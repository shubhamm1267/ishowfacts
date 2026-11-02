# Paper Facts Studio — one-click fact videos (new Angular + Node extension)

**Start here:** [FACTS_STUDIO_README.md](FACTS_STUDIO_README.md). This uploaded project now includes an Angular interface, Node generation API, Gemini Lite storyboard planning, source-assisted facts, Cartesia narration, Wikimedia Commons imagery, Freesound CC0 effects, and browser MP4 preview/download. The original `paper-doc` Python/FFmpeg renderer and its manual workflow remain intact below.

The included sample in `samples/offline-render-demo.mp4` is an explicitly **silent, offline renderer test**, not a live provider-generated video. Configure the provider keys in `studio/.env` for real automatic production.

---

# paper-doc · Paper Cut-out Documentary reels with Claude

Faceless 9:16 fact reels in the "paper documentary" look: kraft-paper pages, a big two-line title with one red word, your subject photo turned into a paper cut-out, and stamps, tickets, rulers, flasks, x-ray pages and comic bursts landing on every word you say. You record the voice; Claude Code plans the scenes and renders the video on your Mac.

From the Grow With AST video "Maine Bhi Bana Di" (the Bombardier Beetle reel). Made by AST BTS (@ast_bts).

## What you need
- A **Mac on macOS 14 or newer** (it uses the Mac's Futura font and Apple Vision to cut out photos, on your machine).
- **Claude Code** (desktop app Code tab, or the CLI).
- **ffmpeg** and **Python 3** with `numpy` + `pillow`. Optional: `pedalboard` (voice polish), `whisper-cpp` + a model (word timings).

```bash
brew install ffmpeg whisper-cpp
python3 -m pip install numpy pillow pedalboard
mkdir -p ~/.whisper-models   # put ggml-large-v3-turbo-q5_0.bin here (huggingface.co/ggerganov/whisper.cpp)
```

## Install
1. Unzip this folder.
2. Copy the `paper-doc` folder into your project's skills folder: `<your project>/.claude/skills/paper-doc/` (or `~/.claude/skills/paper-doc/` to have it in every project).
3. Check: `bash .claude/skills/paper-doc/scripts/setup_check.sh` then `python3 .claude/skills/paper-doc/scripts/paper_doc.py selftest ./selftest` — you get a 6-second test video.

## Use
Open Claude Code in your project and say, for example:

> Use the paper-doc skill. Here is my voice: `voice.m4a`. Topic: the mantis shrimp. Photo: `mantis.jpg` (my own).

Claude polishes the voice, transcribes it word by word, shows you a scene table (time · words · title · visual · sound), and after your OK writes the plan, shows you one frame per scene, and renders the reel. Ready-made prompts for the topic, the script and the reel are in `prompts/`.

## What's inside
| | |
|---|---|
| `SKILL.md` | the workflow Claude follows |
| `REFERENCE.md` | every scene element and option (for Claude, or you if you want to tweak) |
| `scripts/paper_doc.py` | the renderer |
| `scripts/subject_cutout.swift` | cuts the subject out of a photo (Apple Vision, on device) |
| `scripts/voice_polish.py` | voice clean-up (Spotify Pedalboard) |
| `scripts/transcribe.py` | word timings (whisper.cpp) |
| `scripts/setup_check.sh` | checks your setup |
| `sounds/` | CC0 sound effects (Kenney) — free to use and share |
| `prompts/` | topic, script and make-the-reel prompts |
| `examples/beetle_plan.json` | the full Bombardier Beetle plan (media not included) |

## Good to know
- Use photos you own or have the right to use. Don't copy other creators' frames.
- Sounds: the bundled CC0 effects, plus generated sizzle / boil / boom / riser and a generated dark music drone. Want your own music? Put the file path in the plan's `meta.music.file`.
- Check every fact before you post. The script prompt asks Claude for sources.
- 9:16 only for now.

Licences: see `NOTICE.md`.
