# Storyboard-driven motion

`studio/lib/explainer.mjs` now uses GSAP's seekable timeline for deterministic easing/choreography, procedural SVG for the visuals, resvg for Hindi shaping/rasterization, and the existing Python/FFmpeg renderer for composition and audio. No browser, downloaded illustration, or generated executable code is required. See the official [GSAP timeline documentation](https://gsap.com/docs/v3/GSAP/Timeline/).

Five supported animation families replace the earlier uniform circular icon/connector layout:

| `diagram.animation` | Visual behavior | Appropriate use |
| --- | --- | --- |
| `wave-field` | Moving wind arrows, evolving water surface, orbital water markers, fetch span | Wind acting on a water surface; two nodes with wind/water icons |
| `solar-flow` | Rotating sun rays, moving light traces, perspective photovoltaic panel, electrical path reveal | Sunlight reaching a photovoltaic panel and electricity output; solar/energy icons |
| `comparison` | Staggered side-by-side isometric stages with supplied entity icons and details | Qualitative comparison of 2–4 entities; no invented quantitative size ratios |
| `process-flow` | Staged isometric process illustrations and sequential reveals | General source-backed processes with 2–4 steps |
| `radio-link` | Illustrated aircraft, drifting clouds, radio tower, phone and headset pilot | Sourced aviation communication context; exactly two nodes with phone/radio icons; not proof of interference or a crash |

The story selects a supported family and supplies labels/details. Playback follows the narrated shot's duration and project frame rate, with a maximum 12 seconds of generated animation before the final frame holds. Framing uses the actual region below the headline, including the new 1080×1440 reference mode; the artwork keeps its proportions. Shaped Hindi labels have explicit word placement. Completed frame assets are reused on retries within the same output folder when their content/code/font/settings/viewport hash matches; missing frames force rebuilding. This does not cache across unrelated jobs or eliminate encoding/provider time.

Example diagram scene fragment (the surrounding episode still needs its normal narration and fact/source fields):

```json
{
  "visual": "diagram",
  "diagram": {
    "reason": "The narration defines fetch, which needs a visible span in the wind direction.",
    "animation": "wave-field",
    "style": "mechanism",
    "heading": "हवा से पानी में हलचल",
    "nodes": [
      {"icon": "wind", "label": "पानी पर बहती हवा", "detail": "हवा सतह को ऊर्जा देती है"},
      {"icon": "water", "label": "हवा के संपर्क की दूरी", "detail": "इसी दूरी को फेच कहते हैं"}
    ]
  }
}
```

Gemini is instructed to default to no diagram, choose at most one justified diagram in an episode, and select an animation whose mechanism matches the source and narration. Unsupported animation names and structurally incompatible specialized scenes fall back to the general process family. JSON supplies data, never runnable expressions. Ambiguous photo/video point-outs still require independent visual verification in the existing pointer system.

These are explanatory illustrations, not measured physics simulations or an unlimited story-to-animation engine. A new mechanism needing different objects or actions requires a new reviewed renderer. Changing JSON labels does not create arbitrary new character acting, scientific apparatus or 3D assets. Three.js would be useful for real 3D scenes; Manim for specialized mathematical explanations. Neither has been added to the production pipeline in this change.

Reviewed outputs:

- `samples/dynamic-motion-showcase.mp4`: 16-second silent four-family design preview from fixed JSON fixtures. Four explanatory shots are used only to showcase the supported renderers; automatic episodes retain the one-diagram limit.
- `samples/dynamic-motion-showcase.json`: editable fixture data for that preview.
- `samples/dynamic-ocean-sample.mp4`: 20.33-second actual project composition with existing Hindi narration, two HD clips, two photos and one new wave/fetch animation. Only the diagram scene changes from the earlier reviewed sample. Source attribution is in `samples/dynamic-ocean-sample-CREDITS.json` and the relevant footage has burned-in credits.

Run `node studio/tests/motion-preview.mjs` from the repository root to reproduce these previews after the earlier reviewed sample assets exist. This helper deliberately makes no new Gemini, stock or voice requests; it is not a fresh unattended end-to-end generation test. Production jobs use the new renderer through `prepareExplainers` in `studio/server.mjs`.
