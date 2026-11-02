"""Reference narration acoustics, not speaker identification or voice cloning.

Reports approximate pitch and level variation from a video/audio file. Where
the input contains music, multiple speakers or effects, F0 estimates are only
rough; use this as a QA comparison, not as a person-specific voice target.
"""
import json
import subprocess
import sys

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve


def audit(path):
    run = subprocess.run([
        "ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000",
        "-f", "f32le", "-",
    ], check=True, capture_output=True)
    sr = 16000
    raw = np.frombuffer(run.stdout, dtype="<f4")
    sos = butter(3, [80, 500], btype="bandpass", fs=sr, output="sos")
    band = sosfilt(sos, raw)
    pitch, loud = [], []
    size, stride = int(sr * .042), int(sr * .021)
    for start in range(0, len(raw) - size, stride):
        segment = raw[start:start + size]
        db = 20 * np.log10(max(float(np.sqrt(np.mean(segment ** 2))), 1e-7))
        loud.append(db)
        if db < -36:
            continue
        sample = band[start:start + size]
        sample = sample - sample.mean()
        cor = fftconvolve(sample, sample[::-1], mode="full")[size - 1:]
        if cor[0] < 1e-7:
            continue
        lo, hi = int(sr / 360), int(sr / 85)
        j = int(np.argmax(cor[lo:hi]) + lo)
        if cor[j] / cor[0] >= .56:
            pitch.append(sr / j)
    p = np.array(pitch)
    loud = np.array(loud)
    if not len(loud):
        raise ValueError("No audio samples")
    return {
        "file": path.split("/")[-1], "seconds": round(len(raw) / sr, 2),
        "pitch_median_hz": round(float(np.median(p)), 1) if len(p) else None,
        "pitch_p10_p90_hz": [round(float(x), 1) for x in np.percentile(p, [10, 90])] if len(p) else [],
        "level_p10_p90_dbfs": [round(float(x), 1) for x in np.percentile(loud, [10, 90])],
        "near_silence_percent": round(float(np.mean(loud < -36) * 100), 1),
        "pitch_samples": len(p),
    }


for name in sys.argv[1:]:
    print(json.dumps(audit(name), ensure_ascii=False))
