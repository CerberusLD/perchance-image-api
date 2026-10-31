package com.aether.studio

import org.json.JSONObject
import java.io.InputStream
import java.text.Normalizer

/**
 * Tokenizador BPE byte-level (estilo GPT-2) compatible con el `tokenizer.json`
 * del modelo de prompts.
 *
 * No hay librería de tokenizers en Android: se implementa el algoritmo estándar
 * (bytes -> unicode -> merges por rango) sobre el vocabulario y los merges
 * exportados desde el entrenamiento.
 */
class BpeTokenizer(private val vocab: Map<String, Int>, merges: List<Pair<String, String>>) {

  private val ranks: Map<Pair<String, String>, Int> =
    merges.withIndex().associate { (i, pair) -> pair to i }

  private val cache = HashMap<String, List<Int>>(4096)

  companion object {
    const val PAD = 0
    const val BOS = 1
    const val SEP = 2
    const val MASK = 3
    const val EOS = 4

    /** bytes -> caracteres visibles (misma tabla que GPT-2). */
    private val BYTE_TO_CHAR: CharArray = run {
      val bs = ArrayList<Int>()
      for (b in '!'.code..'~'.code) bs.add(b)
      for (b in 0xA1..0xAC) bs.add(b)
      for (b in 0xAE..0xFF) bs.add(b)
      val cs = bs.toMutableList()
      var n = 0
      for (b in 0..255) {
        if (!bs.contains(b)) {
          bs.add(b)
          cs.add(256 + n)
          n += 1
        }
      }
      val map = CharArray(256)
      for (i in bs.indices) map[bs[i]] = cs[i].toChar()
      map
    }

    private val GPT2_SPLIT = Regex(
      "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+",
      setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE),
    )

    fun fromStream(stream: InputStream): BpeTokenizer {
      val raw = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
      val root = JSONObject(raw)
      val vocabObj = root.getJSONObject("vocab")
      val vocab = HashMap<String, Int>(vocabObj.length() * 2)
      vocabObj.keys().forEach { k -> vocab[k] = vocabObj.getInt(k) }

      val mergesArr = root.getJSONArray("merges")
      val merges = ArrayList<Pair<String, String>>(mergesArr.length())
      for (i in 0 until mergesArr.length()) {
        val item = mergesArr.get(i)
        if (item is String) {
          val parts = item.split(" ")
          if (parts.size == 2) merges.add(parts[0] to parts[1])
        } else {
          val pair = mergesArr.getJSONArray(i)
          merges.add(pair.getString(0) to pair.getString(1))
        }
      }
      return BpeTokenizer(vocab, merges)
    }
  }

  /** Texto -> ids, sin tokens especiales (equivale a add_special_tokens=False). */
  fun encode(text: String): List<Int> {
    cache[text]?.let { return it }
    val out = ArrayList<Int>()
    val normalized = Normalizer.normalize(text, Normalizer.Form.NFC)
    for (chunk in GPT2_SPLIT.findAll(normalized).map { it.value }) {
      out.addAll(encodeChunk(chunk))
    }
    cache[text] = out
    return out
  }

  private fun encodeChunk(chunk: String): List<Int> {
    // bytes -> unicode
    val sb = StringBuilder()
    for (b in chunk.toByteArray(Charsets.UTF_8)) sb.append(BYTE_TO_CHAR[b.toInt() and 0xFF])

    var word = sb.toString().map { it.toString() }.toMutableList()
    if (word.isEmpty()) return emptyList()

    while (word.size > 1) {
      var bestRank = Int.MAX_VALUE
      var bestIdx = -1
      for (i in 0 until word.size - 1) {
        val rank = ranks[word[i] to word[i + 1]] ?: continue
        if (rank < bestRank) {
          bestRank = rank
          bestIdx = i
        }
      }
      if (bestIdx < 0) break
      // fusiona el primer par con el mejor rango
      val merged = word[bestIdx] + word[bestIdx + 1]
      word = (word.subList(0, bestIdx) + listOf(merged) + word.subList(bestIdx + 2, word.size))
        .toMutableList()
    }

    val ids = ArrayList<Int>(word.size)
    for (piece in word) {
      val id = vocab[piece] ?: vocab["<unk>"] ?: 0
      ids.add(id)
    }
    return ids
  }

  fun decode(ids: List<Int>): String {
    // reconstruye el texto: id -> pieza, pieza -> bytes vía la tabla inversa
    val inverse = HashMap<Char, Int>(256)
    for (b in 0..255) inverse[BYTE_TO_CHAR[b]] = b

    val bytes = java.io.ByteArrayOutputStream()
    for (id in ids) {
      val piece = idToPiece[id] ?: continue
      for (c in piece) {
        val b = inverse[c]
        if (b != null) bytes.write(b)
      }
    }
    return try {
      String(bytes.toByteArray(), Charsets.UTF_8)
    } catch (e: Exception) {
      ""
    }
  }

  private val idToPiece: Map<Int, String> by lazy {
    val map = HashMap<Int, String>(vocab.size * 2)
    vocab.forEach { (piece, id) -> map[id] = piece }
    map
  }
}
