# V9 — three facts, text-safe animations, selectable full-film background

1. **`live-octopus-three-facts-hindi-white-v9.mp4`** — 6 fast shots mapped to exactly 3 distinct octopus facts (flexible skeleton, siphon jet, three hearts). Hindi **Ayush** male narrator, White film palette, four subject-correct independently licensed octopus photos, two moving mechanism diagrams, and Freesound CC0 sound effects.
2. **`live-honeybee-three-facts-english-black-v9.mp4`** — 6 fast English-language shots mapped to 3 facts (hexagonal hive wax, nectar to honey, honey badgers targeting bee larvae). English male narrator, Black film palette, licensed photo of the genuine honey badger rather than an unrelated European badger, and a nectar-making motion diagram.

Each sample includes video, editable plan, reviewed episode, contact image, complete credits and a portable copy of its required media. The corresponding `studio/tests/reviews/*-v9.json` files show the fact-to-shot mapping and factual sources. These are **editorially verified render examples** built from live Gemini/Cartesia/Freesound jobs, not guarantees that automatic image search succeeds for every new topic. You can rerender either without API calls:

```bash
python3 scripts/paper_doc.py render samples/live-octopus-three-facts-hindi-white-v9-plan.json
python3 scripts/paper_doc.py render samples/live-honeybee-three-facts-english-black-v9-plan.json
```

## Older versions

### V8 — two fresh Shorts with static topic straps and animated causality

1. **`live-sailing-stones-hindi-v8.mp4`** — the moving rocks at Racetrack Playa,
   full Hindi text and Cartesia **Ayush** male narration, a real public-domain
   photographic track, moving ice/wind physics diagrams, a cheeky payoff,
   actual Freesound CC0 cues and a static black/yellow curiosity headline.
2. **`live-blood-falls-english-v8.mp4`** — why Antarctica's Taylor Glacier
   leaks rusty-red saltwater. English speech and **English-only** titles,
   diagrams and captions, public-domain National Science Foundation imagery,
   real CC0 sound effects and a fully different storyboard.

Both have 1080×1920 H.264/AAC MP4s, `-contact.jpg` visual reviews,
`-episode.json` original Gemini/story scripts, `-plan.json` editable renderer
motions, `-CREDITS.json` photo and SFX licensing and copied portable `media/`
so they can be re-rendered without credits or API requests:

```bash
python3 scripts/paper_doc.py render samples/live-sailing-stones-hindi-v8-plan.json
python3 scripts/paper_doc.py render samples/live-blood-falls-english-v8-plan.json
```

Live Gemini drafts received a human editorial correction pass **only for the
two bundled examples** (recipes: `studio/tests/reviews/*-v8.json`); the UI's
one-click generation creates a new Gemini scene JSON for every topic. Content
and source-image review is still advised before publishing any AI-created video.

## V7 — earlier Shorts with animated Hindi titles and source-matched effects

1. **`live-wood-frog-hindi-v7.mp4`** — frog winter-freezing survival,
   a Hindi curiosity-gap hook, frost animation around actual licensed frog
   photographs, a glucose-protection illustration, a small story-based joke
   and an animated Devanagari headline. Cartesia **Ayush**, ~33 seconds.
2. **`live-banana-berry-hindi-v7.mp4`** — banana is a botanical berry,
   strawberry is not, the visible achenes and the giant herb that grows
   bananas. Mixes real credited banana/strawberry photography, a non-numbered
   contrast diagram, visual emphasis and a comic reaction. Cartesia **Ayush**,
   ~30 seconds.

Each is a genuine 1080×1920 / 24 fps H.264/AAC MP4 and includes a portable
`-plan.json`, `-episode.json`, `-CREDITS.json`, `-contact.jpg` and media in
`media/live-...-v7/`. After extraction, both can be re-rendered without APIs:

```bash
python3 scripts/paper_doc.py render samples/live-wood-frog-hindi-v7-plan.json
python3 scripts/paper_doc.py render samples/live-banana-berry-hindi-v7-plan.json
```

The original Gemini jobs were run through live APIs, then editorially
reviewed against national-park and university research. A satellite-map shot,
Japanese "banana money" and an irrelevant plant-virus photo were rejected.
The saved review recipes in `studio/tests/reviews/*-v7.json` are QA examples,
not a universal topic template. Read `V7_HINDI_MOTION_QA.md` for details.

## Earlier V6 samples

1. **`live-pufferfish-ayush-v6.mp4`** — named pufferfish hook, water-inflated
   defense, an animated belly mechanism, a humorous football comparison and
   actual independently checked pufferfish photographs. Hindi male **Ayush**;
   about **28.4 seconds**.
2. **`live-rainbow-ayush-v6.mp4`** — the full circular shape of a rainbow,
   why the horizon hides the lower half, airborne viewing, refraction and
   reflection, and mist/spray. Uses genuine rainbow photos and a newly drawn
   **circular rainbow illustration**. Hindi male **Ayush**; about **30.6 seconds**.

Both were generated from **real Gemini topic/storyboard jobs**, then editorially
checked against reputable sources and re-recorded with live Cartesia TTS.
Source visual matches and attribution were manually checked. All sound effect
files are actual downloaded Freesound **CC0** cues, not synthesised placeholders.
No perennial soil/background, numbered 1-2-3 overlay, or "FIG. 04 / PAPER FACTS"
ruler is used in either final sample. The original `paper-doc` renderer creates
both MP4s; videos are not a slideshow or hard-coded one-shot UI template.

Each example has matching `-contact.jpg`, `-episode.json`, `-plan.json`,
`-CREDITS.json` and a `media/live-...-v6/` directory with all precise WAV,
photos and SFX. Re-render them **offline** from the extracted `paper-doc` folder:

```bash
python3 scripts/paper_doc.py render samples/live-pufferfish-ayush-v6-plan.json
python3 scripts/paper_doc.py render samples/live-rainbow-ayush-v6-plan.json
```

These two professionally reviewed samples are **reference quality targets**.
Ordinary one-click generation is dynamic but cannot guarantee that an unseen
Wikimedia photograph is correctly matched or every generated fact is accurate;
always inspect the supplied storyboard, attribution and contact sheet before
posting. Exact editorial decisions are in `studio/tests/reviews/*-v6.json`.

## Earlier V5 examples

1. **`live-venus-flytrap-anuj-v5.mp4`** — Venus flytrap's trigger hairs,
   two touches within ~20 s, authentic North/South Carolina habitat;
   Cartesia **Anuj** expressive native Hindi male, 27 s.
2. **`live-electric-eel-ayush-v5.mp4`** — real South American fish,
   species capable of up to 860 V and the bioelectric research timeline;
   Cartesia **Ayush** native Hindi male, 27 s.

Both are 1080×1920, 24 fps, H.264/AAC; each has its own `-contact.jpg`,
`-episode.json`, `-plan.json`, `-CREDITS.json` and a corresponding
`media/live-...-v5/` directory containing the exact WAV, source photographs
and Freesound CC0 cues. Re-render either with:

```bash
python3 scripts/paper_doc.py render samples/live-venus-flytrap-anuj-v5-plan.json
python3 scripts/paper_doc.py render samples/live-electric-eel-ayush-v5-plan.json
```

These are fact-checked editorial re-renders of two **real dynamic Gemini**
jobs, not hardcoded templates. The editable review recipes are in
`studio/tests/reviews/`. The one-click UI remains new-topic dynamic, but image
and factual QA is still advised for each video.

## Previous V4 Popcorn sample

**`live-popcorn-v4.mp4`** is a newly rendered 21.29-second facts Short at **1080×1920 / 24 fps / H.264 + AAC**. Unlike the former archerfish/beetle examples, this is a new food-science topic.

It uses:

- Actual Wikipedia-grounded Hindi script and **Gemini Flash-Lite storyboard** (6 different shots).
- **Cartesia Sagar** native male Hindi speech, role-by-role pacing, subtle verified pitch lift (no narrator cloning).
- **Freesound CC0** whoosh, pop and impact sounds.
- **Wikimedia Commons** credited CC0, public-domain and CC BY photos.
- The original `scripts/paper_doc.py` renderer with **real foreground cutout**, mask QC, paper-texture switches, animated scientific mechanism cards, camera moves, and a factual 50× reveal.

After the first full live generation, human editorial QA caught two shots that had only generic title cards. The supplied **reviewed sample** uses specifically verified replacement Commons photos and a cleaned transparent kernel cutout; Gemini approved that corrected mask. This sample-review recipe is available as `studio/tests/qa-review-popcorn.mjs`. The usual one-click pipeline remains entirely automatic and has strict missing-image fallbacks; it cannot guarantee that all automatically found shots are as polished as the reviewed example.

Files:

- `live-popcorn-v4.mp4` — ready to play.
- `live-popcorn-v4-contact.jpg` — shot contact sheet.
- `live-popcorn-v4-episode.json` — final exact script and shot directions.
- `live-popcorn-v4-plan.json` — validated animation recipe for the original engine.
- `live-popcorn-v4-CREDITS.json` — complete real image/SFX attribution.
- `media/live-popcorn-v4/` — 9 source files (photos, actual alpha mask, voice and Freesound previews), so re-rendering needs **no additional APIs**.

Rerender locally after extracting the ZIP:

```bash
cd paper-doc
python3 scripts/paper_doc.py render samples/live-popcorn-v4-plan.json
```

Other old samples may exist in a developer worktree, but the V4 distribution focuses on the new, reviewed Popcorn sample. Please check attribution and factual claims before public upload.
