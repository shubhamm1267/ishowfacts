# paper-doc — plan reference

Engine: `scripts/paper_doc.py`. One **scene plan** (JSON) per video. Worked example: `examples/beetle_plan.json` (46 s, 19 scenes; its media files are not included).

```bash
python3 scripts/paper_doc.py words   <video>/06_Edit/transcript/words.json      # word times
python3 scripts/paper_doc.py cutout  <video>/02_Raw/photo.jpg <video>/04_Graphics/paper_cutouts/thing.png
python3 scripts/paper_doc.py contact <video>/06_Edit/<name>_paperdoc.json /tmp/x   # 1 still per scene
python3 scripts/paper_doc.py stills  <video>/06_Edit/<name>_paperdoc.json /tmp/x 3.2 7.9
python3 scripts/paper_doc.py render  <video>/06_Edit/<name>_paperdoc.json
python3 scripts/paper_doc.py selftest ./selftest [photo.jpg]
```

Paths inside a plan are relative to the **video folder** (the plan's folder, or its parent when the plan is in `06_Edit/`). `@pack/…` = this skill folder, `@sfx/…` = the AST BTS sound library (only inside that project), `/…` = absolute.
Canvas is 1080 × 1920 (9:16) unless `meta.size` says otherwise; all x / y below are in that canvas (centre = 540, 960). The title occupies y ≈ 270–600, so the stage for elements is y ≈ 700–1800.

## Plan

```json
{
  "meta": {
    "voice": "05_Audio/voice_polished.wav",          // polished voice (voice_polish.py --strength medium)
    "words": "06_Edit/transcript/words.json",       // optional, for reference
    "out": "07_Export/<ID>_Reel.mp4",
    "duration": 46.6,                               // optional: default = voice length + 1.6 s
    "header": "BOMBARDIER FILES",                   // top-right of every page ("FIG. 03" is automatic)
    "music": {"file": "my_music.mp3", "db": -21, "atempo": 0.9},   // no file / missing -> generated dark drone
    "whoosh_db": -20,                               // whoosh on every scene change (null = off)
    "end_fade": 0.5, "lufs": -14
  },
  "subjects": {                                     // photos that become paper cut-outs
    "beetle": {"image": "04_Graphics/paper_cutouts/beetle_real_cutout.png",
               "anchors": {"tail": [555.8, 1427.2]}}, // named points in the cut-out's pixels
    "frog":   {"image": "02_Raw/frog.jpg"}            // no transparency -> cut out once with Apple Vision
  },
  "sounds": [{"t": 32.92, "sfx": "riser", "lead": 2.8, "db": -16}, {"t": 32.92, "sfx": "boom", "db": -8}],
  "scenes": [
    {"start": 2.00, "title": ["100°C KA", "LAWA"], "red": 2, "scenery": 2, "page": "kraft",
     "elements": [
       {"id": "b", "type": "cutout", "subject": "beetle", "height": 930, "x": 540, "y": 1110},
       {"type": "spray", "on": "b", "anchor": "tail", "dir": 90, "at": 1.6}
     ]}
  ]
}
```

**Scene:** `start` (s, absolute — one scene per spoken phrase, new scene every 2–3 s) · `title` [line 1, line 2] · `red` which line is red (1/2, 0 = none) · `page` `"kraft"` (default) or `"dark"` (X-ray / inside) · `scenery` a seed number = layered paper ground + grass (outdoor / nature), omit for a plain page. `water` a seed number = layered torn-paper sea under the title (surface at y 660, light rays, drifting specks, sea floor + swaying seaweed in front; `"seabed": false` drops the floor/seaweed) for sea / pond / underwater topics.

**Every element:** `type` · `x`,`y` (centre) **or** `on` (an element `id`) + `anchor` (named) / `rel` ([0.5, 0.8] = fraction of that cut-out) + `dx`,`dy` · `at` (s from scene start) · `anim` `pop` (default) / `slam` / `punch` / `fade` / `none` · `in` (entrance length) · `until` (hide from) · `scale`, `rot`, `alpha` · `move` {`to`: [x,y], `at`, `dur`} · `shake` {`at`, `amp`, `freq`, `dur`, `decay`: `linear`/`exp`} · `float` (`{}` or {`amp`, `freq`, `phase`}: gentle bob, for things in water) · `sfx` (name/path, `false` = silent, default per type) · `sfx_db`, `sfx_offset`, `sfx_trim`.

| type | what | own keys |
|---|---|---|
| `cutout` | photo of the subject as a paper cut-out | `subject`, `height` px, `max_width` px (shrinks wide photos), `mode` `color`/`silhouette`/`xray` |
| `photo` | full photo as a polaroid print (places, people, screenshots) | `image`, `width`, `caption` |
| `stamp` | rubber stamp (use `anim: "slam"`) | `text`, `color`, `size`, `tilt` |
| `sticky` | yellow sticky note | `text` (e.g. "?") |
| `ticket` | ticket stub: struck-out word vs ticked word | `strike`, `ok`, `number`, `top` |
| `calendar` | desk calendar | `top`, `big` |
| `ruler` | ruler | `units`, `count` |
| `bracket` | red measuring bracket drawn left→right | `x0`, `x1`, `y`, `dur` |
| `flask` | lab bottle | `label` ("\n" = 2 lines), `liquid` [r,g,b] |
| `warning` | yellow danger sign | `mark` |
| `thermometer` | rising thermometer | `level` 0–1 or keyframes [[t,v],…], `labels` |
| `burst` | comic burst | `text`, `size`, `color` |
| `name_tag` | luggage-tag name card | `line1`, `line2` (red), `sub` (mono) |
| `firecracker` | red cracker | `label` |
| `polyp` | paper polyp colony on the sea floor (baby stage of a jellyfish / coral) | `n` branches, `seed`, `color` |
| `ant` | small drawn ant (victim / enemy for insect topics) | `charred` |
| `text` | big centred word or sign | `text`, `size`, `color`, `font` |
| `label` | mono caption | `text`, `dark`, `size` (x,y = top-left) |
| `spray` | hot spray / jet | `dir` (deg, 90 = down), `length`, `n`, `hot`, `seed` |
| `smoke` | smoke puff | `n`, `spread`, `seed` |
| `rings` | sound / signal rings | `color`, `n` |
| `crosshair` | red target | `r` |
| `glow` | glowing organ / chamber (good on `xray`) | `rx`, `ry`, `level` (keyframes), `color`, `outline_color`, `width` |
| `flow` | droplets travelling to another point | `to` [x,y] or `to_on` + `to_rel`, `dur` |
| `sparkle` | sparkles | `n`, `r` |
| `spark` | fuse spark | — |
| `bubbles` | rising bubbles | `x0`, `x1`, `y`, `rise` |
| `flash` | screen flash | `dur`, `alpha`, `color` |
| `sound` | sound only, no picture | `sfx` |

Colours: `red` (default) `ink` `cream` `green` `yellow` `navy` `xray` `white` `orange` `blue`, or [r,g,b].
Named sounds: `whoosh thud pop mpop question tick ding sizzle boil boom riser glitch` (bundled CC0 files in `sounds/`, or generated), or any path to your own file.
Default sounds: stamp → thud, sticky / warning → question, name_tag / flask → pop, burst / flash → mouth pop, spray → sizzle, bubbles → boil.
