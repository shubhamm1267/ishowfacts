// Finish and review this turn's freshly generated live assets. No earlier
// sample footage, script, narration or SFX is reused.
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gemini,cartesiaVoice,auditHindiEpisode,auditHindiNarration,freesound,auditSoundCue} from '../lib/core.mjs';
import {prepareHeadlineAssets} from '../lib/reference-style.mjs';
const run=JSON.parse(await readFile('studio/jobs/live-soap-bubbles/run.json','utf8'));
const folder=resolve('studio/jobs/live-soap-bubbles',run.id),out=join(folder,'reviewed');await mkdir(out,{recursive:true});
const original=JSON.parse(await readFile(join(folder,'episode.json'),'utf8')),oldPlan=JSON.parse(await readFile(join(folder,'plan.json'),'utf8'));
const keep=[0,1,3,5,6],episode={...original,scenes:keep.map(i=>structuredClone(original.scenes[i]))};
episode.scenes[0].narration='क्या तुमने कभी सोचा है, साबुन के बुलबुले के अंदर क्या होता है?';
episode.headlineText='बुलबुले के अंदर क्या होता है? 🤔';episode.headlineHi=episode.headlineText;episode.headlineHighlight='बुलबुले के';
// The old hook asked why the sphere is round, which the short source does not
// explain. Ask only the question the retained narration actually answers.
const copy=await gemini(`Proofread ONLY the following opening and headline. The rest of the actual source-backed video says a soap bubble is a thin soap/water film enclosing air, lasts briefly, may burst, is used in play, and many bubbles form foam. Ask WHAT is inside, not WHY it is round; the source does not explain roundness. Return JSON {"narration":"...","headline":"..."}. Natural correct Hindi; headline 4-7 short words and final 🤔. Draft:${JSON.stringify({narration:episode.scenes[0].narration,headline:episode.headlineText})}`);
episode.scenes[0].narration=copy.narration;episode.headlineText=copy.headline;episode.headlineHi=copy.headline;
episode.scenes.forEach(s=>{s.beatTextHi='';s.soundCue='';s.sfxQuery='';s.sfxReason='';});
episode.scenes[2].soundCue='pop';episode.scenes[2].sfxQuery='bubble pop';episode.scenes[2].sfxReason='A quiet bubble pop illustrates the narrated bursting, not an unrelated transition.';episode.scenes[2].sfxAt=.77;
await auditHindiEpisode(episode,original.research);
const newVoice=join(out,'voice-0.wav');await cartesiaVoice(episode.scenes[0].narration,'hi-IN-anuj',newVoice,{delivery:'hook'});
const voiceFiles=keep.map((index,i)=>i===0?newVoice:join(folder,'assets',`voice_${String(index).padStart(2,'0')}.wav`));
const durations=voiceFiles.map(file=>Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{encoding:'utf8'})));
await writeFile(join(out,'voices.txt'),voiceFiles.map(v=>`file '${v.replaceAll('\\','/')}'`).join('\n'));
const voice=join(out,'narration.wav');execFileSync('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',join(out,'voices.txt'),'-ac','1','-ar','44100',voice]);
const review=await auditHindiNarration(voice,episode);await writeFile(join(out,'audio-review.json'),JSON.stringify(review,null,2));
const plan={...oldPlan,meta:{...oldPlan.meta,headline_hi:episode.headlineText,headline_highlight:'बुलबुले के',voice,out:join(out,'video.mp4'),duration:durations.reduce((a,b)=>a+b,0)+.3,sfx_map:{},whoosh_db:null},scenes:keep.map(i=>structuredClone(oldPlan.scenes[i])),sounds:[]};
plan.meta.headline_image=await prepareHeadlineAssets(episode.headlineText,'बुलबुले के',join(out,'headline'),{compact:true});
let start=0;
for(let i=0;i<5;i++){
 const scene=plan.scenes[i];scene.start=start;start+=durations[i];scene.title=['',''];delete scene.beat_text_hi;delete scene.beat_text_image;
 if(i===0){
  const frames=join(out,'frames-0');await mkdir(frames,{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',join(folder,'assets/clip_0.mp4'),'-t',String(durations[0]+.3),'-an','-vf','fps=24,scale=1920:1920:force_original_aspect_ratio=decrease','-start_number','0',join(frames,'%06d.jpg')]);
  scene.reference_media.frames=frames;scene.reference_media.frame_count=(await readdir(frames)).filter(n=>n.endsWith('.jpg')).length;
 }
}
const credits=JSON.parse(await readFile(join(folder,'CREDITS.json'),'utf8'));
credits.images=credits.images.filter(item=>!['image_2.jpg','image_3.jpg'].some(s=>item.file?.endsWith(s)));credits.soundEffects=[];
// A fourth photo from the automatic run was genuinely below HD. Keep the
// narrated bursting beat with the freshly acquired sharp film macro instead
// of claiming a still visibly proves the moment of popping.
plan.scenes[2].reference_media={...plan.scenes[1].reference_media,camera:'pull'};
const cue=await freesound('pop',join(out,'bubble-pop.mp3'),'bubble pop',{strict:true});
if(!cue)throw Error('No correctly labelled CC0 bubble pop available');
if(!await auditSoundCue(cue.file,episode.scenes[2]))throw Error('Bubble cue failed actual audio relevance review');
credits.soundEffects.push(cue);plan.meta.sfx_map.pop=cue.file;
plan.sounds=[{t:plan.scenes[2].start+durations[2]*.77,sfx:'pop',db:-22,trim:.55}];
await writeFile(join(out,'plan.json'),JSON.stringify(plan,null,2));await writeFile(join(out,'episode.json'),JSON.stringify(episode,null,2));await writeFile(join(out,'CREDITS.json'),JSON.stringify(credits,null,2));
execFileSync('python',['scripts/paper_doc.py','contact',join(out,'plan.json'),join(out,'qa')],{stdio:'inherit'});
execFileSync('python',['scripts/paper_doc.py','render',join(out,'plan.json')],{stdio:'inherit'});
const title=await gemini(`Write one concise natural Hindi YouTube upload title based only on this finished narration. One final emoji, no false promise or why-round claim. JSON {"title":"..."}. Narration:${JSON.stringify(episode.scenes.map(s=>s.narration))}`);
await writeFile(join(out,'youtube-title.txt'),title.title+'\n');
for(const [file,suffix]of [['video.mp4','.mp4'],['plan.json','-plan.json'],['episode.json','-episode.json'],['CREDITS.json','-CREDITS.json'],['audio-review.json','-voice-review.json'],['youtube-title.txt','-youtube-title.txt']])await copyFile(join(out,file),'samples/live-soap-bubbles'+suffix);
await copyFile(join(out,'qa/video_contact.jpg'),'samples/live-soap-bubbles-contact.jpg');
console.log('REVIEWED_LIVE_READY samples/live-soap-bubbles.mp4');
