// Reuse a real generated episode/narration, review stock footage and render
// through the existing production director + Python engine. No invented voice.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gemini, inspectImage, freesound, normalizeDiagram } from '../lib/core.mjs';
import { buildAdvancedPlan, requiredSounds } from '../lib/director.mjs';

const original = resolve(process.argv[2]);
const folder = resolve('studio/jobs/ocean-mixed-sample');
const samples = resolve('samples');
await mkdir(folder, { recursive: true });
await mkdir(samples, { recursive: true });
const episode = JSON.parse(await readFile(join(original, 'episode.json'), 'utf8'));
const clip = resolve('studio/jobs/stock-video-check/sample-clip.mp4');
const credit = { provider: 'Vecteezy', title: 'the sun sets over the ocean as waves crash into the shore',
  source: 'https://www.vecteezy.com/video/68545203', license: 'Vecteezy Free License',
  licenseUrl: 'https://www.vecteezy.com/licensing-agreement', author: 'Rus Wandi',
  attribution: 'Video: Rus Wandi / Vecteezy.com', mediaType: 'video' };
const probe = file => Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0',file], { encoding: 'utf8' }).trim());
const timing = []; let cursor = 0;
for (let i = 0; i < episode.scenes.length; i++) {
  const duration = probe(join(original, 'assets', `voice_${String(i).padStart(2,'0')}.wav`));
  timing.push({ start: cursor, duration }); cursor += duration;
}
const voice = join(folder, 'narration.wav');
await copyFile(join(original, 'assets/narration.wav'), voice);
console.log('Gemini: replacing unavailable still-photo shots with factual animated diagrams');
const diagrams = await gemini(`Provide two factual Hindi animated diagrams for these exact narration lines. Do not add claims, numbers or information beyond the narration. JSON {diagrams:[{nodes:[{label,detail},{label,detail}],links:[{from:0,to:1,label}],heading,style}]}. Each diagram 2-3 nodes, short Devanagari labels and details. Diagram style mechanism or contrast. Narration lines: ${JSON.stringify([episode.scenes[1].narration,episode.scenes[4].narration])}. Return precisely two diagrams.`);
for (const [j,i] of [1,4].entries()) {
  episode.scenes[i].diagram = normalizeDiagram(diagrams.diagrams?.[j]);
  if (!episode.scenes[i].diagram) throw Error('Invalid factual diagram');
  episode.scenes[i].visual = 'diagram'; episode.scenes[i].effects = [];
}
const images = Array(episode.scenes.length).fill(null);
const fps = 24;
for (const i of [0,3]) {
  const frames = join(folder, `frames_${i}`); await mkdir(frames, {recursive:true});
  execFileSync('ffmpeg', ['-v','error','-y','-stream_loop','-1','-i',clip,'-t',String(timing[i].duration+.5),'-an','-vf',`fps=${fps},scale=960:-2`,'-start_number','0',join(frames,'%06d.jpg')]);
  for (const f of [.12,.5,.85]) {
    const n = Math.floor(timing[i].duration*f*fps);
    const audit = await inspectImage(join(frames,`${String(n).padStart(6,'0')}.jpg`),'ocean surface waves',episode.scenes[i].narration,[],{topic:episode.topic,visualRole:'subject'});
    if (!audit.matches || audit.confidence<.75) throw Error(`Clip QA rejected shot ${i+1}`);
  }
  episode.scenes[i].visual = 'video'; episode.scenes[i].mediaUsed = 'video';
  // No unrelated sparks or physics-emitter overlays over documentary footage.
  episode.scenes[i].effects = [];
  images[i] = { video:true,path:clip,frames,fps,frameCount:Math.ceil((timing[i].duration+.5)*fps),width:1920,height:1080,attribution:credit.attribution };
}
console.log('Preparing story-matched SFX');
const sounds = {}, soundCredits = [];
for (const cue of requiredSounds(episode)) {
  try {
    const item = await freesound(cue, join(folder,`sfx_${cue}.mp3`));
    if (item) { sounds[cue] = item.file; soundCredits.push(item); }
  } catch (e) { console.log(`SFX ${cue} unavailable: ${e.message}`); }
}
const plan = buildAdvancedPlan(episode,timing,images,sounds,join(folder,'video.mp4'),voice,{demo:false,fps,backgroundPalette:'white',seed:314159});
await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));
await writeFile(join(folder,'episode.json'),JSON.stringify(episode,null,2));
await writeFile(join(folder,'CREDITS.json'),JSON.stringify({source:[{name:episode.research.title,url:episode.research.url}],videos:[credit],soundEffects:soundCredits,narrator:{provider:'Cartesia',voice:'Ayush'},review:'Existing live-generated Gemini storyboard and Cartesia narration; unsuitable source-image shots replaced with Gemini diagrams; 3-frame QA on both video shots. Not a one-click unattended run.'},null,2));
const python = process.env.PYTHON || 'python';
execFileSync(python,['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
execFileSync(python,['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
for (const [source,suffix] of [['video.mp4','.mp4'],['episode.json','-episode.json'],['CREDITS.json','-CREDITS.json'],['qa/video_contact.jpg','-contact.jpg']]) {
  await copyFile(join(folder,source),join(samples,'ocean-waves-mixed-hindi-sample'+suffix));
}
console.log('SAMPLE_READY '+join(samples,'ocean-waves-mixed-hindi-sample.mp4'));
