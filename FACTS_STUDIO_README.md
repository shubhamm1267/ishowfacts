# Paper Facts Studio — Angular + Node.js + original paper-doc renderer

This folder **extends the supplied `paper-doc` ZIP**. It retains `scripts/paper_doc.py`, its paper props, kraft backgrounds, animations, anchor support, generated scene backgrounds, sound mixing and FFmpeg muxing. It adds one-click generation and a responsive Angular preview interface. No Remotion dependency is needed because the provided Python renderer already does the animation and export.

## Flow

`Angular Generate Video → Node job → Gemini Flash-Lite topic (when blank) → Wikipedia article extract → Gemini scene-specific JSON storyboard + validation/retry → Cartesia Sonic selected male narrator WAV (per scene) → Wikimedia Commons licensed images → strict Gemini multimodal exact-entity check → optional rembg transparent cutout / 2–4-step causal diagrams → Freesound CC0 effects → validated original paper-doc animation JSON → QA contact sheet → paper-doc/Pillow animation → FFmpeg MP4 → Angular video player + downloads`.

The `studio/lib/director.mjs` exposes **31 animation primitives** including spray, smoke, glow, flow, rings, sparks, bubble fields, stamps, funny facial reactions, dynamic rainbow circles, fish-inflation outlines and new winter frost, plus animated fact-grounded diagrams. Gemini chooses timing, **9 compositions, 6 editorial themes, 9 backdrop modes, 4 title treatments, 4 full-photo presentation styles, non-numbered causal diagram layouts, 6 camera directions, 6 entrance motions and optional story-specific SFX** per narrated shot. Scenes can switch between kraft dossier, grayscale newsprint, navy technical blueprint, graph paper, ivory infographic and cream, with sky, city, kitchen, lab and other story-matched backdrops. Repeating ornamental FIG. 04 / PAPER FACTS header/ruler is disabled. Decorative soil, grass and seabed are **not** auto-inserted: scenery must be justified by the actual script. The Node director validates values, locations, anchors and SFX references. A semantic gate removes unspoken rulers, thermometers and flasks. Physical props are collision-tested against the actual cutout extent and dropped when no clean position exists. Each job exposes `episode.json`, `plan.json`, and `CREDITS.json` in the UI, plus a shot contact sheet.

**V7 Hindi visual grammar:** Gemini now supplies a per-episode Devanagari curiosity headline `headlineHi`, per-scene `line1`/`line2` Hindi title, and optional animated proof `beatTextHi`. Pillow RAQM renders them with the bundled, OFL-licensed **Baloo 2 Devanagari** font. A dynamic high-contrast top banner, swipe-in highlight, per-shot progress bar, safe-zone Hindi lower-third, subtle subject-local photo drift and semantically anchored highlights turn the paper documentary into an actual animated Hindi Short rather than Latin heading cards. Botany search screening also blocks money/virus namesakes from being misreported as fruit photographs. See `V7_HINDI_MOTION_QA.md` and the two new V7 samples.

For emitted effects, Gemini reviews the actual image, identifies the visible mouth/tail/body feature and reports a confidence-scored anchor. Python segmentation snaps that anchor to an **opaque foreground boundary**, then infers an outward direction. If it cannot prove where a water jet originates, the director replaces it with a neutral graphic. The mask is also compared with the original image to identify missing antennae, fins, legs or tail sections. Images unsuitable for isolation trigger up to **six** Commons candidates (configurable, maximum eight) before a generic graphic fallback. For a *border halo only*, the cutout stage can retry with a tighter alpha mask and require a second Gemini QA pass; missing body parts remain a rejection. These are automated checks, not a guarantee; inspect the finished contact sheet for each new topic.

Gemini is constrained to facts from an encyclopedia entry; **human fact-checking is still necessary before publication**. Media credits are saved in `studio/jobs/<id>/CREDITS.json` and offered in the UI. Use these in the YouTube description. Auto-licensed images are restricted to CC0, public domain, or CC BY; Creative Commons licenses can have other requirements. Automated scene matching is best-effort, not guaranteed.

## Requirements

- Node.js 22+, Python 3.10+, FFmpeg + FFprobe available on `PATH`.
- Python: `python -m pip install numpy pillow` (prefer a virtual environment).
- Angular dependencies: from `web`, `npm install`.
- Set three secret API keys in `studio/.env`: Gemini, Cartesia and Freesound. Native male **public** voice IDs for Hindi India, English US and English UK are built in and can be overridden with `CARTESIA_VOICE_*_MALE_ID`. Copy `studio/.env.example` for a fresh installation. Never put keys in Angular or commit `.env`.
- **This private, user-requested ZIP intentionally contains a configured `studio/.env` with the keys supplied by the owner.** Do not publish this ZIP, commit the file, or send it to anyone else. The keys are only read by local Node code. Rotate keys if the ZIP has been shared.
- Cartesia Sonic voice choices: **Ayush** (Hindi male, **V6 default**), **Anuj**, **Rakesh**, **Sagar**, **Daniel** (English US), **Archie** (English UK). Per-voice pitch can be adjusted with `NARRATOR_PITCH_ANUJ`, `NARRATOR_PITCH_AYUSH`, etc. Scene-by-scene speed/emotion controls for hook, suspense, explanation, reveal and payoff, plus **energetic/balanced** mode, aim for quick fact-channel storytelling. The V6 reviewed samples both use native Ayush with pitch ratio 1.19; these are licensed provider voices, **not clones** of the user's reference narrator.
- For genuine subject/background segmentation on Linux, Windows or macOS, run `python3 -m pip install -r studio/requirements-cutout.txt` from `paper-doc/` and set `ENABLE_REMBG=1` in `.env`. The higher-quality `isnet-general-use` model downloads on the first use (around 180 MB) and preserves thin fins, legs and antennae better in tested animal photos. Keep `CUTOUT_ALPHA_MATTING=0` unless you have specifically tested another source; matting introduced background color contamination in our regression examples. Failed or unsuitable segmentation falls back to an intact photo or a new candidate; on macOS the original Apple Vision cutout command remains available separately.

## Start

Terminal A:

```bash
cd paper-doc/studio
# The supplied private archive already includes your configured .env.
# If installing a public copy instead: cp .env.example .env and add credentials.
npm start
```

Terminal B:

```bash
cd paper-doc/web
npm install
npm start
```

Open `http://localhost:4200`. The UI uses Angular's `/api` proxy to the backend at `127.0.0.1:4300`. It shows live stage/progress, then plays the MP4 and offers the video, image/SFX credits, Gemini JSON storyboard and original engine JSON plan. The scene preview image is clickable.

**Simpler one-terminal run after installing Angular dependencies:** run `npm run build` once in `web`, then run only `npm start` in `studio`; the backend serves the built UI at `http://127.0.0.1:4300` alongside its API. The downloadable ZIP includes a prebuilt Angular UI, but rebuilding after frontend edits is recommended.

For an offline **renderer-only demonstration**, set `DEMO_MODE=1` in `.env`, start both processes and choose **TRY OFFLINE RENDER DEMO**. It has local illustrative artwork **without live Gemini, Cartesia, Freesound or narration**, and is clearly labelled as such. It does exercise the same rendering pipeline. Live generation needs actual keys and a supported Cartesia voice.

## Tests

```bash
cd paper-doc/studio
npm test
cd ..
python3 -m py_compile scripts/paper_doc.py
# Optional: renders a tiny offline demo and verifies playback, JSON downloads, and contact sheet.
node studio/tests/offline-smoke.mjs
# Optional: calls all live providers, renders and exports a real sample (quota-using, can take many minutes).
RENDER_FPS=20 node --env-file=studio/.env studio/tests/live-e2e.mjs

# Example with the user-preferred native Ayush Hindi voice; live API quotas required:
LIVE_TEST_TOPIC='Venus flytrap' LIVE_TEST_LABEL=venus-flytrap LIVE_TEST_SECONDS=24 \
  LIVE_TEST_VOICE_ACCENT=hi-IN-ayush LIVE_TEST_VOICE_STYLE=energetic \
  RENDER_FPS=24 node --env-file=studio/.env studio/tests/live-e2e.mjs
```

## Important terms and limitations

- Your uploaded renderer's `NOTICE.md` says the code license is *not selected*. Preserve AST BTS credit; confirm the original code owner/license before public redistribution or commercial use. Other GitHub paper-cutout repos are not automatically included or licensed by the GitHub **topic page**.
- Freesound API access is free for **noncommercial API use**; monetized or commercial production may require a separate Freesound API license. This code requests CC0 sounds, but the API's commercial terms are separate from media licensing.
- Cartesia and Gemini have quotas / commercial pricing. This is not an unlimited free generation service. Provider errors appear in the UI, not hidden behind invented success.
- Rendering is CPU-heavy: 1080×1920, 30 fps by default for live jobs; single job at a time to prevent overload. Set `RENDER_FPS=16` for quicker local draft tests. Exact runtime and successful source matching depend on hardware, provider quota and available openly licensed imagery.
- The engine listens only on `127.0.0.1` by default; it is a local studio, **not a secured public hosting backend**. Add authentication, durable queues, and rate limits before internet deployment.
- Windows users can use Windows paths and FFmpeg with Python; the original Apple Vision/Swift segmentation is macOS-only, while optional `rembg` is cross-platform.
