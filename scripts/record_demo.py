"""Record the real Hostwise app for the demo video via the Chrome DevTools screencast.

Frames are captured with their timestamps and assembled into a constant-30fps MP4,
so the footage is the actual app at real speed (the edit may speed it up and says so).

    python scripts/record_demo.py http://localhost:8788 video/work
"""
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8788"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "video/work")
OUT.mkdir(parents=True, exist_ok=True)


class Recorder:
    def __init__(self, page, name):
        self.page, self.name = page, name
        self.dir = OUT / f"frames_{name}"
        self.dir.mkdir(parents=True, exist_ok=True)
        for f in self.dir.glob("*.jpg"):
            f.unlink()
        self.frames = []
        self.cdp = page.context.new_cdp_session(page)
        self.cdp.on("Page.screencastFrame", self.on_frame)

    def on_frame(self, p):
        i = len(self.frames)
        path = self.dir / f"{i:06d}.jpg"
        path.write_bytes(base64.b64decode(p["data"]))
        self.frames.append((path, time.monotonic()))
        self.cdp.send("Page.screencastFrameAck", {"sessionId": p["sessionId"]})

    def start(self):
        self.t0 = time.monotonic()
        self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": 1920, "maxHeight": 1080, "everyNthFrame": 1})

    def stop(self):
        self.t1 = time.monotonic()
        self.cdp.send("Page.stopScreencast")
        time.sleep(0.2)
        lst = OUT / f"{self.name}.txt"
        lines = []
        for k, (path, t) in enumerate(self.frames):
            nxt = self.frames[k + 1][1] if k + 1 < len(self.frames) else self.t1
            lines.append(f"file '{path.resolve().as_posix()}'\nduration {max(0.001, nxt - t):.4f}")
        lines.append(f"file '{self.frames[-1][0].resolve().as_posix()}'")
        lst.write_text("\n".join(lines), encoding="utf-8")
        mp4 = OUT / f"{self.name}.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "16",
                        "-preset", "medium", str(mp4)], check=True)
        return mp4, self.t1 - self.t0, len(self.frames)


def smooth_scroll(page, to_y, ms=1600, steps=60):
    y0 = page.evaluate("window.scrollY")
    for k in range(1, steps + 1):
        t = k / steps
        e = t * t * (3 - 2 * t)
        page.evaluate(f"window.scrollTo(0, {y0 + (to_y - y0) * e})")
        time.sleep(ms / 1000 / steps)


def y_of(page, sel, offset=0):
    return page.evaluate(f"document.querySelector('{sel}').getBoundingClientRect().top + window.scrollY + {offset}")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--hide-scrollbars"])
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")
    time.sleep(0.8)
    report = {}

    # Clip A: landing -> pick a sample table -> favourites resolve through Qloo search
    r = Recorder(page, "a_builder")
    r.start()
    time.sleep(2.2)
    smooth_scroll(page, y_of(page, "#builder", -24), ms=1800)
    time.sleep(0.8)
    page.hover('.samples [data-sample="offsite"]')
    time.sleep(0.5)
    page.click('.samples [data-sample="offsite"]')
    page.wait_for_function("() => [...document.querySelectorAll('.guest')].every(g => g.querySelectorAll('.fav').length > 0)", timeout=90000)
    time.sleep(1.5)
    smooth_scroll(page, y_of(page, ".builder-foot", -700), ms=1400)
    time.sleep(1.2)
    page.hover("#plan-btn")
    time.sleep(0.6)
    report["a"] = r.stop()

    # Clip B: the agent plans live (trace streams, sections fill in)
    r = Recorder(page, "b_plan")
    r.start()
    page.click("#plan-btn")
    page.wait_for_function("() => document.querySelector('#host-note .skeleton-line') === null && !document.querySelector('#plan-btn').disabled", timeout=240000)
    time.sleep(1.5)
    report["b"] = r.stop()

    # Clip C: read the finished plan, section by section
    r = Recorder(page, "c_read")
    r.start()
    page.evaluate("window.scrollTo(0, document.querySelector('#evening').getBoundingClientRect().top + window.scrollY)")
    time.sleep(1.2)
    for sel in ["#sec-seating", "#sec-menu", "#sec-soundtrack", "#sec-film", "#sec-deck"]:
        smooth_scroll(page, y_of(page, sel, -40), ms=1500)
        time.sleep(2.6)
    report["c"] = r.stop()

    # Stills for the edit (full-resolution element captures)
    for sec in ["seating", "menu", "soundtrack", "film", "deck"]:
        page.locator(f"#sec-{sec}").screenshot(path=str(OUT / f"still_{sec}.png"))
    page.evaluate("document.querySelector('#evening').scrollIntoView()")
    page.locator(".trace").screenshot(path=str(OUT / "still_trace.png"))
    report["usage"] = page.inner_text("#trace-usage")
    b.close()

print(json.dumps({k: (str(v[0]), round(v[1], 1), v[2]) if isinstance(v, tuple) else v for k, v in report.items()}, indent=1))
