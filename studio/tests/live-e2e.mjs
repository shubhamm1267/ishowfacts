/**
 * Explicit live, quota-using end-to-end test. Run from paper-doc/:
 * PYTHONPATH=/path/to/rembg/deps U2NET_HOME=/tmp/paperfacts-models RENDER_FPS=20 \
 *   node --env-file=studio/.env studio/tests/live-e2e.mjs
 *
 * Makes a REAL 9:16 Hindi MP4 via Gemini, Cartesia, Commons, Freesound and
 * the original paper-doc renderer, then copies public/non-secret sample
 * artifacts to paper-doc/samples/.
 */
import { mkdtemp, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.JOBS_DIR = await mkdtemp(join(tmpdir(), 'paperfacts-real-e2e-'));
process.env.DEMO_MODE = '0';
const { makeServer } = await import('../server.mjs');
const server = makeServer();
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const samples = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples');

try {
  const topic = process.env.LIVE_TEST_TOPIC || 'Bombardier beetle';
  const slug = String(process.env.LIVE_TEST_LABEL || topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .replace(/[^a-z0-9-]/gi, '').slice(0, 45);
  const namePrefix = `live-${slug}-v${String(process.env.LIVE_TEST_VERSION || '4').replace(/[^0-9]/g, '')}`;
  const response = await fetch(`${base}/api/jobs`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, voiceAccent: process.env.LIVE_TEST_VOICE_ACCENT || 'hi-IN-ayush',
      voiceStyle: process.env.LIVE_TEST_VOICE_STYLE || 'energetic',
      humorIntensity: process.env.LIVE_TEST_HUMOR || 'cheeky',
      backgroundPalette: process.env.LIVE_TEST_BACKGROUND || 'random',
      seconds: Number(process.env.LIVE_TEST_SECONDS || 22), demo: false }) });
  const submitted = await response.json();
  if (response.status !== 202) throw Error(`Could not start live test: ${JSON.stringify(submitted)}`);
  console.log('Live E2E job', submitted.id, 'topic', topic, 'test fps', process.env.RENDER_FPS || 30);
  const began = Date.now();
  let job = { status: 'running' }, lastStage = '', temporaryFailures = 0;
  do {
    await new Promise(ok => setTimeout(ok, 1800));
    try {
      const progress = await fetch(`${base}/api/jobs/${submitted.id}`, { signal: AbortSignal.timeout(15_000) });
      if (!progress.ok) throw Error(`Local API HTTP ${progress.status}`);
      job = await progress.json();
      temporaryFailures = 0;
    } catch (e) {
      if (++temporaryFailures > 12) throw Error(`Studio became unavailable during render: ${e.message}`);
      console.warn(`Waiting for local render API to recover (${temporaryFailures}/12): ${e.message}`);
      continue;
    }
    if (job.stage !== lastStage) { lastStage = job.stage; console.log(job.progress, job.stage); }
    if (Date.now() - began > 1_500_000) throw Error('Live E2E timed out after 25 minutes');
  } while (job.status === 'running');
  if (job.status !== 'complete') throw Error(`Live rendering failed: ${job.error}; ${JSON.stringify(job.warnings)}`);

  const dir = join(process.env.JOBS_DIR, job.id);
  await mkdir(samples, { recursive: true });
  const assets = ['video.mp4', 'plan.json', 'episode.json', 'CREDITS.json'];
  for (const name of assets) {
    const suffix = name === 'video.mp4' ? '.mp4' : `-${name}`;
    await copyFile(join(dir, name), join(samples, `${namePrefix}${suffix}`));
  }
  if (job.contactUrl) await copyFile(join(dir, 'qa', 'video_contact.jpg'), join(samples, `${namePrefix}-contact.jpg`));
  const size = (await stat(join(samples, `${namePrefix}.mp4`))).size;
  if (size < 50_000) throw Error('Sample video unexpectedly small');
  const plan = JSON.parse(await readFile(join(dir, 'plan.json'), 'utf8'));
  const episode = JSON.parse(await readFile(join(dir, 'episode.json'), 'utf8'));
  if (episode.facts?.length !== 3 || new Set(episode.scenes.map(s => s.factIndex)).size !== 3)
    throw Error('Gemini did not create three distinct mapped facts');
  const expectedPalette = process.env.LIVE_TEST_BACKGROUND || 'random';
  if (plan.meta.background_palette !== expectedPalette) throw Error('Requested background palette missing');
  if (!plan.meta.voice || !plan.meta.require_external_sfx) throw Error('Live sample narration/SFX pipeline not enabled');
  const credit = JSON.parse(await readFile(join(dir, 'CREDITS.json'), 'utf8'));
  if (!credit.images?.length && !plan.scenes.some(s => s.elements.some(e => e.type === 'infographic')))
    throw Error('No source images or factual infographics used');
  if (!credit.soundEffects?.length) throw Error('Freesound credits missing');
  const response2 = await fetch(`${base}/api/jobs/${job.id}/video`, { headers: { Range: 'bytes=0-199' } });
  if (response2.status !== 206 || (await response2.arrayBuffer()).byteLength !== 200) throw Error('Live video range stream failed');
  console.log('JOB_FOLDER', dir);
  console.log('PASS', JSON.stringify({ file: `samples/${namePrefix}.mp4`, bytes: size,
    scenes: plan.scenes.length, images: credit.images.length, sounds: credit.soundEffects.length,
    visualEffects: [...new Set(plan.scenes.flatMap(s => s.elements.map(e => e.type)))],
    warnings: job.warnings }));
} finally { await new Promise(ok => server.close(ok)); }
