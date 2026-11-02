# V3 change log and video-quality checklist

This update builds on the **supplied original `paper-doc` renderer and ZIP**.
Its original drawing primitives, paper scenery, cutout positioning, SFX mixer
and FFmpeg render flow are retained. Node and Angular make them dynamic.

## Fixes made after the beetle review

| Defect | Engine-level change | Verification |
| --- | --- | --- |
| Water/chemical emitted from empty space | Gemini inspects the actual source image and proposes a feature point; Python snaps the point to a visible mask boundary and estimates outward direction; uncertain points are discarded | Single archerfish mask: source `(0.0292, 0.3772)`; outward spray `-171°` from visible mouth |
| Bottle/thermometer covered the animal | Props can no longer attach to a cutout; candidate locations are tested against the visible subject bounding box and other props; omit an unplaceable prop | Prop collision regression tests and `plan.scenes[].layout_qc` |
| Beetle limbs/antennae lost on cutout | Upgraded to `isnet-general-use` foreground segmentation without contaminating alpha matting; preserved narrow features with a controlled edge dilation; Gemini compares cutout to original | Archerfish complete mouth, upper/lower fins, tail preserved; full-resolution stills reviewed |
| Every generated shot used nearly one layout | Gemini supplies shot-specific theme, composition, camera, motion, setting, cue positions and animation effects; director validates 9 layouts, 6 themes and all 27 original effect types | New archerfish example uses underwater editorial, environment photos, blueprint cutout and water-jet action |
| Cropped fish tail / offscreen jet | Cutout maximum width now fits the actual horizontal slot with frame margins, and left-facing emitter shots reserve space in front of the mouth | V3 contact sheet checked after correction; fish tail and jet fully visible |
| Important label hidden behind seabed | Renderer separates subject/organic effects from uppermost readable editorial props | Updated contact sheet shows callouts above paper foreground |
| Stock image query returned wrong scenes | Search strips words like "cutout white background", tries article/scientific genus fallbacks and independently checks the photographs | New video uses Commons-licensed fish close-up and fish habitat with `CREDITS.json` |

## New example

`samples/live-archerfish-v3.mp4`: five-scene **Hindi 9:16 documentary Short** about archerfish mouth-jet predation. Gemini created and narrated its source-constrained storyboard; Cartesia synthesized the voice, Freesound provided CC0 effect assets, Wikimedia Commons provided CC BY/Public Domain visuals, and the original Python paper cutout renderer and FFmpeg created the MP4. The exact JSON, source credits, media and contact sheet are in `samples/`.

The live E2E process encountered a transient local polling/connection reset while generating its initial contact sheet. The existing live-generated storyboard, voice and SFX were retained. Two clearer, properly credited fish photographs replaced rejected stock-photo candidates; the revised scene JSON was independently recompiled and the video rendered/visually reviewed locally. This should not be misrepresented as a successful uninterrupted button-click live E2E run.

## Reproduce/check

```bash
cd paper-doc
node --test studio/tests/core.test.mjs studio/tests/director.test.mjs
node studio/tests/offline-smoke.mjs
python3 scripts/paper_doc.py render samples/live-archerfish-v3-plan.json
```

Automated visual audits remain imperfect. Review the contact sheet and citations for each generated story; licensing and factual accuracy require a human check before publishing. Never commit or publicly upload the provided private ZIP because `studio/.env` contains owner-supplied API keys.
