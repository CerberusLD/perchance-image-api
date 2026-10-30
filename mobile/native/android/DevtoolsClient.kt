package com.aether.studio

import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.util.Base64
import android.webkit.WebView
import org.json.JSONObject

/**
 * Motor real del generador de Perchance manejado desde la app vía CDP (DevTools).
 *
 * Flujo (el mismo de un cliente de escritorio, pero dentro del móvil):
 *   1. La WebView oculta carga https://perchance.org/ai-text-to-image-generator
 *   2. Se localizan los frames internos: UI del generador y embed de generación.
 *   3. Se escribe el prompt y se pulsa "generate" por JS en el frame de la UI.
 *   4. Se sondea el frame del embed hasta que aparece #resultImgEl.
 *   5. Se convierte la imagen en data URL dentro de ese frame y se devuelve.
 *
 * Cero servidores: todo ocurre en la WebView del dispositivo.
 */
object DevtoolsClient {

  private const val POLL_MS = 3000L
  private const val MAX_WAIT_MS = 240000L

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

    fun readText(): String? {
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
    }
  }

  private fun socketName(): String? = try {
    val pid = android.os.Process.myPid()
    val names = java.io.File("/proc/net/unix").readLines()
      .map { it.trim().split(Regex("\\s+")).last() }
      .filter { it.contains("webview_devtools_remote") }
    (names.firstOrNull { it.endsWith("webview_devtools_remote_$pid") }
      ?: names.firstOrNull())?.removePrefix("@")
  } catch (e: Exception) {
    null
  }

  private fun open(): LocalSocket? {
    val name = socketName() ?: return null
    return try {
      val s = LocalSocket()
      s.connect(LocalSocketAddress(name, LocalSocketAddress.Namespace.ABSTRACT))
      s.soTimeout = 20000
      s
    } catch (e: Exception) {
      null
    }
  }

  /** /json/list por HTTP plano para descubrir la ruta del WebSocket de la página. */
  private fun pagePath(): String? {
    val s = open() ?: return null
    return try {
      val req = "GET /json/list HTTP/1.1\r\nHost: localhost:9222\r\nConnection: close\r\n\r\n"
      s.outputStream.write(req.toByteArray())
      s.outputStream.flush()
      val buf = ByteArray(65536)
      val n = s.inputStream.read(buf)
      val body = String(buf, 0, maxOf(n, 0))
      Regex("/devtools/page/[A-Fa-f0-9]+").find(body)?.value
    } catch (e: Exception) {
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
      if (!resp.contains("101")) { try { s.close() } catch (e: Exception) {}; return null }
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
      val deadline = System.currentTimeMillis() + timeoutMs
      while (System.currentTimeMillis() < deadline) {
        val raw = link.readText() ?: return null
        val obj = try { JSONObject(raw) } catch (e: Exception) { continue }
        if (obj.optInt("id", -1) == myId) return obj
      }
      return null
    }

    fun eval(frameId: String, script: String, awaitPromise: Boolean = false, timeoutMs: Int = 25000): String? {
      val world = call("Page.createIsolatedWorld", "{\"frameId\":\"$frameId\",\"worldName\":\"aether\"}") ?: return null
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

    fun frames(): List<Pair<String, String>> {
      val tree = call("Page.getFrameTree", "{}") ?: return emptyList()
      val raw = tree.toString()
      val out = ArrayList<Pair<String, String>>()
      Regex("\"frame\":\\{\"id\":\"([^\"]+)\",\"loaderId\":\"[^\"]*\",\"url\":\"([^\"]*)\"")
        .findAll(raw).forEach { out.add(it.groupValues[1] to it.groupValues[2]) }
      if (out.isEmpty()) {
        Regex("\"id\":\"([^\"]+)\",\"url\":\"([^\"]*)\"")
          .findAll(raw).forEach { out.add(it.groupValues[1] to it.groupValues[2]) }
      }
      return out
    }
  }

  private fun promptScript(prompt: String): String {
    val safe = prompt.replace("\\", " ").replace("`", "'").replace("\$", " ")
    return """
      (function(){
        try {
          var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){
            return /got it|aceptar|entendido/i.test((x.innerText||'').trim());
          })[0];
          if (b) b.click();
        } catch(e){}
        var tas=[].slice.call(document.querySelectorAll('textarea')).filter(function(t){
          return t.offsetParent !== null;
        });
        if (!tas.length) return 'no-textarea';
        tas.sort(function(a,b){
          var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
          return (rb.width*rb.height) - (ra.width*ra.height);
        });
        var ta=tas[0];
        ta.setAttribute('data-aether-prompt','1');
        var s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
        s.call(ta, `$safe`);
        ta.dispatchEvent(new Event('input',{bubbles:true}));
        ta.dispatchEvent(new Event('change',{bubbles:true}));
        return 'typed';
      })()
    """.trimIndent()
  }

  /** Señal de que el frame es la UI real: campo visible + botón de generar. */
  private val PROBE_UI = """
    (function(){
      var tas=[].slice.call(document.querySelectorAll('textarea')).filter(function(t){
        return t.offsetParent !== null;
      });
      if (!tas.length) return 'none';
      var hasBtn=[].slice.call(document.querySelectorAll('button')).some(function(b){
        return /generate|generar/i.test(b.innerText||'');
      });
      var hasSuggest=!!document.querySelector('.ai-suggest-btn');
      if (!hasBtn && !hasSuggest) return 'no-button';
      return 'ui:' + tas.length;
    })()
  """.trimIndent()

  private val CLICK_GENERATE = """
    (function(){
      var cands=[];
      var byId=document.querySelector('#generateButtonEl');
      if (byId) cands.push(byId);
      var byName=document.querySelector('[data-name=generate]');
      if (byName) cands.push(byName);
      [].slice.call(document.querySelectorAll('button')).forEach(function(b){
        if (/generate|generar/i.test(b.innerText||'')) cands.push(b);
      });
      if (!cands.length) return 'no-button';
      var b=cands[0];
      if (b.disabled) return 'disabled';
      try { b.click(); } catch (e) {
        try { b.dispatchEvent(new MouseEvent('click', {bubbles:true})); } catch (e2) { return 'click-error'; }
      }
      return 'clicked';
    })()
  """.trimIndent()

  private val READ_RESULT = """
    (function(){
      var im=document.querySelector('#resultImgEl');
      if (im && im.src && im.src.length > 40) return im.src;
      return null;
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
      var ta=document.querySelector('textarea[data-aether-prompt=\"1\"]');
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

  /**
   * Mejora un prompt con el botón 🧠 del propio generador.
   * Devuelve el texto mejorado o null.
   */
  fun improve(prompt: String): String? {
    val path = pagePath() ?: return null
    val link = connectWs(path) ?: return null
    try {
      val session = Session(link)

      var uiFrame: String? = null
      var attempts = 0
      while (uiFrame == null && attempts < 15) {
        attempts += 1
        for ((fid, url) in session.frames()) {
          if (!url.contains("ai-text-to-image-generator")) continue
          val probe = session.eval(fid, PROBE_UI, timeoutMs = 12000)
          if (probe != null && probe.startsWith("ui:")) { uiFrame = fid; break }
        }
        if (uiFrame == null) Thread.sleep(2000)
      }
      if (uiFrame == null) return null

      session.eval(uiFrame, promptScript(prompt), timeoutMs = 20000)
      Thread.sleep(900)
      val before = session.eval(uiFrame, READ_PROMPT) ?: prompt
      var clicked = session.eval(uiFrame, CLICK_SUGGEST, timeoutMs = 20000)
      if (clicked != "clicked") {
        // el botón puede vivir en otro frame de la página
        for ((fid, _) in session.frames()) {
          if (fid == uiFrame) continue
          val r = session.eval(fid, CLICK_SUGGEST, timeoutMs = 12000)
          if (r == "clicked") { clicked = r; break }
        }
      }
      if (clicked != "clicked") return null

      val started = System.currentTimeMillis()
      while (System.currentTimeMillis() - started < 25000) {
        Thread.sleep(1500)
        val now = session.eval(uiFrame, READ_PROMPT, timeoutMs = 15000) ?: continue
        if (now.trim().isNotEmpty() && now != before && now.length > before.length / 2) {
          if (now != before) return now
        }
      }
      return null
    } catch (e: Exception) {
      return null
    } finally {
      link.close()
    }
  }

  /**
   * Genera con el generador real y devuelve un data URL base64, o una URL http
   * si el binario no se pudo leer dentro del frame. `null` si no hubo resultado.
   */
  fun generate(prompt: String): String? {
    val path = pagePath() ?: return null
    val link = connectWs(path) ?: return null
    try {
      val session = Session(link)
      val started = System.currentTimeMillis()

      // 1) Frame de la UI del generador: el que tiene campo visible Y botón de generar
      //    (la página externa también tiene textareas, pero ocultos y sin botón)
      var uiFrame: String? = null
      var attempts = 0
      while (uiFrame == null && attempts < 15) {
        attempts += 1
        for ((fid, url) in session.frames()) {
          if (!url.contains("ai-text-to-image-generator")) continue
          val probe = session.eval(fid, PROBE_UI, timeoutMs = 12000)
          if (probe != null && probe.startsWith("ui:")) { uiFrame = fid; break }
        }
        if (uiFrame == null) Thread.sleep(2000)
      }
      if (uiFrame == null) return null

      // 2) Prompt + clic en generar
      session.eval(uiFrame, promptScript(prompt), timeoutMs = 20000)
      Thread.sleep(1500)
      var clicked = session.eval(uiFrame, CLICK_GENERATE, timeoutMs = 20000)
      if (clicked != "clicked") {
        Thread.sleep(2500)
        session.eval(uiFrame, CLICK_GENERATE, timeoutMs = 20000)
      }

      // 3) Esperar la imagen: se busca en TODOS los frames (el embed se crea al generar)
      var reclicked = false
      while (System.currentTimeMillis() - started < MAX_WAIT_MS) {
        for ((fid, _) in session.frames()) {
          val src = session.eval(fid, READ_RESULT, timeoutMs = 12000) ?: continue
          if (src.length < 40) continue
          val dataUrl = session.eval(fid, toDataUrlScript(src), awaitPromise = true, timeoutMs = 45000)
          if (dataUrl != null && dataUrl.startsWith("data:image")) return dataUrl
          if (src.startsWith("http")) return src
        }
        // Si no aparece nada en 25 s, se reintenta el clic (a veces el primero se pierde)
        if (!reclicked && System.currentTimeMillis() - started > 25000) {
          reclicked = true
          session.eval(uiFrame, CLICK_GENERATE, timeoutMs = 15000)
        }
        Thread.sleep(POLL_MS)
      }
      return null
    } catch (e: Exception) {
      return null
    } finally {
      link.close()
    }
  }

  fun enableDebugging() {
    try { WebView.setWebContentsDebuggingEnabled(true) } catch (e: Exception) {}
  }
}
