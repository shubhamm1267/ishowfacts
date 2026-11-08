# Local footage verification

Production uses `lib/local-visual-quality.mjs`; `visual-quality.mjs` re-exports
the same implementation. Footage checks, framing checks, cutout visual checks
and final exported-frame checks do not call Gemini. Story research, factual and
language review, narration review and search-brief generation still use Gemini.
Provider order, download entitlements and provenance/credit records remain.

* Fuse.js ranks provider titles and checks actual title/tag overlap with the
  requested visible subject. A query supplied to a search is not visual evidence.
* OpenCV checks bounded sampled frames for decode failure, blank frames, severe
  blur, an empty centre portrait crop and large uniform chroma-like rectangles.
* A 64-bit difference hash rejects near-duplicate selected scene samples. This
  does not identify subject names and cannot catch every cropped/edited copy.
* FFprobe checks video/audio presence, duration and the renderer's `output_size`
  (which can differ from its internal canvas). FFmpeg decodes export samples in
  batches of six. These are sampled checks, not an exhaustive corruption scan.
* Tesseract checks readable source text when installed, with English/Hindi data
  when available. Docker installs both. If OCR is missing/fails locally, the job
  gets a warning and the report records the unchecked text detection explicitly.
  Export OCR is skipped because our own headline/logo is intentional.

No model weights or GPU are required. Install the updated npm dependencies and
`requirements-cutout.txt`; no `.env` changes are needed. Docker includes the new
dependencies. OpenCV and OCR use bounded CPU threads; process concurrency remains
limited by the existing server resource budget.

## What approval means

Local approval means technical checks and provider metadata matching passed.
It does **not** establish exact species/historical identity, narrated actions,
truthfulness of metadata, absence of every logo/caption, headline spelling, or
semantic correctness of the portrait crop. Reports explicitly mark these checks
as unperformed. Exact target pointers are omitted rather than guessed. The UI
states the reduced verification scope. Segmentation retains its own mask QA.

## Measured local sample

Nine already-extracted frames from three existing clips took about 0.69 seconds
for local image checks, with zero Gemini requests. OCR was not installed in that
test. Export sampling/decoding and checking 24 frames took about 16 seconds in a
separate run. These are component timings on this PC, not Render benchmarks or
end-to-end generation guarantees; they exclude search/download and rendering.
