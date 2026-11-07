# Deploy ishowfacts: Render backend + Netlify UI

The repository root contains the Dockerfile and netlify.toml. The backend needs
Node, Python and FFmpeg; deploy it as a Docker web service, not a Netlify Function.

## 1. Render backend

1. Sign into https://dashboard.render.com/ with GitHub.
2. Choose **New → Web Service**, connect `shubhamm1267/ishowfacts` and branch `main`.
3. Name it `ishowfacts-api` (or another available name).
4. Choose **Docker** as the language/runtime.
5. Leave **Root Directory empty**; Dockerfile Path is `./Dockerfile` and Docker
   Build Context is the repository root. Leave Docker Command empty to use CMD.
6. Select the instance size. Free can be used for an initial deployment check;
   successful full-resolution rendering is not guaranteed within its resources.
7. Under **Environment**, use **Add from .env** and paste your LOCAL `studio/.env`
   contents. Do not upload the file to GitHub or put provider keys in Netlify.
8. Add/override these backend settings:

   ```dotenv
   HOST=0.0.0.0
   PORT=10000
   ENABLE_REMBG=0
   DEMO_MODE=0
   ```

   The Dockerfile supplies the Linux Python path; do not override PYTHON with a
   Windows path. Keep provider names, model IDs and voice IDs from the local env.
9. Under Advanced, set **Health Check Path** to `/api/health`.
10. Click **Deploy Web Service**. Once Live, copy its ACTUAL HTTPS URL; the name
    may have an extra suffix. Open `https://YOUR-RENDER-HOST/api/health` and check
    for `"ok": true` and the expected configured provider flags.

## 2. Netlify frontend

1. Sign into https://app.netlify.com/ with GitHub.
2. Choose **Add new project → Import an existing project → GitHub**.
3. Select `shubhamm1267/ishowfacts`, branch `main`.
4. Use the repository-root `netlify.toml`. The effective build settings are:

   | Setting | Value |
   |---|---|
   | Base directory | `web` |
   | Build command | `npm run build:netlify` |
   | Publish directory, relative to base | `dist/paper-facts/browser` |
   | Node | `22` |

5. Before deploying, add **RENDER_API_URL** as a build environment variable.
   Its value is the exact Render HTTPS origin from step 1, without `/api` or
   `/api/health`, e.g. `https://ishowfacts-api-EXAMPLE.onrender.com`.
6. Deploy. The build creates `_redirects` with the backend proxy before the SPA
   fallback. No API credentials are needed in this frontend build.
7. Copy the final Netlify HTTPS site URL, e.g. `https://YOUR-SITE.netlify.app`.

## 3. Connect and test

1. In Render → Environment, add **FRONTEND_ORIGIN** equal to the exact Netlify
   site origin, with no trailing slash. Save/redeploy the backend.
2. Open `https://YOUR-SITE.netlify.app/api/health`. It must return backend JSON,
   not the Angular page or a 403. Then open the site itself.
3. Choose Fish Audio, Hindi or English, a 25/30-second target, upload the logo
   and click **Generate Video**. Verify preview, MP4 download and source credits.
   Use **Cancel Generation** in the progress panel to stop a running job.
   Refreshing the page reconnects to the job; it does not cancel it. Cancellation
   aborts in-flight provider requests and stops renderer process trees. The slot
   becomes available after shutdown finishes. Requests already processed by an
   external provider cannot be undone. Cancelled job files use the same
   30-minute expiry as failed/completed jobs.
4. If the free backend has slept, first open the direct Render `/api/health`
   URL and wait for it to wake, then refresh the Netlify site.
5. If logs show `Origin not allowed`, correct FRONTEND_ORIGIN. If Netlify build
   says RENDER_API_URL is missing, add it and trigger a new frontend deploy.
6. If rendering is killed or runs out of memory, use a backend instance with
   sufficient RAM/CPU; a successful health check does not test video rendering.
7. Wikimedia HTTP 429 means research/media access is rate limited, not that a
   Gemini key is invalid. Requests identify this app, share a one-second pacing
   queue, and respect the provider's Retry-After cooldown. Avoid repeatedly
   restarting failed jobs during that cooldown. This does not guarantee access
   from a cloud IP; the provider's limits still apply.

Completed/failed jobs expire after 30 minutes while the service is running.
Render's ephemeral storage can disappear earlier on restart/redeploy/spin-down,
including videos and local topic history. Persistent topic history across these
events requires a persistent disk/database; this setup does not provide one.
The samples folder is excluded from deployment and is not written by production
UI generation. The media cache has its own expiry and size limit.

After setup, pushing main triggers deployments if auto-deploy is enabled.
If the Render URL changes, update Netlify's RENDER_API_URL and redeploy the UI.
If the Netlify domain changes, update Render's FRONTEND_ORIGIN and redeploy it.
