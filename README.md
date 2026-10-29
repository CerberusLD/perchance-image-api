# Perchance Image API — pronto para o app

API completa e funcional para gerar imagens com `perchance.org/ai-text-to-image-generator`, com o problema de detecção de bots (Cloudflare Turnstile) **resolvido** usando Camoufox.

## O que há aqui

| Arquivo | Descrição |
|---|---|
| `perchance-api.md` | Documentação completa da API (oficial v1, interna, texto, embed, estilos, erros, solução Camoufox) |
| `perchance_client.py` | Cliente Python pronto para usar (`PerchanceClient`) |
| `server.py` | API HTTP (Flask) com `/health`, `/styles`, `/generate` |
| `test_client.py` | Teste que gera 3 imagens de exemplo |
| `perchance-styles.json` | 76 estilos com suas keywords |
| `example-official-api.html` | Exemplo da Official Image API v1 no navegador |
| `test_cat.jpg`, `test_leopard.jpg`, `test_city.jpg` | Geradas ao executar `test_client.py` (não versionadas) |

## Instalação

```bash
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m camoufox fetch      # baixa o Firefox anti-detect (~150 MB)
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

1. O Camoufox abre a página e passa pelo Cloudflare Turnstile.
2. Uma geração de aquecimento cria o `userKey` (64 hex) no `localStorage` do iframe embed.
3. O cliente lê o `userKey` e o `adAccessCode` a partir do contexto do navegador.
4. Faz `POST /api/generate` **dentro do iframe verificado** (com cookies/TLS do navegador) com controle total: prompt, negative, seed, resolução, guidance.
5. Baixa a imagem via `downloadTemporaryImageViaProxy`.

## Notas

- A primeira geração leva 30–90 s (aquecimento). As seguintes ~5–15 s.
- Um cliente por processo; não paralelize na mesma instância.
- O `userKey` expira em ~30 s; o cliente o atualiza automaticamente.
- Documentação detalhada em `perchance-api.md` (§16).
