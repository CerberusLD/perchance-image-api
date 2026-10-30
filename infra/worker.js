/**
 * Aether — proxy público neutro.
 *
 * Objetivo: que la app nunca hable directamente con el motor real.
 *  - El hostname que ve el usuario es este Worker (aether-api.<subdominio>.workers.dev)
 *  - Solo se aceptan dos rutas: /health y /generate
 *  - Se descartan todas las cabeceras del origen (incluidas las que identifican al motor)
 *  - Los errores del origen se traducen a mensajes genéricos
 *  - Límite de peticiones por IP, best-effort, sin necesidad de KV
 *
 * Desplegar:
 *   cd infra && npx wrangler deploy
 */

const ORIGIN = 'https://perchance-image-api-vn4j.onrender.com';

const ALLOWED_FIELDS = new Set([
  'prompt',
  'negative_prompt',
  'style',
  'resolution',
  'seed',
  'guidance_scale',
]);

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = buckets.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    buckets.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (buckets.size > 5000) buckets.clear();
  return entry.count > MAX_PER_WINDOW;
}

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const ip = request.headers.get('cf-connecting-ip') || 'anonymous';
    if (rateLimited(ip)) {
      return json({ error: 'rate_limited' }, 429);
    }

    if (url.pathname === '/health') {
      try {
        const upstream = await fetch(`${ORIGIN}/health`, {
          headers: { Accept: 'application/json' },
        });
        if (!upstream.ok) return json({ status: 'waking' });
        return json({ status: 'ok' });
      } catch {
        return json({ status: 'unreachable' }, 503);
      }
    }

    if (url.pathname === '/generate') {
      let payload;
      if (request.method === 'POST') {
        try {
          const raw = await request.json();
          payload = {};
          for (const [key, value] of Object.entries(raw || {})) {
            if (ALLOWED_FIELDS.has(key) && value !== undefined && value !== null) {
              payload[key] = value;
            }
          }
        } catch {
          return json({ error: 'bad_request' }, 400);
        }
      } else {
        payload = {};
        for (const [key, value] of url.searchParams.entries()) {
          if (ALLOWED_FIELDS.has(key)) payload[key] = value;
        }
      }

      if (!payload.prompt || typeof payload.prompt !== 'string' || payload.prompt.trim().length < 3) {
        return json({ error: 'bad_request' }, 400);
      }
      if (payload.prompt.length > 800) payload.prompt = payload.prompt.slice(0, 800);
      payload.response_format = 'jpeg';

      try {
        const upstream = await fetch(`${ORIGIN}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'image/jpeg' },
          body: JSON.stringify(payload),
        });

        const type = upstream.headers.get('content-type') || '';
        if (!upstream.ok || !type.startsWith('image/')) {
          // El cuerpo del origen no se reenvía nunca: puede contener detalles internos.
          const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 503 : 422;
          return json({ error: status === 429 ? 'busy' : status === 422 ? 'rejected' : 'failed' }, status);
        }

        return new Response(upstream.body, {
          status: 200,
          headers: cors({
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline',
          }),
        });
      } catch {
        return json({ error: 'failed' }, 503);
      }
    }

    // Cualquier otra ruta se ignora: no exponemos el resto del backend.
    return json({ error: 'not_found' }, 404);
  },
};
