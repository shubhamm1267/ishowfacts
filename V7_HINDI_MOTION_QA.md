# V7: Animated Hindi Titles, Stronger Visual Cues and Two New Video Samples

## What the attached visual reference actually does

Reviewed the user's ~60-second Curio reference in a 2-second contact-sheet
sampling pass and looked at all major beats. It keeps a **white Devanagari
headline on a dark top band**, rapidly cuts between visual evidence and
illustrated explanations, occasionally uses a humorous character reaction,
and adds emphasis labels over the scene. The user's requested implementation
adapts the **format grammar** without copying the source video, characters,
clips or any branded watermark.

## V7 additions to the original `paper-doc` source

- Bundled the **Baloo 2 Devanagari variable font** (SIL OFL 1.1, copyright
  Ek Type) in `assets/fonts/`, together with the font's `OFL.txt`. Pillow's
  RAQM engine shapes Hindi matras/conjuncts correctly. Cropped-reveal typewriter
  animation displays whole shaped words without breaking vowel signs.
- Each episode now carries a Gemini-generated `headlineHi` in the animation
  JSON. A **dynamic black rounded strap** at the top displays the meaningful
  Hindi hook, with changing accent colors, sweep-in underline and a per-shot
  progress bar. The old "FIG. 04 / PAPER FACTS" ruler remains off.
- Every narrated scene now has **large Hindi line1/line2 titles**, and may
  carry `beatTextHi`, an independently animated Hindi lower-third punchline.
  The punchline stays in a reserved bottom safe zone rather than covering the
  animal/photo. All are optional for English and older saved projects.
- Gemini now must return Hindi story/titles in Devanagari and Node rejects
  Romanized titles for Hindi jobs. Shot JSON chooses 9 layouts, 6 textures,
  cutouts/photos, animated diagrams, 31 effects and context-specific Freesound
  SFX. No same fixed 1-2-3 infographic or soil/grass for unrelated scenes.
- Added an animated **frost** primitive for genuinely freezing scenes and
  subtle subject-local photo/cutout dolly drift. Highlight rings/crosshairs on
  full photographs anchor to the actual framed photo rather than a generic
  empty spot in the frame.
- Improved semantic media title screening for fruit stories so Japanese
  occupation **"banana money" banknotes** and plant-virus charts cannot
  masquerade as close-up banana photography.
- The QA retake tool can use a very modest pitch-preserving `tempo`
  acceleration with new time-aligned visual cut points; original Ayush voice
  remains native Hindi, not a synthetic voice clone.

## Two new editorially verified MP4 exports

| Sample | Visual story | Research and license evidence |
|---|---|---|
| `samples/live-wood-frog-hindi-v7.mp4` | Actual North American wood frog photos; real winter freezing; frost/sugar mechanism; small pause-button comic reaction | US National Park Service (Kobuk Valley and Gates of the Arctic); American Museum of Natural History; CC0 frog photos |
| `samples/live-banana-berry-hindi-v7.mp4` | Banana photos vs public-domain wild strawberry macro; botanical berry contrast; strawberry achenes; giant banana herb; funny factual payoff | Purdue Arboretum, Kew Gardens, Oxford University and NC State University Extension; CC BY/CC0/Public Domain photos |

Each episode was first planned by **real Gemini Flash-Lite**, images searched
from **real Wikimedia Commons**, narration recorded by **real Cartesia Ayush**,
SFX downloaded from **Freesound CC0**, then checked and editorially corrected
before a final render with the original `scripts/paper_doc.py` and FFmpeg.
Retake decisions and exact credits are preserved in the corresponding JSON.

These are **actual rendered MP4 files**, not HTML mocks or storyboard-only
proposals. The two sample videos use different topic, scenery, rhythm,
illustration and proof images; they are not copies of each other's template.

## Automated checks and honest limits

`node --test studio/tests/*.test.mjs` covers all effect types, Hindi headline
propagation, media license filtering, irrelevant effects, shape integrity and
same-subject placement. Both MP4 files and their exact source assets should be
checked via `ffprobe` and an offline `paper_doc.py render` proof, with contact
sheets visually reviewed before final packaging.

Fully automatic one-click work on *unseen topics* can still return a weak hook,
ambiguous photo or missing cutout. Those outputs need a human source and visual
check before upload. It would be misleading to claim every external Wikipedia,
Commons and AI response is always fact-perfect or artistically polished.

Do not publish the owner's configured `.env` from the private ZIP. The bundled
font has its own open license; Freesound's API use terms are separate from
the CC0 status of individual sound effects.
