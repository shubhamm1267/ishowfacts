---
name: paper-doc
description: Make a faceless 9:16 "paper cut-out documentary" fact reel (kraft-paper pages, two-line title with a red word, the real subject photo as a paper cut-out, stamps / props / x-ray pages landing on each spoken word, voice-over only) from the user's voice recording and photos. Use when the user says "use paper-doc", "paper cut-out style", "paper style reel", "beetle style", "is style mein banao", or asks for a faceless fact reel like the Bombardier Beetle reel by @ast_bts / Grow With AST.
---

# paper-doc — Paper Cut-out Documentary reels

Renders with `scripts/paper_doc.py` from a JSON scene plan you write for each video. Read `REFERENCE.md` (every element and key) before writing a plan, and look at `examples/beetle_plan.json` (a full 46 s reel, 19 scenes).

`SKILL` = this folder. Run scripts with the user's Python (one that has numpy + Pillow; pedalboard for the voice step).

## 0 · First time on a machine
`bash SKILL/scripts/setup_check.sh` → fix any ✗ → `python3 SKILL/scripts/paper_doc.py selftest ./paper_doc_selftest` (6 s test video; add a photo path as a 2nd argument to test the cut-out). Needs macOS 14+ (Futura font, Apple Vision cut-out), ffmpeg, swift.

## 1 · Inputs (ask for what's missing)
- **Voice recording** of the script (phone is fine). If they have no script yet, use `prompts/1_topic.txt` and `prompts/2_script.txt`; facts must be checked against the sources.
- **Subject photo(s)** they own or have the right to use. Never download images without asking; never copy another creator's frames.
- Work in a folder per video (e.g. `<video>/02_Raw`, `05_Audio`, `06_Edit`, `04_Graphics/paper_cutouts`, `07_Export`). Plan paths are relative to the video folder (the plan's folder, or its parent when the plan sits in `06_Edit/`).

## 2 · Voice + words
```bash
python3 SKILL/scripts/voice_polish.py RAW.m4a 05_Audio/voice_polished.wav --strength medium
python3 SKILL/scripts/transcribe.py 05_Audio/voice_polished.wav 06_Edit/transcript/words.json --lang hi
python3 SKILL/scripts/paper_doc.py words 06_Edit/transcript/words.json
```
(Skip polish if pedalboard isn't installed and the recording is clean; transcribe needs whisper-cli + a model.)

## 3 · Photos → cut-outs
`python3 SKILL/scripts/paper_doc.py cutout 02_Raw/photo.jpg 04_Graphics/paper_cutouts/thing.png [--rotate 90]` — check the PNG; rotate so the subject points the way scenes need (head up is easiest). Note anchor points (e.g. `tail`, `mouth`) in cut-out pixels if sprays / rings must come out of a spot, or use `rel` fractions.

## 4 · Scene plan table → show the user first
One scene per spoken phrase, **every 2–3 s**. Columns: time · words · title (2 lines, Roman Hinglish, mark the red line) · visual (elements and the word each lands on) · sound. Story shape: mystery hook (silhouette / strangest fact) → "ye sach hai" (ticket / stamp) → name (name tag) → how it works (dark x-ray pages with glows, props) → twist / payoff → name again / final burst. Wait for OK.

## 5 · Plan JSON → check → render
Write `06_Edit/<name>_paperdoc.json` (see REFERENCE.md). Then:
```bash
python3 SKILL/scripts/paper_doc.py contact 06_Edit/<name>_paperdoc.json /tmp/pd   # one still per scene — look at it
python3 SKILL/scripts/paper_doc.py stills  06_Edit/<name>_paperdoc.json /tmp/pd 3.2 7.9   # exact moments
python3 SKILL/scripts/paper_doc.py render  06_Edit/<name>_paperdoc.json
```
Fix overlaps (nothing over the title area y < 640; keep 60 px margins), wrong timing, unreadable text; re-check; render. Output is −14 LUFS, 1080×1920, 30 fps.

## Rules
- Every element lands on its spoken word (`at` = seconds from the scene start).
- One red title line per scene; titles short (≤ 12 characters per line reads best).
- Sounds: built-in names (`whoosh thud pop mpop question tick ding sizzle boil boom riser`) use the bundled CC0 files or are generated; the user can point `@sfx/…` or a path to their own licensed library and `meta.music.file` to their own music (otherwise a generated dark drone plays).
- No view / money promises in scripts; facts with sources.

Made by AST BTS · Grow With AST. Sounds: Kenney (CC0), see `sounds/LICENSE-CC0-Kenney.txt`.
