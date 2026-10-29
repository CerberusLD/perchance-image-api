"""
Perchance API client — pure HTTP, no browser.

Flow (reverse-engineered):
  1. GET  https://perchance.org/api/getAccessCodeForAdPoweredStuff   -> ad code (64 hex)
  2. GET  https://image-generation.perchance.org/api/verifyUser
          ?browserId=<32hex>&accessCode=<adcode>&thread=0           -> userKey (64 hex)
     The ad code works as `accessCode`, so no Cloudflare Turnstile/browser is needed.
  3. POST https://image-generation.perchance.org/api/generate
          ?userKey=...&requestId=...&adAccessCode=...&v=...          -> image metadata
  4. GET  imageDownloadUrl (proxy token) or /api/downloadTemporaryImage?imageId=...
                                                                     -> JPEG bytes

Requires: curl_cffi (Chrome TLS impersonation to pass Cloudflare's fingerprint check).
Optional: PERCHANCE_PROXY=http://user:pass@host:port for flagged/datacenter IPs.

Usage:
    from perchance_client import PerchanceClient
    with PerchanceClient() as pc:
        r = pc.generate("a cute orange cat", style="Cinematic")
        open("cat.jpg", "wb").write(r["image_bytes"])
"""

from __future__ import annotations

import base64
import json
import os
import random
import re
import secrets
import time
from pathlib import Path
from typing import Any, Optional

from curl_cffi import requests as cffi_requests

V_HASH = "9b43eec2e71907610e4e9317b54c208495f6850086e92239a869811d2e2d77ee"
API_BASE = "https://image-generation.perchance.org"
PAGE_BASE = "https://perchance.org"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

_STYLES_PATH = Path(__file__).with_name("perchance-styles.json")


class PerchanceError(RuntimeError):
    pass


def load_styles() -> dict:
    if _STYLES_PATH.exists():
        try:
            return json.loads(_STYLES_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _eval_style_template(tpl: str, prompt: str, negative: str) -> str:
    if not tpl:
        return ""
    out = tpl
    out = re.sub(
        r'\[input\.description\.replace\(/\\b\(realistic\)\\b/i, "actual"\)\]',
        lambda m: re.sub(r"\brealistic\b", "actual", prompt, flags=re.I),
        out,
    )
    out = out.replace('[input.description.length > 40 ? "(pixel art), " : ""]',
                      "(pixel art), " if len(prompt) > 40 else "")
    out = out.replace('[input.description.length < 30 ? input.description : ""]',
                      prompt if len(prompt) < 30 else "")
    out = out.replace('[input.description.length < 10 ? "of "+input.description : ""]',
                      ("of " + prompt) if len(prompt) < 10 else "")
    out = out.replace('[input.pokemonType ? input.pokemonType+", " : ""]', "")
    out = out.replace('[input.negative || ""]', negative)
    out = out.replace("[input.description]", prompt)
    out = re.sub(r"\[[^\]]*\]", "", out)
    return out.strip()


def apply_style(prompt: str, style: Optional[str], negative: str = "") -> tuple[str, str]:
    if not style:
        return prompt, negative
    styles = load_styles()
    entry = styles.get(style) or styles.get(style.strip())
    if not entry:
        return f"{prompt}, {style}", negative
    sp_tpl = entry.get("prompt", "") or ""
    sn_tpl = entry.get("negative", "") or ""
    expanded = _eval_style_template(sp_tpl, prompt, negative)
    if not expanded:
        full_prompt = prompt
    elif prompt and prompt not in expanded:
        full_prompt = f"{prompt}, {expanded}"
    else:
        full_prompt = expanded
    neg_expanded = _eval_style_template(sn_tpl, prompt, negative)
    full_neg = neg_expanded if neg_expanded else negative
    return full_prompt, full_neg


class PerchanceClient:
    """Pure-HTTP Perchance client. No browser, no Turnstile."""

    def __init__(self, timeout: int = 180, proxy: Optional[str] = None,
                 impersonate: str = "chrome"):
        self.timeout = timeout
        self.impersonate = impersonate
        self.proxy = proxy or os.getenv("PERCHANCE_PROXY") or None
        self.session = None
        self.browser_id = secrets.token_hex(16)
        self._ad: Optional[str] = None
        self._ad_ts: float = 0.0
        self._key: Optional[str] = None
        self._key_ts: float = 0.0

    # ---------- lifecycle ----------
    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *exc):
        self.close()

    def start(self):
        if self.session is None:
            kwargs = {"impersonate": self.impersonate}
            if self.proxy:
                kwargs["proxies"] = {"http": self.proxy, "https": self.proxy}
            self.session = cffi_requests.Session(**kwargs)
        return self

    def close(self):
        if self.session is not None:
            try:
                self.session.close()
            finally:
                self.session = None

    # ---------- headers ----------
    def _page_headers(self) -> dict:
        return {
            "User-Agent": UA,
            "Referer": f"{PAGE_BASE}/stable-diffusion-ai",
            "Origin": PAGE_BASE,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
        }

    def _embed_headers(self) -> dict:
        return {
            "User-Agent": UA,
            "Referer": f"{API_BASE}/embed",
            "Origin": API_BASE,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
        }

    # ---------- tokens ----------
    def ad_code(self, force: bool = False) -> str:
        now = time.time()
        if not force and self._ad and (now - self._ad_ts) < 540:
            return self._ad
        r = self.session.get(
            f"{PAGE_BASE}/api/getAccessCodeForAdPoweredStuff",
            headers=self._page_headers(), timeout=30,
        )
        code = (r.text or "").strip()
        if r.status_code != 200 or not re.fullmatch(r"[a-f0-9]{64}", code):
            raise PerchanceError(f"ad code failed: HTTP {r.status_code} {code[:120]}")
        self._ad, self._ad_ts = code, now
        return code

    def verify(self, force: bool = False) -> str:
        now = time.time()
        if not force and self._key and (now - self._key_ts) < 20:
            return self._key
        ad = self.ad_code()
        r = self.session.get(
            f"{API_BASE}/api/verifyUser",
            params={
                "browserId": self.browser_id,
                "accessCode": ad,
                "thread": 0,
                "__cacheBust": random.random(),
            },
            headers=self._embed_headers(), timeout=30,
        )
        try:
            data = r.json()
        except Exception:
            raise PerchanceError(f"verifyUser bad response: HTTP {r.status_code} {r.text[:200]}")
        if data.get("status") in ("success", "already_verified") and data.get("userKey"):
            self._key, self._key_ts = data["userKey"], now
            return self._key
        raise PerchanceError(f"verifyUser failed: {data}")

    # ---------- generation ----------
    def generate(self, prompt: str, *, negative_prompt: str = "",
                 resolution: str = "768x768", guidance_scale: float = 7.0,
                 seed: int = -1, style: Optional[str] = None,
                 timeout: Optional[int] = None) -> dict[str, Any]:
        self.start()
        full_prompt, full_neg = apply_style(prompt, style, negative_prompt)
        if seed is None or seed < 0:
            seed = random.randint(1, 2**30)

        deadline = time.time() + (timeout or self.timeout)
        last_error = None
        while time.time() < deadline:
            ad = self.ad_code()
            key = self.verify()
            rid = f"0.{random.getrandbits(30)}"
            body = {
                "prompt": full_prompt,
                "negativePrompt": full_neg,
                "seed": seed,
                "resolution": resolution,
                "guidanceScale": guidance_scale,
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
            r = self.session.post(
                f"{API_BASE}/api/generate", params=params, json=body,
                headers={**self._embed_headers(), "Content-Type": "application/json"},
                timeout=min(180, max(30, int(deadline - time.time()) + 5)),
            )
            try:
                data = r.json()
            except Exception:
                last_error = f"HTTP {r.status_code} {r.text[:200]}"
                time.sleep(3)
                continue
            status = data.get("status")
            if status == "success":
                return self._build_result(data, full_prompt, full_neg, seed, resolution, guidance_scale)
            if status == "waiting_for_prev_request_to_finish":
                time.sleep(8)
                continue
            if status == "invalid_key":
                self._key = None
                continue
            if status == "invalid_access_code":
                self.ad_code(force=True)
                continue
            if status == "failed_verification":
                self._key = None
                continue
            if status == "client_update_required":
                raise PerchanceError(
                    "client_update_required: Perchance changed the client version hash. "
                    "Re-extract v from https://image-generation.perchance.org/embed"
                )
            last_error = str(data)
            time.sleep(3)

        raise PerchanceError(f"generate timed out: {last_error}")

    def _build_result(self, j: dict, prompt: str, negative: str, seed: int,
                      resolution: str, guidance: float) -> dict[str, Any]:
        proxy = j.get("imageDownloadUrl") or j.get("serverImageDownloadUrl")
        if not proxy:
            found = []

            def walk(v):
                if isinstance(v, str):
                    if "downloadTemporaryImageViaProxy" in v:
                        found.append(v)
                    elif v.startswith("v1.") and len(v) > 80:
                        found.append("/api/downloadTemporaryImageViaProxy?t=" + v)
                elif isinstance(v, dict):
                    for x in v.values():
                        walk(x)
                elif isinstance(v, list):
                    for x in v:
                        walk(x)

            walk(j)
            proxy = found[0] if found else None

        if j.get("imageDataUrls"):
            img = base64.b64decode(j["imageDataUrls"][0].split(",", 1)[1])
        else:
            img = self._download(j, proxy)

        return {
            "image_bytes": img,
            "image_id": j.get("imageId"),
            "seed": j.get("seed", seed),
            "prompt": j.get("prompt", prompt),
            "negative_prompt": j.get("negativePrompt", negative),
            "width": j.get("width"),
            "height": j.get("height"),
            "guidance_scale": j.get("guidanceScale", guidance),
            "maybe_nsfw": j.get("maybeNsfw"),
            "download_url": proxy,
            "raw": j,
        }

    def _normalize_url(self, u: str) -> str:
        if not u:
            return u
        if u.startswith("http"):
            return u
        if u.startswith("/api"):
            return API_BASE + u
        if u.startswith("/"):
            return API_BASE + "/api" + u
        return API_BASE + "/api/downloadTemporaryImageViaProxy?t=" + u

    def _download(self, j: dict, proxy: Optional[str]) -> bytes:
        urls = []
        if proxy:
            urls.append(self._normalize_url(proxy))
        image_id = j.get("imageId")
        if image_id:
            urls.append(f"{API_BASE}/api/downloadTemporaryImage?imageId={image_id}")
        sid = j.get("serverImageDownloadUrl")
        if sid:
            urls.append(self._normalize_url(sid))

        last = ""
        for u in urls:
            try:
                r = self.session.get(u, headers=self._embed_headers(), timeout=60)
                ct = (r.headers.get("content-type") or "").lower()
                if r.status_code == 200 and len(r.content) > 1000 and "json" not in ct:
                    return r.content
                last = f"HTTP {r.status_code} {ct} {r.text[:120]}"
            except Exception as e:
                last = str(e)
        raise PerchanceError(f"download failed: {last}")

    def generate_to_file(self, path: str, prompt: str, **kw) -> dict:
        r = self.generate(prompt, **kw)
        Path(path).write_bytes(r["image_bytes"])
        r["path"] = path
        return r
