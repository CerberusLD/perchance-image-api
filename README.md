# Aether — app Android + API de generación de imágenes

App **nativa para Android** que genera imágenes desde el propio teléfono (sin servidor) y la
API en Python que la respalda.

**[⬇️ Descargar el APK](https://github.com/CerberusLD/perchance-image-api/releases/latest)** · [Documentación de la app](mobile/README.md) · [Referencia de la API](perchance-api.md)

### Ediciones

| Edición | Cuota | Descarga | `applicationId` |
|---|---|---|---|
| **Aether** (sin límite desde 1.1.1) | — | [v1.1.1](https://github.com/CerberusLD/perchance-image-api/releases/tag/v1.1.1) | `com.aether.studio` |
| **Aether Unlimited** | sin límite | [v1.1.1-unlimited](https://github.com/CerberusLD/perchance-image-api/releases/tag/v1.1.1-unlimited) | `com.aether.studio.unlimited` |

Se instalan por separado: puedes tener las dos a la vez. La edición ilimitada sale del mismo
código compilada con `EXPO_PUBLIC_UNLIMITED=1`.

- App: `mobile/` — Expo SDK 58 + React Native, tema oscuro, gratis con cuota diaria.
  El motor vive dentro del APK: una WebView a pantalla completa detrás de la interfaz conduce el
  generador y un módulo nativo en Kotlin lee el resultado por DevTools (CDP), incluso desde un
  iframe de otro origen.
- API opcional: `server.py` + Camoufox headful (Xvfb) para usar el generador desde un servidor.
- Sin marca de agua y sin exponer el proveedor en ninguna pantalla.

---

# Perchance Image API — pronto para o app

API completa e funcional para gerar imagens com `perchance.org/ai-text-to-image-generator`, com o problema de detecção de bots (Cloudflare Turnstile) **resolvido sem navegador**: HTTP puro com `curl_cffi`, usando o ad code como `accessCode` no `verifyUser`.

Se o IP do host for recusado (`token_required`, típico de datacenter), a API cai automaticamente no **Pollinations** (grátis, sem chave) para continuar devolvendo imagens. O parâmetro `provider` permite forçar `perchance` ou `pollinations`.

## O que há aqui

| Arquivo | Descrição |
|---|---|
| `perchance-api.md` | Documentação completa da API (oficial v1, interna, texto, embed, estilos, erros, fluxo sem navegador) |
| `perchance_client.py` | Cliente Python pronto para usar (`PerchanceClient`) |
| `server.py` | API HTTP (Flask) com `/health`, `/warmup`, `/styles`, `/generate` |
| `test_client.py` | Teste que gera 3 imagens de exemplo |
| `perchance-styles.json` | 76 estilos com suas keywords |
| `example-official-api.html` | Exemplo da Official Image API v1 no navegador |
| `test_cat.jpg`, `test_leopard.jpg`, `test_city.jpg` | Geradas ao executar `test_client.py` (não versionadas) |

## Instalação

```bash
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
```

## Uso rápido (Python)

```python
from perchance_client import PerchanceClient

with PerchanceClient() as pc:
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
# imagem direta
curl "http://127.0.0.1:8000/generate?prompt=a%20cute%20cat&style=Cinematic&resolution=768x768" -o cat.jpg

# JSON com base64
curl -X POST http://127.0.0.1:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"cyberpunk city","style":"Pixel Art","resolution":"768x512","seed":42,"response_format":"json"}'

# estilos disponíveis
curl http://127.0.0.1:8000/styles

# saúde
curl http://127.0.0.1:8000/health
```

## App móvil (Aether) y motor actual

- App: `mobile/` — Expo SDK 58 + expo-router, tema oscuro, gratis con cuota diaria y gancho de anuncios.
  Ver `mobile/README.md` para ejecutarla en el teléfono, compilar APK y publicar.
- Motor: `server.py` + Camoufox (`perchance_client.py`). **Necesita ventana real**: `HEADLESS=0`
  (por defecto) y `xvfb-run` en el contenedor, porque el reto de Cloudflare no se resuelve sin display.
- Proxy neutro para la app: `infra/worker.js` (reenvía) o `infra/worker-ai.js` (genera con Workers AI).

> **Importante:** la instância publicada en `perchance-image-api-vn4j.onrender.com` corresponde al
> código antiguo (curl_cffi sin navegador). Desde IP de datacenter cae en el *fallback* de Pollinations
> y sus imágenes llevan marca de agua `pollinations.ai`, lo que rompe el requisito de marca blanca.
> Para servir imágenes limpias hay que redesplegar con este `Dockerfile` (Camoufox + Xvfb) o usar
> `infra/worker-ai.js`. Comprobado: con navegador headful local, `/generate` responde `200` con
> 768×768 JPEG, sin EXIF y sin marca de agua, en ~29 s.

---

## Arquitetura: site de introdução (Pages) + API (Render)

| Parte | Onde roda | O que faz |
|---|---|---|
| `docs/` | GitHub Pages (estático) | Site de introdução + referência da API |
| `server.py` + `perchance_client.py` | Render (Docker) | API real via Flask + curl_cffi (sem navegador) |

- Site (landing + playground): https://cerberusld.github.io/perchance-image-api/
- Referência: https://cerberusld.github.io/perchance-image-api/api.html
- API publicada: **https://perchance-image-api-vn4j.onrender.com**

O Pages publica a pasta `docs/` a cada push em `main` (Settings → Pages → Deploy from a branch → main /docs).

### Deploy da API no Render

1. Render → **New → Blueprint** → selecione este repositório (o `render.yaml` já está pronto).
2. Aguarde o build do Docker (rápido: sem download de navegador).
3. Abra `https://perchance-image-api-vn4j.onrender.com/warmup` uma vez (cria a sessão HTTP e valida o acesso).
4. Confirme `GET /health` → `{"status":"ok","ready":true}`.

> **Plano free do Render:** 512 MB são suficientes: sem navegador, o consumo é baixo e a geração leva ~5–15 s. O free dorme após inatividade — a primeira chamada depois disso demora alguns segundos para acordar.
>
> **IP de datacenter:** o Render usa IP de datacenter e o Perchance pode recusar a verificação do ad code com `token_required`. Nesse caso, configure `PERCHANCE_PROXY` no dashboard do Render com um proxy HTTP residencial/sticky (`http://user:pass@host:port`). O fluxo inteiro (ad code, verifyUser, generate, download) passa pelo mesmo IP — continua sem navegador.

### Por que a API não roda no Pages

O GitHub Pages é **hospedagem estática**: não executa Python, não abre navegador e não resolve Cloudflare/Turnstile. Além disso:

- `perchance.org` envia `X-Frame-Options: sameorigin` → não pode ser embutido em iframe de outro domínio.
- O endpoint do ad code não tem CORS → o navegador não consegue chamá-lo de `github.io`.
- O embed `image-generation.perchance.org` só permite `frame-ancestors` de `*.perchance.org`.

Por isso a geração roda no Render (curl_cffi, sem navegador) e o Pages é só o site de introdução/documentação.

### SDK no navegador

```html
<script src="https://cerberusld.github.io/perchance-image-api/perchance-api.js"></script>
<script>
  PerchanceAPI.setBase("https://SEU-SERVICO.onrender.com");
  const r = await PerchanceAPI.generate("a cute cat", {
    style: "Cinematic",
    resolution: "768x768",
    guidanceScale: 7,
    seed: 12345,
    negativePrompt: "blurry, low quality"
  });
  document.querySelector("img").src = r.dataUrl;
</script>
```



## API publicada

Base: **https://perchance-image-api-vn4j.onrender.com**

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Metadados e lista de endpoints |
| GET | `/health` | `{"status":"ok","ready":true|false}` |
| GET | `/warmup` | Cria a sessão HTTP e valida o acesso |
| GET | `/styles` | Lista os 76 estilos |
| GET | `/generate?prompt=...` | JPEG direto |
| POST | `/generate` | JPEG (padrão) ou JSON com `response_format=json` |

```bash
# JPEG direto
curl "https://perchance-image-api-vn4j.onrender.com/generate?prompt=a%20cute%20cat&style=Cinematic&resolution=768x768" -o cat.jpg

# JSON com base64
curl -X POST https://perchance-image-api-vn4j.onrender.com/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"cyberpunk city","style":"Pixel Art","resolution":"768x512","seed":42,"response_format":"json"}'

# saúde / estilos
curl https://perchance-image-api-vn4j.onrender.com/health
curl https://perchance-image-api-vn4j.onrender.com/styles
```

O playground da landing usa essa mesma base. Para apontar para outro host (Vercel, Railway, Fly ou VPS), edite `docs/config.js`:

```js
window.PERCHANCE_API_BASE = "https://SEU-HOST";
```

> **Importante:** em IP de datacenter o Perchance pode responder `token_required`. Por padrão a API então usa o **Cloudflare Workers AI** (se configurado) e, em último caso, o **Pollinations** — devolvendo a imagem mesmo assim (`X-Image-Provider`). Para usar o Perchance nesse host, configure `PERCHANCE_PROXY` (proxy HTTP residencial/sticky); o fluxo continua 100% sem navegador.

### Fallback grátis e confiável: Cloudflare Workers AI

O plano gratuito do Workers AI não pede cartão e cobre milhares de imagens por dia. É a forma recomendada de fazer `/generate` funcionar sempre no Render (IP de datacenter), sem proxy e sem navegador.

1. Crie uma conta gratuita em https://dash.cloudflare.com
2. **Workers AI → Use REST API → Create Workers AI API Token** e copie o token.
3. Copie o **Account ID** mostrado na mesma página.
4. No Render → **Environment**, adicione:
   - `CF_ACCOUNT_ID` = seu Account ID
   - `CF_API_TOKEN` = o token copiado
   - (opcional) `CF_MODEL` = `@cf/stabilityai/stable-diffusion-xl-base-1.0` (padrão) ou `@cf/black-forest-labs/flux-1-schnell`
5. Reinicie o serviço. `GET /` deve mostrar `"cloudflare_ready": true`.

Cadeia em `auto`: **Perchance → Cloudflare → Pollinations**. O header `X-Image-Provider` e o campo `provider` no JSON dizem qual respondeu. Sem chave, o Pollinations gratuito limita a **1 imagem a cada 45 s por IP**; com `POLLINATIONS_TOKEN` esse limite desaparece.

## Parâmetros de `/generate`

| Parâmetro | Tipo | Default | Descrição |
|---|---|---|---|
| `prompt` | string | obrigatório | Descrição da imagem |
| `negative_prompt` | string | `""` | O que evitar |
| `resolution` | string | `768x768` | `512x512` \| `512x768` \| `768x512` \| `768x768` |
| `guidance_scale` | float | `7.0` | 1–30, aderência ao prompt |
| `seed` | int | `-1` | -1 = aleatório; mesmo seed ≈ mesma imagem |
| `style` | string | — | Qualquer um dos 76 estilos |
| `provider` | string | `auto` | `auto` \| `perchance` \| `cloudflare` \| `pollinations` |
| `response_format` | string | — | `json` para base64 |

## Como funciona (resumo)

1. O cliente gera um `browserId` (32 hex) e busca o ad code em `perchance.org/api/getAccessCodeForAdPoweredStuff`.
2. Chama `verifyUser?browserId=...&accessCode=<adcode>&thread=0` → `userKey` (64 hex). O ad code vale como `accessCode`, então **não há Turnstile nem navegador**.
3. Faz `POST /api/generate?userKey=...&adAccessCode=...&v=...` por HTTP (curl_cffi impersona o TLS do Chrome) com prompt, negative, seed, resolução e guidance.
4. Baixa a imagem via `downloadTemporaryImageViaProxy` (ou `downloadTemporaryImage?imageId=...`).

## Notas

- A primeira chamada após o deploy (ou depois de o serviço dormir) pode levar alguns segundos a mais; depois, ~5–15 s por imagem.
- No Render (IP de datacenter) o Perchance é recusado e a API usa o Pollinations automaticamente; o header `X-Image-Provider` e o campo `provider` no JSON dizem qual foi usado.
- Variáveis: `IMAGE_PROVIDER=auto|perchance|pollinations` e `IMAGE_FALLBACK=pollinations|none`.
- Um cliente por processo; não paralelize na mesma instância.
- O `userKey` expira em ~30 s; o cliente o atualiza automaticamente.
- Documentação detalhada em `perchance-api.md` (§17).
