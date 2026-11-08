# Story approval and bounded generation

The UI submits `POST /api/jobs` with `previewFirst: true`. After automatic topic
selection/research, one Gemini draft response contains a primary storyboard and
two complete text variants sharing the same sourced claims and shot structure.
Local checks require three different openings, complete scene arrays, mapped
claims, requested language and sufficient narration length. The UI shows all three
full scripts with separate selection buttons. They are explicitly labelled drafts.
No TTS or footage download starts before selection. Provider keys are omitted from
`approved-story.json`; unselected scripts are not separately proofread or narrated.

`POST /api/jobs/:id/approve` requires `optionIndex` for a three-script snapshot.
Only that option receives the combined factual/language review. Comedy strength,
hook family and missing humorous callbacks are informational preferences, not
rejection/repair gates; actual unsupported premises, changed qualifiers, language
errors and missing source evidence still block. There is no extra comedy-flag
request or targeted comedy repair in this production path.

If factual/language repair changes the selected script, the corrected text is
saved and the UI returns to approval before TTS. The corrected option is marked
reviewed so approving it again does not repeat that review. Other options remain
available and unreviewed. The chosen episode, including its hook, is passed into
narration; it is not replaced by a newly generated story. Selection indexes are
validated, and concurrent approval requests are rejected.

Older single-script snapshots still resume through the legacy approval path.
Failed jobs with surviving snapshots can retry. This cannot restore files lost
with an ephemeral hosting instance. Atomic status writes and browser job-ID
storage protect against partial JSON and refresh loss. Previews and completed
jobs retain the 30-minute cleanup window. Approval waiting is excluded from timing.

Connection startup uses a bounded retry window for transient gateway/network
errors and displays a connecting state during retries. It never describes a failed
health request as proof of missing API keys. A persistent failure still offers a
manual reconnect; the frontend cannot repair a stopped Render instance.

## Work reduced

* Hindi, causal-claim and editorial evidence review now share one response with
  explicit independent verdict fields. Missing language/claim verdicts still fail.
* One repair per draft and at most two drafts replace nested three-draft / three-
  repair loops. Provider outages/quota errors do not redraft the entire story.
* A fitted copyedited headline is reused instead of invoking another editor.
* Per-job Gemini usage records actual HTTP attempts/statuses and returned token
  counts, with no API key or prompt logged. Daily-exhausted credentials are skipped
  during subsequent calls, including approval on the same backend instance.
* Automatic single-topic selection checks metadata availability first: Instagram
  index/public discovery, then configured stock APIs. This is a feasibility signal,
  not visual or licensing approval and not an exhaustive all-provider search.
  Provider failures produce an unknown result rather than false missing-footage
  evidence. New Instagram pointers found here are reused after approval.
* Stock titles are ranked before downloading. Obvious crypto/historical-token
  mismatches are rejected cheaply; actual crop/entity/text checks still run.
* Candidate review images are smaller; only accepted candidates expand into frame
  sequences. Final-cut review batches six frames per call instead of four.
* Startup cleanup runs in the background so listening/health need not wait for
  old job/cache traversal. Active-job and expiry protections remain in place.

Instagram-first acquisition and stock/photo fallback remain. Public-source download
is not proof of reuse permission. These changes cannot guarantee a usable source
for every possible topic or prevent hosting restarts. Sample timings must be
reported as measured, not as a guaranteed latency for Render free instances.

## Local visual verification

Footage verification now uses Fuse.js, OpenCV, difference hashes and FFmpeg
instead of Gemini visual reviews. See `LOCAL-MEDIA-CHECKS.md` for the explicit
limits and measured component timings. Semantic identity/action and final-frame
headline correctness are not established by these local checks.

Gemini reviews the selected hook in the combined editorial call. Curiosity and
comedy suggestions are advisory styleNotes. Recognized style-only feedback is
kept out of blocking issues when the source evidence and other verdicts pass.
The factual repair prompt preserves the user-selected opening/callback unless
the listed issue actually requires a factual, language or unanswered-promise fix.
No separate hook-strength retry or automatic comedy rewrite is requested.
