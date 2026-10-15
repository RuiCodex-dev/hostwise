"""Build the demo's sound: Edge neural TTS narration (per scene, with word timings for
captions), an original synthesised music bed, and a ducked pre-mix.

Outputs (video/hyperframes/assets/):
  mix.wav              narration + ducked music, the only audio track in the composition
  timings.json         per-scene start/end and per-word caption timings
Music is generated here from code (no samples), so it is ours to licence (see CREDITS.md).

    python video/make_audio.py
"""
import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve

ROOT = Path(__file__).resolve().parent
WORK = ROOT / "work" / "tts"
ASSETS = ROOT / "hyperframes" / "assets"
SR = 48000
spec = json.loads((ROOT / "narration.json").read_text(encoding="utf-8"))


async def tts(scene):
    mp3 = WORK / f"{scene['id']}.mp3"
    words = []
    comm = edge_tts.Communicate(scene["text"], spec["voice"], rate=spec["rate"], boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    wav = WORK / f"{scene['id']}.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ar", str(SR), "-ac", "1", str(wav)], check=True)
    return wav, words


def read(wav):
    sr, x = wavfile.read(wav)
    x = x.astype(np.float32) / 32768.0
    return x


def music(seconds, seed=7):
    """Warm Rhodes-like chords + soft pad, 72 bpm, D major, original composition."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    out = np.zeros(n, np.float32)
    t = np.arange(n) / SR
    bpm = 72
    beat = 60 / bpm
    bar = beat * 4
    midi = lambda m: 440 * 2 ** ((m - 69) / 12)
    chords = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]]  # Dmaj7 Bm7 Gmaj7 A6
    # pad
    for b in range(int(seconds / bar) + 1):
        ch = chords[b % 4]
        s0 = int(b * bar * SR)
        L = int(bar * SR * 1.25)
        seg = np.arange(L) / SR
        env = np.minimum(1, seg / 1.2) * np.minimum(1, np.maximum(0, (bar * 1.25 - seg) / 1.0))
        tone = np.zeros(L, np.float32)
        for m in ch[:4]:
            f = midi(m)
            tone += (np.sin(2 * np.pi * f * seg) + 0.25 * np.sin(2 * np.pi * 2.001 * f * seg)) * 0.05
        e = min(n, s0 + L)
        out[s0:e] += (tone * env)[: e - s0]
    # electric-piano arpeggio
    pattern = [0, 2, 3, 4, 3, 2, 1, 2]
    for b in range(int(seconds / bar) + 1):
        ch = chords[b % 4]
        for k, idx in enumerate(pattern):
            if rng.random() < 0.18:
                continue
            start = b * bar + k * beat / 2
            s0 = int(start * SR)
            if s0 >= n:
                break
            L = int(2.2 * SR)
            seg = np.arange(L) / SR
            f = midi(ch[idx] + 12)
            vel = 0.06 + 0.03 * rng.random()
            tone = np.sin(2 * np.pi * f * seg + 0.6 * np.sin(2 * np.pi * f * seg) * np.exp(-seg * 6)) * np.exp(-seg * 2.4) * vel
            tone *= np.minimum(1, seg / 0.004)
            e = min(n, s0 + L)
            out[s0:e] += tone[: e - s0].astype(np.float32)
    # soft bass on the root
    for b in range(int(seconds / bar) + 1):
        f = midi(chords[b % 4][0] - 12)
        for half in (0, 2):
            s0 = int((b * bar + half * beat) * SR)
            L = int(beat * 1.9 * SR)
            if s0 >= n:
                break
            seg = np.arange(L) / SR
            tone = np.sin(2 * np.pi * f * seg) * np.exp(-seg * 1.6) * 0.09 * np.minimum(1, seg / 0.01)
            e = min(n, s0 + L)
            out[s0:e] += tone[: e - s0].astype(np.float32)
    # room reverb
    ir_len = int(2.4 * SR)
    ir = rng.standard_normal(ir_len).astype(np.float32) * np.exp(-np.arange(ir_len) / SR * 2.6)
    ir /= np.abs(ir).sum() / 6
    wet = fftconvolve(out, ir)[:n].astype(np.float32)
    mix = 0.78 * out + 0.22 * wet
    fade = int(3 * SR)
    mix[:fade] *= np.linspace(0, 1, fade)
    mix[-fade:] *= np.linspace(1, 0, fade)
    return mix / (np.abs(mix).max() + 1e-6) * 0.5


async def main():
    WORK.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    clips, timings, cur = [], [], 0.0
    for sc in spec["scenes"]:
        cur += sc.get("lead", 0)
        wav, words = await tts(sc)
        x = read(wav)
        dur = len(x) / SR
        timings.append({"id": sc["id"], "start": round(cur, 3), "end": round(cur + dur, 3), "text": sc["text"],
                        "words": [{"w": w["w"], "t": round(cur + w["t"], 3), "d": round(w["d"], 3)} for w in words]})
        clips.append((cur, x))
        cur += dur + spec["gap"] + sc.get("tail", 0)
    total = cur
    n = int(total * SR) + SR
    voice = np.zeros(n, np.float32)
    for start, x in clips:
        s0 = int(start * SR)
        voice[s0:s0 + len(x)] += x
    bed = music(n / SR)
    # duck: smooth envelope of the voice
    env = np.abs(voice)
    k = int(0.25 * SR)
    c = np.concatenate([[0.0], np.cumsum(env, dtype=np.float64)])
    idx = np.arange(len(env))
    lo = np.clip(idx - k // 2, 0, len(env)); hi = np.clip(idx + k // 2, 0, len(env))
    env = ((c[hi] - c[lo]) / np.maximum(1, hi - lo)).astype(np.float32)
    env = np.clip(env / (env.max() + 1e-6) * 4, 0, 1)
    gain = 0.55 - 0.33 * env  # music sits under the voice, lifts in the gaps
    mix = voice * 0.95 + bed * gain
    mix = mix / (np.abs(mix).max() + 1e-6) * 0.89
    stereo = np.stack([mix, mix], axis=1)
    wavfile.write(ASSETS / "mix.wav", SR, (stereo * 32767).astype(np.int16))
    (ASSETS / "timings.json").write_text(json.dumps({"total": round(total, 2), "scenes": timings}, indent=1), encoding="utf-8")
    print(json.dumps({"total": round(total, 2), "scenes": [(t["id"], t["start"], t["end"]) for t in timings]}))


asyncio.run(main())
