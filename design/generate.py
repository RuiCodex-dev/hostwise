"""Generate Hostwise imagery with gflow-cli (Google Flow, Nano Banana Pro, 0 credits).

One `gflow image t2i` call per prompt, sequentially, because the Flow profile is
shared machine-wide (the lease wait lets other agents finish first). Raw output
lands in design/gen/raw/<slug>/ (git-ignored); curated picks are graded by grade.py.

    python design/generate.py [slug ...]
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "gen" / "raw"
spec = json.loads((ROOT / "prompts.json").read_text(encoding="utf-8"))
only = set(sys.argv[1:])
env = dict(os.environ, GFLOW_CLI_LEASE_WAIT_SECONDS="1500", GFLOW_CLI_UPDATE_CHECK="0", PYTHONUTF8="1")
RAW.mkdir(parents=True, exist_ok=True)
log = open(RAW.parent / "run.log", "a", encoding="utf-8")


def images(d: Path):
    return [f for f in d.iterdir() if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]


for job in spec["jobs"]:
    slug = job["slug"]
    if only and slug not in only:
        continue
    out = RAW / slug
    out.mkdir(parents=True, exist_ok=True)
    if len(images(out)) >= 3:
        continue
    prompt = f'{job["subject"]} {spec["style_suffix"]}'
    for attempt in range(4):
        t0 = time.time()
        log.write(f"\n=== {slug} attempt {attempt + 1} {time.strftime('%H:%M:%S')} owner=qloo-visuals\n")
        log.flush()
        r = subprocess.run(
            ["gflow", "image", "t2i", prompt, "--model", "nano-pro", "--aspect", job["aspect"],
             "-n", "3", "--out", str(out)],
            env=env, stdout=log, stderr=log,
        )
        log.write(f"--- {slug} exit {r.returncode} in {time.time() - t0:.0f}s, files {len(images(out))}\n")
        log.flush()
        if r.returncode == 0 and images(out):
            break
        time.sleep(75)
log.write("\nALL DONE\n")
log.close()
