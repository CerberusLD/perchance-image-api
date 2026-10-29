"""
HTTP API wrapper around PerchanceClient (curl_cffi, no browser).

Endpoints:
  GET  /health
  GET  /styles
  POST /generate   {prompt, negative_prompt, resolution, guidance_scale, seed, style}
                   -> image/jpeg (default) or JSON if "response_format":"json"
  GET  /generate?prompt=...   -> image/jpeg
"""

import io
import json
import threading
from pathlib import Path

from flask import Flask, request, jsonify, send_file

from perchance_client import PerchanceClient, load_styles

app = Flask(__name__)
_lock = threading.Lock()
_client = None


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
        "version": "1.0.0",
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
    return jsonify({"status": "ok", "ready": _client is not None})


@app.get("/styles")
def styles():
    return jsonify(sorted(load_styles().keys()))


@app.route("/generate", methods=["GET", "POST"])
def generate():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
    else:
        data = request.args.to_dict()
    prompt = data.get("prompt")
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    kw = dict(
        negative_prompt=data.get("negative_prompt", ""),
        resolution=data.get("resolution", "768x768"),
        guidance_scale=float(data.get("guidance_scale", 7.0)),
        seed=int(data.get("seed", -1)),
        style=data.get("style") or None,
    )
    with _lock:
        try:
            r = get_client().generate(prompt, **kw)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if data.get("response_format") == "json":
        import base64
        return jsonify({
            "ok": True,
            "image_b64": base64.b64encode(r["image_bytes"]).decode(),
            "seed": r["seed"],
            "width": r["width"],
            "height": r["height"],
            "prompt": r["prompt"],
            "negative_prompt": r["negative_prompt"],
            "maybe_nsfw": r["maybe_nsfw"],
        })
    return send_file(io.BytesIO(r["image_bytes"]), mimetype="image/jpeg",
                     download_name=f"{r['seed']}.jpg")


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, threaded=True)
