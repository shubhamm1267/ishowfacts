"""Word-level transcript for a paper-doc plan, with whisper.cpp (whisper-cli), in ~18 s chunks cut at pauses.

  python3 scripts/transcribe.py VOICE.(wav|mp4|m4a) OUT_words.json [--lang hi] [--model PATH]

Writes [{"w": word, "s": start_s, "e": end_s}, …]. Hindi comes out in Devanagari with English words in
English; write on-screen titles in Roman Hinglish yourself. Default model: ~/.whisper-models/ggml-large-v3-turbo-q5_0.bin
(brew install whisper-cpp; model from huggingface.co/ggerganov/whisper.cpp).
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

CHUNK = 18.0   # whisper's word mode can silently skip speech inside a long 30 s window; short chunks don't


def cut_points(wav16k, total):
    """Chunk boundaries every ~CHUNK s, each moved to the quietest 50 ms nearby so no word is split."""
    import numpy as np
    x = np.frombuffer(Path(wav16k).read_bytes()[44:], np.int16).astype(np.float32)
    hop = 800                                            # 50 ms at 16 kHz
    rms = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, "same")[::hop] + 1e-9)
    cuts, t = [0.0], 0.0
    while total - t > CHUNK + 4:
        lo, hi = int((t + CHUNK - 4) / 0.05), int((t + CHUNK + 2) / 0.05)
        t = (lo + int(np.argmin(rms[lo:hi]))) * 0.05
        cuts.append(t)
    return cuts + [total]


def valid(b):
    try:
        b.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def flush(words, cur):
    txt = cur[0].decode("utf-8", "replace").strip()
    if txt.replace("�", "").strip() == "":                        # cut-off scrap at a chunk end
        return
    txt = txt.replace("�", "")
    if not (txt.startswith("[") and txt.endswith("]")):                # skip [_BEG_] / [music] markers
        words.append({"w": txt, "s": round(cur[1], 3), "e": round(cur[2], 3)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--lang", default="hi")
    ap.add_argument("--model", default=str(Path.home() / ".whisper-models/ggml-large-v3-turbo-q5_0.bin"))
    a = ap.parse_args()
    words = []
    with tempfile.TemporaryDirectory() as tmp:
        full = Path(tmp) / "full.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.audio, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                        str(full)], check=True)
        total = (full.stat().st_size - 44) / 2 / 16000
        cuts = cut_points(full, total)
        for t0, t1 in zip(cuts, cuts[1:]):
            wav = Path(tmp) / "chunk.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t0}", "-t", f"{t1 - t0}", "-i", str(full),
                            "-c:a", "pcm_s16le", str(wav)], check=True)
            base = Path(tmp) / "chunk"
            subprocess.run(["whisper-cli", "-m", a.model, "-f", str(wav), "-l", a.lang, "-ml", "1", "-sow",
                            "-oj", "-of", str(base)], capture_output=True, check=True)
            # whisper -ml 1 can split one Devanagari letter's UTF-8 bytes over two entries: keep the raw
            # bytes and join pieces until they decode, starting a new word at a leading space
            raw = (base.with_suffix(".json")).read_bytes().decode("utf-8", "surrogateescape")
            data = json.loads(raw)
            cur = None
            for w in data.get("transcription", []):
                b = w["text"].encode("utf-8", "surrogateescape")
                s, e = t0 + w["offsets"]["from"] / 1000, min(t1, t0 + w["offsets"]["to"] / 1000)
                if cur and b[:1] == b" " and valid(cur[0]):
                    flush(words, cur)
                    cur = None
                if cur is None:
                    cur = [b, s, e]
                else:
                    cur[0] += b
                    cur[2] = e
            if cur:
                flush(words, cur)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(words, ensure_ascii=False, indent=0))
    print(f"{len(words)} words -> {a.out}")


if __name__ == "__main__":
    main()
