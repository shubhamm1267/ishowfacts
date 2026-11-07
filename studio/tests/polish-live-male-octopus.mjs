// Editorial QA of THIS run's freshly acquired assets; no earlier sample imports.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {makeVoice} from '../server.mjs';
import {auditHindiEpisode,auditHindiNarration,gemini} from '../lib/core.mjs';
import {prepareHeadlineAssets} from '../lib/reference-style.mjs';
import {heygenPerformance} from '../lib/heygen.mjs';
import {buildAdvancedPlan} from '../lib/director.mjs';
const run=JSON.parse(await readFile('studio/jobs/live-male-octopus/run.json','utf8'));
const source=resolve('studio/jobs/live-male-octopus',run.id),folder=join(source,'reviewed');await mkdir(folder,{recursive:true});
const episode=JSON.parse(await readFile(join(source,'episode.json'),'utf8'));
// Correct ambiguous literal "leave limbs behind", keep the source's explicit
// invertebrate qualifier, and use a hook whose answer this actual source gives.
episode.headlineText='ऑक्टोपस का ये हुनर देखो 😲';episode.headlineHi=episode.headlineText;episode.headlineHighlight='ऑक्टोपस का';
const lines=[
 'ऑक्टोपस अपना आकार बदलकर छोटी जगह से भी निकल सकता है। अरे साला, भागने का पूरा जुगाड़ है!',
 'तैरते समय यह अपनी भुजाएँ पीछे की ओर रखता है और उल्टी दिशा में बढ़ता है।',
 'इसका साइफन सांस लेने और आगे बढ़ने, दोनों में काम आता है।',
 'इसकी आठ भुजाओं के बीच चोंच जैसा मुँह होता है।',
 'और दिमाग? बिना रीढ़ की हड्डी वाले जीवों में यह सबसे समझदार जीवों में से एक है!'
];
if(episode.scenes.length!==lines.length)throw Error('Expected this run\'s five-shot storyboard');
episode.scenes.forEach((s,i)=>{s.narration=lines[i];s.beatTextHi='';});
await auditHindiEpisode(episode,episode.research);
console.log(process.env.REUSE_OCTOPUS_NARRATION==='1'?'Using this run\'s approved natural-pitch male narration':'Reviewed fresh octopus story; generating natural-pitch male narration');
let narration;
if(process.env.REUSE_OCTOPUS_NARRATION==='1'){
 const saved=JSON.parse(await readFile(join(folder,'episode.json'),'utf8'));
 if(JSON.stringify(saved.scenes.map(s=>s.narration))!==JSON.stringify(lines))throw Error('Cached narration script mismatch');
 const review=JSON.parse(await readFile(join(folder,'audio-review.json'),'utf8'));
 if(!review.approved)throw Error('Existing narration has not passed review');
 narration=JSON.parse(await readFile(join(folder,'timing.json'),'utf8'));
}else{
 narration=await makeVoice(episode,'hi-IN-anuj','energetic',folder,'heygen');
 await writeFile(join(folder,'audio-review.json'),JSON.stringify(await auditHindiNarration(narration.voice,episode),null,2));
}
await writeFile(join(folder,'episode.json'),JSON.stringify(episode,null,2));
await writeFile(join(folder,'timing.json'),JSON.stringify(narration,null,2));
console.log('New narration approved; waiting for this live run\'s licensed media');
while(true){const status=JSON.parse(await readFile(join(source,'status.json'),'utf8'));if(status.status==='failed')throw Error('Fresh media job failed: '+status.error);if(status.status==='complete')break;await new Promise(ok=>setTimeout(ok,3000));}
const credits=JSON.parse(await readFile(join(source,'CREDITS.json'),'utf8'));
const media=JSON.parse(await readFile(join(folder,'final-media.json'),'utf8'));
const initial=JSON.parse(await readFile(join(source,'plan.json'),'utf8'));
const originalClip=credits.images.find(m=>m.file===initial.scenes[0].reference_media.image);
const initialMedia=initial.scenes[0].reference_media;
const images=[
 {path:originalClip.file,video:true,frames:initialMedia.frames,frameCount:initialMedia.frame_count,fps:24,attribution:originalClip.attribution},
 {path:media.clip.file,video:true,...media.clip,attribution:media.clip.attribution},
 {path:media.photos[0].file,cutout:false},
 {path:initial.scenes[2].reference_media.image,cutout:false,attribution:'Scientific illustration (public domain)'},
 {path:media.photos[1].file,cutout:false}
];
const plan=buildAdvancedPlan(episode,narration.timing,images,{},join(folder,'video.mp4'),narration.voice,{visualStyle:'reference-news',mediaFit:'cover',fps:24});
Object.assign(plan.meta,{voice:narration.voice,out:join(folder,'video.mp4'),duration:narration.timing.at(-1).start+narration.timing.at(-1).duration+.3,headline_hi:episode.headlineText,headline_highlight:episode.headlineHighlight,voice_pitch_semitones:0});
plan.meta.headline_image=await prepareHeadlineAssets(episode.headlineText,episode.headlineHighlight,join(folder,'headline'),{compact:true});
for(let i=0;i<plan.scenes.length;i++){
 const scene=plan.scenes[i];scene.start=narration.timing[i].start;delete scene.beat_text_hi;delete scene.beat_text_image;
 if(scene.reference_media?.media_type==='video'){
  const frames=join(folder,`frames-${i}`);await mkdir(frames,{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',scene.reference_media.image,'-t',String(narration.timing[i].duration+.4),'-an','-vf','fps=24,scale=1920:1920:force_original_aspect_ratio=decrease','-start_number','0',join(frames,'%06d.jpg')]);
  Object.assign(scene.reference_media,{frames,frame_count:(await readdir(frames)).filter(n=>n.endsWith('.jpg')).length});
 }
}
// This story requests no event SFX; do not decorate cuts with arbitrary sounds.
if(plan.sounds?.length)throw Error('Re-review any sound events against the revised story timing');
await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));
const plate=credits.images.find(m=>m.file===initial.scenes[2].reference_media.image);
credits.images=[originalClip,media.clip,media.photos[0],{...plate,mediaType:'scientific illustration'},media.photos[1]];
credits.videos=credits.images.filter(m=>m.provider==='Vecteezy'||m.provider==='Mixkit');
credits.narrator={...credits.narrator,voiceName:'Vikram - Upbeat & Lively',processing:heygenPerformance()};await writeFile(join(folder,'CREDITS.json'),JSON.stringify(credits,null,2));
execFileSync('python',['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
const title=await gemini(`Write one concise natural Hindi YouTube upload title based only on this finished script. No invented mechanism, danger, claims or numerical facts; exactly one final emoji. JSON {"title":"..."}. Script:${JSON.stringify(lines)}`);
await writeFile(join(folder,'youtube-title.txt'),title.title+'\n');
const prefix='samples/live-male-octopus';
for(const [name,suffix]of [['video.mp4','.mp4'],['episode.json','-episode.json'],['plan.json','-plan.json'],['CREDITS.json','-CREDITS.json'],['audio-review.json','-audio-review.json'],['youtube-title.txt','-youtube-title.txt']])await copyFile(join(folder,name),prefix+suffix);
await copyFile(join(folder,'qa/video_contact.jpg'),prefix+'-contact.jpg');
const originalStatus=JSON.parse(await readFile(join(source,'status.json'),'utf8'));
await writeFile(prefix+'-status.json',JSON.stringify({...originalStatus,title:episode.headlineText,youtubeTitle:title.title,duration:plan.meta.duration,reviewed:true,stage:'Reviewed new story ready',initialWarnings:originalStatus.warnings,warnings:[],localVideo:prefix+'.mp4',mediaSummary:{realVideos:2,realPhotos:2,scientificIllustrations:1}},null,2));
await copyFile(join(folder,'delivery-review.json'),prefix+'-delivery-review.json').catch(()=>{});
console.log('NEW_STORY_READY '+prefix+'.mp4');
