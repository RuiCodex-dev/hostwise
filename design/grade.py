"""Curate and grade the chosen Flow variants into the app's image set.

Shared treatment for every plate so they read as one shoot:
- trim 0.6 % from every edge (some variants carry a hairline frame),
- lift the shadows towards the brand aubergine and warm the highlights slightly,
- saturation 0.93, a gentle S-curve, seeded fine grain,
- export a PNG master to design/art/ and WebP sizes to public/img/.

    python design/grade.py
"""
import random
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "gen" / "raw"
ART = ROOT / "art"
OUT = ROOT.parent / "public" / "img"

PICKS = {
    "hero": ("61037c78-0b15-4a10-99bc-d327b5367e96_3.jpg", [1366, 800]),
    "menu": ("a26f9322", [1200, 640]),
    "playlist": ("2c38f134", [1200, 640]),
    "film": ("1bef2a60", [1200, 640]),
    "talk": ("b95b7347", [1200, 640]),
    "seating": ("9043cbec", [1200, 640]),
    "afterglow": ("6867eaee", [1366, 800]),
}

SHADOW = (59, 36, 51)   # aubergine #3B2433
HIGHLIGHT = (255, 238, 214)


def find(slug: str, prefix: str) -> Path:
    for f in (RAW / slug).iterdir():
        if f.name.startswith(prefix):
            return f
    raise FileNotFoundError(f"{slug}/{prefix}")


def curve(x: float) -> float:
    # gentle S-curve on 0..1
    return x + 0.12 * (x - 0.5) * (1 - abs(2 * x - 1))


def grade(im: Image.Image, seed: int) -> Image.Image:
    w, h = im.size
    t = round(min(w, h) * 0.006)
    im = im.crop((t, t, w - t, h - t)).convert("RGB")
    im = ImageEnhance.Color(im).enhance(0.93)
    lut = []
    for c in range(3):
        for v in range(256):
            x = curve(v / 255)
            # split-tone: shadows towards aubergine, highlights towards warm cream
            s = (1 - x) ** 2 * 0.10
            hl = x ** 2 * 0.06
            y = x * (1 - s - hl) + s * SHADOW[c] / 255 + hl * HIGHLIGHT[c] / 255
            lut.append(max(0, min(255, round(y * 255))))
    im = im.point(lut)
    # seeded monochrome grain
    rnd = random.Random(seed)
    noise = Image.effect_noise((max(1, w // 2), max(1, h // 2)), 18).resize(im.size, Image.BILINEAR)
    noise = noise.point(lambda v: 128 + (v - 128) // 3).convert("RGB")
    im = Image.blend(im, Image.blend(im, noise, 0.5), 0.06 + rnd.random() * 0.01)
    return im


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for i, (slug, (prefix, widths)) in enumerate(PICKS.items()):
        src = find(slug, prefix)
        im = grade(Image.open(src), seed=1000 + i)
        im.save(ART / f"{slug}.png", optimize=True)
        for w in widths:
            h = round(im.height * w / im.width)
            im.resize((w, h), Image.LANCZOS).save(OUT / f"{slug}-{w}.webp", "WEBP", quality=80, method=6)
        print(slug, src.name, im.size)


if __name__ == "__main__":
    main()
