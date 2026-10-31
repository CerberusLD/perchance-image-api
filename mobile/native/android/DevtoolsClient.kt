package com.aether.studio

import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.util.Base64
import android.webkit.WebView
import org.json.JSONObject

/**
 * Motor del generador manejado desde la app vía CDP (DevTools).
 *
 * Flujo:
 *   1. La WebView oculta carga https://perchance.org/ai-text-to-image-generator
 *   2. Se localiza el frame de la UI (campo visible + botón de generar).
 *   3. Se espera a que el generador esté libre, se escribe el prompt y se pulsa generate.
 *   4. Se comprueba que el render arrancó de verdad (botón bloqueado / estado ocupado).
 *   5. Se sondea TODOS los frames hasta que aparece una imagen nueva (#resultImgEl).
 *   6. Se convierte en data URL dentro del propio frame y se devuelve.
 *
 * Nunca devuelve `null` sin explicar el motivo: usa códigos "ERR:<etapa>" para que
 * la interfaz pueda decir qué pasó y el usuario reintente sin adivinar.
 */
object DevtoolsClient {

  private const val MAX_WAIT_MS = 150000L
  private const val POLL_MS = 2500L
  private const val TAG = "AetherEngine"

  private val lock = Any()

  private class Link(val socket: LocalSocket) {
    val input = socket.inputStream
    val output = socket.outputStream
    fun close() = try { socket.close() } catch (e: Exception) {}

    fun sendText(text: String) {
      val payload = text.toByteArray(Charsets.UTF_8)
      val header = ArrayList<Byte>()
      header.add(0x81.toByte())
      when {
        payload.size < 126 -> header.add((payload.size or 0x80).toByte())
        payload.size < 65536 -> {
          header.add((126 or 0x80).toByte())
          header.add(((payload.size shr 8) and 0xFF).toByte())
          header.add((payload.size and 0xFF).toByte())
        }
        else -> {
          header.add((127 or 0x80).toByte())
          for (i in 7 downTo 0) header.add(((payload.size.toLong() shr (8 * i)) and 0xFF).toByte())
        }
      }
      val mask = ByteArray(4) { (Math.random() * 255).toInt().toByte() }
      mask.forEach { header.add(it) }
      val masked = ByteArray(payload.size)
      for (i in payload.indices) masked[i] = (payload[i].toInt() xor mask[i % 4].toInt()).toByte()
      output.write(header.toByteArray())
      output.write(masked)
      output.flush()
    }

    /** Devuelve null si se cierra el socket o expira el soTimeout. */
    fun readText(): String? {
      return try {
        val sb = StringBuilder()
        while (true) {
          val b0 = input.read()
          if (b0 < 0) return null
          val b1 = input.read()
          if (b1 < 0) return null
          val opcode = b0 and 0x0F
          val masked = (b1 and 0x80) != 0
          var len = (b1 and 0x7F).toLong()
          if (len == 126L) len = ((input.read() shl 8) or input.read()).toLong()
          else if (len == 127L) {
            len = 0
            for (i in 0 until 8) len = (len shl 8) or input.read().toLong()
          }
          val mask = if (masked) ByteArray(4) { input.read().toByte() } else null
          val data = ByteArray(len.toInt())
          var read = 0
          while (read < data.size) {
            val r = input.read(data, read, data.size - read)
            if (r < 0) return null
            read += r
          }
          if (mask != null) for (i in data.indices) data[i] = (data[i].toInt() xor mask[i % 4].toInt()).toByte()
          if (opcode == 0x8) return null
          sb.append(String(data, Charsets.UTF_8))
          if ((b0 and 0x80) != 0) return sb.toString()
        }
        null
      } catch (e: Exception) {
        null
      }
    }
  }

  private fun log(msg: String) {
    try { android.util.Log.i(TAG, msg) } catch (e: Exception) {}
  }

  private fun now() = System.currentTimeMillis()

  /** Nombres candidatos del socket de la WebView propia (sin depender de /proc). */
  private fun candidates(): List<String> {
    val pid = android.os.Process.myPid()
    val out = ArrayList<String>()
    out.add("webview_devtools_remote_$pid")
    for (path in listOf("/proc/self/net/unix", "/proc/net/unix")) {
      try {
        java.io.File(path).readLines().forEach { line ->
          val parts = line.trim().split(Regex("\\s+"))
          val name = parts.lastOrNull() ?: return@forEach
          if (name.contains("webview_devtools_remote")) {
            val clean = name.removePrefix("@")
            if (!out.contains(clean)) out.add(clean)
          }
        }
      } catch (e: Exception) {
        // Android 10+ bloquea /proc/net por SELinux: se ignora y se usa el pid.
      }
    }
    return out
  }

  private fun connectTo(name: String): LocalSocket? = try {
    val s = LocalSocket()
    s.connect(LocalSocketAddress(name, LocalSocketAddress.Namespace.ABSTRACT))
    s.soTimeout = 20000
    s
  } catch (e: Exception) {
    null
  }

  private fun open(): LocalSocket? {
    for (name in candidates()) {
      connectTo(name)?.let {
        log("open: socket $name")
        return it
      }
    }
    log("open: sin socket (pid=${android.os.Process.myPid()})")
    return null
  }

  /** /json/list por HTTP plano sobre el socket abstracto. */
  private fun pagePath(): String? {
    for (attempt in 1..8) {
      val path = pagePathOnce()
      if (path != null) return path
      Thread.sleep(1200)
    }
    log("pagePath: sin target tras 8 intentos")
    return null
  }

  private fun pagePathOnce(): String? {
    val s = open() ?: return null
    return try {
      val req = "GET /json/list HTTP/1.1\r\nHost: localhost:9222\r\nConnection: close\r\n\r\n"
      s.outputStream.write(req.toByteArray())
      s.outputStream.flush()
      val buf = ByteArray(65536)
      val n = s.inputStream.read(buf)
      val body = String(buf, 0, maxOf(n, 0))
      val hit = Regex("/devtools/page/[A-Fa-f0-9]+").find(body)?.value
      if (hit == null) log("pagePath: respuesta sin target (${body.take(80)})")
      hit
    } catch (e: Exception) {
      log("pagePath error: ${e.message}")
      null
    } finally {
      try { s.close() } catch (e: Exception) {}
    }
  }

  private fun connectWs(path: String): Link? {
    val s = open() ?: return null
    return try {
      val key = Base64.encodeToString(ByteArray(16) { (Math.random() * 255).toInt().toByte() }, Base64.NO_WRAP)
      val hs = "GET $path HTTP/1.1\r\nHost: localhost:9222\r\nUpgrade: websocket\r\n" +
        "Connection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\n\r\n"
      s.outputStream.write(hs.toByteArray())
      s.outputStream.flush()
      val buf = ByteArray(2048)
      val n = s.inputStream.read(buf)
      val resp = String(buf, 0, maxOf(n, 0))
      if (!resp.contains("101")) {
        log("ws: handshake ${resp.take(60)}")
        try { s.close() } catch (e: Exception) {}
        return null
      }
      Link(s)
    } catch (e: Exception) {
      null
    }
  }

  private fun jsString(s: String): String =
    "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ") + "\""

  private class Session(val link: Link) {
    private var id = 0

    fun call(method: String, params: String, timeoutMs: Int = 30000): JSONObject? {
      id += 1
      val myId = id
      link.sendText("{\"id\":$myId,\"method\":\"$method\",\"params\":$params}")
      val deadline = now() + timeoutMs
      while (now() < deadline) {
        val raw = link.readText() ?: return null
        val obj = try { JSONObject(raw) } catch (e: Exception) { continue }
        if (obj.optInt("id", -1) == myId) return obj
      }
      return null
    }

    fun eval(frameId: String, script: String, awaitPromise: Boolean = false, timeoutMs: Int = 25000): String? {
      val world = call(
        "Page.createIsolatedWorld",
        "{\"frameId\":\"$frameId\",\"worldName\":\"aether\"}"
      ) ?: return null
      val ctx = world.optJSONObject("result")?.optInt("executionContextId", -1) ?: -1
      if (ctx < 0) return null
      val params = buildString {
        append("{\"expression\":").append(jsString(script))
        append(",\"contextId\":").append(ctx)
        append(",\"returnByValue\":true")
        append(",\"awaitPromise\":").append(awaitPromise)
        append("}")
      }
      val res = call("Runtime.evaluate", params, timeoutMs) ?: return null
      val result = res.optJSONObject("result")?.optJSONObject("result") ?: return null
      if (!result.has("value")) return null
      val v = result.get("value")
      return if (v == JSONObject.NULL) null else v.toString()
    }

    /**
     * Árbol de frames completo. Se recorre el JSON (no regex): los frames hijos
     * incluyen `parentId` antes de `loaderId`, así que un patrón fijo los perdía.
     */
    fun frames(): List<Pair<String, String>> {
      val res = call("Page.getFrameTree", "{}") ?: return emptyList()
      val out = ArrayList<Pair<String, String>>()

      fun walk(node: JSONObject?) {
        if (node == null) return
        val frame = node.optJSONObject("frame") ?: return
        val id = frame.optString("id", "")
        val url = frame.optString("url", "")
        if (id.isNotEmpty()) out.add(id to url)
        val children = node.optJSONArray("childFrames")
        if (children != null) {
          for (i in 0 until children.length()) walk(children.optJSONObject(i))
        }
      }

      walk(res.optJSONObject("result")?.optJSONObject("frameTree"))
      return out
    }
  }

  // ---------------------------------------------------------------- scripts

  private val PROBE_UI = """
    (function(){
      var tas=[].slice.call(document.querySelectorAll('textarea')).filter(function(t){
        return t.offsetParent !== null;
      });
      if (!tas.length) return 'none';
      var hasBtn=[].slice.call(document.querySelectorAll('button')).some(function(b){
        return /generate|generar/i.test(b.innerText||'') || b.id==='generateButtonEl';
      });
      var hasSuggest=!!document.querySelector('.ai-suggest-btn');
      if (!hasBtn && !hasSuggest) return 'no-button';
      return 'ui:' + tas.length;
    })()
  """.trimIndent()

  /** 'idle' | 'busy' | 'no-button' — el generador sólo acepta clics cuando está libre. */
  private val READ_STATE = """
    (function(){
      var byId=document.querySelector('#generateButtonEl');
      var btn=byId || [].slice.call(document.querySelectorAll('button')).filter(function(b){
        return /generate|generar/i.test(b.innerText||'');
      })[0] || null;
      if (!btn) return 'no-button';
      var stop=document.querySelector('.stop-btn, #stopButtonEl, [data-name=stop]');
      if (stop && stop.offsetParent !== null) return 'busy';
      if (btn.disabled) return 'busy';
      var cls=(typeof btn.className==='string'?btn.className:'');
      if (/\b(busy|loading|generating)\b/i.test(cls)) return 'busy';
      return 'idle';
    })()
  """.trimIndent()

  /**
   * Enfoca el campo del prompt y selecciona todo su contenido.
   *
   * Se elige el textarea MÁS CERCANO al botón de generar: después de la primera
   * imagen la página muestra otros campos y "el más grande" deja de ser el del
   * prompt, con lo que el generador acababa repitiendo el prompt anterior.
   */
  private val FOCUS_SELECT = """
    (function(){
      var tas=[].slice.call(document.querySelectorAll('textarea')).filter(function(t){
        return t.offsetParent !== null;
      });
      if (!tas.length) return 'no-ta';
      var btn=document.querySelector('#generateButtonEl') || [].slice.call(document.querySelectorAll('button')).filter(function(b){
        return /generate|generar/i.test(b.innerText||'');
      })[0];
      var ta=tas[0];
      if (btn) {
        var rb=btn.getBoundingClientRect(), bx=rb.left+rb.width/2, by=rb.top+rb.height/2, best=1e9;
        tas.forEach(function(t){
          var r=t.getBoundingClientRect();
          var dx=(r.left+r.width/2)-bx, dy=(r.top+r.height/2)-by;
          var d=Math.sqrt(dx*dx+dy*dy);
          if (d<best) { best=d; ta=t; }
        });
      } else {
        tas.sort(function(a,b){
          var ra=a.getBoundingClientRect(), rb2=b.getBoundingClientRect();
          return (rb2.width*rb2.height) - (ra.width*ra.height);
        });
        ta=tas[0];
      }
      ta.setAttribute('data-aether-prompt','1');
      try { ta.focus(); ta.setSelectionRange(0, ta.value.length); } catch(e) { return 'focus-error'; }
      return 'focused';
    })()
  """.trimIndent()

  /**
   * Escribe el prompt con entrada REAL (Input.insertText): la página recibe los
   * mismos eventos que al teclear, así no se queda con el prompt anterior.
   * Si el valor no coincide, cae al setter nativo + eventos input/change.
   */
  private fun typePrompt(session: Session, frame: String, prompt: String): Boolean {
    session.eval(frame, FOCUS_SELECT, timeoutMs = 12000)
    session.call("Input.insertText", "{\"text\":" + jsString(prompt) + "}", 15000)
    session.eval(frame, DISPATCH_CHANGE, timeoutMs = 8000)

    var current = session.eval(frame, READ_PROMPT, timeoutMs = 12000)
    if (current == null || current.trim() != prompt.trim()) {
      log("typePrompt: insertText no cuadra, se usa el setter")
      session.eval(frame, promptScript(prompt), timeoutMs = 20000)
      current = session.eval(frame, READ_PROMPT, timeoutMs = 12000)
    }
    val ok = current != null && current.trim() == prompt.trim()
    log("typePrompt: ok=" + ok + " valor=" + (current ?: "null").take(60))
    return ok
  }

  private val DISPATCH_CHANGE = """
    (function(){
      var ta=document.querySelector('textarea[data-aether-prompt=\"1\"]');
      if (!ta) return 'no-ta';
      ta.dispatchEvent(new Event('input',{bubbles:true}));
      ta.dispatchEvent(new Event('change',{bubbles:true}));
      return 'ok';
    })()
  """.trimIndent()

  private fun promptScript(prompt: String): String {
    val safe = prompt.replace("\\", " ").replace("`", "'").replace("$", " ")
    return """
      (function(){
        try {
          var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){
            return /got it|aceptar|entendido/i.test((x.innerText||'').trim());
          })[0];
          if (b) b.click();
        } catch(e){}
        var ta=document.querySelector('textarea[data-aether-prompt="1"]');
        if (!ta) {
          var tas=[].slice.call(document.querySelectorAll('textarea')).filter(function(t){
            return t.offsetParent !== null;
          });
          if (!tas.length) return 'no-textarea';
          tas.sort(function(a,b){
            var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
            return (rb.width*rb.height) - (ra.width*ra.height);
          });
          ta=tas[0];
        }
        ta.setAttribute('data-aether-prompt','1');
        var s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
        s.call(ta, `$safe`);
        ta.dispatchEvent(new Event('input',{bubbles:true}));
        ta.dispatchEvent(new Event('change',{bubbles:true}));
        ta.blur();
        return 'typed';
      })()
    """.trimIndent()
  }

  private val CLICK_GENERATE = """
    (function(){
      var cands=[];
      var byId=document.querySelector('#generateButtonEl'); if(byId) cands.push(byId);
      var byName=document.querySelector('[data-name=generate]'); if(byName) cands.push(byName);
      [].slice.call(document.querySelectorAll('button')).forEach(function(b){
        if (/generate|generar/i.test(b.innerText||'')) cands.push(b);
      });
      if (!cands.length) return 'no-button';
      var b=cands[0];
      if (b.disabled) return 'disabled';
      try { b.click(); } catch (e) {
        try { b.dispatchEvent(new MouseEvent('click',{bubbles:true})); } catch (e2) { return 'click-error'; }
      }
      return 'clicked';
    })()
  """.trimIndent()

  private val CLICK_SUGGEST = """
    (function(){
      var b=document.querySelector('.ai-suggest-btn');
      if (!b) {
        b=[].slice.call(document.querySelectorAll('button')).filter(function(x){
          var t=(x.textContent||'')+(x.getAttribute('aria-label')||'')+(x.title||'');
          return t.indexOf('🧠')>=0 || /suggest|enhance|improve|mejorar/i.test(t);
        })[0];
      }
      if (!b) return 'no-button';
      if (b.disabled) return 'disabled';
      b.click();
      return 'clicked';
    })()
  """.trimIndent()

  private val READ_PROMPT = """
    (function(){
      var ta=document.querySelector('textarea[data-aether-prompt="1"]');
      if (!ta) {
        var tas=[].slice.call(document.querySelectorAll('textarea')).filter(function(t){
          return t.offsetParent !== null;
        });
        if (!tas.length) return null;
        tas.sort(function(a,b){
          var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
          return (rb.width*rb.height) - (ra.width*ra.height);
        });
        ta=tas[0];
      }
      return ta.value;
    })()
  """.trimIndent()

  private val READ_RESULT = """
    (function(){
      var im=document.querySelector('#resultImgEl');
      if (im && im.src && im.src.length > 40) return im.src;
      return null;
    })()
  """.trimIndent()

  /** Marca la imagen que ya estaba: así no se devuelve una vieja ni se descarta una nueva con la misma URL. */
  private val MARK_OLD = """
    (function(){
      var im=document.querySelector('#resultImgEl');
      if (im) { im.setAttribute('data-aether-old','1'); return 'marked'; }
      return 'none';
    })()
  """.trimIndent()

  private val READ_NEW = """
    (function(){
      var im=document.querySelector('#resultImgEl');
      if (!im || !im.src || im.src.length < 40) return null;
      if (im.getAttribute('data-aether-old') === '1') return null;
      return im.src;
    })()
  """.trimIndent()

  private fun toDataUrlScript(src: String): String = """
    (async function(){
      try {
        var r=await fetch(${jsString(src)});
        var b=await r.blob();
        return await new Promise(function(res){ var f=new FileReader();
          f.onloadend=function(){ res(f.result); }; f.readAsDataURL(b); });
      } catch(e) { return null; }
    })()
  """.trimIndent()

  // ------------------------------------------------------------- utilidades

  /**
   * La WebView vive detrás de la interfaz: si el sistema la marca oculta (o su
   * viewport queda degenerado), el generador NO ejecuta el render. Aquí se fuerza
   * tamaño real, foco y estado activo antes de tocar nada.
   */
  private fun prepare(session: Session) {
    session.call(
      "Emulation.setDeviceMetricsOverride",
      "{\"width\":360,\"height\":640,\"deviceScaleFactor\":2.625,\"mobile\":true}",
      8000
    )
    session.call("Emulation.setFocusEmulationEnabled", "{\"enabled\":true}", 8000)
    session.call("Page.setWebLifecycleState", "{\"state\":\"active\"}", 8000)
  }

  /**
   * Fija el estilo en el `<select>` del generador (el que más opciones tiene).
   * Compara normalizando: "𝗡𝗼 𝘀𝘁𝘆𝗹𝗲" -> "nostyle", acentos y mayúsculas aparte.
   */
  private fun styleScript(name: String): String = """
    (function(target){
      function norm(s){
        try { s = s.normalize('NFKC'); } catch(e) {}
        return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      }
      var sels=[].slice.call(document.querySelectorAll('select'));
      if (!sels.length) return 'no-select';
      var best=null, bn=-1;
      sels.forEach(function(s){ if (s.options.length > bn) { bn = s.options.length; best = s; } });
      if (!best || bn < 20) return 'no-style-select';
      var t=norm(target), idx=-1;
      for (var i=0;i<best.options.length;i++){ if (norm(best.options[i].text) === t) { idx=i; break; } }
      if (idx < 0) return 'no-match';
      best.selectedIndex = idx;
      best.dispatchEvent(new Event('input',{bubbles:true}));
      best.dispatchEvent(new Event('change',{bubbles:true}));
      return 'set:' + best.options[idx].text;
    })(${jsString(name)})
  """.trimIndent()

  /** Nombre exacto del estilo en el generador; "Libre" es la opción sin estilo. */
  private fun styleOptionName(style: String?): String =
    if (style.isNullOrBlank() || style.equals("libre", true)) "No style" else style

  /** Frame de la UI real: el que tiene campo visible y botón de generar. */
  private fun findUiFrame(session: Session, budgetMs: Int = 45000): String? {
    val deadline = now() + budgetMs
    while (now() < deadline) {
      for ((fid, url) in session.frames()) {
        if (!url.contains("ai-text-to-image-generator") && !url.contains("perchance.org")) continue
        val probe = session.eval(fid, PROBE_UI, timeoutMs = 12000)
        if (probe != null && probe.startsWith("ui:")) return fid
      }
      Thread.sleep(1500)
    }
    return null
  }

  /** true cuando el generador está libre y acepta un nuevo trabajo. */
  private fun waitIdle(session: Session, frame: String, budgetMs: Int): Boolean {
    val deadline = now() + budgetMs
    while (now() < deadline) {
      val state = session.eval(frame, READ_STATE, timeoutMs = 12000)
      if (state == "idle") return true
      if (state == null) return false
      Thread.sleep(1200)
    }
    return false
  }

  /** Imágenes que ya estaban en la página antes de generar (para no devolver una vieja). */
  private fun existingResults(session: Session): Set<String> {
    val out = HashSet<String>()
    for ((fid, _) in session.frames()) {
      val src = session.eval(fid, READ_RESULT, timeoutMs = 8000) ?: continue
      if (src.length > 40) out.add(src)
    }
    return out
  }

  // ---------------------------------------------------------------- motor

  /**
   * Mejora el prompt con el botón 🧠 del propio generador y deja la página libre:
   * al terminar espera a que el generador vuelva a estar disponible, de modo que
   * el siguiente `generate()` nunca se encuentre el botón bloqueado.
   */
  fun improve(prompt: String): String? = synchronized(lock) {
    val path = pagePath() ?: run { log("improve: sin socket"); return null }
    val link = connectWs(path) ?: run { log("improve: sin websocket"); return null }
    try {
      val session = Session(link)
      prepare(session)
      val uiFrame = findUiFrame(session, 30000) ?: run { log("improve: sin UI"); return null }
      if (!waitIdle(session, uiFrame, 15000)) log("improve: generador ocupado, se intenta igual")

      typePrompt(session, uiFrame, prompt)
      Thread.sleep(900)
      val before = session.eval(uiFrame, READ_PROMPT) ?: prompt

      var clicked = session.eval(uiFrame, CLICK_SUGGEST, timeoutMs = 20000)
      if (clicked != "clicked") {
        for ((fid, _) in session.frames()) {
          if (fid == uiFrame) continue
          val r = session.eval(fid, CLICK_SUGGEST, timeoutMs = 10000)
          if (r == "clicked") { clicked = r; break }
        }
      }
      if (clicked != "clicked") {
        log("improve: sin botón 🧠")
        return null
      }

      val deadline = now() + 30000
      var improved: String? = null
      while (now() < deadline) {
        Thread.sleep(1200)
        val text = session.eval(uiFrame, READ_PROMPT, timeoutMs = 12000) ?: continue
        if (text.trim().isNotEmpty() && text.trim() != before.trim() && text.trim().length > before.trim().length / 2 + 2) {
          improved = text
          break
        }
      }
      if (improved == null) log("improve: sin texto nuevo")

      // Nunca dejar la página ocupada: el 🧠 puede disparar un render.
      if (!waitIdle(session, uiFrame, 20000)) {
        log("improve: el generador sigue ocupado al salir")
      } else {
        log("improve: generador libre")
      }
      improved
    } catch (e: Exception) {
      log("improve error: ${e.message}")
      null
    } finally {
      link.close()
    }
  }

  /**
   * Genera una imagen. Devuelve un data URL, una URL http o "ERR:<etapa>".
   *
   * Si el render no llega o el resultado no corresponde al prompt pedido, se
   * reintenta una vez recargando la página: así nunca se repite la imagen del
   * prompt anterior por estado pegado de la página.
   */
  fun generate(prompt: String, style: String? = null): String = synchronized(lock) {
    var last = "ERR:no-result"
    for (attempt in 1..2) {
      last = generateOnce(prompt, style, reloadFirst = attempt > 1)
      log("generate: intento $attempt -> ${last.take(40)}")
      if (last.startsWith("data:image") || last.startsWith("http")) return last
      // Errores de canal no mejoran recargando.
      if (last == "ERR:no-socket" || last == "ERR:no-page" || last == "ERR:no-ui") return last
      Thread.sleep(1500)
    }
    return last
  }

  private fun generateOnce(prompt: String, style: String?, reloadFirst: Boolean): String {
    val path = pagePath() ?: return "ERR:no-socket"
    val link = connectWs(path) ?: return "ERR:no-page"
    try {
      val session = Session(link)
      prepare(session)

      if (reloadFirst) {
        log("generate: recargando la página para partir de cero")
        session.call("Page.reload", "{}", 15000)
        Thread.sleep(9000)
        prepare(session)
      }

      val uiFrame = findUiFrame(session) ?: return "ERR:no-ui"
      log("generate: uiFrame=$uiFrame visible=" + session.eval(uiFrame, "document.visibilityState"))

      val previous = existingResults(session)
      for ((fid, _) in session.frames()) session.eval(fid, MARK_OLD, timeoutMs = 6000)

      if (!waitIdle(session, uiFrame, 60000)) log("generate: ocupado tras 60 s, se intenta igual")

      val styleResult = session.eval(uiFrame, styleScript(styleOptionName(style)), timeoutMs = 15000)
      log("generate: estilo(${style ?: "libre"}) -> $styleResult")

      if (!typePrompt(session, uiFrame, prompt)) {
        log("generate: no se pudo escribir el prompt")
        return "ERR:no-ui"
      }
      Thread.sleep(800)

      var started = false
      for (attempt in 1..3) {
        val clicked = session.eval(uiFrame, CLICK_GENERATE, timeoutMs = 20000)
        log("generate: click $attempt -> $clicked")
        if (clicked == "clicked") {
          val deadline = now() + 8000
          while (now() < deadline) {
            Thread.sleep(1000)
            if (session.eval(uiFrame, READ_STATE, timeoutMs = 10000) == "busy") { started = true; break }
          }
          if (started) break
        }
        if (clicked == "disabled") waitIdle(session, uiFrame, 20000)
        Thread.sleep(1200)
      }
      log("generate: started=$started")

      val deadline = now() + MAX_WAIT_MS
      while (now() < deadline) {
        for ((fid, _) in session.frames()) {
          val src = session.eval(fid, READ_NEW, timeoutMs = 10000)
            ?: session.eval(fid, READ_RESULT, timeoutMs = 10000)?.takeIf { !previous.contains(it) }
            ?: continue
          if (src.length < 40) continue

          // ¿El render usó el prompt nuevo? Si la página repitió el anterior, se reintenta.
          val matches = promptUsed(session, uiFrame, prompt)
          log("generate: imagen en $fid | prompt coincide=$matches")
          if (!matches) return "ERR:stale"

          val dataUrl = session.eval(fid, toDataUrlScript(src), awaitPromise = true, timeoutMs = 45000)
          if (dataUrl != null && dataUrl.startsWith("data:image")) return dataUrl
          if (src.startsWith("http")) return src
        }
        Thread.sleep(POLL_MS)
      }
      return "ERR:no-result"
    } catch (e: Exception) {
      log("generate error: ${e.message}")
      return "ERR:no-result"
    } finally {
      link.close()
    }
  }

  /** Busca el prompt en los frames de resultado (excluye el de la UI, que lo contiene por definición). */
  private fun promptUsed(session: Session, uiFrame: String, prompt: String): Boolean {
    val needle = prompt.trim().take(16)
    if (needle.length < 4) return true
    val script = """
      (function(needle){
        function norm(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
        var t=(document.body?document.body.innerText:'')+' '+(document.documentElement?document.documentElement.innerHTML:'');
        return norm(t).indexOf(norm(needle)) >= 0 ? 'yes' : 'no';
      })(${jsString(needle)})
    """.trimIndent()
    for ((fid, _) in session.frames()) {
      if (fid == uiFrame) continue
      if (session.eval(fid, script, timeoutMs = 8000) == "yes") return true
    }
    return false
  }

  /** Diagnóstico legible para Ajustes: dónde está el motor. */
  fun diagnose(): String {
    val sb = StringBuilder()
    val names = candidates()
    sb.append("socket: ").append(names.firstOrNull() ?: "?").append('\n')
    sb.append("debugging: ").append(if (isDebuggingEnabled()) "on" else "off").append('\n')
    val path = pagePath()
    sb.append("target: ").append(path ?: "no encontrado").append('\n')
    if (path == null) return sb.toString()
    val link = connectWs(path) ?: run { sb.append("websocket: falló"); return sb.toString() }
    try {
      val session = Session(link)
      prepare(session)
      val frames = session.frames()
      sb.append("frames: ").append(frames.size).append('\n')
      for ((fid, url) in frames) sb.append(" · ").append(url.take(60)).append('\n')
      val ui = findUiFrame(session, 12000)
      sb.append("ui: ").append(ui ?: "no detectada").append('\n')
      if (ui != null) {
        sb.append("estado: ").append(session.eval(ui, READ_STATE) ?: "?").append('\n')
        sb.append("probe: ").append(session.eval(ui, PROBE_UI) ?: "?")
      }
    } catch (e: Exception) {
      sb.append("error: ").append(e.message)
    } finally {
      link.close()
    }
    return sb.toString()
  }

  private fun isDebuggingEnabled(): Boolean = try {
    val cls = WebView::class.java
    val f = cls.getDeclaredField("sDebuggingEnabled")
    f.isAccessible = true
    f.getBoolean(null)
  } catch (e: Exception) {
    true
  }

  fun enableDebugging() {
    try { WebView.setWebContentsDebuggingEnabled(true) } catch (e: Exception) {}
  }
}