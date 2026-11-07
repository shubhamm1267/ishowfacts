import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {makeVoice} from '../server.mjs';
import {auditHindiEpisode,auditHindiNarration} from '../lib/core.mjs';
import {prepareHeadlineAssets} from '../lib/reference-style.mjs';
import {DEFAULT_HEYGEN_VOICE,heygenPerformance} from '../lib/heygen.mjs';
const sampleName=process.env.HEYGEN_SAMPLE_NAME||'heygen-energetic';
if(!/^heygen-[a-z0-9-]+$/.test(sampleName))throw Error('Invalid sample name');
const prefix=join('samples',sampleName);
const folder=resolve('studio/jobs',sampleName==='heygen-energetic'?'heygen-project-preview':sampleName);await mkdir(folder,{recursive:true});
const episode=JSON.parse(await readFile('samples/live-soap-bubbles-episode.json','utf8'));
episode.humorIntensity='edgy';
episode.scenes[0].narration='कभी सोचा है, साबुन का बुलबुला आखिर होता क्या है?';
episode.scenes[1].narration='अरे साला, दिखता पूरा जादू है! पर यह साबुन और पानी की बेहद पतली परत है, जिसके अंदर हवा होती है।';
episode.scenes[1].delivery='reveal';
episode.headlineText='बुलबुला आखिर होता क्या है? 🤔';episode.headlineHi=episode.headlineText;episode.headlineHighlight='बुलबुला आखिर';
await auditHindiEpisode(episode,episode.research);
console.log('Generating five new HeyGen scenes through the project voice pipeline');
let narration;
if(process.env.REUSE_HEYGEN_PREVIEW==='1'){
 let t=0;const timing=episode.scenes.map((_,i)=>{const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',join(folder,`voice_${String(i).padStart(2,'0')}.wav`)],{encoding:'utf8'}));const item={start:t,duration};t+=duration;return item;});
 narration={voice:join(folder,'narration.wav'),timing};
}else narration=await makeVoice(episode,'hi-IN-anuj','energetic',folder,'heygen');
await writeFile(join(folder,'audio-review.json'),JSON.stringify(await auditHindiNarration(narration.voice,episode),null,2));
const plan=JSON.parse(await readFile('samples/live-soap-bubbles-plan.json','utf8'));
Object.assign(plan.meta,{voice:narration.voice,out:join(folder,'video.mp4'),duration:narration.timing.at(-1).start+narration.timing.at(-1).duration+.3,headline_hi:episode.headlineText,headline_highlight:episode.headlineHighlight,voice_pitch_semitones:0});
plan.meta.headline_image=await prepareHeadlineAssets(episode.headlineText,episode.headlineHighlight,join(folder,'headline'),{compact:true});
for(let i=0;i<plan.scenes.length;i++){
 const scene=plan.scenes[i];scene.start=narration.timing[i].start;
 if(scene.reference_media?.media_type==='video'){
  const original=scene.reference_media.image,frames=join(folder,`frames-${i}`);await mkdir(frames,{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',original,'-t',String(narration.timing[i].duration+.4),'-an','-vf','fps=24,scale=1920:1920:force_original_aspect_ratio=decrease','-start_number','0',join(frames,'%06d.jpg')]);
  Object.assign(scene.reference_media,{frames,frame_count:(await readdir(frames)).filter(n=>n.endsWith('.jpg')).length});
 }
}
plan.sounds=plan.sounds.map(s=>({...s,t:narration.timing[2].start+narration.timing[2].duration*.77}));
await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));await writeFile(join(folder,'episode.json'),JSON.stringify(episode,null,2));
execFileSync('python',['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
for(const [file,suffix]of [['video.mp4','.mp4'],['episode.json','-episode.json'],['audio-review.json','-audio-review.json']])await copyFile(join(folder,file),prefix+suffix);
await copyFile(join(folder,'qa/video_contact.jpg'),prefix+'-contact.jpg');
const credits=JSON.parse(await readFile('samples/live-soap-bubbles-CREDITS.json','utf8'));credits.narrator={provider:'HeyGen',model:'heygen-voice-1-turbo-free',voiceId:process.env.HEYGEN_VOICE_HI_ID||DEFAULT_HEYGEN_VOICE,name:process.env.HEYGEN_SAMPLE_VOICE_NAME||'Configured public voice',style:'energetic',processing:heygenPerformance({},'energetic','hi')};await writeFile(prefix+'-CREDITS.json',JSON.stringify(credits,null,2));
console.log('READY '+prefix+'.mp4');
