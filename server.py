"""
HTTP API wrapper around PerchanceClient (curl_cffi, no browser).

Provider strategy:
  - IMAGE_PROVIDER=auto (default): try Perchance; if its IP check rejects the
    request (token_required), fall back to Pollinations (free, no key).
  - IMAGE_PROVIDER=perchance: only Perchance.
  - IMAGE_PROVIDER=pollinations: only Pollinations.
  - IMAGE_FALLBACK=none disables the fallback.

Endpoints:
  GET  /health
  GET  /styles
  POST /generate   {prompt, negative_prompt, resolution, guidance_scale, seed, style, provider}
                   -> image/jpeg (default) or JSON if "response_format":"json"
  GET  /generate?prompt=...   -> image/jpeg
"""

import base64
import io
import os
import random
import threading
import time
import urllib.parse

from flask import Flask, request, jsonify, send_file
from curl_cffi import requests as creq

from perchance_client import (API_BASE, V_HASH, PerchanceClient, apply_style,
                              load_styles)

app = Flask(__name__)
_lock = threading.Lock()
_client = None
_poll_lock = threading.Lock()
_last_poll = 0.0

_PROVIDER = os.environ.get("IMAGE_PROVIDER", "auto").strip().lower()
_FALLBACK = os.environ.get("IMAGE_FALLBACK", "pollinations").strip().lower()

# Cloudflare Workers AI (free tier, no card): reliable fallback for datacenter
# hosts. Create a token at dash.cloudflare.com -> Workers AI -> Use REST API.
_CF_ACCOUNT = os.environ.get("CF_ACCOUNT_ID", "").strip()
_CF_TOKEN = os.environ.get("CF_API_TOKEN", "").strip()
_CF_MODEL = os.environ.get(
    "CF_MODEL", "@cf/stabilityai/stable-diffusion-xl-base-1.0"
).strip()
_POLL_TOKEN = os.environ.get("POLLINATIONS_TOKEN", "").strip()


@app.after_request
def _cors(resp):
    # Allow the static GitHub Pages frontend (any origin) to call this API.
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/generate", methods=["OPTIONS"])
def _options():
    return ("", 204)


def get_client() -> PerchanceClient:
    global _client
    if _client is None:
        _client = PerchanceClient()
        _client.start()
    return _client


@app.get("/")
def index():
    return jsonify({
        "name": "Perchance Image API",
        "version": "1.1.0",
        "provider": _PROVIDER,
        "fallback": _FALLBACK,
        "providers": ["perchance", "cloudflare", "pollinations"],
        "cloudflare_ready": _cf_ready(),
        "endpoints": {
            "GET /health": "service status",
            "GET /warmup": "create the HTTP session (first call after deploy)",
            "GET /styles": "list styles",
            "GET /generate?prompt=...": "JPEG image",
            "POST /generate": "JSON or JPEG",
        },
        "docs": "https://cerberusld.github.io/perchance-image-api/",
    })


@app.route("/warmup", methods=["GET", "POST"])
def warmup():
    """Create the HTTP session and validate access. Call once after deploy."""
    with _lock:
        try:
            get_client()
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True, "ready": True})


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "ready": _client is not None,
        "provider": _PROVIDER,
        "fallback": _FALLBACK,
    })


@app.get("/styles")
def styles():
    return jsonify(sorted(load_styles().keys()))


@app.post("/diag/raw")
def diag_raw():
    """Temporary: test whether a userKey issued on another IP works here."""
    d = request.get_json(force=True) or {}
    key = d.get("userKey") or ""
    ad = d.get("adAccessCode") or ""
    if not key:
        return jsonify({"error": "userKey required"}), 400
    c = PerchanceClient()
    c.start()
    rid = f"0.{random.getrandbits(30)}"
    body = {
        "prompt": d.get("prompt", "a small red apple on a table"),
        "negativePrompt": "",
        "seed": 1,
        "resolution": "512x512",
        "guidanceScale": 7,
        "channel": "ai-text-to-image-generator",
        "subChannel": "public",
        "userKey": key,
        "adAccessCode": ad,
        "requestId": rid,
    }
    params = {
        "userKey": key, "requestId": rid, "adAccessCode": ad,
        "v": V_HASH, "__cacheBust": str(random.random()),
    }
    r = c.session.post(
        f"{API_BASE}/api/generate", params=params, json=body,
        headers={**c._embed_headers(), "Content-Type": "application/json"},
        timeout=90,
    )
    return jsonify({"status_code": r.status_code, "body": r.text[:600]})


def _dims(resolution: str):
    try:
        w, h = (resolution or "").lower().replace("×", "x").split("x")
        return int(w), int(h)
    except Exception:
        return 768, 768


def _pollinations(prompt: str, negative: str, resolution: str,
                  seed: int, style) -> dict:
    """Free, keyless fallback: https://image.pollinations.ai"""
    full_prompt, full_neg = apply_style(prompt, style, negative)
    if full_neg:
        full_prompt = f"{full_prompt}. Avoid: {full_neg}"
    w, h = _dims(resolution)
    if seed is None or seed < 0:
        seed = random.randint(1, 2_147_483_647)
    url = "https://image.pollinations.ai/prompt/" + urllib.parse.quote(full_prompt, safe="")
    params = {
        "width": w,
        "height": h,
        "seed": int(seed),
        "model": "flux",
        "nologo": "true",
    }
    global _last_poll
    last = None
    headers = {"Authorization": f"Bearer {_POLL_TOKEN}"} if _POLL_TOKEN else {}
    with _poll_lock:
        if not _POLL_TOKEN and _last_poll:
            wait = 45.0 - (time.time() - _last_poll)
            if wait > 0:
                time.sleep(min(wait, 45.0))
        for _ in range(2):
            try:
                r = creq.get(url, params=params, headers=headers,
                             impersonate="chrome", timeout=150)
                ctype = (r.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
                if r.status_code == 200 and ctype.startswith("image/") and len(r.content) > 1000:
                    _last_poll = time.time()
                    return {
                        "image_bytes": r.content,
                        "mime": ctype,
                        "seed": int(seed),
                        "width": w,
                        "height": h,
                        "prompt": full_prompt,
                        "negative_prompt": full_neg,
                        "maybe_nsfw": False,
                        "provider": "pollinations",
                    }
                last = f"HTTP {r.status_code} {ctype} {r.text[:100]}"
                if r.status_code == 402:
                    # free tier: one image per IP every 45 s
                    break
            except Exception as e:
                last = str(e)
            time.sleep(1.5)
        _last_poll = time.time()
    raise RuntimeError(f"pollinations failed: {last}")


def _cf_ready() -> bool:
    return bool(_CF_ACCOUNT and _CF_TOKEN)


def _cloudflare(prompt: str, negative: str, resolution: str,
                guidance: float, seed: int, style) -> dict:
    """Cloudflare Workers AI (free tier). Supports negative prompt, guidance,
    dimensions and seed with SDXL; flux-1-schnell ignores them."""
    if not _cf_ready():
        raise RuntimeError("cloudflare not configured (CF_ACCOUNT_ID / CF_API_TOKEN)")
    full_prompt, full_neg = apply_style(prompt, style, negative)
    w, h = _dims(resolution)
    w = max(256, min(2048, w))
    h = max(256, min(2048, h))
    if seed is None or seed < 0:
        seed = random.randint(1, 2_147_483_647)

    if "flux" in _CF_MODEL.lower():
        body = {"prompt": full_prompt, "steps": 4, "seed": int(seed)}
    else:
        body = {
            "prompt": full_prompt,
            "negative_prompt": full_neg,
            "width": w,
            "height": h,
            "num_steps": 20,
            "guidance": float(guidance),
            "seed": int(seed),
        }

    url = f"https://api.cloudflare.com/client/v4/accounts/{_CF_ACCOUNT}/ai/run/{_CF_MODEL}"
    r = creq.post(
        url,
        headers={"Authorization": f"Bearer {_CF_TOKEN}"},
        json=body,
        impersonate="chrome",
        timeout=180,
    )
    ctype = (r.headers.get("content-type") or "").split(";")[0].strip()
    if r.status_code == 200 and ctype.startswith("image/"):
        img = r.content
    else:
        try:
            j = r.json()
        except Exception:
            raise RuntimeError(f"cloudflare HTTP {r.status_code}: {r.text[:200]}")
        if not j.get("success"):
            raise RuntimeError(f"cloudflare error: {j.get('errors')}")
        b64 = (j.get("result") or {}).get("image")
        if not b64:
            raise RuntimeError(f"cloudflare: no image in response ({str(j)[:200]})")
        img = base64.b64decode(b64)
        ctype = "image/jpeg"

    if len(img) < 1000:
        raise RuntimeError("cloudflare returned an empty image")
    return {
        "image_bytes": img,
        "mime": ctype,
        "seed": int(seed),
        "width": w,
        "height": h,
        "prompt": full_prompt,
        "negative_prompt": full_neg,
        "maybe_nsfw": False,
        "provider": "cloudflare",
    }


def _perchance(prompt: str, negative: str, resolution: str,
               guidance: float, seed: int, style) -> dict:
    with _lock:
        r = get_client().generate(
            prompt,
            negative_prompt=negative,
            resolution=resolution,
            guidance_scale=guidance,
            seed=seed,
            style=style,
        )
    r["provider"] = "perchance"
    return r


@app.route("/generate", methods=["GET", "POST"])
def generate():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
    else:
        data = request.args.to_dict()

    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    negative = data.get("negative_prompt", "") or ""
    resolution = data.get("resolution", "768x768") or "768x768"
    try:
        guidance = float(data.get("guidance_scale", 7.0))
    except (TypeError, ValueError):
        guidance = 7.0
    try:
        seed = int(data.get("seed", -1))
    except (TypeError, ValueError):
        seed = -1
    style = data.get("style") or None

    provider = (data.get("provider") or _PROVIDER).strip().lower()
    if provider not in ("auto", "perchance", "cloudflare", "pollinations"):
        provider = _PROVIDER

    def _fallback():
        errs = []
        if _cf_ready():
            try:
                return _cloudflare(prompt, negative, resolution, guidance, seed, style)
            except Exception as e:
                errs.append(f"cloudflare: {e}")
        if _FALLBACK == "pollinations":
            try:
                return _pollinations(prompt, negative, resolution, seed, style)
            except Exception as e:
                errs.append(f"pollinations: {e}")
        raise RuntimeError("fallback failed: " + ("; ".join(errs) or "none configured"))

    try:
        if provider == "pollinations":
            result = _pollinations(prompt, negative, resolution, seed, style)
        elif provider == "cloudflare":
            result = _cloudflare(prompt, negative, resolution, guidance, seed, style)
        else:
            try:
                result = _perchance(prompt, negative, resolution, guidance, seed, style)
            except Exception as e:
                if provider == "perchance":
                    raise
                # Perchance rejected this IP (token_required) or failed:
                # keep the API useful by using a fallback provider.
                app.logger.warning("perchance failed (%s); using fallback", e)
                result = _fallback()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    used = result.pop("provider", "perchance")
    mime = result.pop("mime", "image/jpeg")

    if (data.get("response_format") or "").lower() == "json":
        return jsonify({
            "ok": True,
            "provider": used,
            "image_b64": base64.b64encode(result["image_bytes"]).decode(),
            "seed": result["seed"],
            "width": result["width"],
            "height": result["height"],
            "prompt": result["prompt"],
            "negative_prompt": result["negative_prompt"],
            "maybe_nsfw": result.get("maybe_nsfw", False),
        })

    resp = send_file(
        io.BytesIO(result["image_bytes"]),
        mimetype=mime,
        download_name=f"{result['seed']}.jpg",
    )
    resp.headers["X-Image-Provider"] = used
    return resp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, threaded=True)
