import os
from perchance_client import PerchanceClient

tests = [
    dict(prompt="a cute orange cat sitting on a windowsill, soft morning light",
         style="Cinematic", resolution="768x768", seed=12345, guidance_scale=7.0,
         out="test_cat.jpg"),
    dict(prompt="a majestic snow leopard on a cliff at sunrise",
         style="Oil Painting", resolution="512x768", seed=999, guidance_scale=9.0,
         negative_prompt="blurry, low quality", out="test_leopard.jpg"),
    dict(prompt="cyberpunk city at night, neon lights, rain",
         style="Pixel Art", resolution="768x512", seed=42, guidance_scale=8.0,
         out="test_city.jpg"),
]

with PerchanceClient(headless=True, humanize=True) as pc:
    print("warmup OK, userKey:", (pc._user_key or "")[:16], "...")
    for t in tests:
        out = t.pop("out")
        print("generating:", t["prompt"][:50], "|", t.get("style"))
        r = pc.generate_to_file(out, **t)
        print("  ->", out, len(r["image_bytes"]), "bytes", r["width"], "x", r["height"],
              "seed", r["seed"], "nsfw", r["maybe_nsfw"])
    print("done")
