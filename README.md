# Perchance Image API — pronto para o app

API completa e funcional para gerar imagens com `perchance.org/ai-text-to-image-generator`, com o problema de detecção de bots (Cloudflare Turnstile) **resolvido sem navegador**: HTTP puro com `curl_cffi`, usando o ad code como `accessCode` no `verifyUser`.

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

## Arquitetura: site de introdução (Pages) + API (Render)

| Parte | Onde roda | O que faz |
|---|---|---|
| `docs/` | GitHub Pages (estático) | Site de introdução + referência da API |
| `server.py` + `perchance_client.py` | Render (Docker) | API real via Flask + curl_cffi (sem navegador) |

- Site: https://cerberusld.github.io/perchance-image-api/
- Referência: https://cerberusld.github.io/perchance-image-api/api.html
- API: `https://SEU-SERVICO.onrender.com`

O Pages publica a pasta `docs/` a cada push em `main` (Settings → Pages → Deploy from a branch → main /docs).

### Deploy da API no Render

1. Render → **New → Blueprint** → selecione este repositório (o `render.yaml` já está pronto).
2. Aguarde o build do Docker (rápido: sem download de navegador).
3. Abra `https://SEU-SERVICO.onrender.com/warmup` uma vez (cria a sessão HTTP e valida o acesso).
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



## Parâmetros de `/generate`

| Parâmetro | Tipo | Default | Descrição |
|---|---|---|---|
| `prompt` | string | obrigatório | Descrição da imagem |
| `negative_prompt` | string | `""` | O que evitar |
| `resolution` | string | `768x768` | `512x512` \| `512x768` \| `768x512` \| `768x768` |
| `guidance_scale` | float | `7.0` | 1–30, aderência ao prompt |
| `seed` | int | `-1` | -1 = aleatório; mesmo seed ≈ mesma imagem |
| `style` | string | — | Qualquer um dos 76 estilos |
| `response_format` | string | — | `json` para base64 |

## Como funciona (resumo)

1. O cliente gera um `browserId` (32 hex) e busca o ad code em `perchance.org/api/getAccessCodeForAdPoweredStuff`.
2. Chama `verifyUser?browserId=...&accessCode=<adcode>&thread=0` → `userKey` (64 hex). O ad code vale como `accessCode`, então **não há Turnstile nem navegador**.
3. Faz `POST /api/generate?userKey=...&adAccessCode=...&v=...` por HTTP (curl_cffi impersona o TLS do Chrome) com prompt, negative, seed, resolução e guidance.
4. Baixa a imagem via `downloadTemporaryImageViaProxy` (ou `downloadTemporaryImage?imageId=...`).

## Notas

- A primeira geração leva 30–90 s (aquecimento). As seguintes ~5–15 s.
- Um cliente por processo; não paralelize na mesma instância.
- O `userKey` expira em ~30 s; o cliente o atualiza automaticamente.
- Documentação detalhada em `perchance-api.md` (§16).
