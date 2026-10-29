# Perchance AI Image Generator — Complete API Documentation

> **Source:** `https://perchance.org/ai-text-to-image-generator` (and related generators)
> **Type:** Unofficial / reverse-engineered. Perchance has no published developer portal; everything below was recovered from the page's own JavaScript, network traffic and community clients (eeemoon/perchance, Yuser00123/perchance-mcp-unlimited, Gousting/perchance-api, someoneuk/perchanceapi).
> **Stability:** Endpoints, version hashes and Turnstile flows change without notice. Treat as a moving target and re-extract when something breaks.
> **Audience:** Building an app that generates images (and text) via Perchance.

---

## 0. TL;DR — which API should my app use?

| Goal | Use | Why |
|---|---|---|
| Images in a browser/web app, permanent hosted URLs, no keys | **Official Image API v1** (`perchance.org/perchance-ai-api`) | No auth, no CORS, iframe+postMessage, returns permanent `user.uploads.dev` URLs, unlimited |
| Maximum control (negative prompt, guidance scale, style injection, download raw bytes) | **Internal API** (`image-generation.perchance.org/api/*`) | Fastest, returns imageId + proxy download token, supports channels/styles | Requires browserId + userKey + adAccessCode + Turnstile |
| Text generation | **Text API** (`text-generation.perchance.org/api`) | SSE streaming, userKey auth |
| Most reliable local generation (handles Turnstile itself) | **Embed API** (`image-generation.perchance.org/embed#payload`) | Runs Perchance's own JS in a real browser |

**Recommendation for a new app:** start with the **Official Image API v1**. It is the only one designed for external apps ("Works from any domain — your custom app, a localhost page, any site. No keys, no CORS, no backend."). Drop to the Internal API only if you need raw bytes / custom channels.

---

## 1. Architecture overview

```
perchance.org/ai-text-to-image-generator
│
├── Main page (Cloudflare protected, JS app)
│   └── iframe: #outputIframeEl  (generator page on *.perchance.org)
│       └── 4 nested iframes: image-generation.perchance.org/embed
│           └── each renders one image as <img src="data:image/jpeg;base64,...">
│
├── Official Image API v1
│   └── perchance.org/perchance-ai-api  (iframe + postMessage → user.uploads.dev URL)
│
├── Internal API (image-generation.perchance.org/api/*)
│   ├── verifyUser              (Turnstile → userKey)
│   ├── checkUserVerificationStatus
│   ├── getAccessCodeForAdPoweredStuff  (ad access code)
│   ├── generate               (POST → imageId + download token)
│   ├── downloadTemporaryImage / downloadTemporaryImageViaProxy
│   └── getUserQueuePosition
│
├── Text API (text-generation.perchance.org/api/*)
│   ├── verifyUser  (returns userKey in HTML)
│   └── generate   (SSE stream)
│
└── Embed API
    └── image-generation.perchance.org/embed#<JSON payload>
```

**Key facts**
- There is **no API key**. Auth is dynamic: `browserId` (32 hex) + `userKey` (64 hex) + `adAccessCode` (64 hex) + Cloudflare Turnstile token (sitekey `0x4AAAAAAAA8g8NphwaSOT59`).
- `userKey` is **IP-bound and short-lived (~30 s)**. It must be refreshed via a Turnstile token from the same IP.
- Images from the internal API are **temporary** (download within ~5 min, token single-use). The Official API v1 returns **permanent** `user.uploads.dev` URLs.
- Cloudflare protects both `perchance.org` and `image-generation.perchance.org`. Datacenter IPs get `403 Just a moment`. Use a real browser or `curl_cffi` TLS impersonation + residential proxy.

---

## 2. Official Image API v1 (RECOMMENDED for apps)

### 2.1 Endpoint

```
GET https://perchance.org/perchance-ai-api?prompt=...
```

Route flag also accepted: `https://perchance.org/perchance-ai-api?v1/image&prompt=...`

### 2.2 How to call it (browser / iframe)

It is designed to be called from a browser via a hidden iframe + `postMessage`. **No backend, no keys, no CORS.**

```js
// 1) warm up once per user (Cloudflare)
var _warmed = false;
function warmUp() {
  return new Promise(function (res) {
    if (_warmed) return res(true);
    var f = document.createElement("iframe");
    f.style.cssText = "width:1px;height:1px;border:0;position:absolute;opacity:0";
    f.src = "https://perchance.org";
    var t = setTimeout(function () { f.remove(); res(false); }, 15000);
    f.onload = function () {
      clearTimeout(t);
      setTimeout(function () { f.remove(); _warmed = true; res(true); }, 500);
    };
    document.body.appendChild(f);
  });
}

// 2) generate
var _cache = {};
function generateImage(prompt, opts) {
  var key = prompt + JSON.stringify(opts || {});
  if (_cache[key]) return Promise.resolve({ ok: true, url: _cache[key], cached: true });
  return new Promise(function (resolve, reject) {
    var p = new URLSearchParams({ prompt: prompt, format: "json", id: Math.random().toString(36).slice(2) });
    if (opts) Object.keys(opts).forEach(function (k) { p.set(k, opts[k]); });
    var f = document.createElement("iframe");
    f.style.cssText = "width:1px;height:1px;border:0;position:absolute;opacity:0";
    f.src = "https://perchance.org/perchance-ai-api?" + p;
    var settled = false;
    function onMsg(e) {
      var d = e.data || {};
      if (d.api !== "perchance-image-api" || !d.result || d.result.id !== p.get("id")) return;
      finish(d.result.ok ? resolve : reject, d.result);
    }
    function finish(cb, result) {
      if (settled) return; settled = true;
      window.removeEventListener("message", onMsg);
      f.remove();
      if (result.ok) _cache[key] = result.url;
      cb(result.ok ? result : new Error(result.error || "generation failed"));
    }
    window.addEventListener("message", onMsg);
    document.body.appendChild(f);
    setTimeout(function () { finish(reject, { ok: false, error: "timeout after 180s" }); }, 180000);
  });
}

// 3) use
warmUp().then(function () {
  return generateImage("a cute cat", { resolution: "768x768", seed: 7 });
}).then(function (r) {
  imgEl.src = r.url;   // r = { ok, url, seed, dataUrl, ... }
}).catch(function (e) { console.error(e); });
```

### 2.3 Parameters (query string)

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `prompt` | string | **yes** | — | What to draw. English works best. |
| `negativePrompt` | string | no | `NSFW, nudity, blurry, low quality, text, watermark` | Things to avoid. |
| `resolution` | string | no | `512x512` | `512x512` \| `512x768` \| `768x512` \| `768x768` |
| `guidanceScale` | number | no | `7` | 1–30. Higher = closer to prompt. |
| `seed` | integer | no | random | Same seed + prompt ≈ same image. |
| `removeBackground` | bool | no | `false` | Transparent PNG output. |
| `width` / `height` | number | no | — | Display size on result page (optional). |
| `saveTitle` / `saveDescription` | string | no | — | Metadata (optional). |
| `format` | string | no | `html` | `html` \| `json` \| `redirect` |
| `callback` | string | no | — | JSONP callback name (with `format=json`). |
| `id` | string | yes* | — | Unique request id; must match `d.result.id` in postMessage. Auto-generated in the snippet. |

\* `id` is required for the postMessage correlation; the snippet generates `Math.random().toString(36).slice(2)`.

### 2.4 `format` modes

- `html` (default) — returns a nice page showing the image.
- `json` — returns `{ ok, url, dataUrl, seed, ... }` (used in the iframe snippet).
- `redirect` — 302 to the hosted image URL.

### 2.5 Result object

```json
{ "ok": true, "url": "https://user.uploads.dev/...", "seed": 7, "dataUrl": "data:image/jpeg;base64,...", "cached": false }
```

- `url` is a **permanent** `user.uploads.dev` URL — never challenged, cacheable, safe to store.
- `dataUrl` is an inline base64 image (useful if you want bytes without a second fetch).

### 2.6 Examples

```
# nice HTML page
https://perchance.org/perchance-ai-api?v1/image&prompt=a%20cute%20cat%20pixel%20art&format=html

# JSON
https://perchance.org/perchance-ai-api?prompt=a%20dragon%20oil%20painting&resolution=768x768&guidanceScale=9&seed=7&format=json

# redirect straight to image
https://perchance.org/perchance-ai-api?prompt=cyberpunk%20city&format=redirect

# JSONP (cross-origin)
https://perchance.org/perchance-ai-api?prompt=aurora%20sky&format=json&callback=myCallback
```

### 2.7 Notes
- Unlimited — no usage caps, no rate limits on the official endpoint.
- Image is generated on the **caller's** browser quota (the iframe runs in the user's browser), so a headless server cannot call it directly — use a real browser or the Embed/Internal flows from a server.
- Cache by `prompt+opts` key; permanent URLs make most requests Cloudflare-free after the first.

---

## 3. Internal Image API (`image-generation.perchance.org/api/*`)

Lower-level, faster, more control. Used by the stable-diffusion-ai generator. Requires auth tokens.

### 3.1 Base URLs

```
BASE_EMBED     = https://image-generation.perchance.org
BASE_PERCHANCE = https://perchance.org
API_GENERATE   = https://image-generation.perchance.org/api/generate
API_DOWNLOAD   = https://image-generation.perchance.org/api/downloadTemporaryImage
API_DOWNLOAD_PROXY = https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy
API_VERIFY     = https://image-generation.perchance.org/api/verifyUser
API_CHECK      = https://image-generation.perchance.org/api/checkUserVerificationStatus
API_AD_CODE    = https://perchance.org/api/getAccessCodeForAdPoweredStuff
API_QUEUE      = https://image-generation.perchance.org/api/getUserQueuePosition
```

### 3.2 Auth model

| Token | Shape | Source | Lifetime |
|---|---|---|---|
| `browserId` | 32 hex chars | `localStorage['generation-v2-browser']` or generated: `[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('')` | persistent per browser |
| `userKey` | 64 hex chars | `localStorage['generation-v2:{browserId}:userKey-{thread}']` or from `verifyUser` | ~30 s, IP-bound |
| `adAccessCode` | 64 hex chars | `GET /api/getAccessCodeForAdPoweredStuff` | ~10 min |
| Turnstile token | long string | Cloudflare Turnstile, sitekey `0x4AAAAAAAA8g8NphwaSOT59` | one-shot |
| `v` (client version hash) | 40 hex | extracted from embed JS | changes occasionally |

**Current `v` hash (2026-09-24):** `9b43eec2e71907610e4e9317b54c208495f6850086e92239a869811d2e2d77ee`
**Old (now returns `client_update_required`):** `f4fd5ce3a6a768bf12d73c3d6a678d1fb5811e4a24b41c7964a13dc789c811cd`

### 3.3 Flow

```
1. browserId  = load or generate 32-hex (persist in localStorage)
2. adAccessCode = GET /api/getAccessCodeForAdPoweredStuff  (Referer/Origin/UA headers)
3. userKey:
   a. tokenless: GET /api/verifyUser?browserId=...&thread=0  → {status:"failed_verification",reason:"token_required"}
      (or "already_verified" + userKey if cached)
   b. solve Turnstile (sitekey above) → token
   c. GET /api/verifyUser?browserId=...&token=<token>&thread=0  → {status:"success",userKey:"64hex"}
   d. (optional) GET /api/checkUserVerificationStatus?userKey=...&cacheKey=... → {status:"verified"}
4. POST /api/generate?userKey=...&requestId=...&adAccessCode=...&v=...&__cacheBust=...
   body: {prompt, negativePrompt, seed, resolution, guidanceScale, channel, subChannel, userKey, adAccessCode, requestId}
5. Download image via proxy token or imageId
```

### 3.4 `GET /api/verifyUser`

```
GET https://image-generation.perchance.org/api/verifyUser?browserId={32hex}&token={turnstileToken}&thread={0}&__cacheBust={random}
```

Headers: `User-Agent`, `Referer: https://image-generation.perchance.org/embed`, `Origin: https://image-generation.perchance.org`.

- Without token: `{"status":"failed_verification","reason":"token_required"}` (or `"already_verified"`).
- With valid token: `{"status":"success","userKey":"<64hex>"}`.
- Rate limited: response body contains `too_many_requests`.
- IP mismatch / expired → `invalid_key` later at generate time.

Tokenless variant (old eeemoon method, now mostly fails): `GET .../verifyUser?thread=0&__cacheBust=...` returns an HTML page containing `"userKey":"..."`. Parse with `content.find('"userKey":"')`.

### 3.5 `GET /api/checkUserVerificationStatus`

```
GET https://image-generation.perchance.org/api/checkUserVerificationStatus?userKey={64hex}&cacheKey={int(time.time()//3)}
```
Response: `{"status":"verified"}` or `{"status":"not_verified"}`.

### 3.6 `GET /api/getAccessCodeForAdPoweredStuff`

```
GET https://perchance.org/api/getAccessCodeForAdPoweredStuff?__cacheBust={cacheBust}
```
Headers (required): `User-Agent`, `Referer: https://perchance.org/stable-diffusion-ai` (or your generator page), `Origin: https://perchance.org`, `Accept: */*` (or `*/*`), `Accept-Language: en-US,en;q=0.9`.

Response: plain text 64-hex code. Without proper headers/proxy → Cloudflare `Just a moment` HTML.

**curl_cffi bypass (open-source unlimited, no proxy needed):**
```python
from curl_cffi import requests
r = requests.get("https://perchance.org/api/getAccessCodeForAdPoweredStuff",
                 impersonate="chrome",
                 headers={"Referer":"https://perchance.org/stable-diffusion-ai",
                          "Origin":"https://perchance.org","Accept":"*/*"})
code = r.text.strip()   # 64 hex
```

### 3.7 `POST /api/generate` (internal)

```
POST https://image-generation.perchance.org/api/generate
     ?userKey={64hex}
     &requestId={requestId}
     &adAccessCode={64hex}
     &v={CLIENT_VERSION_HASH}
     &__cacheBust={random}
```

Headers: `Content-Type: application/json`, plus embed headers (`Referer: .../embed`, `Origin: https://image-generation.perchance.org`).

Body (JSON):
```json
{
  "prompt": "a cute cat",
  "negativePrompt": "",
  "seed": -1,
  "resolution": "512x512",
  "guidanceScale": 7.0,
  "channel": "stable-diffusion-ai",
  "subChannel": "public",
  "userKey": "<64hex>",
  "adAccessCode": "<64hex>",
  "requestId": "0.<random>"
}
```

**Notes:**
- `channel` is the generator name (e.g. `stable-diffusion-ai`, `ai-text-to-image-generator`, `ai-image-generator`). `subChannel` usually `public`.
- `requestId` format: `aiImageCompletion{random}` (eeemoon) or `0.{random}` (mcp). Both accepted.
- `resolution`: `512x512` | `512x768` | `768x512` | `768x768`. (The eeemoon wrapper only exposes `512x768`/`768x768`/`768x512` for portrait/square/landscape; the official API also has `512x512`.)

Success response:
```json
{
  "status": "success",
  "imageId": "...",
  "fileExtension": "jpeg",
  "seed": 12345,
  "prompt": "a cute cat, ...",
  "width": 768,
  "height": 768,
  "guidanceScale": 7.0,
  "negativePrompt": "",
  "maybeNsfw": false,
  "imageDownloadUrl": "/api/downloadTemporaryImageViaProxy?t=v1...."
}
```

Other response statuses:
| Status | Meaning | Action |
|---|---|---|
| `success` | OK | download via proxy token / imageId |
| `invalid_key` | userKey expired/invalid | refresh userKey, retry |
| `invalid_access_code` | ad code expired | refresh ad code, retry |
| `failed_verification` | Turnstile required | get fresh token |
| `waiting_for_prev_request_to_finish` | concurrency lock | wait 8 s, retry |
| `client_update_required` | `v` hash outdated | try old hash, then re-extract from embed JS |
| `invalid_key` (via proxy) | IP mismatch | must run from same IP that minted the key |

Response may also include `imageDataUrls: ["data:image/jpeg;base64,..."]` (direct data URL) instead of/in addition to imageId.

### 3.8 `GET /api/downloadTemporaryImage` (legacy)

```
GET https://image-generation.perchance.org/api/downloadTemporaryImage?imageId={imageId}
```
Returns image bytes (JPEG). May be blocked by Cloudflare without cf_clearance.

### 3.9 `GET /api/downloadTemporaryImageViaProxy` (new)

```
GET https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy?t={v1 token}
```
Headers response: `X-Perchance-Proxy-Backend: quick-tunnel`, `X-Image-Sha256`, `X-Expires-At`. Token is IP-bound, single-use, ~5 min expiry, requires cf_clearance cookie. Fetch inside a Playwright page context that has clearance, or via httpx with the right cookies.

Example token shape: `v1.Tyl8PPYSXrs1EMop.sUSxeYLCRH4D71MzsJ8dvbQhOmKD1yyXJy_40px5QTvQg6V-...`

### 3.10 `GET /api/getUserQueuePosition`

```
GET https://image-generation.perchance.org/api/getUserQueuePosition
```
Returns queue position for the current user (used when server is busy).

### 3.11 `_find_proxy_download` (helper)

The `imageDownloadUrl` / proxy token can be nested anywhere in the generate response. Recursively search for strings containing `downloadTemporaryImageViaProxy` or starting with `v1.` (len > 80):

```python
def _find_proxy_download(value):
    if isinstance(value, str):
        if "downloadTemporaryImageViaProxy" in value: return value
        if value.startswith("v1.") and len(value) > 80:
            return f"/api/downloadTemporaryImageViaProxy?t={value}"
        return None
    if isinstance(value, dict):
        for k in ("imageDownloadUrl","proxy_download","proxyDownload","proxyUrl","downloadUrl"):
            if k in value and isinstance(value[k], str):
                r = _find_proxy_download(value[k])
                if r: return r
        for v in value.values():
            r = _find_proxy_download(v)
            if r: return r
    if isinstance(value, list):
        for item in value:
            r = _find_proxy_download(item)
            if r: return r
    return None
```

### 3.12 Download strategy (recommended)

1. If `_find_proxy_download(response)` returns a token/URL → try it first.
2. Normalize to full URL:
   - full URL → as-is
   - `/api/downloadTemporaryImageViaProxy?...` → prepend `https://image-generation.perchance.org`
   - `/downloadTemporaryImageViaProxy?...` → prepend `https://image-generation.perchance.org/api`
   - `v1....` token → `https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy?t=<token>`
3. Try httpx (with proxy + cf_clearance if available).
4. Fallback: Playwright fetch inside a page that first visited `/embed` (to obtain cf_clearance), then `fetch(url)` and read blob as base64.

---

## 4. Text Generation API (`text-generation.perchance.org/api`)

### 4.1 Base URL

```
BASE_URL = https://text-generation.perchance.org/api
```

### 4.2 Flow (eeemoon/perchance)

1. `GET {BASE_URL}/verifyUser?thread=0&__cacheBust={random}` → HTML page; parse `"userKey":"..."`.
2. `POST {BASE_URL}/generate?userKey={key}&requestId=aiTextCompletion{random}&__cacheBust={random}` with JSON body:
   ```json
   {
     "generatorName": "ai-text-generator",
     "instruction": "<prompt>",
     "instructionTokenCount": 1,
     "startWith": "",
     "startWithTokenCount": 1,
     "stopSequences": []
   }
   ```
3. Response is **streamed** (SSE-ish). Read the body with a reader; chunks are text. Lines:
   - `t:<json>` → a text chunk (JSON-decode the part after `t:`).
   - `data:` → end of stream.

### 4.3 Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `prompt` / `instruction` | string | required | The prompt. |
| `start_with` / `startWith` | string | `""` | Text to start generation with. |
| `stop_sequences` / `stopSequences` | string[] | `[]` | Stop sequences. |
| `timeout` | number | 5.0 | Client-side wait timeout (s). |

### 4.4 Python client sketch (streaming)

```python
import asyncio, json, random
from playwright.async_api import async_playwright

async def stream_text(prompt, start_with=None, stop_sequences=None, timeout=5.0):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent="Mozilla/5.0 ...")
        page = await ctx.new_page()
        await page.goto(f"https://text-generation.perchance.org/api/verifyUser?thread=0&__cacheBust={random.random()}")
        content = await page.content()
        i = content.find('"userKey":"') + len('"userKey":"')
        key = content[i:content.find('"', i)]
        url = (f"https://text-generation.perchance.org/api/generate"
               f"?userKey={key}&requestId=aiTextCompletion{random.randint(0,2**30)}"
               f"&__cacheBust={random.random()}")
        body = {"generatorName":"ai-text-generator","instruction":prompt,
                "instructionTokenCount":1,"startWith":start_with or "",
                "startWithTokenCount":1,"stopSequences":stop_sequences or []}
        q = asyncio.Queue()
        await page.expose_function("onChunk", q.put)
        asyncio.create_task(page.evaluate("""async ({url,body})=>{
            const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
            const reader=r.body.getReader(); const dec=new TextDecoder();
            while(true){const {value,done}=await reader.read(); if(done) break;
              await window.onChunk(dec.decode(value,{stream:true}));}
        }""", {"url":url,"body":body}))
        while True:
            try:
                chunk = await asyncio.wait_for(q.get(), timeout=timeout)
                for line in chunk.splitlines():
                    if line.startswith("t:"): yield json.loads(line[2:])
                    elif line.startswith("data:"): return
            except asyncio.TimeoutError:
                await page.evaluate("window.abortFetch()")
                raise
        await browser.close()
```

### 4.5 Notes
- `verifyUser` here returns an HTML page (not JSON) containing the key — older flow, may be blocked by the new `token_required` change. The EEemoon library still uses it.
- There is no official text API page equivalent to `perchance-ai-api` for text (the `ai-text-plugin-api` page exists but is a generator, not a documented REST endpoint). Text gen is the least stable surface.

---

## 5. Embed API (`image-generation.perchance.org/embed`)

The embed is what the page itself uses. You can drive it directly with a hash payload — most reliable for local generation because it runs Perchance's own JS (including Turnstile).

### 5.1 URL

```
https://image-generation.perchance.org/embed#<url-encoded JSON>
```

### 5.2 Payload

```json
{
  "prompt": "a cute cat",
  "negativePrompt": "",
  "seed": -1,
  "resolution": "512x512",
  "guidanceScale": 7.0,
  "saveChannel": "stable-diffusion-ai",
  "channel": "stable-diffusion-ai",
  "subChannel": "public",
  "requestId": "0.<random>",
  "iframeId": "mcp_<hex>"
}
```

### 5.3 DOM hooks (poll these)

- `#resultImgEl` with a `src` → finished. `src` is a `data:image/...;base64,...` URL.
- `#waitingContentEl` → still generating; `.innerText` shows status.
- Global vars set after completion: `window.seedUsedForThisResult`, `window.arrayBufferOfResultImage`, `window.imageIdOfResultImage`, `window.fileExtensionOfResultImage`, `window.finishedGeneration`.

### 5.4 postMessage

The embed posts to parent:
```js
window.parent.postMessage({ type: "finished", dataUrl, seedUsed, id }, "*");
```
Also the main page uses `postMessage({type:'plsGibAccessCodeForAdPoweredStuff'}, '*')` to obtain the ad access code from the parent, and receives `{type:'okayYouMayHaveCodeForAdPoweredStuff♡', code}`.

### 5.5 Hidden-tab handling

The embed JS includes `hiddenSafeWait` worker timer and `paintTick` fixes for backgrounded tabs. If you run generation in a hidden iframe, expect slower polling. Keep the tab visible or use the HTTP internal API instead.

---

## 6. Styles (76)

Pass a style by appending its keywords to the prompt (the unofficial wrappers do `"{prompt}, {style_prompt}"` with a negative prompt). The official API v1 has no `style` param — fold style keywords into `prompt`/`negativePrompt`.

Full list (from `styles.json`, perchance-mcp-unlimited):

```
1920s Photo, 1930s Photo, 1940s Photo, 1950s Photo, 1960s Photo, 1970s Photo,
1980s Photo, 1990s Photo, 2D Disney Character, 2D Pokemon, 3D Disney Character,
3D Emoji, 3D Isometric Icon, 3D Pokemon, 50s Enamel Sign, 50s Infomercial Anime,
Anime, Anime Screencap, Cartoon, Casual Photo, Cinematic, Claymation, Concept Art,
Concept Art Icon, Concept Sketch, Crayon Drawing, Cursed Photo, Cute 3D Icon,
Cute 3D Icon 𝗦𝗲𝘁, Cute Anime, Cute Figurine, Cute Illustration, Digital Painting,
Digital Painting Icon, Disney Sketch, Drawn Anime, Fantasy City Map, Fantasy Landscape,
Fantasy Painting, Fantasy Portrait, Fantasy World Map, Flat Illustration, Flat Style Icon,
Flat Style Logo, Franco-Belgian Comic, Furry - Cinematic, Furry - Drawn, Furry - Oil,
Furry - Painted, Game Art Icon, Illustration, Manga, Medieval, Neon Vintage Anime,
Nihonga Painting, Oil Painting, Oil Painting - 70s Pulp, Oil Painting - Old,
Oil Painting - Realism, Old World Map, Painted Pokemon, Painterly, Pencil, Pixel Art,
Professional Photo, Soft Anime, Studio Ghibli, Tattoo Design, Tintin Comic,
Traditional Japanese, Vintage Anime, Vintage Comic, Vintage Pulp Art, Waifu,
Watercolor, YuGiOh Art
```

Each style maps to `{prompt, negative}` keyword strings. The wrapper applies:
```js
full_prompt   = style_prompt   ? `${prompt}, ${style_prompt}`   : prompt
full_negative = style_negative ? `${negative_prompt}, ${style_negative}` : negative_prompt
```

The someoneuk/perchanceapi client also ships a smaller 25-style set (cinematic, anime, digital-art, photorealistic, fantasy, portrait, landscape, sci-fi, traditional-japanese, oil-painting, watercolor, pixel-art, sketch, 3d-render, vaporwave, cyberpunk, steampunk, horror, abstract, minimalist, isometric, low-poly, retro, none). Use whichever matches your UX.

---

## 7. Resolutions

| Name | Pixels | Use |
|---|---|---|
| square (sd) | `512x512` | Internal API default |
| square (hd) | `768x768` | eeemoon default square |
| portrait | `512x768` | vertical |
| landscape | `768x512` | horizontal |

Official API v1 only accepts `512x512 | 512x768 | 768x512 | 768x768`.
Max image size noted by the perchance "AI Image Generator API" generator: 1024×1024 px. PNG and JPEG supported.

---

## 7.5 UI controls on the page → API mapping

The web UI exposes many controls, but the underlying API only accepts `prompt`, `negativePrompt`, `seed`, `resolution`, `guidanceScale` (plus channel/subChannel/auth). Every other control is a **client-side convenience** that rewrites the prompt or orchestrates multiple calls.

| UI control | Values | How it maps to the API |
|---|---|---|
| Art Style (select) | 76 styles (see §7.7) | Style's `prompt` keywords appended to `prompt`; style's `negative` appended to `negativePrompt` |
| Shape (select) | Square / Portrait / Landscape | `resolution`: `768x768` / `512x768` / `768x512` (or `512x512` square-sd) |
| How many? (select) | 2 / 4 / 6 / 8 / 16 / 32 | N parallel generate calls (page instantiates N nested embed iframes) |
| Add shot… (select) | camera shots (close-up, wide, low angle, …) | Appended to `prompt` |
| Add color… (select) | color palettes | Appended to `prompt` |
| Add effect… (select) | effects (glow, bokeh, …) | Appended to `prompt` |
| Add genre… (select) | genres (manga, shonen, …) | Appended to `prompt` |
| Negative prompt (anti-description) | free text | `negativePrompt` |
| Guidance scale slider | 1–30 | `guidanceScale` |
| Seed input | integer | `seed` (same seed ≈ same image) |
| Filter (No/Moderate/Safe) | 3 levels | Client-side moderation; not an API param. `maybeNsfw` flag in response |
| NSFW unlock (18+) | 15 min … permanent | Session flag; not an API param |
| removeBackground (official API) | true/false | Official API v1 param `removeBackground` |
| width / height (official API) | display px | Official API v1 params `width`/`height` (display only) |

### 7.6 Prompt modifier keyword examples

The modifier dropdowns are not enumerated in the recovered code, but the perchance prompt-engineering guides suggest these common tokens (append to `prompt`):

- **Shot/composition:** `wide angle shot`, `extreme close-up`, `portrait`, `landscape`, `low angle shot`, `symmetrical`, `leading lines`, `rule of thirds`, `overhead view`, `aerial establishing shot`, `centered product view`, `three-quarter portrait`
- **Lighting:** `cinematic lighting`, `volumetric rays`, `soft diffused light`, `neon glow`, `dramatic shadows`, `golden hour`, `blue hour`, `moody`, `ethereal glow`
- **Color:** `monochromatic blues`, `warm earth tones`, `vibrant`, `pastel`, `high contrast`
- **Quality:** `highly detailed`, `4K`, `8k`, `masterpiece`, `best quality`, `sharp focus`
- **Genre (anime):** `manga art`, `shonen`, `shojo`, `seinen`, `isekai`
- **Prompt weighting:** `(term:1.2)` to emphasize; `cyberpunk::3 steampunk::1` for blending; `AND`/`OR` for concept logic

### 7.7 Full style list with keyword expansions

Each style expands to `prompt` keywords + `negative` keywords. Apply: `full_prompt = prompt + ', ' + style.prompt` (if style.prompt), `full_negative = negativePrompt + ', ' + style.negative` (if style.negative). The style `"No style"` / `none` adds nothing.

| Style | Prompt keywords | Negative keywords |
|---|---|---|
| 1920s Photo | famous vintage 1920s photo, [input.description], 1920s photo, restored photograph, {sepia\|black and white}, historical archive photo | [input.negative \|\| ""] |
| 1930s Photo | famous vintage 1930s photo, [input.description], grainy photograph, 1930s photo with film grain, 1930s photo with vignetting, retro, r/OldSchoolCool, 1930s photo, vintage photo | [input.negative \|\| ""] |
| 1940s Photo | famous vintage 1940s photo, [input.description], grainy photograph, 1940s photo with film grain, 1940s photo with vignetting, retro, r/OldSchoolCool, 1940s photo, vintage photo | [input.negative \|\| ""] |
| 1950s Photo | famous vintage 50s photo, [input.description], grainy photograph, 1950s photo with film grain, 1950s photo with vignetting, retro, r/OldSchoolCool, 1950s photo, vintage photo | [input.negative \|\| ""] |
| 1960s Photo | famous vintage 60s photo, [input.description], grainy photograph, 1960s photo with film grain, 60s photo with vignetting, retro, r/OldSchoolCool, 60s photo, vintage photo | [input.negative \|\| ""] |
| 1970s Photo | famous vintage 70s photo, [input.description], grainy photograph, 1970s photo with film grain, 70s photo with vignetting, retro, r/OldSchoolCool, 70s photo, vintage photo | [input.negative \|\| ""] |
| 1980s Photo | famous vintage 80s photo, [input.description], grainy photograph, 80s photo with film grain, Kodacolor II 80s photo with vignetting, retro, r/OldSchoolCool, 80s photo with wear and tear and minor creasing and scratches, vintage color photo | [input.negative \|\| ""] |
| 1990s Photo | [input.description], 90s home video, nostalgic 90s photo, taken with kodak disposable camera | [input.negative \|\| ""] |
| 2D Disney Character | 2D cartoon Disney character digital art of [input.description]. superb linework, classic 2D Disney style art, inspired in the style of the art styles of Glen Keane and Aaron Blaise, Disney-style character concept with a Disney-style face, trending on artstation, Disney-style version of [input.description].\n\nOverall, it's an absolute world-class masterpiece 2D Disney-inspired Character. It's an aesthetically pleasing 2D Disney-inspired piece with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| 2D Pokemon | [input.description], [input.pokemonType ? input.pokemonType+", " : ""]pokemon creature concept, superb line art, beautiful colors and composition, 2D art style, beautiful pokemon digital art, fakemon, in the style of Sowsow, pokemon creature, cryptid, fakemon, masterpiece, in the style of Yuu Nishida, 4k. The Pokémon-like creature is centered within this anime-style 2D image. It's from the upcoming Pokemon Movie \(2026\) which has the classic 2D Pokemon art style.\n\nOverall, it's an absolute world-class masterpiece 2D Pokemon-inspired artwork. It's an aesthetically pleasing 2D Pokemon-inspired artwork with impeccable attention to detail and impressive composition. Clean, perfect linework, impeccable clean 2D anime-inspired art style. | [input.negative \|\| ""], messy, garbled, confusing, incoherent, unclear |
| 3D Disney Character | 3D cartoon Disney character portrait render. [input.description], bokeh, 4k, highly detailed, Pixar render, CGI Animation, Disney, cute big circular reflective eyes, dof, cinematic film, Disney realism, subtle details, breathtaking Pixar short, fine details, close up, sharp focus, HDR, Disney-style octane render, incredible composition, superb lighting and detail, [input.description].\n\nOverall, it's an absolute world-class masterpiece 3D Disney-inspired Character. It's an aesthetically pleasing 3D Disney-inspired piece with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| 3D Emoji | masterpiece [input.description] cartoon 3D emoji concept render, close-up, facing forward, matte finish, 3D emoji render, app icon, simple design, new iOS 18.4 style [input.description] emoji render, simple background, centered, world-class masterpiece work of art, crisp render, sharp focus, charmingly aesthetic design, 4k, soft lighting, masterpiece emoji-style figurine 3D render, pure white background | [input.negative \|\| ""] |
| 3D Isometric Icon | [input.description], 3D isometric render of cute [input.description], 3D app icon, clean isometric design, beautiful design, soft gradient background, soft colors, centered, 3D blender render, masterpiece, best quality, high resolution, 8k octane render, beautiful color scheme, soft smooth lighting, physically based rendering, square image, high polycount | [input.negative \|\| ""] |
| 3D Pokemon | An incredibly perfect high-quality 3D render of a pokemon creature, [input.description], [input.pokemonType ? input.pokemonType+", " : ""]8k render, beautiful pokemon digital art, fakemon, pokemon creature, cryptid, fakemon, masterpiece, soft focus, best quality, high quality. Perfect soft lighting, beautiful composition. It's an impressive CGI image from the upcoming Pokemon Movie \(2026\).\n\nOverall, it's an absolute world-class masterpiece 3D-rendered Pokemon-inspired creature. It's an aesthetically pleasing 3D Pokemon-inspired piece with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| 50s Enamel Sign | 50s enamel sign of [input.description], 50s advert enamel sign, masterpiece, authentic vintage enamel sign | [input.negative \|\| ""] |
| 50s Infomercial Anime | [input.description], 1950s infomercial style, delicate linework, paprika anime art style, chromatic aberration glow, 2d painted cel animation, soft focus, 2D pixiv 1950s | [input.negative \|\| ""] |
| Anime | anime art of [input.description], world-class masterpiece, 4k, best quality, anime art.\n\nOverall, it's an absolute world-class masterpiece anime-inspired artwork. It's an aesthetically pleasing anime art with impeccable attention to detail and beautiful composition. | [input.negative \|\| ""] |
| Anime Screencap | Anime screencap, [input.description]. It's an anime screencap from a popular anime. Beautiful visual quality, remastered, extremely high quality, very aesthetic, high production value, high-skill masterpiece. The image shows impeccable and beautiful composition and contrast. It's an exquisite anime screencap style image. | [input.negative \|\| ""], faded, washed out, low quality |
| Cartoon | [input.description], cartoon-style art, superb linework, nice colors and composition, bold linework, masterpiece, cute art in the style of Dana Terrace, in the style of Rebecca Sugar, in the style of ry-spirit, amazing and wholesome cartoon-style art, cute art style, (trending on artstation) | [input.negative \|\| ""] |
| Casual Photo | A casual real-life photograph. A casual photo of [input.description.replace(/\b(realistic)\b/i, "actual")]. It's a casual photo. Overall it's an actual real-life photograph. | [input.negative \|\| ""] |
| Cinematic | [input.description], cinematic shot, dynamic lighting, 75mm, Technicolor, Panavision, cinemascope, sharp focus, fine details, 8k, HDR, realism, realistic, key visual, film still, cinematic color grading, depth of field.\n\nOverall, it's an absolute world-class cinematic masterpiece. It's an aesthetically pleasing cinematic shot with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Claymation | [input.description], claymation, incredible claymation style, kubo and the two strings style art, Missing Link 2019 art style, clay texture, clay animation, stop-motion clay | [input.negative \|\| ""] |
| Concept Art | [input.description], concept art, digital art, illustration, inspired by wlop style, 8k, fine details, sharp, very detailed, high resolution, world-class masterpiece.\n\nOverall, it's absolute world-class masterpiece concept art. It's an aesthetically pleasing concept art with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Concept Art Icon | [input.description], a concept art icon, a digital art logo, illustration, league of legends style concept art logo icon, inspired by wlop style, 8k, fine details, sharp, very detailed, high resolution logo icon | [input.negative \|\| ""] |
| Concept Sketch | black and white technical drawing showcasing {a} [input.description], annotation details, world-class masterpiece black and white, pencil strokes, annotated technical concept art sketch, pencil texture.\n\nOverall, it's a charmingly aesthetic and well-composed concept sketch. | [input.negative \|\| ""] |
| Crayon Drawing | [input.description], crayon drawing | [input.negative \|\| ""] |
| Cursed Photo | cursed photo of [input.description], creepy and cursed, absolutely cursed photo, nope nope nope nope, what the actual f, unsettling photo, cursed_thing, cursedimages, no context, cursed image, bad photo, weird photo, very strange, color photo, creepy photo, nightmare fuel | [input.negative \|\| ""] |
| Cute 3D Icon | [input.description], a cute 3D icon of [input.description], cartoon 3D icon, very cute shape, stylized octane render, 8k, masterpiece, soooo cute, beautiful cute perfection, beautiful soft lighting, soft colors, centered, high resolution, [input.description], soft gradient background | [input.negative \|\| ""] |
| Cute 3D Icon 𝗦𝗲𝘁 | [input.description], a set of lovely little 3D icons, cute 3D icons, very cute shapes, stylized octane render, 8k, masterpiece, soooo cute, beautiful cute perfection, beautiful soft lighting, soft colors, centered, high resolution, [input.description], cute icon set | [input.negative \|\| ""] |
| Cute Anime | adorable, cute, kawaii, [input.description], cute moe anime character portrait, adorable, featured on pixiv, kawaii moé masterpiece, cuteness overload, very detailed, sooooo adorable.\n\nOverall, it's an absolute world-class masterpiece anime-inspired artwork. It's an aesthetically pleasing anime art with impeccable attention to detail and beautiful composition. | [input.negative \|\| ""] |
| Cute Figurine | [input.description], figurine, modern Disney style, octane render, chibi | [input.negative \|\| ""] |
| Cute Illustration // adapted from a nice image i saw by 'リュウ 🔵🐺': https://aigc.uploads.dev/image/765de3e463f307119a339788690c56c35ca53d8bd19364f533e65c672831c357.jpeg | A cute cartoon showing [input.description], in a soft, cute, minimalist, webcomic-style illustration. Line art is somewhat bold but gentle, with clean lines, and subtle variation. Colors are soft, flat, with gentle pastel tones. No shading except for light inner shadows or simple highlights. The background is plain white or contains a light wash of color with subtle textured style. The overall scene is wholesome and endearing like a page from a Liz Climo comic. Composition is centered with space around the character, evoking authentic warmth through the wholesome, soft, web comic style.\n\nIt's an aesthetically pleasing masterpiece, showing high skill in evoking an authentic and beautifully minimalist style. | [input.negative \|\| ""] |
| Digital Painting | [input.description], breathtaking digital art, trending on artstation, in the style of atey ghailan, in the style of greg rutkowski, in the style of greg tocchini, in the style of james gilleard, 8k, high resolution, best quality.\n\nOverall, it's an absolute world-class masterpiece digital painting. It's an aesthetically pleasing digital painting with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Digital Painting Icon | [input.description], app logo icon, digital art pictogram icon, trending on artstation, app icon in the style of atey ghailan, app icon in the style of greg rutkowski, app icon in the style of greg tocchini, app icon in the style of james gilleard, 8k, high resolution, best quality | [input.negative \|\| ""] |
| Disney Sketch | Glen Keane character concept art black and white pencil sketch of [input.description]. rough pencil sketch in the style of Glen Keane, rough pencil sketch, close up, loose Disney-style character concept art sketch, nice sketchy pencil strokes, Disney character design sketch, pencil texture, a concept art pencil sketch of [input.description], in the style of Glen Keane.\n\nOverall, it's an charmingly aesthetic and well-composed Disney-style sketch. | [input.negative \|\| ""] |
| Drawn Anime | anime-style illustration with perfect clean lines, illustration of [input.description], anime drawing/art, bold linework, illustration, cel shaded, anime-style digital illustration. It's an anime-inspired 2D-style anime illustration. Aesthetic high-skill, professional anime illustration, which looks like a screencap from an anime series. It has clean line work and a pleasant, appealing drawn aesthetic style. Overall, it's a world-class illustration with flawless line work, perfect composition, and impeccable attention to detail. | [input.negative \|\| ""] |
| Fantasy City Map | an aerial view of a city, TTRPG city map showing the full city, [input.description], fantasy art, highly-skilled senior environment artist piece, beautiful fantasy map.\n\nOverall, it's an absolute world-class masterpiece fantasy city map. It's an aesthetically pleasing fantasy city map artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Fantasy Landscape | [input.description], fantasy matte painting, absolute masterpiece, detailed matte painting in the style of andreas rocha and greg rutkowski, in the style of Brothers Hildebrandt, superb composition, vivid fantasy art, breathtaking fantasy masterpiece. It's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Fantasy Painting | [input.description], d&d, fantasy, highly detailed, digital painting, artstation, sharp focus, fantasy art, illustration, 8k, in the style of greg rutkowski. It's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Fantasy Portrait | [input.description], d&d, fantasy, highly detailed, digital painting, artstation, sharp focus, fantasy art, character art, illustration, 8k, art in the style of artgerm and greg rutkowski. It's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Fantasy World Map | beautiful fantasy map of [input.description], beautiful fantasy map inspired by middle earth and azeroth and discworld and westeros and essos and the witcher world and tamriel and faerûn and thedas, 4k, beautiful colors, crisp, high-resolution artistic map, topographic 3D terrain, artistic map.\n\nOverall, it's an absolute world-class masterpiece fantasy world map. It's an aesthetically pleasing fantasy world map artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Flat Illustration | [input.description], illustration, flat, 2D, vector art, masterpiece, made with adobe illustrator, behance competition winner, trending on dribble, 4k, high resolution, crisp lines.\n\nOverall, it's an absolute world-class masterpiece flat-style illustration. It's an aesthetically pleasing flat-style illustration with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Flat Style Icon | [input.description], creative icon, flat style icon, masterpiece, high resolution, crisp, beautiful composition and color choice, beautiful flat painted style, behance contest-winner, award winning icon illustration, 8k, best quality | [input.negative \|\| ""] |
| Flat Style Logo | beautiful flat-style logo design depicting [input.description], creative flat-style logo design, trending on dribbble, featured on behance, portfolio piece, minimal flat design, breathtaking graphic design, 8k, high resolution vector logo, plain background, amazingly beautiful logo design, winner of best logo award | [input.negative \|\| ""] |
| Franco-Belgian Comic | franco-belgian color comic about [input.description], bande dessinée, franco-belgian comic panel, masterpiece, breathtaking composition, intricate, detailed, best quality | [input.negative \|\| ""] |
| Furry - Cinematic | [input.description], cinematic shot, dynamic lighting, 75mm, Technicolor, Panavision, cinemascope, sharp focus, fine details, 8k, HDR, realism, realistic, key visual, film still, cinematic color grading, depth of field.\n\nOverall, it's an absolute world-class masterpiece. It's an aesthetically pleasing image with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Furry - Drawn | anthro [input.description] illustration, hand-drawn, bold linework, anthro illustration, cel shaded, 4k, fine details, masterpiece.\n\nOverall, it's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Furry - Oil | [input.description], crisp vibrant detailed soft painterly digital art, volumetric lighting, natural lighting, realistic lighting, vibrant colors, crisp oil painting, painterly realism, depth of field, subtle soft details, vivid, fresh, striking, in the style of chunie, in the style of darkgem, in the style of honovy, inspired by zaush, inspired by anhes, inspired by puinkey, in the style of caraid, in the style of dagasi, inspired by taranfiddler, in the style of atey ghailan, in the style of MilletGustave, in the style of Curbet, inspired by Charlie Bowater style, lol art.\n\nOverall, it's a world-class painterly masterpiece. It's aesthetically pleasing digitial art with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Furry - Painted | anthro [input.description] digital art, masterpiece, 4k, fine details. It's an absolute world-class masterpiece artwork.\n\nOverall, it's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Game Art Icon | [input.description], a concept art icon for league of legends, a digital art logo, illustration, league of legends style icon, inspired by wlop style, 8k, dota 2 style icon, fine details, sharp, very detailed icon, high resolution rpg ability/spell/item icon | [input.negative \|\| ""] |
| Illustration | breathtaking illustration of [input.description], illustration, masterpiece, breathtaking illustration.\n\nOverall, it's an absolute world-class masterpiece illustration. It's an aesthetically pleasing illustration with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Manga | [input.description], incredible hand-drawn manga, black and white, in the style of Takehiko Inoue, in the style of Katsuhiro Otomo and akira toriyama manga, hand-drawn art in the style of rumiko takahashi and Inio Asano, Ken Akamatsu manga art.\n\nOverall, it's an absolute world-class masterpiece black and white manga-style artwork. It's an aesthetically pleasing black and white manga artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Medieval | medieval illuminated manuscript picture of [input.description], medieval illuminated manuscript art, masterpiece medieval color illustration, 16th century, 8k high-resolution scan of 16th century illuminated manuscript painting, detailed medieval masterpiece. | [input.negative \|\| ""] |
| Neon Vintage Anime | [input.description], neon vintage anime style, 90's anime style, 1990s anime, hajime sorayama, greg tocchini, neon vintage anime masterpiece, anime art, 4k, high quality.\n\nOverall, it's an absolute world-class masterpiece neon vintage anime artwork. It's an aesthetically pleasing neon vintage anime artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Nihonga Painting | japanese nihonga painting about [input.description], Nihonga, ancient japanese painting, intricate, detailed | [input.negative \|\| ""] |
| Oil Painting | breathtaking alla prima oil painting, [input.description], close up, alla prima style, oil on linen, painterly oil on canvas, painterly style, exquisite composition and lighting, modern painterly masterpiece, in the style of alexi zaitsev, award-winning painterly alla prima oil painting.\n\nOverall, it's an absolute world-class masterpiece oil painting. It's an aesthetically pleasing oil painting with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Oil Painting - 70s Pulp | 1970s vintage pulp art, ultra realistic, fully restored, exquisite lighting and composition, polished, masterpiece, vintage pulp art, in the style of Earle K. Bergey, in the style of Kelly Freas, in the style of Alex Schomburg, in the style of H. J. Ward, glossy pulp art, Amazing Stories, Weird Tales, 8k, high resolution, best quality, hyper-realistic, Mattias Adolfsson style, detailed stylization, [input.description], ultra realistic, wlop-style, exquisite lighting and composition, polished, world-class masterpiece, digitally enhanced, breathtaking shot, subtle details, superb quality, art in the style of Kuvshinov, Kuvshinov style, detailed stylization.\n\nOverall, it's an absolute world-class masterpiece artwork. It's an aesthetically pleasing restored 1970s vintage pulp art with impeccable attention to detail and impressive composition. It has perfect contrast and color balance. Almost photorealism. | [input.negative \|\| ""], scratches, faded, washed out, grainy, dirty |
| Oil Painting - Old | [input.description], Oil painting in the style of Jean-François Millet and Gustave Courbet and Jules Breton | [input.negative \|\| ""] |
| Oil Painting - Realism | breathtaking oil painting, [input.description], photorealistic oil painting, in the style of charlie bowater, fine details, in the style of wlop, trending on artstation, very detailed.\n\nOverall, it's an absolute world-class masterpiece realism oil painting. It's an aesthetically pleasing realism oil painting with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Old World Map | fantasy world map of [input.description], fantasy world map, highly detailed digital painting, fantasy art, map illustration, 8k.\n\nOverall, it's an absolute world-class masterpiece old world map. It's an aesthetically pleasing old world style map artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Painted Pokemon | Beautiful, very high-quality painterly digital concept art, [input.description], [input.pokemonType ? input.pokemonType+", " : ""]8k digital painting of a pokemon, amazing pokemon creature art in the style of piperdraws, cryptid creations in the style of Piper Thibodeau, in the style of Naoki Saito and {Tokiya\|Mitsuhiro Arita}, incredible composition.\n\nOverall, it's an absolute world-class masterpiece painterly Pokemon-inspired artwork. It's an aesthetically pleasing painterly Pokemon-inspired artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Painterly | painterly digital painting, [input.description], digital painting in the style of Ilya Kuvshinov with painterly brush strokes, in the style of Ilya Kuvshinov, world-class painterly masterpiece.\n\nOverall, it's an absolute world-class masterpiece painterly digital painting. It's an aesthetically pleasing painterly digital painting with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Pencil | black and white pencil drawing, [input.description], black and white, breathtaking pencil illustration, highly detailed, 4k, textured paper, pencil texture, sketch | [input.negative \|\| ""] |
| Pixel Art | [input.description.length > 40 ? "(pixel art), " : ""][input.description], best pixel art, neo-geo graphical style, retro nostalgic masterpiece, 128px, 16-bit pixel art [input.description.length < 10 ? "of "+input.description : ""], 2D pixel art style, adventure game pixel art, inspired by the art style of hyper light drifter, masterful dithering, superb composition, beautiful palette, exquisite pixel detail | [input.negative \|\| ""] |
| Professional Photo | [input.description], {sharp\|soft} focus, depth of field, 8k photo, HDR, professional lighting, taken with Canon EOS R5, DSLR, 75mm lens | [input.negative \|\| ""] |
| Soft Anime | [input.description], anime masterpiece with soft lighting, gentle intricate style, highly detailed, pixiv, anime art, 4k, art from your name anime, garden of words style art, high quality.\n\nOverall, it's an absolute world-class masterpiece soft beautiful anime-inspired artwork. It's an aesthetically pleasing, soft, beautiful anime art with impeccable attention to detail and beautiful composition. | [input.negative \|\| ""] |
| Studio Ghibli | Studio Ghibli style artwork of [input.description], Studio Ghibli style art film still, sharp, very detailed, high resolution, inspired by the style of Hayao Miyazaki, anime, film still from Spirited Away. In the style of Kiki Delivery Service, with a similar art style to Princess Mononoke. Aesthetically similar to My Neighbor Totoro's art style.\n\nOverall, it's an absolute world-class masterpiece Studio Ghibli-inspired artwork. It's an aesthetically pleasing classic Studio Ghibli style artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Tattoo Design | amazing tattoo design, [input.description], breathtaking tattoo design, incredible tattoo design | [input.negative \|\| ""] |
| Tintin Comic | color comic panel in the style of Hergé about [input.description], in the style of Hergé, tintin style, french comic panel, franco-belgian style, masterpiece, high-resolution Hergé style | [input.negative \|\| ""] |
| Traditional Japanese | [input.description], in ukiyo-e art style, traditional japanese masterpiece | [input.negative \|\| ""] |
| Vintage Anime | [input.description], 1990s anime, vintage anime, 90's anime style, in the style of hajime sorayama, in the style of greg tocchini, anime masterpiece, pixiv, akira-style art, akira anime art, 4k, high quality.\n\nOverall, it's an absolute world-class masterpiece vintage anime artwork. It's an aesthetically pleasing vintage anime artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| Vintage Comic | comic book style art of [input.description], drawing, in the style of Dave Stevens, in the style of Adam Hughes, 1940's, 1950's, hand-drawn, color, high resolution, best quality, closeup | [input.negative \|\| ""] |
| Vintage Pulp Art | 1970s vintage pulp art, [input.description], vintage pulp art, in the style of Earle K. Bergey, in the style of Kelly Freas, in the style of Alex Schomburg, in the style of H. J. Ward, glossy pulp art, Amazing Stories, Weird Tales, 8k, high resolution, best quality | [input.negative \|\| ""] |
| Waifu | [input.description], waifu character portrait, 1girl, very high resolution, semi-realistic anime art. Intricate and impressive anime artwork with stunningly beautiful composition and style.\n\nOverall, it's an absolute world-class masterpiece anime artwork. It's an aesthetically pleasing waifu artwork with impeccable attention to detail and impressive composition. It's an aesthetically pleasing character portrait. It's an aesthetically pleasing image. It's an aesthetically pleasing image. It's an aesthetically pleasing image. It's an aesthetically pleasing image. | [input.negative \|\| ""] |
| Watercolor | [input.description], (watercolor), high resolution, intricate details, 4k, wallpaper, concept art, watercolor on textured paper.\n\nOverall, it's an absolute world-class masterpiece watercolor artwork. It's an aesthetically pleasing watercolor artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |
| YuGiOh Art | yugioh card art for [input.description], art in the style of genzoman, in the style of Akina Fujiwara, in the style of rossdraws, yugioh monster, close up, painterly details, breathtaking art, centered, masterpiece, amazing composition, [input.description.length < 30 ? input.description : ""].\n\nOverall, it's an absolute world-class masterpiece "Yu-Gi-Oh!"-inspired artwork. It's an aesthetically pleasing Yu-Gi-Oh inspired artwork with impeccable attention to detail and impressive composition. | [input.negative \|\| ""] |

### 7.8 Batch generation pattern

Since one `generate` call = one image, "How many = N" is implemented client-side:

```js
async function generateBatch(prompt, opts, n) {
  const seeds = Array.from({length:n}, ()=>Math.floor(Math.random()*2**30));
  return Promise.all(seeds.map(s => generateImage(prompt, {...opts, seed: s})));
}
```
Or in Python: `asyncio.gather(*[gen(prompt, seed=s) for s in seeds])`.

### 7.9 NSFW / filter notes

- The API response includes `maybeNsfw: boolean`.
- The page's Filter (No/Moderate/Safe) and the 18+ NSFW unlock are **client-side**; there is no `nsfw` param in the generate body. The model itself may refuse; retry with rephrased prompt if needed.
- `disable_safety` exists in the Gousting wrapper as a reserved param but is not sent to Perchance.


## 8. Error handling & status codes

### HTTP / Cloudflare
- `403` / `Just a moment...` HTML → Cloudflare managed challenge. Need real browser or TLS impersonation + proxy.
- Turnstile failure `600010` → bot behavior detected.

### Internal generate statuses (see §3.7)

### Rate limits
- The perchance "AI Image Generator API" generator lists: **10 requests/min per IP**.
- `waiting_for_prev_request_to_finish` → a global lock; wait 8 s and retry.
- `too_many_requests` in verifyUser body → rate limited.

### IP binding
- `userKey` is IP-bound and short-lived (~30 s).
- `adAccessCode` and proxy download token are IP-bound / single-use (~5 min).
- Running from a datacenter IP usually fails; use residential IP or a proxy.

---

## 9. Cloudflare / Turnstile bypass (for server-side apps)

From Yuser00123/perchance-mcp-unlimited (open-source unlimited stack):

1. **Ad code (no proxy needed):** `curl_cffi` with `impersonate="chrome"`:
   ```python
   from curl_cffi import requests
   r = requests.get("https://perchance.org/api/getAccessCodeForAdPoweredStuff",
                    impersonate="chrome",
                    headers={"Referer":"https://perchance.org/stable-diffusion-ai",
                             "Origin":"https://perchance.org","Accept":"*/*"})
   ```
2. **Turnstile solving:** SeleniumBase UC Mode (undetected Chromium) or Camoufox.
3. **userKey via browser:** navigate to `https://perchance.org/stable-diffusion-ai`, read `localStorage['generation-v2:{browserId}:userKey-0']`.
4. **Download:** fetch inside Playwright page context (has cf_clearance).
5. **TLS fingerprint:** httpx fails in some regions; curl fallback works.

Turnstile sitekey: `0x4AAAAAAAA8g8NphwaSOT59`.

---

## 10. Browser identity (localStorage schema)

```
localStorage['generation-v2-browser']                          = "<32hex browserId>"
localStorage['generation-v2:{browserId}:userKey-{thread}']     = "<64hex userKey>"
localStorage['generation-v2:{browserId}:recentlyVerified']     = "<timestamp ms>"
```

Cache files used by the mcp client:
- `~/.perchance-mcp/browser_id.txt`
- `~/.perchance-mcp/user_key.txt`

---

## 11. Complete Python example (internal API, minimal)

```python
import asyncio, random, httpx, urllib.parse

BASE_EMBED = "https://image-generation.perchance.org"
BASE_PERCHANCE = "https://perchance.org"
API_GENERATE = f"{BASE_EMBED}/api/generate"
API_AD_CODE  = f"{BASE_PERCHANCE}/api/getAccessCodeForAdPoweredStuff"
V_HASH = "9b43eec2e71907610e4e9317b54c208495f6850086e92239a869811d2e2d77ee"

async def gen(prompt, resolution="512x512", guidance=7.0, seed=-1):
    # 1. ad access code
    async with httpx.AsyncClient(headers={"User-Agent":"Mozilla/5.0","Referer":"https://perchance.org/stable-diffusion-ai",
                                          "Origin":"https://perchance.org","Accept":"*/*"}, timeout=20) as c:
        r = await c.get(f"{API_AD_CODE}?__cacheBust={random.random()}")
        ad_code = r.text.strip()

    # 2. userKey must be obtained via browser/Turnstile (not shown) — paste a fresh one:
    user_key = "PASTE_64_HEX_USERKEY"

    body = {"prompt":prompt,"negativePrompt":"","seed":seed,"resolution":resolution,
            "guidanceScale":guidance,"channel":"ai-text-to-image-generator",
            "subChannel":"public","userKey":user_key,"adAccessCode":ad_code,
            "requestId":f"0.{random.getrandbits(30)}"}
    params = {"userKey":user_key,"requestId":body["requestId"],"adAccessCode":ad_code,
              "v":V_HASH,"__cacheBust":str(random.random())}
    async with httpx.AsyncClient(headers={"Content-Type":"application/json",
                                          "Referer":f"{BASE_EMBED}/embed",
                                          "Origin":BASE_EMBED}, timeout=120) as c:
        r = await c.post(API_GENERATE, params=params, json=body)
        data = r.json()
        print(data)
        # download via proxy token
        tok = None
        def find(v):
            nonlocal tok
            if isinstance(v,str):
                if "downloadTemporaryImageViaProxy" in v: tok=v; return True
                if v.startswith("v1.") and len(v)>80: tok=f"/api/downloadTemporaryImageViaProxy?t={v}"; return True
            if isinstance(v,dict):
                for x in v.values():
                    if find(x): return True
            if isinstance(v,list):
                for x in v:
                    if find(x): return True
            return False
        find(data)
        if tok:
            url = tok if tok.startswith("http") else f"{BASE_EMBED}{tok if tok.startswith('/') else '/'+tok}"
            # fix /downloadTemporaryImageViaProxy -> /api/...
            if "/downloadTemporaryImageViaProxy" in url and "/api/" not in url:
                url = url.replace("/downloadTemporaryImageViaProxy", "/api/downloadTemporaryImageViaProxy")
            img = await c.get(url)
            open("out.jpg","wb").write(img.content)
            print("saved", len(img.content))

asyncio.run(gen("a cute cat"))
```

### 11.1 JavaScript example (Official API v1)

See §2.2.

---

## 12. Recommended app architecture

1. **Web app (browser):** use Official Image API v1 (§2). Cache permanent URLs. Warm up once.
2. **Need raw bytes / custom channels / styles folded into prompt:** use Internal API (§3) but only from a real browser or a residential-IP server with Turnstile solving.
3. **Server-side batch generation:** drive the Embed API (§5) with Playwright + stealth, or use the mcp client's `generate_via_embed_playwright`.
4. **Text:** use Text API (§4) via Playwright; expect instability.
5. Always handle `invalid_key` / `waiting_for_prev_request_to_finish` / `client_update_required` with retries.
6. Persist `browserId`; cache `userKey` for ~20 s max.

---

## 13. Source references

- `https://perchance.org/perchance-ai-api` — official docs (extracted above).
- `https://github.com/eeemoon/perchance` — Python client (imagegen.py, textgenerator.py).
- `https://github.com/Yuser00123/perchance-mcp-unlimited` — deep reverse-engineering (client.py, VERIFICATION.md, styles.json).
- `https://github.com/Gousting/perchance-api` — FastAPI wrapper (browser automation).
- `https://github.com/someoneuk/perchanceapi` — lite Playwright-free client.
- `https://browse.sh/skills/perchance.org/generate-image-viqw8u` — browser-automation recipe.

---

## 14. Changelog / version notes

- 2026-09-24: `v` hash changed `f4fd5ce3...` → `9b43eec2...`.
- New download endpoint `/api/downloadTemporaryImageViaProxy?t=v1....` (quick-tunnel backend) replaces imageId method.
- Ad code endpoint now requires full headers + (in some regions) proxy.
- `userKey` now IP-bound, ~30 s lifetime, requires Turnstile token (sitekey `0x4AAAAAAAA8g8NphwaSOT59`).
- Official Image API v1 remains the stable, app-friendly surface.

---

## 15. Live verification notes (2026-10-29)

Tested from this environment (Linux, residential IP).

### 15.1 Plain HTTP / headless Chrome — blocked

| Endpoint | Result |
|---|---|
| `GET /api/getAccessCodeForAdPoweredStuff` (plain `requests`) | ✅ 200, 64-hex code (intermittently 403 after many calls) |
| `GET /api/verifyUser?browserId=...&thread=0` | ✅ 200, `{"status":"failed_verification","reason":"token_required"}` |
| `POST /api/generate` with dummy userKey | ✅ 200, `{"status":"invalid_key"}` (request shape accepted) |
| Cloudflare Turnstile, headless/headed Chrome + playwright-extra stealth | ❌ `600010` — environment flagged as bot |
| Official API v1 inside headless Chrome | ❌ warmup Turnstile fails |

### 15.2 Camoufox — ✅ FULLY WORKING

Using **Camoufox** (anti-detect Firefox, `humanize=True`) the bot detection is bypassed and the full internal API works end-to-end:

| Step | Result |
|---|---|
| Load `ai-text-to-image-generator` | ✅ real page (Turnstile passes) |
| UI generation (warmup) | ✅ image produced |
| `userKey` from embed `localStorage` | ✅ 64-hex |
| `GET /api/getAccessCodeForAdPoweredStuff` (fetch in page) | ✅ 64-hex |
| `POST /api/generate` (fetch in verified embed frame) | ✅ `status: success`, exact prompt/seed/resolution/guidance/negative |
| `downloadTemporaryImageViaProxy` | ✅ JPEG bytes |

**Real test output (3 images):**

| File | Style | Resolution | Seed | Bytes |
|---|---|---|---|---|
| `test_cat.jpg` | Cinematic | 768x768 | 12345 | 87,479 |
| `test_leopard.jpg` | Oil Painting | 512x768 | 999 | 122,707 |
| `test_city.jpg` | Pixel Art | 768x512 | 42 | 138,249 |

All verified with `file`: JPEG, exact requested dimensions, `maybeNsfw: false`.

**Conclusion:** the API is complete and usable. The only requirement is a real anti-detect browser (Camoufox). See §16 for the ready-to-use client and setup.

---

## 16. Solución al bot detection — Camoufox (VERIFICADO)

### 16.1 Why Camoufox

Cloudflare Turnstile returns `600010` for headless Chrome and even stealth-patched Chromium. **Camoufox** is a Firefox-based anti-detect browser with fingerprint spoofing and humanize mode; it passes Turnstile in this environment.

### 16.2 Install

```bash
cd "ImageGenerator Servidor"
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python camoufox requests
.venv/bin/python -m camoufox fetch      # downloads the patched Firefox (~150 MB)
```

### 16.3 The working flow (implemented in `perchance_client.py`)

```
1. Launch Camoufox (headless=True, humanize=True)
2. Open https://perchance.org/ai-text-to-image-generator  → Turnstile passes
3. Click "got it", set a warmup prompt, click ✨ generate
4. Wait for the embed frame's #resultImgEl (image done)
5. Read userKey from the embed frame's localStorage:
      generation-v2:{browserId}:userKey-0  (64 hex)
6. Fetch adAccessCode from perchance.org (same-origin, cookies):
      GET /api/getAccessCodeForAdPoweredStuff
7. From INSIDE the verified image-generation.perchance.org embed frame, fetch:
      POST /api/generate?userKey=...&requestId=...&adAccessCode=...&v=...&__cacheBust=...
      body {prompt, negativePrompt, seed, resolution, guidanceScale,
            channel:"ai-text-to-image-generator", subChannel:"public",
            userKey, adAccessCode, requestId}
8. Download via imageDownloadUrl (proxy token) with fetch in the same frame
```

**Critical:** steps 6–8 MUST run inside the browser context (`page.evaluate` / `frame.evaluate`). Calling them from Python `requests` gets Cloudflare `403` because the TLS fingerprint and `cf_clearance` cookie live in the browser.

### 16.4 Ready-to-use client

`perchance_client.py` (in this project) exposes:

```python
from perchance_client import PerchanceClient

with PerchanceClient(headless=True) as pc:
    r = pc.generate(
        "a cute orange cat sitting on a windowsill",
        style="Cinematic",          # any of the 76 styles (auto-appends keywords)
        resolution="768x768",       # 512x512 | 512x768 | 768x512 | 768x768
        guidance_scale=7.0,         # 1–30
        seed=12345,                 # -1 = random
        negative_prompt="blurry",   # optional
    )
    open("cat.jpg", "wb").write(r["image_bytes"])
    print(r["width"], r["height"], r["seed"], r["maybe_nsfw"])
```

Handles automatically:
- Turnstile / Cloudflare (Camoufox)
- userKey expiry (`invalid_key` → refresh)
- ad code expiry (`invalid_access_code` → refresh)
- queue lock (`waiting_for_prev_request_to_finish` → 8 s retry)
- proxy download token discovery (`imageDownloadUrl` / `v1....`)

### 16.5 Setup + run

```bash
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python camoufox requests
.venv/bin/python -m camoufox fetch
.venv/bin/python test_client.py
```

`test_client.py` generates 3 test images (different styles/resolutions/seeds) and saves them as `test_cat.jpg`, `test_leopard.jpg`, `test_city.jpg`.

HTTP API (Flask) is in `server.py`:

```bash
.venv/bin/python server.py       # http://127.0.0.1:8000
curl "http://127.0.0.1:8000/generate?prompt=a%20cute%20cat&style=Cinematic&resolution=768x768" -o cat.jpg
curl -X POST http://127.0.0.1:8000/generate -H "Content-Type: application/json" \
  -d '{"prompt":"cyberpunk city","style":"Pixel Art","resolution":"768x512","seed":42,"response_format":"json"}'
```

Endpoints: `GET /health`, `GET /styles`, `GET|POST /generate`.

### 16.6 Notes / limits

- One Camoufox instance per app process; it is memory-heavy (~300–500 MB).
- The warmup generation takes 30–90 s; subsequent generations via the internal API are fast (~5–15 s).
- Reuse the same browser session: `userKey` is refreshed automatically, but the embed frame must stay alive.
- Do not run in parallel on the same client instance (the generator has a global queue lock). Use one client per worker or serialize calls.
- `style` is applied by appending the style's keyword expansion to the prompt (exactly what the page does). See `perchance-styles.json`.
- The page's extra controls (🧠 prompt enhancer modal, ➕ modifiers, filter, "how many") are UI-only; the API itself takes `prompt`/`negativePrompt` and one image per call. Batch = N calls.

---

## 17. No-browser flow — the ad code doubles as `accessCode` (VERIFIED 2026-10-29)

This supersedes §16 for production use. **No browser, no Turnstile, no Camoufox.**

### 17.1 The discovery

`GET /api/verifyUser` accepts the **ad access code** in the `accessCode` parameter:

```
GET https://image-generation.perchance.org/api/verifyUser
    ?browserId=<32hex>&accessCode=<adcode>&thread=0&__cacheBust=<random>
```

Response:

```json
{"status":"success","userKey":"<64hex>"}
```

Subsequent calls with the same `browserId` return `{"status":"already_verified","userKey":"..."}`.
So the Turnstile token is not required when a valid ad code is supplied.

### 17.2 Full flow (pure HTTP)

```
1. browserId = secrets.token_hex(16)                        # 32 hex
2. ad = GET https://perchance.org/api/getAccessCodeForAdPoweredStuff
        headers: Referer perchance.org/stable-diffusion-ai, Origin perchance.org
3. key = GET https://image-generation.perchance.org/api/verifyUser
        ?browserId=<bid>&accessCode=<ad>&thread=0
        headers: Referer image-generation.perchance.org/embed, Origin image-generation.perchance.org
4. POST https://image-generation.perchance.org/api/generate
        ?userKey=<key>&requestId=0.<rand>&adAccessCode=<ad>&v=<V_HASH>&__cacheBust=<rand>
        body: {prompt, negativePrompt, seed, resolution, guidanceScale,
               channel:"ai-text-to-image-generator", subChannel:"public",
               userKey, adAccessCode, requestId}
5. GET imageDownloadUrl (proxy token) or /api/downloadTemporaryImage?imageId=...
```

### 17.3 Why it works without a browser

- **Cloudflare TLS fingerprint:** handled by `curl_cffi` with `impersonate="chrome"`.
- **Turnstile:** bypassed because `verifyUser` accepts the ad code as `accessCode`.
- **CORS:** irrelevant — server-side HTTP, not a browser fetch.

### 17.4 Verified results

| Test | Result |
|---|---|
| ad code (curl_cffi) | ✅ 64 hex |
| verifyUser with `accessCode=<ad>` | ✅ `status: success`, userKey 64 hex |
| verifyUser tokenless after that | ✅ `already_verified` |
| generate (512x768, seed 777, guidance 9, negative) | ✅ `status: success` |
| download proxy | ✅ 77,515-byte JPEG |
| 3-image batch via `test_client.py` | ✅ 86 KB / 116 KB / 140 KB, correct dimensions |
| `/generate` on Flask (local) | ✅ 47 KB JPEG in **7.4 s** |

### 17.5 Caveats

- The ad code and `userKey` are IP-bound. Run the whole flow from the same IP (the server does).
- The `v` hash can change; if you get `client_update_required`, re-extract it from `https://image-generation.perchance.org/embed`.
- On a flagged/datacenter IP, the ad code endpoint may return a Cloudflare challenge. Set `PERCHANCE_PROXY` (HTTP proxy) — the client passes it to `curl_cffi`, and the whole flow uses it so the IP stays consistent.
- Serialize generations per client (the server uses a lock); `waiting_for_prev_request_to_finish` is retried automatically.

### 17.6 Result

`perchance_client.py` now uses this flow with `curl_cffi` only. No Firefox, no Camoufox, no 150 MB download, low memory — suitable for the Render free plan.

---

## 18. Hosting on Render: provider chain (verified 2026-10-29)

### 18.1 The wall

`verifyUser` accepts the ad code as `accessCode` only from IPs Perchance trusts. From Render's datacenter IP (74.220.48.219) every TLS impersonation (chrome, chrome110/120/124, firefox, firefox133, safari, edge101) returns:

```json
{"status":"failed_verification","reason":"token_required"}
```

The embed's own JS confirms the intended flow is `verifyUser?browserId=...&token=<turnstile>` (or tokenless if already verified); the ad-code shortcut is IP-sensitive.

### 18.2 The chain

`server.py` implements `IMAGE_PROVIDER=auto` (default):

1. **Perchance** — full control (negative, guidance, seed, 76 styles). Works from residential IPs and via `PERCHANCE_PROXY`.
2. **Cloudflare Workers AI** — free tier, no card. SDXL supports prompt, negative, width, height, guidance, seed. Enabled by `CF_ACCOUNT_ID` + `CF_API_TOKEN` (optional `CF_MODEL`; `@cf/black-forest-labs/flux-1-schnell` is the faster alternative).
3. **Pollinations** — keyless, `https://image.pollinations.ai/prompt/...`. Free tier is **1 image / 45 s per IP**; the server serializes and waits between calls. A `POLLINATIONS_TOKEN` removes the limit.

The response exposes the winner via `X-Image-Provider` (JPEG) or `"provider"` (JSON). Force one with `?provider=perchance|cloudflare|pollinations`.

### 18.3 Verified from Render

| Request | Result |
|---|---|
| `GET /` | `cloudflare_ready:false`, providers listed |
| `GET /generate` #1 | 200, 35,738 B, `x-image-provider: pollinations`, 10.5 s |
| `GET /generate` #2 | 200, 38,999 B, `x-image-provider: pollinations`, 49.0 s (throttle) |

### 18.4 Making it fast

Set the two Cloudflare env vars in Render. The chain then returns Cloudflare images in ~2–6 s and Perchance is skipped only when it fails. No browser, no proxy, no cost at this volume.

### 18.5 Why not a free residential proxy

Free lists are datacenter (same block), untrusted (MITM/logging) and unstable. Real residential IPs cost money. The only free, safe residential IP is the user's own connection — usable via a Cloudflare/Tailscale tunnel, but that requires a machine at home to stay on.
