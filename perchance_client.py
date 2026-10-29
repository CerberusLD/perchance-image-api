"""
Perchance API client — Camoufox edition.

Solves Cloudflare + Turnstile (bot detection) by driving a real,
anti-detect Firefox (Camoufox) through the generator page once,
then using the internal HTTP API from inside the verified page context.

Requirements:
    uv venv .venv --python 3.12
    uv pip install --python .venv/bin/python camoufox requests
    .venv/bin/python -m camoufox fetch

Usage:
    from perchance_client import PerchanceClient
    with PerchanceClient() as pc:
        r = pc.generate("a cute orange cat", style="Cinematic", resolution="768x768")
        open("cat.jpg","wb").write(r["image_bytes"])
"""

from __future__ import annotations

import base64
import json
import os
import random
import re
import time
from pathlib import Path
from typing import Any, Optional

from camoufox.sync_api import Camoufox

V_HASH = "9b43eec2e71907610e4e9317b54c208495f6850086e92239a869811d2e2d77ee"
GEN_URL = "https://perchance.org/ai-text-to-image-generator"
API_BASE = "https://image-generation.perchance.org"

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
    """Evaluate the simple template expressions used in perchance-styles.json."""
    if not tpl:
        return ""
    out = tpl
    # [input.description.replace(/\b(realistic)\b/i, "actual")]
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
    out = re.sub(r"\[[^\]]*\]", "", out)  # drop any unknown leftover
    return out.strip()


def apply_style(prompt: str, style: Optional[str], negative: str = "") -> tuple[str, str]:
    """Append a style's keyword expansion to prompt/negative (same as the page)."""
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
    def __init__(self, headless: bool = True, humanize: bool = True,
                 warmup_prompt: str = "a colorful abstract test pattern"):
        self.headless = headless
        self.humanize = humanize
        self.warmup_prompt = warmup_prompt
        self._browser = None
        self._page = None
        self._gen_frame = None
        self._embed = None
        self._user_key: Optional[str] = None
        self._key_time: float = 0.0

    # ---------- lifecycle ----------
    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *exc):
        self.close()

    def start(self):
        self._browser = Camoufox(headless=self.headless, humanize=self.humanize).__enter__()
        self._page = self._browser.new_page()
        self._page.goto(GEN_URL, wait_until="domcontentloaded", timeout=60000)
        self._gen_frame = self._wait_gen_frame()
        if not self._gen_frame:
            raise PerchanceError("Generator iframe not found (Cloudflare?)")
        self._warmup()
        return self

    def close(self):
        try:
            if self._browser:
                self._browser.__exit__(None, None, None)
        finally:
            self._browser = None

    # ---------- internals ----------
    def _wait_gen_frame(self, tries: int = 30):
        for _ in range(tries):
            for f in self._page.frames:
                try:
                    n = f.evaluate(
                        "()=>[...document.querySelectorAll('select')].some(el=>el.options.length>50)?1:0"
                    )
                except Exception:
                    n = 0
                if n:
                    return f
            time.sleep(2)
        return None

    def _click(self, label: str) -> bool:
        return self._gen_frame.evaluate(
            """(lab)=>{const b=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').includes(lab)); if(b){b.click();return true;} return false;}""",
            label,
        )

    def _set_prompt(self, text: str):
        self._gen_frame.evaluate(
            """(v)=>{const ta=[...document.querySelectorAll('textarea')][1];
                 const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
                 s.call(ta,v); ta.dispatchEvent(new Event('input',{bubbles:true}));
                 ta.dispatchEvent(new Event('change',{bubbles:true}));}""",
            text,
        )

    def _find_key(self) -> Optional[str]:
        for fr in self._page.frames:
            try:
                k = fr.evaluate(
                    """()=>{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
                         if(k.includes('userKey')){const v=localStorage.getItem(k);
                         if(v&&v.length===64) return v;}} return null;}"""
                )
            except Exception:
                k = None
            if k:
                return k
        return None

    def _wait_embed_done(self, timeout: int = 240):
        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(3)
            for fr in self._page.frames:
                try:
                    done = fr.evaluate(
                        """()=>{const im=document.querySelector('#resultImgEl');
                             return !!(im && im.src && im.src.length>1000);}"""
                    )
                except Exception:
                    done = False
                if done:
                    return fr
        return None

    def _warmup(self):
        """One UI generation to pass Turnstile and mint a userKey."""
        self._click("got it")
        self._set_prompt(self.warmup_prompt)
        time.sleep(1)
        self._click("generate")
        self._embed = self._wait_embed_done(timeout=300)
        if not self._embed:
            raise PerchanceError("Warmup generation failed (no result image)")
        self.refresh_key()

    def refresh_key(self) -> str:
        for _ in range(30):
            k = self._find_key()
            if k:
                self._user_key = k
                self._key_time = time.time()
                return k
            time.sleep(2)
        raise PerchanceError("Could not obtain userKey (Turnstile not solved?)")

    def _ad_code(self) -> str:
        code = self._page.evaluate(
            """async()=>{const r=await fetch('https://perchance.org/api/getAccessCodeForAdPoweredStuff',
                 {headers:{'Accept':'*/*'}}); return await r.text();}"""
        )
        if not code or len(code.strip()) != 64:
            raise PerchanceError(f"Bad ad access code: {str(code)[:80]}")
        return code.strip()

    def _fetch_generate(self, url: str, body: dict) -> dict:
        return self._embed.evaluate(
            """async ({url, body}) => {
                const r = await fetch(url, {method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify(body)});
                const t = await r.text();
                try { return {status:r.status, json:JSON.parse(t)}; }
                catch(e){ return {status:r.status, text:t.slice(0,600)}; }
            }""",
            {"url": url, "body": body},
        )

    def _download(self, proxy_path: str) -> bytes:
        u = proxy_path
        if not u.startswith("http"):
            if u.startswith("/api"):
                u = API_BASE + u
            elif u.startswith("/"):
                u = API_BASE + "/api" + u
            else:
                u = API_BASE + "/api/downloadTemporaryImageViaProxy?t=" + u
        data_url = self._embed.evaluate(
            """async(u)=>{const r=await fetch(u); if(!r.ok) return 'ERR '+r.status;
                 const b=await r.blob();
                 return await new Promise(res=>{const f=new FileReader();
                     f.onloadend=()=>res(f.result); f.readAsDataURL(b);});}""",
            u,
        )
        if not isinstance(data_url, str) or not data_url.startswith("data:"):
            raise PerchanceError(f"Download failed: {str(data_url)[:120]}")
        return base64.b64decode(data_url.split(",", 1)[1])

    # ---------- public API ----------
    def generate(self, prompt: str, *, negative_prompt: str = "",
                 resolution: str = "768x768", guidance_scale: float = 7.0,
                 seed: int = -1, style: Optional[str] = None,
                 timeout: int = 180) -> dict[str, Any]:
        """Generate one image. Returns dict with image_bytes + metadata."""
        full_prompt, full_neg = apply_style(prompt, style, negative_prompt)
        if seed is None or seed < 0:
            seed = random.randint(1, 2**30)

        if not self._user_key or (time.time() - self._key_time) > 25:
            try:
                self.refresh_key()
            except PerchanceError:
                self.refresh_key()

        rid = f"0.{random.getrandbits(30)}"
        ad = self._ad_code()
        body = {
            "prompt": full_prompt,
            "negativePrompt": full_neg,
            "seed": seed,
            "resolution": resolution,
            "guidanceScale": guidance_scale,
            "channel": "ai-text-to-image-generator",
            "subChannel": "public",
            "userKey": self._user_key,
            "adAccessCode": ad,
            "requestId": rid,
        }
        params = {"userKey": self._user_key, "requestId": rid,
                  "adAccessCode": ad, "v": V_HASH,
                  "__cacheBust": str(random.random())}
        url = API_BASE + "/api/generate?" + "&".join(f"{k}={v}" for k, v in params.items())

        deadline = time.time() + timeout
        while time.time() < deadline:
            data = self._fetch_generate(url, body)
            j = data.get("json") or {}
            status = j.get("status")
            if status == "success":
                break
            if status == "waiting_for_prev_request_to_finish":
                time.sleep(8)
                continue
            if status == "invalid_key":
                old = self._user_key
                self.refresh_key()
                if self._user_key == old:
                    # embed has not re-verified yet: nudge it with a UI generation
                    try:
                        self._set_prompt(self.warmup_prompt)
                        self._click("generate")
                        time.sleep(15)
                    except Exception:
                        pass
                    self.refresh_key()
                body["userKey"] = self._user_key
                params["userKey"] = self._user_key
                url = API_BASE + "/api/generate?" + "&".join(f"{k}={v}" for k, v in params.items())
                continue
            if status == "invalid_access_code":
                ad = self._ad_code()
                body["adAccessCode"] = ad
                params["adAccessCode"] = ad
                url = API_BASE + "/api/generate?" + "&".join(f"{k}={v}" for k, v in params.items())
                continue
            raise PerchanceError(f"Generate failed: {data}")
        else:
            raise PerchanceError("Generate timed out")

        # find download url
        proxy = j.get("imageDownloadUrl") or j.get("serverImageDownloadUrl")
        if not proxy:
            acc = []

            def walk(v):
                if isinstance(v, str):
                    if "downloadTemporaryImageViaProxy" in v:
                        acc.append(v)
                    elif v.startswith("v1.") and len(v) > 80:
                        acc.append("/api/downloadTemporaryImageViaProxy?t=" + v)
                elif isinstance(v, dict):
                    for x in v.values():
                        walk(x)
                elif isinstance(v, list):
                    for x in v:
                        walk(x)

            walk(j)
            proxy = acc[0] if acc else None

        img = b""
        if j.get("imageDataUrls"):
            img = base64.b64decode(j["imageDataUrls"][0].split(",", 1)[1])
        elif proxy:
            img = self._download(proxy)

        return {
            "image_bytes": img,
            "image_id": j.get("imageId"),
            "seed": j.get("seed", seed),
            "prompt": j.get("prompt", full_prompt),
            "negative_prompt": j.get("negativePrompt", full_neg),
            "width": j.get("width"),
            "height": j.get("height"),
            "guidance_scale": j.get("guidanceScale", guidance_scale),
            "maybe_nsfw": j.get("maybeNsfw"),
            "download_url": proxy,
            "raw": j,
        }

    def generate_to_file(self, path: str, prompt: str, **kw) -> dict:
        r = self.generate(prompt, **kw)
        Path(path).write_bytes(r["image_bytes"])
        r["path"] = path
        return r
