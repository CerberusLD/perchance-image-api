/**
 * Aether — variante del proxy que GENERA las imágenes dentro del propio Worker
 * (Cloudflare Workers AI, modelo flux-1-schnell). No hay backend detrás:
 * ni origen, ni marca de agua, ni dominio de terceros en la respuesta.
 *
 * Requisitos:
 *   - Cuenta de Cloudflare con Workers AI habilitado (plan gratuito incluido:
 *     ~10.000 neuronas/día, suficiente para probar y para poco tráfico).
 *   - Binding `AI` declarado en wrangler (ver wrangler.ai.toml).
 *
 * Desplegar:
 *   cd infra && npx wrangler deploy -c wrangler.ai.toml
 */

const MODEL = '@cf/black-forest-labs/flux-1-schnell';

const STYLE_HINTS = {
  Cinematic: 'cinematic film still, dramatic lighting, 35mm, shallow depth of field',
  'Professional Photo': 'professional photography, sharp focus, natural light, 85mm lens',
  'Digital Painting': 'digital painting, rich brush strokes, vivid colors',
  'Oil Painting': 'oil painting, textured canvas, classical technique',
  Anime: 'anime illustration, clean lineart, vibrant colors',
  'Studio Ghibli': 'studio ghibli style, hand painted background, warm palette',
  'Concept Art': 'concept art, matte painting, worldbuilding design',
  'Fantasy Portrait': 'fantasy portrait, epic rim light, ornate details',
  Watercolor: 'watercolor painting, soft washes, paper texture',
  'Pixel Art': 'pixel art, 16-bit sprite, crisp pixels',
  '3D Isometric Icon': 'isometric 3d icon, soft shadows, clean render',
  'Neon Vintage Anime': 'retro 80s anime, neon glow, film grain',
  Manga: 'manga panel, black and white ink, screentone',
  Pencil: 'graphite pencil drawing, paper grain, hatching',
  Claymation: 'claymation still, plasticine texture, soft studio light',
  'Fantasy Landscape': 'epic fantasy landscape, atmospheric depth, golden hour',
  'Tattoo Design': 'tattoo design, bold linework, high contrast, black ink',
};

function cors(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    ...headers,
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: cors({ 'Content-Type': 'application/json; charset=utf-8' }),
  });

/** "768x1024" -> { width, height } redondeado a múltiplos de 8. */
function dims(resolution) {
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(String(resolution || ''));
  const clamp = (v) => Math.max(256, Math.min(1024, Math.round(v / 8) * 8));
  if (!match) return { width: 768, height: 768 };
  return { width: clamp(Number(match[1])), height: clamp(Number(match[2])) };
}

function bytesFrom(result) {
  if (result instanceof ReadableStream) return result;
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  const b64 = result?.image ?? result?.images?.[0] ?? result;
  if (typeof b64 !== 'string') throw new Error('unexpected_model_output');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === '/health') {
      return json({ status: env?.AI ? 'ok' : 'unreachable' });
    }

    if (url.pathname !== '/generate') {
      return json({ error: 'not_found' }, 404);
    }

    let body;
    try {
      body = request.method === 'POST' ? await request.json() : Object.fromEntries(url.searchParams);
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    const prompt = String(body.prompt || '').trim();
    if (prompt.length < 3) return json({ error: 'bad_request' }, 400);
    if (!env?.AI) return json({ error: 'engine_unavailable' }, 503);

    const { width, height } = dims(body.resolution);
    const negative = String(body.negative_prompt || '').slice(0, 200);
    const style = STYLE_HINTS[body.style] || '';
    const full = [prompt, style, negative ? `avoid: ${negative}` : ''].filter(Boolean).join('. ');

    try {
      const result = await env.AI.run(MODEL, {
        prompt: full.slice(0, 2000),
        width,
        height,
        steps: 4,
      });

      return new Response(bytesFrom(result), {
        status: 200,
        headers: cors({ 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline' }),
      });
    } catch {
      return json({ error: 'failed' }, 503);
    }
  },
};
