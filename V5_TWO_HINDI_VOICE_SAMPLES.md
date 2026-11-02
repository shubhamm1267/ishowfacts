# V5 — two different facts, two native Hindi male voices

The two sample videos were actually generated through live Gemini (story),
Cartesia (voice), Wikimedia Commons (licensed photographs), Freesound (CC0
sound cues) and the supplied paper-doc/Python/FFmpeg animation renderer.
They are **separate subjects and storyboards**, not one static title template.

| Deliverable | Voice | Checked fact | Shots | Runtime |
| --- | --- | --- | --- | --- |
| `samples/live-venus-flytrap-anuj-v5.mp4` | Anuj — expressive Hindi male | A second trigger within about 20 s closes the trap; plants are native to North/South Carolina wetlands | 6 (5 photograph shots, one causal diagram) | ~27 s |
| `samples/live-electric-eel-ayush-v5.mp4` | Ayush — youthful Hindi male | Some electric eel species can discharge up to 860 V; documented studies informed battery invention | 6 (3 photograph shots, 3 mechanism/history diagrams) | ~27 s |

The narration uses hook, explanation, suspense, reveal and payoff performance
controls with different per-voice pitch settings. Anuj's final narration median
F0 measured **~188 Hz**, Ayush's **~155 Hz** via an approximate autocorrelation
check; a pitch number alone cannot measure expressiveness or listener preference.
These voices are authentic Cartesia catalog options, **not clones** of the
user's example audio.

## Manual QA in addition to the automatic generator

The first fully automatic live image search returned poor assets on difficult
shots, including an amusement ride named “Electric Eel,” rejected cutout tails
and filler diagrams. The automatic stage correctly avoided putting unverified
species images into the final storyboard, but fell back to title graphics.
Both final MP4s were **editorially reviewed and re-rendered** with corrected
Hindi narration, exact Wikimedia Commons photos licensed CC BY / public domain,
story-relevant animated diagrams, and preserved Freesound effects.

The QA decisions are recorded in `studio/tests/reviews/`; generic tools
`studio/tests/qa-review-story.mjs` and `studio/tests/package-live-job.mjs`
permit repeating these steps for another topic. The supplied scene JSON and
every referenced media file live under `samples/`, so both samples can be
re-rendered offline. The regular Angular **GENERATE VIDEO** button continues
to create new Gemini-driven storyboards and layouts; because factual and image
search errors remain possible, its unreviewed videos are not guaranteed
publication-ready.

## Project updates

- Cartesia native Hindi male selection: Anuj / Ayush / Rakesh / Sagar, plus
  English (US/UK), with per-voice pitch and energetic/balanced style.
- Gemini story retries for truncated JSON, factual-number prompts, geographic
  wording guardrails and coherent media/story subject roles.
- Wikimedia Commons name collision rejection for rides, merchandise and ads;
  exact free-image licensing and inspection remain mandatory.
- Source code still uses the original `scripts/paper_doc.py` animations and
  FFmpeg export; no static “one fixed template” video editor was introduced.

See each `samples/*-CREDITS.json` for exact image, source and Freesound links.

**Important:** The private ZIP contains owner-provided API credentials because
the owner specifically requested it. Do not publish it to GitHub or share it.
