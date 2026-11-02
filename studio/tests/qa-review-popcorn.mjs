/** Editorial QA re-render for the supplied Popcorn sample.
 * Keeps Gemini's factual lines, Cartesia voice, original timings and licensed
 * Freesound cues; replaces two rejected Commons shots with verified exact files.
 * This is an explicit sample-review pass, not a fixed template used by the app.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildAdvancedPlan, validateAdvancedPlan } from '../lib/director.mjs';

const job = resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Supply the absolute Popcorn live job folder');
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const input = JSON.parse(await readFile(join(job, 'episode.json'), 'utf8'));
const previous = JSON.parse(await readFile(join(job, 'plan.json'), 'utf8'));
if (!/popcorn/i.test(input.topic) || input.scenes.length !== 6) throw Error('This curated QA recipe requires the six-shot Popcorn sample');
const a = join(job, 'assets');
const scenes = input.scenes;

// Subject-led visual continuity: popped corn teaser → actual ancient crop →
// unpopped kernels → cause/effect diagram → real segmented popped kernels → bowl.
scenes[0].backgroundMode = 'kitchen';
scenes[0].visual = 'photo';
scenes[2].backgroundMode = 'paper';
scenes[2].visual = 'photo';
scenes[3].backgroundMode = 'lab';
scenes[3].diagram = { heading: 'INSIDE A KERNEL', nodes: [
  { label: 'HARD HULL', detail: 'Tough outer shell' },
  { label: 'TRAPPED WATER', detail: 'Moisture stays inside' },
  { label: 'STEAM PRESSURE', detail: 'Heat builds pressure' },
], links: [{ from: 0, to: 1, label: 'traps' }, { from: 1, to: 2, label: 'heats' }] };
scenes[4].backgroundMode = 'paper';
scenes[4].visual = 'cutout';
scenes[4].effects = [
  { type: 'rings', where: 'subject', rel: [.5, .5], at: .35, intensity: .65 },
  { type: 'burst', where: 'left', text: 'POP!', at: .53, intensity: .85 },
];
scenes[5].backgroundMode = 'kitchen';
// The narrator explicitly states a 50× expansion: make THAT the on-screen
// comparison, not an unrelated centimetre ruler.
scenes[5].effects = [
  { type: 'text', where: 'right', text: '50×', at: .36, intensity: .8 },
  { type: 'sparkle', where: 'left', at: .48, intensity: .5 },
];

const bbox = JSON.parse(await readFile(join(a, 'curated_cutout_4_trim2.bbox.json'), 'utf8'));
const imgs = [
  { path: join(a, 'curated_pop_4_alt.jpg'), cutout: false },
  { path: join(a, 'image_1.jpg'), cutout: false },
  { path: join(a, 'curated_kernel_2.jpg'), cutout: false },
  null,
  { path: join(a, 'curated_cutout_4_trim2.png'), cutout: true, bbox },
  { path: join(a, 'image_5.jpg'), cutout: false },
];
const timing = previous.scenes.map((s, i) => ({ start: s.start,
  duration: (previous.scenes[i + 1]?.start ?? previous.meta.duration - .45) - s.start }));
const output = join(job, 'reviewed-video.mp4');
const plan = buildAdvancedPlan({ title: input.title, topic: input.topic, scenes }, timing,
  imgs, previous.meta.sfx_map, output, previous.meta.voice,
  { fps: previous.meta.fps, seed: previous.meta.visual_seed });
const problems = validateAdvancedPlan(plan);
if (problems.length) throw Error(problems.join('; '));
await writeFile(join(job, 'reviewed-plan.json'), JSON.stringify(plan, null, 2));
await writeFile(join(job, 'reviewed-episode.json'), JSON.stringify(input, null, 2));

const originalCredits = JSON.parse(await readFile(join(job, 'CREDITS.json'), 'utf8'));
const curated = [
  { title: 'File:Popcorn popped.jpg', file: imgs[0].path, license: 'Public domain', author: 'Paolo Neo',
    source: 'https://commons.wikimedia.org/wiki/File:Popcorn_popped.jpg' },
  { title: 'File:Popcorn Kernels (34913464381).jpg', file: imgs[2].path,
    license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0',
    author: 'Jazmin Oteo', source: 'https://commons.wikimedia.org/wiki/File:Popcorn_Kernels_(34913464381).jpg' },
  { title: 'File:Popcorn (1).jpg', file: imgs[4].path, license: 'Public domain',
    author: 'Renee Comet / National Cancer Institute',
    source: 'https://commons.wikimedia.org/wiki/File:Popcorn_(1).jpg' },
];
originalCredits.images = [originalCredits.images[1], originalCredits.images[2], ...curated];
originalCredits.editorialReview = 'Scene 1/3/5 photos verified, background-masked cutout and 3-step physical diagram';
await writeFile(join(job, 'reviewed-CREDITS.json'), JSON.stringify(originalCredits, null, 2));

async function run(command, args) {
  await new Promise((ok, fail) => {
    const process = spawn(command, args, { cwd: project, env: globalThis.process.env, stdio: 'inherit' });
    process.once('error', fail);
    process.once('close', code => code === 0 ? ok() : fail(Error(`${command} exited with ${code}`)));
  });
}
await mkdir(join(job, 'qa-reviewed'), { recursive: true });
await run('python3', [join(project, 'scripts', 'paper_doc.py'), 'contact', join(job, 'reviewed-plan.json'), join(job, 'qa-reviewed')]);
await run('python3', [join(project, 'scripts', 'paper_doc.py'), 'render', join(job, 'reviewed-plan.json')]);
console.log('QA_REVIEW_READY', JSON.stringify({ video: output,
  contact: join(job, 'qa-reviewed', 'reviewed-video_contact.jpg'),
  shots: plan.scenes.length, photoCount: imgs.filter(x => !!x).length,
  genuineCutouts: imgs.filter(x => !!x?.cutout).length, diagramCount: plan.scenes.filter(s => s.elements.some(e => e.type === 'infographic')).length }));
