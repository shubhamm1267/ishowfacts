/**
 * Preserve a real render as a portable, independently repeatable example.
 * Usage: node studio/tests/package-live-job.mjs /tmp/paperfacts-real-e2e-.../JOB-ID archerfish
 * Copies only referenced sources + audio, not credentials or private work files.
 * The live-e2e test already saves the rendered MP4 and storyboard/credit JSON.
 */
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const job = process.argv[2] && resolve(process.argv[2]);
const slug = String(process.argv[3] || 'archerfish').toLowerCase().replace(/[^a-z0-9-]/g, '');
if (!job || !slug) throw Error('Usage: package-live-job.mjs /abs/job-dir sample-slug');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const samples = join(root, 'samples');
const version = String(process.argv[4] || '4').replace(/[^0-9]/g, '');
const name = `live-${slug}-v${version}`;
const mediaDir = join(samples, 'media', name);
const reviewed = process.argv.includes('--reviewed');
const plan = JSON.parse(await readFile(join(job, reviewed ? 'reviewed-plan.json' : 'plan.json'), 'utf8'));
await mkdir(mediaDir, { recursive: true });
const copied = new Map();

async function pack(path) {
  if (!path) return path;
  const absolute = resolve(job, path);
  if (copied.has(absolute)) return copied.get(absolute);
  const base = basename(absolute).replace(/[^a-zA-Z0-9._-]/g, '_');
  const relative = join('media', name, base).replaceAll('\\', '/');
  await copyFile(absolute, join(samples, relative));
  copied.set(absolute, relative);
  return relative;
}

plan.meta.voice = await pack(plan.meta.voice);
for (const effect of Object.keys(plan.meta.sfx_map || {})) plan.meta.sfx_map[effect] = await pack(plan.meta.sfx_map[effect]);
for (const subject of Object.values(plan.subjects || {})) subject.image = await pack(subject.image);
for (const scene of plan.scenes) for (const element of scene.elements || []) {
  if (element.type === 'photo') element.image = await pack(element.image);
}
plan.meta.out = `${name}-rerender.mp4`;
await writeFile(join(samples, `${name}-plan.json`), JSON.stringify(plan, null, 2));
await copyFile(join(job, reviewed ? 'reviewed-episode.json' : 'episode.json'), join(samples, `${name}-episode.json`));
const credits = JSON.parse(await readFile(join(job, reviewed ? 'reviewed-CREDITS.json' : 'CREDITS.json'), 'utf8'));
for (const item of [...(credits.images || []), ...(credits.soundEffects || [])]) delete item.file;
await writeFile(join(samples, `${name}-CREDITS.json`), JSON.stringify(credits, null, 2));
await copyFile(join(job, reviewed ? 'reviewed-video.mp4' : 'video.mp4'), join(samples, `${name}.mp4`));
await copyFile(join(job, reviewed ? 'qa-reviewed/reviewed-video_contact.jpg' : 'qa/video_contact.jpg'), join(samples, `${name}-contact.jpg`));
console.log(JSON.stringify({ sample: `${name}.mp4`, sourceFiles: copied.size, portablePlan: `${name}-plan.json` }));
