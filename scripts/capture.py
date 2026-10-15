"""Drive the real app in Chromium: load a sample table, run the agent, capture screenshots.

    python scripts/capture.py [base_url] [sample_id] [out_dir]
"""
import sys, time, json
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787"
sample = sys.argv[2] if len(sys.argv) > 2 else "neighbours"
out = Path(sys.argv[3] if len(sys.argv) > 3 else "press"); out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    import os
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=float(os.environ.get("DSF", "1")))
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base, wait_until="networkidle")
    page.screenshot(path=str(out / "01-landing.png"))
    page.click(f'.samples [data-sample="{sample}"]')
    page.wait_for_function("() => [...document.querySelectorAll('.guest')].every(g => g.querySelectorAll('.fav').length > 0)", timeout=60000)
    time.sleep(0.6)
    page.locator("#builder").screenshot(path=str(out / "02-guests.png"))
    page.click("#plan-btn")
    page.wait_for_function("() => document.querySelector('#sec-seating').dataset.state === 'done' && document.querySelector('#host-note .skeleton-line') === null", timeout=180000)
    time.sleep(1.0)
    page.evaluate("document.querySelector('#evening').scrollIntoView()")
    time.sleep(0.4)
    page.screenshot(path=str(out / "03-evening-top.png"))
    for sec in ["seating", "menu", "soundtrack", "film", "deck"]:
        page.locator(f"#sec-{sec}").screenshot(path=str(out / f"04-{sec}.png"))
    page.locator(".trace").screenshot(path=str(out / "05-trace.png"))
    page.locator("#evening").screenshot(path=str(out / "06-evening-full.png"))
    usage = page.inner_text("#trace-usage")
    m = p.chromium  # noqa
    mob = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True)
    mp = mob.new_page(); mp.goto(base, wait_until="networkidle"); mp.screenshot(path=str(out / "07-mobile-landing.png"))
    mob.close()
    b.close()
print(json.dumps({"usage": usage, "console_errors": errors}, indent=1))
