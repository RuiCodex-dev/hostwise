"""Thumbnail (1280x720), Open Graph card (1200x630) and a vertical teaser (1080x1920).

Typography is real (Instrument Serif / Hanken Grotesk via the browser), never model-rendered.
    python video/make_extras.py
"""
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PROJ = ROOT.parent
FONTS = (PROJ / "public" / "fonts").as_uri()
ART = (PROJ / "design" / "art").as_uri()

BASE_CSS = f"""
@font-face {{ font-family: IS; src: url('{FONTS}/instrument-serif-latin-400-normal.woff2'); }}
@font-face {{ font-family: IS; font-style: italic; src: url('{FONTS}/instrument-serif-latin-400-italic.woff2'); }}
@font-face {{ font-family: HG; font-weight: 600; src: url('{FONTS}/hanken-grotesk-latin-600-normal.woff2'); }}
* {{ margin: 0; box-sizing: border-box; }}
body {{ background: #2C1A26; color: #F3ECE1; overflow: hidden; }}
.mark em {{ color: #C1964A; font-style: italic; }}
"""


def card(w, h, plate, side="left", big=150, tag=46, extra=""):
    align = "left" if side == "left" else "right"
    grad = "90deg" if side == "left" else "270deg"
    pos = "left: 7%;" if side == "left" else "right: 7%;"
    return f"""<html><head><style>{BASE_CSS}
    .bg {{ position: absolute; inset: 0; background: url('{ART}/{plate}.png') center/cover; }}
    .sh {{ position: absolute; inset: 0; background: linear-gradient({grad}, rgba(28,17,24,.94) 0%, rgba(28,17,24,.66) 42%, rgba(28,17,24,.08) 75%); }}
    .c {{ position: absolute; {pos} top: 50%; transform: translateY(-50%); text-align: {align}; width: 62%; }}
    .eb {{ font: 600 {round(tag*0.42)}px HG; letter-spacing: .2em; text-transform: uppercase; color: #C1964A; margin-bottom: {round(tag*0.6)}px; }}
    .mark {{ font: {big}px/0.95 IS; }}
    .tag {{ font: italic {tag}px/1.12 IS; margin-top: {round(tag*0.5)}px; color: rgba(243,236,225,.92); }}
    .by {{ font: 600 {round(tag*0.42)}px HG; letter-spacing: .18em; text-transform: uppercase; color: #C1964A; margin-top: {round(tag*0.9)}px; }}
    {extra}
    </style></head><body style="width:{w}px;height:{h}px">
    <div class="bg"></div><div class="sh"></div>
    <div class="c"><div class="eb">A hosting agent built on Qloo</div><div class="mark">Host<em>wise</em></div>
    <div class="tag">Dinner for people who don't share a taste. Yet.</div><div class="by">Rui Codex</div></div>
    </body></html>"""


TEASER_OVERLAY = f"""<html><head><style>{BASE_CSS}
body {{ width: 1080px; height: 1920px; background: transparent; }}
.top {{ position: absolute; left: 80px; right: 80px; top: 170px; }}
.eb {{ font: 600 26px HG; letter-spacing: .2em; text-transform: uppercase; color: #C1964A; }}
.h {{ font: 96px/1.0 IS; margin-top: 30px; }}
.h em {{ color: #C1964A; font-style: italic; }}
.bot {{ position: absolute; left: 80px; right: 80px; bottom: 210px; }}
.p {{ font: 600 34px/1.4 HG; color: rgba(243,236,225,.86); }}
.mark {{ font: 120px/1 IS; margin-top: 40px; }}
.by {{ font: 600 26px HG; letter-spacing: .18em; text-transform: uppercase; color: #C1964A; margin-top: 18px; }}
</style></head><body>
<div class="top"><div class="eb">Six guests. Six tastes.</div><div class="h">An agent that plans dinner so <em>nobody</em> is left out.</div></div>
<div class="bot"><div class="p">Every pick scored for every guest in Qloo's taste graph. Real app, live run, 2x speed.</div>
<div class="mark">Host<em>wise</em></div><div class="by">Rui Codex</div></div>
</body></html>"""


def shot(page, html, w, h, out, transparent=False):
    page.set_viewport_size({"width": w, "height": h})
    tmp = ROOT / "work" / "_extra.html"  # load from a file so file:// fonts and images are allowed
    tmp.write_text(html, encoding="utf-8")
    page.goto(tmp.as_uri())
    page.wait_for_timeout(400)
    page.evaluate("document.fonts.ready")
    page.screenshot(path=str(out), omit_background=transparent)


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    shot(page, card(1280, 720, "hero", big=150, tag=44), 1280, 720, ROOT / "thumbnail.png")
    shot(page, card(1200, 630, "hero", big=132, tag=40), 1200, 630, PROJ / "public" / "img" / "og.png"); __import__("PIL.Image").Image.open(PROJ / "public" / "img" / "og.png").convert("RGB").save(PROJ / "public" / "img" / "og.jpg", quality=86); (PROJ / "public" / "img" / "og.png").unlink()
    shot(page, TEASER_OVERLAY, 1080, 1920, ROOT / "work" / "teaser_overlay.png", transparent=True)
    b.close()

src = ROOT / "demo-final.mp4"
if src.exists():
    # 18 s from the live agent run onwards, centred on an aubergine vertical canvas.
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-ss", "28.3", "-t", "18", "-i", str(src),
        "-i", str(ROOT / "work" / "teaser_overlay.png"),
        "-filter_complex",
        "color=c=0x2C1A26:s=1080x1920:d=18[bg];[0:v]scale=1080:-2,setsar=1[v];[bg][v]overlay=0:(H-h)/2[b];[b][1:v]overlay=0:0,format=yuv420p[out];"
        "[0:a]afade=t=in:d=0.4,afade=t=out:st=17:d=1[a]",
        "-map", "[out]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "160k",
        "-r", "30", str(ROOT / "teaser-vertical.mp4"),
    ], check=True)
print("extras done")
