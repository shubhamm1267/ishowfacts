# Instagram-first generation

The normal Generate Video backend passes a job-scoped Instagram adapter to
`stockVideo`. It runs before Vecteezy, Mixkit, Pexels, Coverr and Commons. Photo
fallback remains available. No API key or browser login is added for Instagram.

Discovery first checks `data/instagram-footage.json`, a small index of public
source pointers used in previous samples (not a video archive or a guarantee of
licensing). New subjects use public search results and Instagram embeds on
allowlisted articles. URLs are extracted from real pages; Gemini does not invent
video links. Search indexing is incomplete and may return no usable links. The
initial index covers octopus, archerfish and SLS footage, not all topics.

`scripts/instagram_download.py` uses pinned yt-dlp to download one public video.
All processes are hidden on Windows and use the existing process limiter and
cancellation signal. There are no automatic cookies, proxy rotation, browser
processes, account scraping or login retries. Render's Docker build installs
yt-dlp through requirements-cutout.txt; installing that updated requirements file
is also necessary in other Python environments.

Limits: 80 MB per download, 20 seconds per downloader invocation, two candidates
per lookup and a 60-second aggregate Instagram lookup budget per generation job.
Two download failures, or a login/access-block error, disable further Instagram
attempts for that job. A new job gets a new chance. Cancelling a job aborts its
downloads. Partial files and temporary metadata are removed.

Source IDs and SHA-256 hashes prevent exact source reuse within a job. Accepted
Instagram clips must pass the existing entity, narration relevance, embedded
text/branding and portrait-framing reviews. The backend accepts native sources
with at least 640 pixels on the short side; it does not describe these sources as
native 1080p. Clips shorter than the required scene are rejected rather than
looped. Rejected candidates use separate frame directories. Output stays 1080x1920.

Single-fact 20-50 second videos now request enough narrated shots to target 3-4
second cuts; actual cut times still follow the measured narration. This is not a
hard duration guarantee for every spoken line. Long compilations retain their
existing budget. Voice settings and narration processing are unchanged.

Credits include original Instagram URLs, creators and an explicit unknown reuse
permission notice. Public availability and a successful download do not grant
copyright permission. This provider does not falsely label a Reel CC0/CC BY.
No credits are burned into the video; retain source details alongside publication.

The normal job expiry/cleanup owns these downloaded assets. Integration does not
write production videos to the manual samples folder or change the 30-minute TTL.

Validation: unit tests exercise URL boundaries, discovery domains, primary/fallback
order, per-job blocking, cancellation, distinct IDs and identical-byte rejection.
A local live adapter download of the indexed octopus Reel succeeded before any
stock-provider requests. A fresh Generate Video UI run also completed locally:
Gemini selected Company scrip, Fish supplied Hindi narration, and the UI downloaded
a 27-second 1080x1920 MP4. Instagram returned no usable discovery results for that
topic; the output used five stock clips and one photo. This is a fallback-flow test,
not an Instagram-only generation or proof of Render cloud-IP access.

Known quality limitation: automatic reviews accepted a modern Bitcoin stock shot
for a historical token scene. Passing the current reviews does not guarantee
historical identity or exact visual relevance; this remains an unresolved issue.
