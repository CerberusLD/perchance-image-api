# Perchance Image API — listo para la app

API completa y funcional para generar imágenes con `perchance.org/ai-text-to-image-generator`, con el problema de detección de bots (Cloudflare Turnstile) **resuelto** usando Camoufox.

## Qué hay aquí

| Archivo | Descripción |
|---|---|
| `perchance-api.md` | Documentación completa de la API (oficial v1, interna, texto, embed, estilos, errores, solución Camoufox) |
| `perchance_client.py` | Cliente Python listo para usar (`PerchanceClient`) |
| `server.py` | API HTTP (Flask) con `/health`, `/styles`, `/generate` |
| `test_client.py` | Test que genera 3 imágenes de ejemplo |
| `perchance-styles.json` | 76 estilos con sus keywords |
| `example-official-api.html` | Ejemplo de la Official Image API v1 en navegador |
| `test_cat.jpg`, `test_leopard.jpg`, `test_city.jpg` | Generadas al ejecutar `test_client.py` (no versionadas) |

## Instalación

```bash
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m camoufox fetch      # descarga Firefox anti-detect (~150 MB)
```

## Uso rápido (Python)

```python
from perchance_client import PerchanceClient

with PerchanceClient(headless=True) as pc:
    r = pc.generate(
        "a cute orange cat sitting on a windowsill",
        style="Cinematic",
        resolution="768x768",
        guidance_scale=7.0,
        seed=12345,
        negative_prompt="blurry, low quality",
    )
    open("cat.jpg", "wb").write(r["image_bytes"])
    print(r["width"], r["height"], r["seed"])
```

## Uso como API HTTP

```bash
.venv/bin/python server.py          # http://127.0.0.1:8000
```

```bash
# imagen directa
curl "http://127.0.0.1:8000/generate?prompt=a%20cute%20cat&style=Cinematic&resolution=768x768" -o cat.jpg

# JSON con base64
curl -X POST http://127.0.0.1:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"cyberpunk city","style":"Pixel Art","resolution":"768x512","seed":42,"response_format":"json"}'

# estilos disponibles
curl http://127.0.0.1:8000/styles

# salud
curl http://127.0.0.1:8000/health
```

## Parámetros de `/generate`

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `prompt` | string | requerido | Descripción de la imagen |
| `negative_prompt` | string | `""` | Qué evitar |
| `resolution` | string | `768x768` | `512x512` \| `512x768` \| `768x512` \| `768x768` |
| `guidance_scale` | float | `7.0` | 1–30, adherencia al prompt |
| `seed` | int | `-1` | -1 = aleatorio; mismo seed ≈ misma imagen |
| `style` | string | — | Cualquiera de los 76 estilos |
| `response_format` | string | — | `json` para base64 |

## Cómo funciona (resumen)

1. Camoufox abre la página y pasa Cloudflare Turnstile.
2. Una generación de calentamiento crea el `userKey` (64 hex) en el `localStorage` del iframe embed.
3. El cliente lee el `userKey` y el `adAccessCode` desde el contexto del navegador.
4. Hace `POST /api/generate` **dentro del iframe verificado** (con cookies/TLS del navegador) con control total: prompt, negative, seed, resolución, guidance.
5. Descarga la imagen vía `downloadTemporaryImageViaProxy`.

## Notas

- La primera generación tarda 30–90 s (calentamiento). Las siguientes ~5–15 s.
- Un cliente por proceso; no paralelizar sobre la misma instancia.
- `userKey` caduca ~30 s; el cliente lo refresca automáticamente.
- Documentación detallada en `perchance-api.md` (§16).
