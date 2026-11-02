/**
 * Copies referenced, non-secret media into samples/media/ and rewrites the
 * improved real-photo sample's JSON paths so anyone can replay the animation:
 * python3 scripts/paper_doc.py render samples/live-beetle-v2-realphotos-plan.json
 */
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const samples = join(root, 'samples');
const planPath = join(samples, 'live-beetle-v2-realphotos-plan.json');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const mediaFolder = join(samples, 'media');
await mkdir(mediaFolder, { recursive: true });
const paths = new Map();

async function pack(src) {
  if (!src) return src;
  if (src.replaceAll('\\', '/').startsWith('media/')) return src;
  const absolute = resolve(src);
  if (paths.has(absolute)) return paths.get(absolute);
  const relative = join('media', basename(absolute)).replaceAll('\\', '/');
  await copyFile(absolute, join(samples, relative));
  paths.set(absolute, relative);
  return relative;
}

plan.meta.voice = await pack(plan.meta.voice);
for (const name of Object.keys(plan.meta.sfx_map || {})) plan.meta.sfx_map[name] = await pack(plan.meta.sfx_map[name]);
for (const subject of Object.values(plan.subjects || {})) subject.image = await pack(subject.image);
for (const scene of plan.scenes) for (const el of scene.elements) {
  if (el.type === 'photo') el.image = await pack(el.image);
}
plan.meta.out = 'live-beetle-v2-realphotos-rerender.mp4';
await writeFile(planPath, JSON.stringify(plan, null, 2));
// Preserve all credits for the new photographs AND the reused Freesound cues.
const photographs = JSON.parse(await readFile(join(samples, 'live-beetle-v2-realphotos-credits.json'), 'utf8'));
const initial = JSON.parse(await readFile(join(samples, 'live-beetle-v2-CREDITS.json'), 'utf8'));
const publicCredit = ({ file, ...credit }) => credit;
await writeFile(join(samples, 'live-beetle-v2-realphotos-CREDITS.json'), JSON.stringify({
  source: initial.source, images: photographs.map(publicCredit), soundEffects: initial.soundEffects.map(publicCredit),
}, null, 2));
console.log('Portable project', paths.size, 'media files →', planPath);
