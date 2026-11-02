"""AST BTS voice preset — makes the voice smoother and easier on the ear.

Chain (Spotify Pedalboard + a numpy split-band de-esser + ffmpeg loudnorm):
  1. High-pass 80 Hz          -> removes table thumps / fan rumble
  2. Expander                 -> keeps gaps between words as quiet as the raw take
  3. EQ: -boxiness, +warmth, -harshness, soft top-end roll-off above 7 kHz
  4. Compressor               -> evens loud and soft words
  5. De-esser (5-10 kHz)      -> softens sharp "s"/"sh" (after the compressor, which lifts them)
  6. Loudness -14 LUFS (static gain) + limiter at -1.5 dB (style guide)

Usage:
  .venv/bin/python voice/voice_polish.py IN OUT [--strength light|medium|strong]
IN can be a video or audio file. If OUT is .mp4/.mov the video is copied
untouched and only the audio is replaced; if OUT is .wav you get audio only.
"""
import argparse, os, subprocess, sys, tempfile
import numpy as np
from pedalboard import (Compressor, Gain, HighpassFilter, HighShelfFilter, Limiter, LowShelfFilter,
                        NoiseGate, Pedalboard, PeakFilter)
from pedalboard.io import AudioFile

SR = 48000

PRESETS = {
    # EQ gains in dB (top = shelf above 7 kHz); deess = max cut; ratio = compressor; gate = expander ratio,
    # gate_below = expander threshold in dB below the speech level, gate_rel = release ms
    "light":  dict(box=-1.5, warm=1.0, harsh=-2.0, top=-1.0, deess=-9, ratio=2.0, gate=2.5, gate_below=28, gate_rel=120),
    "medium": dict(box=-2.5, warm=1.5, harsh=-3.0, top=-2.0, deess=-12, ratio=3.0, gate=3.5, gate_below=25, gate_rel=100),
    "strong": dict(box=-3.5, warm=2.0, harsh=-4.0, top=-3.0, deess=-15, ratio=4.0, gate=4.5, gate_below=23, gate_rel=90),
}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-2000:])
    return r


def deess(x, sr, max_cut_db):
    """Split-band de-esser: only the 5-10 kHz band is turned down, and only while it's spiky."""
    band = Pedalboard([HighpassFilter(5000)])(x, sr)
    win = int(sr * 0.005)
    env = np.sqrt(np.convolve(band[0] ** 2, np.ones(win) / win, mode="same") + 1e-12)
    full = np.sqrt(np.convolve(x[0] ** 2, np.ones(win) / win, mode="same") + 1e-12)
    # how much the sibilant band sticks out compared with the whole voice
    ratio_db = 20 * np.log10(env / full)
    over = np.clip(ratio_db - (-18), 0, None)            # band louder than -18 dB of the full signal
    gain_db = -np.minimum(over * 2.0, -max_cut_db)
    # smooth the gain so it doesn't click (2 ms attack-ish, 40 ms release-ish)
    g = 10 ** (gain_db / 20)
    a, r = np.exp(-1 / (sr * 0.002)), np.exp(-1 / (sr * 0.04))
    out = np.empty_like(g); s = 1.0
    for i, v in enumerate(g):
        c = a if v < s else r
        s = c * s + (1 - c) * v
        out[i] = s
    return x - band + band * out[None, :]


def polish(in_path, out_path, strength="medium"):
    p = PRESETS[strength]
    tmp = tempfile.mkdtemp()
    raw = os.path.join(tmp, "raw.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", in_path, "-vn", "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", raw])
    with AudioFile(raw) as f:
        x = f.read(f.frames)

    # level-match: bring every recording to the same speech level (90th pct of 50 ms frames = -14 dBFS)
    # so the expander/compressor thresholds below behave the same on quiet and loud takes
    n = int(SR * 0.05)
    lv = 20 * np.log10(np.sqrt((x[0, : len(x[0]) // n * n].reshape(-1, n) ** 2).mean(1)) + 1e-9)
    x = x * 10 ** ((-14 - float(np.percentile(lv, 90))) / 20)
    gate_th = -14 - p["gate_below"]

    pre = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=80),   # two stages = steeper cut, so the warmth
        HighpassFilter(cutoff_frequency_hz=80),   # shelf below can't lift rumble
        NoiseGate(threshold_db=gate_th, ratio=p["gate"], attack_ms=2, release_ms=p["gate_rel"]),
        LowShelfFilter(cutoff_frequency_hz=200, gain_db=p["warm"]),
        PeakFilter(cutoff_frequency_hz=380, gain_db=p["box"], q=1.0),
        PeakFilter(cutoff_frequency_hz=3200, gain_db=p["harsh"], q=1.0),
        HighShelfFilter(cutoff_frequency_hz=7000, gain_db=p["top"]),
    ])
    y = pre(x, SR)
    y = Pedalboard([Compressor(threshold_db=-22, ratio=p["ratio"], attack_ms=6, release_ms=90)])(y, SR)
    # de-ess after compression (the compressor would otherwise bring the "s" back up)
    y = deess(y, SR, p["deess"])

    # loudness: measure, then one static gain + a true-peak-safe limiter.
    # (ffmpeg loudnorm falls back to "dynamic" mode, which lifts the room noise between words)
    mid = os.path.join(tmp, "mid.wav")
    with AudioFile(mid, "w", SR, 1) as f:
        f.write(y)
    meas = run(["ffmpeg", "-hide_banner", "-i", mid, "-af", "ebur128", "-f", "null", "-"]).stderr
    lufs = float(meas[meas.rindex("I:"):].split()[1])
    # pedalboard's Limiter drives the input up by -threshold and caps at 0 dBFS, so trim back after it:
    # net effect = static gain to -14 LUFS with a ceiling at -1.5 dBFS
    y = Pedalboard([Gain(gain_db=-14 - lufs), Limiter(threshold_db=-1.5, release_ms=60), Gain(gain_db=-1.5)])(y, SR)
    # the limiter shaves a little loudness off; correct once (only downward beyond the -1.5 dB ceiling)
    with AudioFile(mid, "w", SR, 1) as f:
        f.write(y)
    meas = run(["ffmpeg", "-hide_banner", "-i", mid, "-af", "ebur128", "-f", "null", "-"]).stderr
    fix = -14 - float(meas[meas.rindex("I:"):].split()[1])
    headroom = -1.0 - 20 * np.log10(np.abs(y).max() + 1e-9)
    y = Pedalboard([Gain(gain_db=min(fix, headroom))])(y, SR)
    final = os.path.join(tmp, "final.wav")
    with AudioFile(final, "w", SR, 1) as f:
        f.write(y)

    if out_path.lower().endswith((".mp4", ".mov", ".m4v")):
        run(["ffmpeg", "-v", "error", "-y", "-i", in_path, "-i", final, "-map", "0:v", "-map", "1:a",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", out_path])
    else:
        run(["ffmpeg", "-v", "error", "-y", "-i", final, "-c:a", "pcm_s24le", out_path])
    return out_path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--strength", default="medium", choices=PRESETS)
    a = ap.parse_args()
    print(polish(a.inp, a.out, a.strength))
