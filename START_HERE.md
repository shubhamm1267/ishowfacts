# Paper Facts Studio V9 — three distinct facts, faster narration, clean animation layouts

Yeh project **aapke original `paper-doc` renderer** par based hai. Desktop/localhost par full facts Shorts banata hai. Server-side `.env` aapki permission se **pre-configured** hai; usse online share mat karna.

## One-time setup

Install **Node.js 22+**, **Python 3.11+** and **FFmpeg/FFprobe**. From the extracted `paper-doc/` folder:

```bash
python3 -m pip install -r studio/requirements-cutout.txt
```

First cutout generation downloads the higher-quality `isnet-general-use` model (around 180 MB). Let that finish once; subsequent generations reuse it. Your `.env` enables model-aware foreground validation and Gemini cutout inspection.

For normal use, the Angular UI is **already built** and in `web/dist/`. You do not need Angular CLI or `npm install` just to launch the supplied UI.

## Start the studio

```bash
cd paper-doc/studio
npm start
```

Visit **http://127.0.0.1:4300** and click **GENERATE VIDEO**. Topic is optional; blank = Gemini chooses an interesting fact. **Ayush (native Hindi male)** is the default narrator. Anuj, Rakesh, Sagar, English US/UK and energetic/balanced delivery remain selectable. Voice selection selects the **whole film's language**: narrator, static banner, scene titles, factual infographics and captions. Use **COMEDY / EDGE LEVEL** for Clean, Cheeky, or Edgy. Select **VIDEO BACKGROUND COLOR**: **White** (clean white throughout), **Black** (dark throughout), or **Random** (the existing Gemini/story-based paper colors). Actual imagery and static black headline remain independently visible. Real generation can take several minutes due to image QA, voice generation and CPU animation.

**Exactly three facts per new video:** Gemini must write three distinct source-supported statements in top-level `facts`, and map each scene to one of them using `factIndex: 0|1|2`. This is a **content contract**, not a repetitive numbered on-screen tutorial. Missing, duplicate, unmapped or scrambled facts trigger Gemini storyboard repair. The upbeat Cartesia mode is faster while preserving phrase-level delivery. The mechanism renderer now reserves distinct areas for text, routes all signal particles outside fact labels and adapts to all three background choices.

When complete, play the Short in the browser and download its MP4, credit file, Gemini storyboard JSON and exact animation JSON. Review the contact sheet and factual accuracy before YouTube publication.

## Edit the Angular interface

```bash
cd paper-doc/web
npm install
npm run build
```

Restart the studio after changing backend source. During frontend development you can use `npm start` from `web/` to run Angular at port 4200 with API proxy.

## Built-in checks

```bash
cd paper-doc
node --test studio/tests/*.test.mjs
node studio/tests/offline-smoke.mjs
```

**V9 new samples:** `samples/live-octopus-three-facts-hindi-white-v9.mp4` (Hindi Ayush, exactly three octopus facts, white background) and `samples/live-honeybee-three-facts-english-black-v9.mp4` (English male, three honeybee/hive facts, black background). Accompanying `-episode.json`, `-plan.json`, `-CREDITS.json` and `-contact.jpg` make the animations inspectable. Their exact independently inspected 6-shot editorial recipes are in `studio/tests/reviews/*-v9.json`.

Matching `studio/tests/reviews/*-v7.json` files document every editorial script and license-checked image choice. Gemini generated the original live topics and storyboards, then the examples received independent fact and visual checking, correction and another real Ayush narration recording. This editorial process is **not** a fixed template used by the UI: normally Gemini builds new scene-level JSON for any subject. See `V7_HINDI_MOTION_QA.md` for reference analysis, motion improvements, tests and remaining limitations.

The dynamic renderer supports **9 compositions**, **6 editorial themes**, **4 title animations**, and an effects library including frost, rainbow, inflation, source-anchored particles and relevant sound cues. Red target crosshairs and generic smile-emoji reactions are disabled. V9 replaces formerly overlapping circular infographic nodes with separate text-safe cards and external motion lanes in `pathways`, `mechanism`, `spotlight`, and `contrast` styles. A **static black title strip**, viewport-anchored above the scene camera, renders a relevant topic phrase in yellow/white. The **OFL-licensed Baloo 2** Devanagari font shapes Hindi conjuncts and matras; English mode rejects Hindi visual text. The old repeating FIG/PAPER FACTS strip remains disabled. Decorative soil/grass is never forced. Gemini proposes each shot's JSON; Node validates it before the original renderer executes. Automated factual/image matching can be affected by image-source rate limits and still needs human review before publication.

**Privacy / licensing:** This private ZIP deliberately includes API secrets. Do not publish, upload to GitHub, or share with anyone. The original `NOTICE.md` has no settled source-code license; Freesound API commercial use and image credit obligations should be checked separately. See `FACTS_STUDIO_README.md` for details.
