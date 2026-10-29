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

from perchance_client import PerchanceClient, apply_style, load_styles

app = Flask(__name__)
_lock = threading.Lock()
_client = None

_PROVIDER = os.environ.get("IMAGE_PROVIDER", "auto").strip().lower()
_FALLBACK = os.environ.get("IMAGE_FALLBACK", "pollinations").strip().lower()


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
        "providers": ["perchance", "pollinations"],
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
    last = None
    for _ in range(3):
        try:
            r = creq.get(url, params=params, impersonate="chrome", timeout=150)
            ctype = (r.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
            if r.status_code == 200 and ctype.startswith("image/") and len(r.content) > 1000:
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
        except Exception as e:
            last = str(e)
        time.sleep(1.5)
    raise RuntimeError(f"pollinations failed: {last}")


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
    if provider not in ("auto", "perchance", "pollinations"):
        provider = _PROVIDER

    try:
        if provider == "pollinations":
            result = _pollinations(prompt, negative, resolution, seed, style)
        else:
            try:
                result = _perchance(prompt, negative, resolution, guidance, seed, style)
            except Exception as e:
                if provider == "perchance" or _FALLBACK == "none":
                    raise
                # Perchance rejected this IP (token_required) or failed:
                # keep the API useful by using the keyless fallback.
                app.logger.warning("perchance failed (%s); using pollinations", e)
                result = _pollinations(prompt, negative, resolution, seed, style)
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
