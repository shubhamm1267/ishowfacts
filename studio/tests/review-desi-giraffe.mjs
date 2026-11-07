// Editorial review of THIS fresh run, never imports earlier sample media/story.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {makeVoice} from '../server.mjs';
import {auditHindiEpisode,auditHindiNarration,gemini} from '../lib/core.mjs';
import {prepareHeadlineAssets} from '../lib/reference-style.mjs';
import {heygenPerformance} from '../lib/heygen.mjs';
const run=JSON.parse(await readFile('studio/jobs/live-desi-giraffe/run.json','utf8'));
const source=resolve('studio/jobs/live-desi-giraffe',run.id),folder=join(source,'reviewed');await mkdir(folder,{recursive:true});
const episode=JSON.parse(await readFile(join(source,'episode.json'),'utf8'));
const lines=[
 'भाई, क्या तुम्हें पता है कि ज़मीन पर सबसे ऊँचा जानवर कौन है?',
 'जिराफ! समझो, जंगल का लंबू भाई—उसकी गर्दन और टाँगें, दोनों लंबी हैं।',
 'वो बबूल जैसे पेड़ों के पत्ते, फल और फूल खाता है।',
 'और इतनी ऊँचाई पर खाता है, जहाँ ज़्यादातर दूसरे शाकाहारी पहुँच ही नहीं पाते!',
 'लेकिन गर्दन सिर्फ खाने के लिए नहीं! नर जिराफ इससे एक-दूसरे पर वार भी करते हैं।',
 'इन मुकाबलों से तय होता है कि किस नर का दबदबा रहेगा। अरे, पूरा गर्दन वाला दंगल है!'
];
if(episode.scenes.length!==6)throw Error('This fresh run must have six scenes');
episode.headlineText='जिराफ की गर्दन का डबल काम 😲';episode.headlineHi=episode.headlineText;episode.headlineHighlight='जिराफ की';episode.title=episode.headlineText;
episode.facts=[
 'जिराफ सबसे ऊँचे जीवित ज़मीनी जानवर हैं और उनकी गर्दन व टाँगें लंबी होती हैं।',
 'जिराफ मुख्यतः बबूल जैसे पेड़ों के पत्ते, फल और फूल खाते हैं; वे ऐसी ऊँचाइयों पर खाते हैं जहाँ अधिकांश दूसरे ज़मीन पर रहने वाले शाकाहारी नहीं पहुँच पाते।',
 'नर जिराफ अपनी गर्दन को हथियार बनाकर मुकाबले करते हैं और इन मुकाबलों से उनका आपसी दबदबा तय होता है।'
];
const captions=[['सबसे ऊँचा','ज़मीनी जानवर'],['जिराफ का कद','लंबी गर्दन'],['पेड़ों का खाना','पत्ते और फल'],['ऊँची पहुँच','खाने का फायदा'],['गर्दन से मुकाबला','नर जिराफ'],['किसका दबदबा','गर्दन वाला दंगल']];
episode.scenes.forEach((s,i)=>{s.narration=lines[i];s.line1=captions[i][0];s.line2=captions[i][1];s.beatTextHi='';s.callout='';s.soundCue='';s.sfxQuery='';s.sfxReason='';s.pointOut=null;});
await auditHindiEpisode(episode,episode.research);
let narration;
if(process.env.REUSE_DESI_VOICE==='1'){
 const saved=JSON.parse(await readFile(join(folder,'episode.json'),'utf8'));
 if(JSON.stringify(saved.scenes.map(s=>s.narration))!==JSON.stringify(lines))throw Error('Voice script changed; generate matching narration');
 narration=JSON.parse(await readFile(join(folder,'timing.json'),'utf8'));
}else narration=await makeVoice(episode,'hi-IN-anuj','energetic',folder,'heygen');
await writeFile(join(folder,'episode.json'),JSON.stringify(episode,null,2));
await writeFile(join(folder,'timing.json'),JSON.stringify(narration,null,2));
await writeFile(join(folder,'audio-review.json'),JSON.stringify(await auditHindiNarration(narration.voice,episode),null,2));
console.log('New desi narration passed; waiting for this fresh job media');
while(true){const status=JSON.parse(await readFile(join(source,'status.json'),'utf8'));if(status.status==='failed')throw Error(status.error);if(status.status==='complete')break;await new Promise(ok=>setTimeout(ok,3000));}
const plan=JSON.parse(await readFile(join(source,'plan.json'),'utf8'));
const combat=JSON.parse(await readFile(join(folder,'combat-credit.json'),'utf8'));
// The first landscape clip crops its subject out in portrait. Lead with this
// run's sharp full-height portrait instead, and close on actual neck combat.
plan.scenes[0].reference_media=structuredClone(plan.scenes[5].reference_media);
plan.scenes[0].reference_media.camera='static';
plan.scenes[5].reference_media={...structuredClone(plan.scenes[5].reference_media),image:combat.file,media_type:'photo',camera:'pull'};
Object.assign(plan.meta,{voice:narration.voice,out:join(folder,'video.mp4'),headline_hi:episode.headlineText,headline_highlight:episode.headlineHighlight,title:episode.title,facts:episode.facts,duration:narration.timing.at(-1).start+narration.timing.at(-1).duration+.3,voice_pitch_semitones:0});
plan.meta.headline_image=await prepareHeadlineAssets(episode.headlineText,episode.headlineHighlight,join(folder,'headline'),{compact:true});
for(const [i,scene]of plan.scenes.entries()){
 scene.start=narration.timing[i].start;delete scene.beat_text_hi;delete scene.beat_text_image;
 if(!scene.reference_media)throw Error('Fresh scene '+i+' needs a reviewed real visual, not an empty fallback');
 delete scene.reference_media.pointer;
 if(scene.reference_media.media_type==='video'){
  const frames=join(folder,`frames-${i}`);await mkdir(frames,{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',scene.reference_media.image,'-t',String(narration.timing[i].duration+.4),'-an','-vf','fps=24,scale=1920:1920:force_original_aspect_ratio=decrease','-start_number','0',join(frames,'%06d.jpg')]);
  Object.assign(scene.reference_media,{frames,frame_count:(await readdir(frames)).filter(n=>n.endsWith('.jpg')).length});
 }
}
plan.sounds=[];plan.meta.sfx_map={};plan.meta.whoosh_db=null;
await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));
const credits=JSON.parse(await readFile(join(source,'CREDITS.json'),'utf8'));
const usedFiles=new Set(plan.scenes.map(s=>s.reference_media.image));credits.images=credits.images.filter(m=>usedFiles.has(m.file));credits.images.push(combat);credits.videos=credits.images.filter(m=>m.mediaType==='video');
credits.narrator={...credits.narrator,voiceName:'Vikram - Upbeat & Lively',processing:heygenPerformance()};credits.soundEffects=[];await writeFile(join(folder,'CREDITS.json'),JSON.stringify(credits,null,2));
execFileSync('python',['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
console.log('Reviewed render started');const renderStarted=Date.now();
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
const title=await gemini(`Write ONE short natural Hindi YouTube upload title ONLY for this finished story. No invented danger or "खौफनाक", no evolutionary why claim, and exactly one final emoji. JSON {"title":"..."}. Script:${JSON.stringify(lines)}`);
await writeFile(join(folder,'youtube-title.txt'),title.title+'\n');
const prefix='samples/live-desi-giraffe';
for(const [file,suffix]of [['video.mp4','.mp4'],['episode.json','-episode.json'],['plan.json','-plan.json'],['CREDITS.json','-CREDITS.json'],['audio-review.json','-audio-review.json'],['youtube-title.txt','-youtube-title.txt']])await copyFile(join(folder,file),prefix+suffix);
await copyFile(join(folder,'qa/video_contact.jpg'),prefix+'-contact.jpg');
const status=JSON.parse(await readFile(join(source,'status.json'),'utf8'));
await writeFile(prefix+'-status.json',JSON.stringify({...status,title:episode.title,youtubeTitle:title.title,duration:plan.meta.duration,editoriallyReviewed:true,stage:'Reviewed desi sample ready',localVideo:prefix+'.mp4',initialWarnings:status.warnings,warnings:[]},null,2));
await writeFile(prefix+'-reviewed-performance.json',JSON.stringify({renderSeconds:Math.round((Date.now()-renderStarted)/100)/10,includes:'render and upload-title generation',automaticJob:status.performance,editoriallyReviewed:true},null,2));
console.log('DESI_READY '+prefix+'.mp4');
