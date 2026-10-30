#!/usr/bin/env python3
"""Genera los iconos de la app (Aether) con Pillow.

Uso:  python3 scripts/make-icons.py
Salida: assets/icon.png, adaptive-*, monochrome, favicon.png, splash-icon.png
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")

VIOLET = (139, 92, 246)
INDIGO = (124, 77, 255)
CYAN = (34, 211, 238)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def diagonal_gradient(size: int, color_a, color_b) -> Image.Image:
    """Gradiente diagonal dibujado línea a línea (sin numpy)."""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    steps = size * 2
    for i in range(steps):
        t = i / (steps - 1)
        d.line([(i, 0), (0, i)], fill=lerp(color_a, color_b, t))
    return img


def ring_mask(size: int, radius: float, width: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    cx = cy = size / 2
    d.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=255,
        width=int(width),
    )
    return mask


def soft_glow(size: int, color, radius: float, blur: float, opacity: int) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = cy = size / 2
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color + (opacity,))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def rounded_bg(size: int, top, bottom) -> Image.Image:
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        grad.putpixel((0, y), lerp(top, bottom, y / (size - 1)))
    img = grad.resize((size, size))
    return img.convert("RGBA")


def build_mark(size: int, with_background: bool, monochrome: bool = False) -> Image.Image:
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    if with_background:
        canvas.alpha_composite(rounded_bg(S, (12, 10, 22), (5, 5, 10)))
        canvas.alpha_composite(soft_glow(S, VIOLET, S * 0.42, S * 0.10, 150))
        canvas.alpha_composite(soft_glow(S, CYAN, S * 0.26, S * 0.12, 70))

    # Aro con gradiente
    ring_radius = S * 0.335
    ring_width = S * 0.042
    mask = ring_mask(S, ring_radius, ring_width)
    if monochrome:
        ring_layer = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    else:
        grad = diagonal_gradient(S, VIOLET, CYAN).convert("RGBA")
        ring_layer = Image.new("RGBA", (S, S), (255, 255, 255, 255))
        ring_layer.paste(grad, (0, 0))
    canvas.alpha_composite(Image.composite(ring_layer, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask))


    # Prisma central
    cx, cy = S / 2, S / 2
    top = (cx, cy - S * 0.265)
    right = (cx + S * 0.170, cy + S * 0.235)
    bottom = (cx, cy + S * 0.115)
    left = (cx - S * 0.170, cy + S * 0.235)
    prism = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(prism)
    d.polygon([top, right, bottom], fill=(255, 255, 255, 255))
    d.polygon([top, bottom, left], fill=(214, 202, 255, 250))
    # Bisel oscuro entre caras
    d.line([top, bottom], fill=(11, 11, 18, 90), width=max(2, int(S * 0.004)))

    if monochrome:
        canvas.alpha_composite(prism)
    else:
        canvas.alpha_composite(prism)

    # Brillo superior del prisma
    canvas.alpha_composite(soft_glow(S, (255, 255, 255), S * 0.06, S * 0.02, 60))

    out = canvas.resize((size, size), Image.LANCZOS)
    return out


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    icon = build_mark(1024, with_background=True)
    icon.convert("RGB").save(os.path.join(OUT, "icon.png"))

    fg = build_mark(1024, with_background=False)
    fg.save(os.path.join(OUT, "android-icon-foreground.png"))

    # Fondo del icono adaptativo (color plano con degradado suave)
    adaptive_bg = rounded_bg(1024, (12, 10, 22), (5, 5, 10)).convert("RGB")
    adaptive_bg.save(os.path.join(OUT, "android-icon-background.png"))

    mono = build_mark(1024, with_background=False, monochrome=True)
    mono.save(os.path.join(OUT, "android-icon-monochrome.png"))

    splash = build_mark(512, with_background=False)
    splash.save(os.path.join(OUT, "splash-icon.png"))

    fav = build_mark(196, with_background=True).convert("RGB")
    fav.save(os.path.join(OUT, "favicon.png"))

    print("Iconos generados en", OUT)


if __name__ == "__main__":
    main()
