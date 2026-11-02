/**
 * Optional QA re-render from an existing live job. Reuses paid Cartesia audio
 * and CC0 Freesound downloads, but re-selects distinct Commons photographs,
 * audits their anchors with Gemini, and creates a sample MP4 + scene sheet.
 * Run from paper-doc/: node --env-file=studio/.env studio/tests/rebuild-live-sample.mjs /abs/live-job/folder
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { commonsImage, inspectImage } from '../lib/core.mjs';
import { buildAdvancedPlan } from '../lib/director.mjs';

function run(command, args) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', fail);
    child.once('exit', code => code === 0 ? ok() : fail(Error(`${command} exited ${code}`)));
  });
}
const folder = process.argv[2];
if (!folder) throw Error('Pass absolute existing live job folder');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = join(root, 'samples');
const job = JSON.parse(await readFile(join(folder, 'episode.json'), 'utf8'));
const previous = JSON.parse(await readFile(join(folder, 'plan.json'), 'utf8'));
const episode = { title: job.title, topic: job.topic, scenes: job.scenes };
const timing = previous.scenes.map((s, i) => ({ start: s.start,
  duration: (previous.scenes[i + 1]?.start ?? previous.meta.duration - .45) - s.start }));
const sounds = previous.meta.sfx_map;
const images = [], credits = [], used = new Set();
await mkdir(sample, { recursive: true });
for (let i = 0; i < episode.scenes.length; i++) {
  const scene = episode.scenes[i];
  const filename = join(folder, 'assets', `new_photo_${i}.jpg`);
  const found = await commonsImage(scene.visualQuery, filename, used)
    || await commonsImage(episode.topic || 'Bombardier beetle', filename, used);
  if (!found) { console.log(`Scene ${i + 1}: fallback graphics`); images.push(null); continue; }
  used.add(found.title);
  console.log(`Scene ${i + 1}: ${found.title} (${found.license})`);
  credits.push(found);
  let guidance = null;
  try {
    guidance = await inspectImage(filename, scene.visualQuery, scene.narration, scene.effects || []);
    for (const e of scene.effects || []) {
      if (e.where === 'subject' && guidance.anchors[e.type]) e.rel = guidance.anchors[e.type];
    }
  } catch (e) { console.log('Gemini image audit skipped:', e.message); }
  let bbox = null;
  const cutDest = join(folder, 'assets', `new_cutout_${i}.png`);
  if (scene.visual === 'cutout' && guidance?.cutoutSuitable !== false) {
    try {
      await run('python3', [join(root, 'studio', 'prepare_cutout.py'), filename, cutDest]);
      bbox = JSON.parse(await readFile(cutDest.replace(/\.png$/, '.bbox.json'), 'utf8'));
    } catch (e) { console.log('Photo card fallback:', e.message); }
  }
  images.push({ path: bbox ? cutDest : filename, cutout: !!bbox, bbox });
}
const out = join(sample, 'live-beetle-v2-realphotos.mp4');
const planPath = join(sample, 'live-beetle-v2-realphotos-plan.json');
const plan = buildAdvancedPlan(episode, timing, images, sounds, out,
  join(folder, 'assets', 'narration.wav'), { fps: Number(process.env.RENDER_FPS || 20) });
await writeFile(planPath, JSON.stringify(plan, null, 2));
await writeFile(join(sample, 'live-beetle-v2-realphotos-credits.json'), JSON.stringify(credits, null, 2));
await run('python3', [join(root, 'scripts', 'paper_doc.py'), 'contact', planPath, join(sample, 'qa')]);
await run('python3', [join(root, 'scripts', 'paper_doc.py'), 'render', planPath]);
console.log('PASS improved photo sample:', out);
