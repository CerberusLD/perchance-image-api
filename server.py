"""
Perchance-only HTTP API (Camoufox browser edition).

Perchance now requires a Turnstile token for `verifyUser`; the old ad-code
shortcut is gone. The only way to generate is to drive a real, anti-detect
Firefox (Camoufox) through the generator page once and then use the internal
HTTP API from inside the verified page context.

Playwright's sync API is thread-bound, so the browser lives in one dedicated
worker thread and every request is executed there through a queue. Flask stays
threaded and /health keeps responding while an image is generating.

Endpoints:
  GET  /health
  GET  /styles
  GET  /warmup
  GET  /generate?prompt=...          -> image/jpeg
  POST /generate {prompt, negative_prompt, resolution, guidance_scale, seed,
                  style, response_format} -> image/jpeg or JSON
"""

import base64
import io
import os
import queue
import threading

from flask import Flask, request, jsonify, send_file

from perchance_client import PerchanceClient, load_styles

app = Flask(__name__)


@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/generate", methods=["OPTIONS"])
def _options():
    return ("", 204)


class PerchanceWorker:
    """Owns Camoufox in a single thread; runs calls through a queue."""

    def __init__(self):
        self._q = queue.Queue()
        self._ready = threading.Event()
        self._error = None
        self._client = None
        self._thread = threading.Thread(target=self._run, daemon=True,
                                        name="perchance-browser")
        self._thread.start()

    def _run(self):
        try:
            self._client = PerchanceClient(headless=True, humanize=True)
            self._client.start()
        except Exception as e:
            self._error = e
            self._ready.set()
            return
        self._ready.set()
        while True:
            item = self._q.get()
            if item is None:
                return
            fn, args, kwargs, ev, box = item
            try:
                box["result"] = fn(self._client, *args, **kwargs)
            except Exception as e:
                box["error"] = e
            finally:
                ev.set()

    @property
    def ready(self) -> bool:
        return self._ready.is_set() and self._error is None

    def ensure_ready(self, timeout: int = 180):
        if not self._ready.wait(timeout):
            raise RuntimeError("browser initialization timed out")
        if self._error:
            raise self._error

    def call(self, fn, *args, timeout: int = 300, **kwargs):
        self.ensure_ready()
        ev = threading.Event()
        box = {}
        self._q.put((fn, args, kwargs, ev, box))
        if not ev.wait(timeout):
            raise RuntimeError("generation timed out")
        if "error" in box:
            raise box["error"]
        return box["result"]


_worker = None
_worker_lock = threading.Lock()


def get_worker() -> PerchanceWorker:
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = PerchanceWorker()
        return _worker


@app.get("/")
def index():
    return jsonify({
        "name": "Perchance Image API",
        "version": "2.0.0",
        "engine": "perchance",
        "browser": "camoufox",
        "endpoints": {
            "GET /health": "service status",
            "GET /warmup": "start the browser and verify (first call after deploy)",
            "GET /styles": "list styles",
            "GET /generate?prompt=...": "JPEG image",
            "POST /generate": "JSON or JPEG",
        },
        "docs": "https://cerberusld.github.io/perchance-image-api/",
    })


@app.route("/warmup", methods=["GET", "POST"])
def warmup():
    """Start Camoufox and complete the Perchance verification."""
    try:
        get_worker().ensure_ready()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True, "ready": True})


@app.get("/health")
def health():
    w = _worker
    return jsonify({
        "status": "ok",
        "ready": bool(w and w.ready),
        "engine": "perchance",
        "browser": "camoufox",
    })


@app.get("/styles")
def styles():
    return jsonify(sorted(load_styles().keys()))


@app.route("/generate", methods=["GET", "POST"])
def generate():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
    else:
        data = request.args.to_dict()

    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    try:
        guidance = float(data.get("guidance_scale", 7.0))
    except (TypeError, ValueError):
        guidance = 7.0
    try:
        seed = int(data.get("seed", -1))
    except (TypeError, ValueError):
        seed = -1

    kw = dict(
        negative_prompt=data.get("negative_prompt", "") or "",
        resolution=data.get("resolution", "768x768") or "768x768",
        guidance_scale=guidance,
        seed=seed,
        style=data.get("style") or None,
    )

    try:
        r = get_worker().call(
            lambda c: c.generate(prompt, **kw), timeout=300
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if (data.get("response_format") or "").lower() == "json":
        return jsonify({
            "ok": True,
            "provider": "perchance",
            "image_b64": base64.b64encode(r["image_bytes"]).decode(),
            "seed": r["seed"],
            "width": r["width"],
            "height": r["height"],
            "prompt": r["prompt"],
            "negative_prompt": r["negative_prompt"],
            "maybe_nsfw": r.get("maybe_nsfw"),
        })

    resp = send_file(io.BytesIO(r["image_bytes"]), mimetype="image/jpeg",
                     download_name=f"{r['seed']}.jpg")
    resp.headers["X-Image-Provider"] = "perchance"
    return resp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, threaded=True)
