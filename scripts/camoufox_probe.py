"""Probe: can Camoufox pass Perchance's Turnstile from a datacenter IP?

Run by .github/workflows/camoufox-probe.yml on a GitHub Actions runner (Azure
datacenter IP). Prints PROBE_* lines so the result is easy to read in the logs.
"""
import base64
import json
import os
import random
import time

from camoufox.sync_api import Camoufox

V = "9b43eec2e71907610e4e9317b54c208495f6850086e92239a869811d2e2d77ee"


def find_gen(page):
    for x in page.frames:
        try:
            n = x.evaluate(
                "()=>[...document.querySelectorAll('select')].some(el=>el.options.length>50)?1:0"
            )
        except Exception:
            n = 0
        if n:
            return x
    return None


def get_key(page):
    for fr in page.frames:
        try:
            k = fr.evaluate(
                "()=>{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);"
                "if(k.includes('userKey')){const v=localStorage.getItem(k);"
                "if(v&&v.length===64) return v;}} return null;}"
            )
            if k:
                return k
        except Exception:
            pass
    return None


def main():
    with Camoufox(headless=True, humanize=True) as browser:
        page = browser.new_page()
        page.goto(
            "https://perchance.org/ai-text-to-image-generator",
            wait_until="domcontentloaded",
            timeout=90000,
        )
        f = None
        for _ in range(30):
            time.sleep(2)
            f = find_gen(page)
            if f:
                break
        print("PROBE frame:", bool(f), flush=True)
        if not f:
            return 1

        def click_btn(label):
            return f.evaluate(
                """(lab)=>{const b=[...document.querySelectorAll('button')]"""
                """.find(b=>(b.innerText||'').includes(lab)); if(b){b.click();return true;} return false;}""",
                label,
            )

        click_btn("got it")
        f.evaluate(
            """()=>{const ta=[...document.querySelectorAll('textarea')][1];
            const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
            s.call(ta,'a cute orange cat sitting on a windowsill');
            ta.dispatchEvent(new Event('input',{bubbles:true}));
            ta.dispatchEvent(new Event('change',{bubbles:true}));}"""
        )
        time.sleep(1)
        click_btn("generate")

        key = None
        for i in range(45):
            time.sleep(2)
            key = get_key(page)
            if key:
                break
            if i % 5 == 0:
                print("PROBE waiting key", i * 2, flush=True)
        print("PROBE key:", bool(key), flush=True)
        if not key:
            return 2

        ad = page.evaluate(
            """async()=>{const r=await fetch('https://perchance.org/api/getAccessCodeForAdPoweredStuff',
            {headers:{'Accept':'*/*'}}); return await r.text();}"""
        )
        print("PROBE ad_len:", len(ad or ""), flush=True)

        emb = None
        for fr in page.frames:
            try:
                if fr.evaluate("()=>location.hostname==='image-generation.perchance.org'"):
                    emb = fr
                    break
            except Exception:
                pass
        if emb is None:
            print("PROBE embed: missing", flush=True)
            return 3

        rid = f"0.{random.getrandbits(30)}"
        body = {
            "prompt": "a majestic snow leopard on a cliff at sunrise, cinematic",
            "negativePrompt": "blurry, low quality",
            "seed": 12345,
            "resolution": "512x768",
            "guidanceScale": 9.0,
            "channel": "ai-text-to-image-generator",
            "subChannel": "public",
            "userKey": key,
            "adAccessCode": ad,
            "requestId": rid,
        }
        params = {
            "userKey": key, "requestId": rid, "adAccessCode": ad,
            "v": V, "__cacheBust": str(random.random()),
        }
        url = "https://image-generation.perchance.org/api/generate?" + "&".join(
            f"{k}={v}" for k, v in params.items()
        )

        data = None
        for _ in range(8):
            data = emb.evaluate(
                """async ({url, body}) => {
                    const r = await fetch(url, {method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body: JSON.stringify(body)});
                    const t = await r.text();
                    try { return {status:r.status, json:JSON.parse(t)}; }
                    catch(e){ return {status:r.status, text:t.slice(0,400)}; }
                }""",
                {"url": url, "body": body},
            )
            j = data.get("json") or {}
            print("PROBE generate:", json.dumps(j)[:300], flush=True)
            if j.get("status") == "waiting_for_prev_request_to_finish":
                time.sleep(8)
                continue
            if j.get("status") == "invalid_key":
                key = get_key(page)
                body["userKey"] = key
                params["userKey"] = key
                url = "https://image-generation.perchance.org/api/generate?" + "&".join(
                    f"{k}={v}" for k, v in params.items()
                )
                time.sleep(2)
                continue
            break

        j = data.get("json") or {}
        if j.get("status") != "success":
            print("PROBE_FAILED", json.dumps(j)[:300], flush=True)
            return 4

        img = j.get("imageDataUrls", [None])[0]
        if img:
            raw = base64.b64decode(img.split(",", 1)[1])
            print("PROBE_SUCCESS bytes:", len(raw), flush=True)
            return 0

        proxy = j.get("imageDownloadUrl") or j.get("serverImageDownloadUrl")
        print("PROBE_SUCCESS url:", bool(proxy), flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
