/**
 * Traducción del prompt a inglés, invisible para el usuario.
 *
 * El generador entiende mejor el inglés, así que antes de renderizar se traduce
 * el texto (cualquier idioma → inglés). Si ya está en inglés, no se toca; si el
 * servicio no responde, se usa el texto original para no bloquear la generación.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

const cache = new Map<string, string>();

type GtxResponse = [Array<[string, string]> | null, unknown, string?];

/** Traduce al inglés y devuelve también si hubo traducción real. */
export async function ensureEnglish(
  text: string,
  timeoutMs = 8000,
): Promise<{ text: string; translated: boolean }> {
  const clean = text.trim();
  if (clean.length < 3) return { text, translated: false };

  const cached = cache.get(clean);
  if (cached) return { text: cached, translated: cached !== clean };

  if (typeof fetch !== 'function') return { text, translated: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url =
      `${ENDPOINT}?client=gtx&sl=auto&tl=en&dt=t&q=` + encodeURIComponent(clean);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { text, translated: false };

    const data = (await res.json()) as GtxResponse;
    const chunks = Array.isArray(data?.[0]) ? data[0] : [];
    const translated = chunks
      .map((part) => (Array.isArray(part) ? part[0] ?? '' : ''))
      .join('')
      .trim();
    const source = typeof data?.[2] === 'string' ? data[2] : '';

    if (!translated) return { text, translated: false };
    if (source === 'en') return { text, translated: false };

    cache.set(clean, translated);
    return { text: translated, translated: true };
  } catch {
    return { text, translated: false };
  } finally {
    clearTimeout(timer);
  }
}
