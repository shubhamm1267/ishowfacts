// Run separately from npm test; renders a short local demonstration, no API keys.
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DEMO_MODE = '1';
process.env.DEMO_FPS = process.env.DEMO_FPS || '5';
process.env.DEMO_SCENE_SECONDS = process.env.DEMO_SCENE_SECONDS || '.8';
process.env.JOBS_DIR = await mkdtemp(join(tmpdir(), 'paperfacts-smoke-'));
const { makeServer } = await import('../server.mjs');
const { validateAdvancedPlan } = await import('../lib/director.mjs');
const server = makeServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const job = await (await fetch(`${base}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demo: true }) })).json();
  if (!job.id) throw Error(`Could not submit demo job: ${JSON.stringify(job)}`);
  console.log('Rendering offline job:', job.id);
  let result;
  const start = Date.now();
  do {
    await new Promise(r => setTimeout(r, 850));
    result = await (await fetch(`${base}/api/jobs/${job.id}`)).json();
    process.stdout.write(`\r${result.stage}: ${result.progress}%     `);
    if (Date.now() - start > 360_000) throw Error('Smoke test timed out');
  } while (result.status === 'running');
  console.log();
  if (result.status !== 'complete') throw Error(result.error || 'Smoke test failed');
  const path = join(process.env.JOBS_DIR, job.id, 'video.mp4');
  const video = await stat(path);
  if (video.size < 1000) throw Error('Video empty');
  const response = await fetch(`${base}/api/jobs/${job.id}/video`, { headers: { Range: 'bytes=0-99' } });
  if (response.status !== 206 || (await response.arrayBuffer()).byteLength !== 100) throw Error('HTTP range playback failed');
  const planResponse = await fetch(`${base}/api/jobs/${job.id}/plan`);
  const plan = await planResponse.json();
  if (planResponse.status !== 200 || !Array.isArray(plan.scenes) || plan.scenes.length !== 4 ||
      validateAdvancedPlan(plan).length || !plan.scenes.every(s=>s.elements?.length))
    throw Error('Complete valid animation plan missing');
  const storyboardResponse = await fetch(`${base}/api/jobs/${job.id}/episode`);
  if (storyboardResponse.status !== 200 || !(await storyboardResponse.json()).scenes) throw Error('Storyboard download unavailable');
  if (result.contactUrl) {
    const sheet = await fetch(`${base}${result.contactUrl}`);
    if (sheet.status !== 200 || sheet.headers.get('content-type') !== 'image/jpeg') throw Error('Contact sheet missing');
  }
  const index = await fetch(base);
  if (index.status !== 200 || !(await index.text()).includes('app-root')) throw Error('Built Angular UI was not served');
  console.log('PASS', path, video.size, 'bytes');
} finally {
  await new Promise(resolve => server.close(resolve));
}
