# V6 delivery — editorial and motion quality log

## Two different Shorts

| | Pufferfish | Rainbow |
|---|---|---|
| Final video | `samples/live-pufferfish-ayush-v6.mp4` | `samples/live-rainbow-ayush-v6.mp4` |
| Hook | Names the fish and reveals its inflation trick immediately | Claims a rainbow is a circle, then resolves the horizon illusion |
| Narrator | Cartesia Ayush, native Hindi male, energetic, 1.19x pitch | Same Cartesia Ayush setting |
| Visual language | Deep-water photo, documentary fish images, comic surprised emoji, expansion ring and contrast cards | Real city/mountain rainbows, a full-circle vector rainbow, orbit-style science diagram, spray/mist context |
| Sound | Verified Freesound CC0 cues matched to hook/expansion/comic reveal | Verified Freesound CC0 cues matched to curiosity/reveal |
| Duration | ~28.37 s | ~30.61 s |

Both samples are actual 1080×1920, 24 fps H.264/AAC MP4 exports, not simulated
UI previews. Their `samples/live-*-v6-CREDITS.json` files list source photos,
sound recordings, and additional research sources. Commons images remain intact
when their masks risk clipping a fin, tail or other body part.

## Dynamic generation path (not fixed episode templates)

1. Click **Generate Video** in Angular. An optional topic is sent to Node;
   otherwise Gemini selects a suitable fact topic.
2. Node gets encyclopedia grounding and prompts Gemini Flash-Lite to plan
   hook, scene-specific narration, visual target, photo treatment, layout,
   backdrop, title style, diagram nodes, effect primitives and sound cues as JSON.
3. Node validates entity labels, durations, effects, anchors and media roles.
   Wikimedia Commons licensed photo candidates get exact-entity checks. Optional
   cutouts are alpha-quality audited; incomplete body silhouettes are rejected.
4. Cartesia records the selected Hindi/English narrator with per-beat energy.
   Freesound downloads CC0 cues relevant to the individual story, subject to
   network/API quotas and catalogue availability.
5. The original `scripts/paper_doc.py` raster animation engine and FFmpeg
   render a playable MP4. The UI offers playback, video, credits, exact script,
   engine JSON and a contact-sheet visual QA preview.

This version adds **four full-photo card styles** (`clean`, `frame`, `poster`,
`polaroid`), **diagram styles** (`cards`, `contrast`, `orbit`, `timeline`,
`steps` only when the story explicitly calls for steps) and **three more
non-stock effects** (`reaction`, `rainbow`, `inflate`). The script no longer
forces step numbers or a recurring soil/seabed/grass foreground. The visual
director hides the old ruler/FIG. 04/PAPER FACTS strip unless a custom scene
explicitly asks for a header. Effect and SFX choices now come through per-shot
Gemini JSON, with conservative runtime validation.

## What was checked by a human

- Reviewed frame contact sheets at different timestamps for both MP4s.
- Rejected attempted underwater photo candidates showing a **porcupinefish**
  rather than the specified pufferfish; the final video uses checked pufferfish
  images. Kept complete photos instead of a segmentation mask that clipped a tail.
- Rejected a misleading circular atmospheric **glory** photo as a rainbow;
  replaced it with an explicitly illustrated rainbow circle.
- Rewrote facts in spoken Hindi so the named subject appears immediately and
  the story keeps a reason to watch, then re-synthesised both six-scene Ayush
  voice tracks. The humorous beat is a clearly hypothetical reaction.
- Fixed the renderer crash when a genuine, very short Freesound cue was faded
  longer than its total duration; now the fade is clamped to available samples.
- Preserved reproducible source media in `samples/media/...`, including the
  consolidated narration, CC0 effects, source photographs and their metadata.
- Verified actual MP4 output in FFprobe and retained source photos' licenses.

## Honesty about unattended results

These **two samples were professionally editorial-reviewed** after real live
Gemini/Cartesia/Freesound processing. Future one-click topics use the same
dynamic engine, but an automated model may still pick a too-plain hook, mistake
a related animal for the exact species, or produce an uninteresting photo.
The system surfaces evidence and a shot contact sheet to support review; it
does not claim a perfect guaranteed upload-ready Short on every unseen input.
For important channels, add a human scene-approval step before publishing.

## Privacy and usage

`studio/.env` inside the owner's requested **private** ZIP contains the supplied
Gemini, Cartesia and Freesound API credentials; never commit or share it.
Review all media credits before distributing a rendered clip. Freesound CC0
sound licenses and Freesound **API** commercial use terms are separate matters.
The original source bundle's `NOTICE.md` did not settle a redistributable
license; check ownership/rights before public hosting or commercial resale.
