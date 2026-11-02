/** Editorial proof pass for any real Gemini-generated fact episode.
 * Allows an editor to correct sourced facts, pick exact licensed media and
 * retake Cartesia performance while keeping the dynamic storyboard renderer.
 * Usage: node --env-file=studio/.env studio/tests/qa-review-story.mjs JOB manifest.json
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { cartesiaVoice, resolveVoiceProfile } from '../lib/core.mjs';
import { buildAdvancedPlan, validateAdvancedPlan } from '../lib/director.mjs';

const [jobArg, recipeArg] = process.argv.slice(2);
if (!jobArg || !recipeArg) throw Error('Usage: qa-review-story.mjs /abs/job /abs/review.json');
const job = resolve(jobArg);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const recipe = JSON.parse(await readFile(resolve(recipeArg), 'utf8'));
const episode = JSON.parse(await readFile(join(job, 'episode.json'), 'utf8'));
if (typeof recipe.headlineHi === 'string') episode.headlineHi = recipe.headlineHi.trim().slice(0, 95);
if (typeof recipe.headlineText === 'string') {
  episode.headlineText = recipe.headlineText.trim().slice(0, 95);
  episode.headlineHi = episode.headlineText;
}
if (typeof recipe.headlineHighlight === 'string')
  episode.headlineHighlight = recipe.headlineHighlight.trim().slice(0, 40);
if (['hi', 'en'].includes(recipe.language)) episode.language = recipe.language;
if (Array.isArray(recipe.facts) && recipe.facts.length === 3 &&
    recipe.facts.every(f => typeof f === 'string' && f.trim().length >= 12))
  episode.facts = recipe.facts.map(f => f.trim());
const prior = JSON.parse(await readFile(join(job, 'plan.json'), 'utf8'));
const credits = JSON.parse(await readFile(join(job, 'CREDITS.json'), 'utf8'));
if (Array.isArray(recipe.sources)) {
  credits.source = [...(credits.source || []), ...recipe.sources.filter(s => s.url && s.name)];
  episode.reviewSources = recipe.sources.filter(s => s.url && s.name);
}
if (recipe.topic !== episode.topic || recipe.scenes.length < 3 || recipe.scenes.length > 12)
  throw Error('Review recipe topic or scene count invalid');
// Editorial re-timing may add/delete one or two beats without abandoning the
// original generated topic, source research, credit ledger or dynamic renderer.
if (recipe.scenes.length !== episode.scenes.length) {
  episode.scenes = recipe.scenes.map((s, i) => ({ ...episode.scenes[Math.min(i, episode.scenes.length - 1)], ...s }));
}
const accent = recipe.voiceAccent || credits.narrator.voiceAccent;
resolveVoiceProfile(accent); // Fails closed on unknown Cartesia profile.
const tempo = Number(recipe.tempo ?? 1);
if (!(tempo >= .9 && tempo <= 1.25)) throw Error('Review narration tempo outside supported range');
const asset = join(job, 'assets');
const tracks = [];
const timings = [];
let t = 0;
for (const [i, s] of episode.scenes.entries()) {
  const review = recipe.scenes[i];
  const narration = review.narration?.trim();
  if (!narration || narration.length < 18) throw Error(`Scene ${i + 1} narration is missing or too short`);
  Object.assign(s, review);
  if (Number.isInteger(review.factIndex) && review.factIndex >= 0 && review.factIndex <= 2)
    s.factIndex = review.factIndex;
  // An edited shot must not inherit tiny English/Gemini callouts from a
  // different draft. Retain only explicitly approved story annotations.
  if (!Object.hasOwn(review, 'callout')) s.callout = '';
  delete s.media;
  delete s.credit;
  const voice = join(asset, `reviewed_voice_${String(i).padStart(2, '0')}.wav`);
  try { await stat(voice); }
  catch { await cartesiaVoice(s.narration, accent, voice, s, recipe.voiceStyle || 'energetic'); }
  const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', voice], false);
  const seconds = Number(probe.trim());
  if (!(seconds > .4 && seconds < 15)) throw Error(`Scene ${i + 1}: invalid TTS duration`);
  tracks.push(voice);
  timings.push({ start: t, duration: seconds / tempo });
  t += seconds / tempo;
  console.log(`VOICE ${i + 1}/${episode.scenes.length} ${seconds.toFixed(2)}s`);
}
const concat = join(asset, 'reviewed_concat.txt');
await writeFile(concat, tracks.map(f => `file '${f.replaceAll("'", "'\\''")}'`).join('\n'));
const pitch = Number(recipe.pitch ?? 1);
if (!(pitch >= .9 && pitch <= 1.25)) throw Error('Review pitch outside supported range');
const filters = ['highpass=f=80'];
if (Math.abs(pitch - 1) > .005) filters.push(`rubberband=pitch=${pitch}:formant=preserved:pitchq=quality`);
if (Math.abs(tempo - 1) > .005) filters.push(`atempo=${tempo}`);
filters.push('acompressor=threshold=0.11:ratio=2.8:attack=5:release=90:makeup=1.6',
  'loudnorm=I=-16:LRA=9:TP=-1.5', 'alimiter=limit=0.96');
const reviewedWav = join(asset, 'reviewed_narration.wav');
await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concat,
  '-af', filters.join(','), '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', reviewedWav]);

const images = recipe.scenes.map((s, i) => {
  if (s.visual === 'diagram' || s.visual === 'illustration') return null;
  if (!s.media) throw Error(`Scene ${i + 1}: source media missing; never substitute a generic icon`);
  const path = resolve(job, s.media);
  if (!path.startsWith(`${job}/`)) throw Error('Media cannot escape current job');
  if (s.cutout && !s.bbox) throw Error(`Scene ${i + 1}: cutout requires validated bbox metadata`);
  return { path, cutout: !!s.cutout, bbox: s.bbox || null };
});
for (const img of images.filter(Boolean)) await stat(img.path);
const output = join(job, 'reviewed-video.mp4');
const plan = buildAdvancedPlan(episode, timings, images, prior.meta.sfx_map, output,
  reviewedWav, { fps: recipe.fps || 24, seed: recipe.seed || prior.meta.visual_seed,
    backgroundPalette: ['white', 'black', 'random'].includes(recipe.backgroundPalette)
      ? recipe.backgroundPalette : prior.meta.background_palette || 'random' });
const problems = validateAdvancedPlan(plan);
if (problems.length) throw Error(`Review layout check failed: ${problems.join('; ')}`);
await writeFile(join(job, 'reviewed-plan.json'), JSON.stringify(plan, null, 2));
await writeFile(join(job, 'reviewed-episode.json'), JSON.stringify(episode, null, 2));
// A reviewed credit list is an exact bill of materials, not all candidates
// attempted during Gemini-image QA. Preserve the Freesound attribution.
const index = new Map(credits.images.map(c => [c.file, c]));
const cited = new Map();
for (let i = 0; i < images.length; i++) {
  if (!images[i]) continue;
  const selected = recipe.scenes[i];
  const verified = selected.credit || index.get(images[i].path);
  if (!verified || !verified.source || !verified.license) throw Error(`Scene ${i + 1}: missing license/source attribution`);
  if (!/^(CC BY \d|CC0|Public domain)/i.test(verified.license)) throw Error('Unsupported license in review');
  cited.set(verified.source, { ...verified, file: images[i].path });
}
credits.images = [...cited.values()];
credits.narrator = { provider: 'Cartesia', voiceAccent: accent,
  voiceName: resolveVoiceProfile(accent).name, profile: 'male', style: recipe.voiceStyle || 'energetic',
  pitchRatio: pitch };
credits.editorialReview = recipe.editorialReview;
await writeFile(join(job, 'reviewed-CREDITS.json'), JSON.stringify(credits, null, 2));
await mkdir(join(job, 'qa-reviewed'), { recursive: true });
await run('python3', [join(project, 'scripts/paper_doc.py'), 'contact', join(job, 'reviewed-plan.json'), join(job, 'qa-reviewed')]);
await run('python3', [join(project, 'scripts/paper_doc.py'), 'render', join(job, 'reviewed-plan.json')]);
console.log('REVIEWED_OK', JSON.stringify({ file: output, duration: plan.meta.duration.toFixed(2),
  scenes: episode.scenes.length, images: images.filter(Boolean).length, diagrams: images.filter(x => !x).length,
  licensedAssets: credits.images.length, freesooundCues: credits.soundEffects.length }));

async function run(command, args, inherit = true) {
  return await new Promise((accept, reject) => {
    let output = '';
    const child = spawn(command, args, { cwd: project, env: process.env,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    if (!inherit) {
      child.stdout.on('data', data => { output += String(data); });
      child.stderr.on('data', data => { output += String(data); });
    }
    child.once('error', reject);
    child.once('close', code => code === 0 ? accept(output) : reject(Error(`${command} code=${code}: ${output.slice(-1500)}`)));
  });
}
