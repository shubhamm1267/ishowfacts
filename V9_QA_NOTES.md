# Paper Facts Studio V9 — verified fixes and current limits

## Requirements addressed

- Exactly **3 independent research-supported factual statements** per Gemini-generated episode, instead of a universal numbered explainer. Gemini `facts: [string, string, string]` and each `scene.factIndex` (0/1/2) are required, ordered, and validated. Gemini repair/retry is used when this contract fails.
- **White, Black, Random** full-film background selection in Angular, job API, Node director, and original Python paper-cutout renderer. Random retains the story-derived prior palette.
- Removed the overlap-prone basic circle-to-circle infographic composition for `pathways`, `mechanism`, `spotlight`, and `contrast` diagrams. The replacement uses measured RAQM-capable Hindi/English text in isolated cards, external connector lanes and scene-timed signal particles. Does not draw connecting arrows through text.
- Faster Cartesia energetic reading, six narrative shots for three fact chapters in both samples. The fixed top Hindi/English title remains viewport-anchored above camera motion.
- Three-fact content, default SFX and imagery paths validated by 26 Node automated tests. Angular release build completed.

## Real end-to-end sample render audit

| Sample | Language | Background | Fact shots | Runtime | Photos | Diagrams | Video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Octopus (three hearts, siphon and body) | Hindi Ayush male | White | 2+2+2 | 26.96 s | 4 verified octopus photos | 2 | H.264 1080×1920, AAC |
| Honeybee (hexagons, honey conversion, honey badger larvae raid) | English male | Black | 2+2+2 | 33.83 s | 5 photo shots (4 unique credited files) | 1 | H.264 1080×1920, AAC |

Samples originated as **real Gemini live jobs** with actual Cartesia TTS and CC0 Freesound downloads, then underwent human factual correction and subject/license verification. They were re-narrated and re-rendered using original `scripts/paper_doc.py`, and their exact reviewed storyboard/animation JSON and sources are attached. Full-resolution image QA confirmed Devanagari matra shaping, banner text, and no collisions between panels/connector lines. These curated editorial QA examples are not hardcoded as the general one-click topic template.

Run tests:

```bash
cd paper-doc
node --test studio/tests/core.test.mjs studio/tests/director.test.mjs
python3 -m py_compile scripts/paper_doc.py
```

Render portable examples (no API calls):

```bash
python3 scripts/paper_doc.py render samples/live-octopus-three-facts-hindi-white-v9-plan.json
python3 scripts/paper_doc.py render samples/live-honeybee-three-facts-english-black-v9-plan.json
```

## Realistic remaining limits

- Automatic Wikimedia image searching encountered **HTTP 429** during the live runs. An optional Openverse CC0/PD/CC BY alternative was added, but also returned **403** in this testing environment. The two delivered samples therefore have manually selected and verified Commons photo media. **One-click automatic photos for every possible topic are not guaranteed** when third-party services throttle or block requests. Diagram fallback preserves renderability.
- Three-fact structure and storyboard safety are programmatically enforced; AI factual correctness and species-appropriate image matching still require editorial review before publishing. Exact 1080×1920 output cannot guarantee virality or match every feature of a reference creator's motion direction.
- This ZIP is for **private use**. `studio/.env` contains live API credentials by explicit user authorization; **do not commit or publish the ZIP**. Rotate credentials if the ZIP leaks. Images may require author credit, with full manifests provided; Freesound terms should be verified before commercial distribution.
