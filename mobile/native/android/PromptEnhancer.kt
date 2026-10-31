package com.aether.studio

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import org.json.JSONObject
import java.nio.LongBuffer

/**
 * Mejorador de prompts con el modelo propio (MDLM 11.3M) empaquetado en la app.
 *
 * No hay servidor ni modelo externo: el grafo ONNX y el tokenizador viajan
 * dentro del APK y se cargan en memoria al primer uso.
 *
 * Algoritmo (el mismo del entrenamiento, formato "largo"):
 *   1. el prompt se convierte en `head` (sujeto) y `cat` (categoría)
 *   2. cada uno de los 14 grupos del esqueleto elige su opción puntuando TODOS
 *      los candidatos en una sola pasada del modelo
 *   3. se monta la plantilla final (~180 palabras, en inglés)
 */
object PromptEnhancer {

  private const val TAG = "AetherPromptAI"
  private const val ASSET_DIR = "prompt_model"

  private var session: OrtSession? = null
  private var env: OrtEnvironment? = null
  private var tok: BpeTokenizer? = null
  private var template: String = ""
  private var pools: LinkedHashMap<String, List<String>> = LinkedHashMap()
  private var classWords: Map<String, List<String>> = emptyMap()
  private var categoryMap: Map<String, String> = emptyMap()
  private var stopWords: Set<String> = emptySet()
  private var maxLen = 64

  private fun log(msg: String) {
    try { android.util.Log.i(TAG, msg) } catch (e: Exception) {}
  }

  val isReady: Boolean get() = session != null && tok != null

  /** Carga perezosa; la primera llamada tarda ~1-2 s (lectura de assets + grafo). */
  @Synchronized
  fun ensureLoaded(context: Context): Boolean {
    if (isReady) return true
    return try {
      val started = System.currentTimeMillis()
      val app = context.applicationContext

      val enhance = JSONObject(
        app.assets.open("$ASSET_DIR/enhance.json").bufferedReader().use { it.readText() }
      )
      template = enhance.getString("template")
      val poolsJson = enhance.getJSONObject("pools")
      val poolKeys = poolsJson.keys()
      while (poolKeys.hasNext()) {
        val tag = poolKeys.next()
        val arr = poolsJson.getJSONArray(tag)
        pools[tag] = (0 until arr.length()).map { i -> arr.getString(i) }
      }
      val cw = enhance.getJSONObject("class_words")
      val cwKeys = cw.keys()
      val wordsMap = HashMap<String, List<String>>()
      while (cwKeys.hasNext()) {
        val k = cwKeys.next()
        wordsMap[k] = cw.getString(k).split(" ").filter { w -> w.isNotBlank() }
      }
      classWords = wordsMap
      val cat = enhance.getJSONObject("category")
      val catKeys = cat.keys()
      val catMap = HashMap<String, String>()
      while (catKeys.hasNext()) {
        val k = catKeys.next()
        catMap[k] = cat.getString(k)
      }
      categoryMap = catMap
      val st = enhance.getJSONArray("stop")
      stopWords = (0 until st.length()).map { st.getString(it) }.toSet()

      tok = BpeTokenizer.fromStream(app.assets.open("$ASSET_DIR/tokenizer.json"))

      // El grafo se copia una vez a disco y se abre por ruta: ORT lo mapea en
      // memoria en lugar de tener 12 MB extra en el heap de la app.
      val modelFile = copyAssetIfNeeded(app, "scorer.int8.onnx")
      env = OrtEnvironment.getEnvironment()
      val opts = OrtSession.SessionOptions().apply {
        setIntraOpNumThreads(2)
        setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        try {
          setCPUArenaAllocator(false)
        } catch (e: Exception) {
          // versiones antiguas de ORT no lo exponen
        }
      }
      session = env!!.createSession(modelFile.absolutePath, opts)

      log("cargado en ${System.currentTimeMillis() - started} ms (${modelFile.length() / 1024 / 1024} MB)")
      true
    } catch (e: Exception) {
      log("error cargando: ${e.message}")
      session = null
      false
    }
  }

  /** true si hay margen suficiente para cargar el grafo (~60 MB de pico). */
  private fun hasEnoughMemory(context: Context): Boolean {
    return try {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
      val info = android.app.ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      val heapFree = Runtime.getRuntime().maxMemory() - (Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory())
      log("memoria: avail=${info.availMem / 1024 / 1024} MB · heapLibre=${heapFree / 1024 / 1024} MB · largeHeap=${am.isLowRamDevice}")
      info.availMem > 350L * 1024 * 1024 || heapFree > 120L * 1024 * 1024
    } catch (e: Exception) {
      true
    }
  }

  /** Copia un asset a filesDir (una sola vez) y devuelve el fichero. */
  private fun copyAssetIfNeeded(context: Context, name: String): java.io.File {
    val dir = java.io.File(context.filesDir, ASSET_DIR)
    if (!dir.exists()) dir.mkdirs()
    val target = java.io.File(dir, name)
    val assetSize = try {
      context.assets.openFd("$ASSET_DIR/$name").use { it.length }
    } catch (e: Exception) {
      -1L
    }
    if (target.exists() && (assetSize <= 0 || target.length() == assetSize)) return target

    context.assets.open("$ASSET_DIR/$name").use { input ->
      java.io.FileOutputStream(target).use { output ->
        val buf = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n <= 0) break
          output.write(buf, 0, n)
        }
        output.flush()
      }
    }
    return target
  }

  // ------------------------------------------------------------- sujeto
  private fun headOf(subject: String): String {
    val s = subject.trim().replace(Regex("^(a|an|the)\\s+", RegexOption.IGNORE_CASE), "")
    val out = ArrayList<String>()
    for (w in s.split(Regex("\\s+"))) {
      val lw = w.lowercase()
      if (lw in stopWords || lw.endsWith("ing")) break
      out.add(w)
      if (out.size >= 4) break
    }
    val head = out.joinToString(" ")
    return head.ifBlank { s }
  }

  private fun categoryOf(head: String): String {
    val toks = Regex("[a-z]+").findAll(head.lowercase()).map { it.value }.toList()
    for ((cls, words) in classWords) {
      if (toks.any { it in words }) return categoryMap[cls] ?: "an object"
    }
    return categoryMap["default"] ?: "an object"
  }

  // ------------------------------------------------------------ puntuado
  /**
   * Puntúa todos los candidatos de un grupo en UNA pasada.
   * Devuelve la probabilidad media (log) de cada candidato.
   */
  private fun scoreCandidates(subject: String, tag: String, oi: Int, candidates: List<String>): DoubleArray {
    val s = session ?: return DoubleArray(candidates.size)
    val t = tok ?: return DoubleArray(candidates.size)

    val prefix = ArrayList<Int>()
    prefix.add(BpeTokenizer.BOS)
    prefix.addAll(t.encode("$subject [$tag][O$oi]"))
    prefix.add(BpeTokenizer.SEP)

    val encoded = candidates.map { t.encode(it) + BpeTokenizer.EOS }
    val width = encoded.maxOf { it.size }
    val seq = prefix.size + width

    // columnas: solo los tokens que aparecen en los candidatos (evita 12k columnas)
    val cols = sortedSetOf<Int>()
    encoded.forEach { e -> e.forEach { cols.add(it) } }
    cols.add(BpeTokenizer.EOS)
    val colList = cols.toList()
    val colIndex = HashMap<Int, Int>(colList.size)
    colList.forEachIndexed { i, id -> colIndex[id] = i }

    val b = candidates.size
    val idsBuf = LongBuffer.allocate(b * seq)
    for (row in 0 until b) {
      for (i in 0 until seq) {
        val v = when {
          i < prefix.size -> prefix[i]
          i < prefix.size + encoded[row].size -> encoded[row][i - prefix.size]
          else -> BpeTokenizer.EOS
        }
        idsBuf.put(v.toLong())
      }
    }
    idsBuf.rewind()

    val selBuf = LongBuffer.allocate(b * width)
    for (row in 0 until b) {
      for (i in 0 until width) selBuf.put((row.toLong() * seq) + prefix.size + i)
    }
    selBuf.rewind()

    val colsBuf = LongBuffer.allocate(colList.size)
    colList.forEach { colsBuf.put(it.toLong()) }
    colsBuf.rewind()

    val e = env ?: return DoubleArray(candidates.size)
    val idsTensor = OnnxTensor.createTensor(e, idsBuf, longArrayOf(b.toLong(), seq.toLong()))
    val selTensor = OnnxTensor.createTensor(e, selBuf, longArrayOf(selBuf.capacity().toLong()))
    val colsTensor = OnnxTensor.createTensor(e, colsBuf, longArrayOf(colList.size.toLong()))
    val res = try {
      s.run(mapOf("ids" to idsTensor, "sel" to selTensor, "cols" to colsTensor))
    } finally {
      idsTensor.close()
      selTensor.close()
      colsTensor.close()
    }

    val tensor = res[0] as OnnxTensor
    val buffer = tensor.floatBuffer
    val data = FloatArray(b * width * colList.size)
    buffer.get(data)

    // log-softmax por fila sobre las columnas elegidas
    val scores = DoubleArray(b)
    for (row in 0 until b) {
      var logp = 0.0
      var n = 0
      for (i in 0 until encoded[row].size) {
        val off = (row * width + i) * colList.size
        var mx = Float.NEGATIVE_INFINITY
        for (j in 0 until colList.size) mx = maxOf(mx, data[off + j])
        var sExp = 0.0
        for (j in 0 until colList.size) sExp += Math.exp((data[off + j] - mx).toDouble())
        val logNorm = mx + Math.log(sExp)
        val col = colIndex[encoded[row][i]] ?: continue
        logp += (data[off + col] - logNorm)
        n += 1
      }
      scores[row] = if (n > 0) logp / n else Double.NEGATIVE_INFINITY
    }

    tensor.close()
    res.close()
    return scores
  }

  // ---------------------------------------------------------------- API
  /** Mejora un prompt ya en inglés. Devuelve el texto final o null. */
  @Synchronized
  fun enhance(context: Context, subjectRaw: String): String? = try {
    enhanceInner(context, subjectRaw)
  } catch (e: Throwable) {
    log("enhance falló: ${e.message}")
    null
  }

  private fun enhanceInner(context: Context, subjectRaw: String): String? {
    // Con la WebView del generador abierta, un móvil de gama media puede quedarse
    // sin memoria: mejor no cargar el modelo que morir por OOM.
    if (!hasEnoughMemory(context)) {
      log("memoria insuficiente, se omite el modelo")
      return null
    }
    if (!ensureLoaded(context)) return null
    val subject = subjectRaw.lowercase().replace(Regex("\\s+"), " ").trim().trim(',')
    if (subject.isBlank()) return null

    val started = System.currentTimeMillis()
    val head = headOf(subject)
    val cat = categoryOf(head)

    val chosen = HashMap<String, String>()
    var passes = 0
    for ((tag, pool) in pools) {
      val scores = scoreCandidates(subject, tag, 1, pool)
      passes += 1
      var best = 0
      for (i in scores.indices) if (scores[i] > scores[best]) best = i
      chosen[tag] = pool[best]
    }

    var text = template
    text = text.replace("{head}", head).replace("{cat}", cat)
    for ((tag, value) in chosen) text = text.replace("{${tag.lowercase()}}", value)
    text = text.replace(Regex("\\s+"), " ").trim()

    log("mejorado en ${System.currentTimeMillis() - started} ms · $passes pasadas · ${text.split(" ").size} palabras")
    return if (text.length > 40) text else null
  }
}
