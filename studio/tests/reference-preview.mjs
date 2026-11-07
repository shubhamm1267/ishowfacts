// Reviewed style sample using original project narration and fresh varied media.
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { stockVideo } from '../lib/stock-video.mjs';
import { commonsImage, inspectImage, inspectFocus, gemini } from '../lib/core.mjs';
import { buildAdvancedPlan } from '../lib/director.mjs';
import { preparePointerAssets } from '../lib/reference-style.mjs';

const folder=resolve('studio/jobs/reference-layout-preview');await mkdir(folder,{recursive:true});
const old=resolve('studio/jobs/ocean-mixed-sample');
const episode=JSON.parse(await readFile(join(old,'episode.json'),'utf8'));
const oldPlan=JSON.parse(await readFile(join(old,'plan.json'),'utf8'));
const timing=episode.scenes.map((_,i)=>({start:oldPlan.scenes[i].start,duration:(oldPlan.scenes[i+1]?.start??oldPlan.meta.duration-.45)-oldPlan.scenes[i].start}));
const fps=24,media=Array(episode.scenes.length).fill(null),credits=[];
const used=new Set(['vecteezy:68545203']);
async function prepareClip(item,i){
 const frames=join(folder,`frames_${i}`);await mkdir(frames,{recursive:true});
 execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',item.file,'-t',String(timing[i].duration+.5),'-an','-vf',`fps=${fps},scale=960:-2`,'-start_number','0',join(frames,'%06d.jpg')]);
 const files=(await readdir(frames)).filter(n=>n.endsWith('.jpg')).sort();
 const sample=[.12,.5,.85].map(f=>join(frames,files[Math.min(files.length-1,Math.floor(timing[i].duration*fps*f))]));
 for(const path of sample){const qa=await inspectImage(path,'ocean waves',episode.scenes[i].narration,[],{topic:'Wind wave'});if(!qa.matches||qa.confidence<.75)return null;}
 const focus=await inspectFocus(sample,'a clearly visible crest of a breaking ocean wave',episode.scenes[i].narration);
 return {frames,fps,frameCount:files.length,width:1920,height:1080,focus};
}
console.log('Reviewing first ocean clip');
const first={file:resolve('studio/jobs/stock-video-check/sample-clip.mp4'),provider:'Vecteezy',source:'https://www.vecteezy.com/video/68545203',license:'Vecteezy Free License',author:'Rus Wandi',attribution:'Video: Rus Wandi / Vecteezy.com'};
const prepared=await prepareClip(first,0);if(!prepared)throw Error('First clip failed review');
media[0]={...prepared,path:first.file,video:true,attribution:first.attribution};credits.push(first);
episode.scenes[0].pointOut={target:'visible wave crest',label:'लहर का शिखर',kind:'arrow',at:.28};
console.log('Finding a different clip (original source excluded)');
const second=await stockVideo('sea waves',join(folder,'second-clip.mp4'),{used,inspect:item=>prepareClip(item,3)});
if(!second)throw Error('No second distinct free clip found');
media[3]={...second,path:second.file,video:true,attribution:second.attribution||''};credits.push(second);
episode.scenes[3].pointOut={target:'visible wave crest',label:'समुद्री लहर',kind:'circle',at:.3};
for(const [i,query] of [[1,'ocean breaking wave'],[4,'large ocean wave']]){
 console.log(`Selecting distinct photograph for shot ${i+1}`);
 const dest=join(folder,`photo_${i}.jpg`);
 let chosen;
 for(let attempt=0;attempt<3;attempt++){
  const image=await commonsImage(query,dest,used);if(!image)break;used.add(image.title);
  const qa=await inspectImage(dest,'ocean wave',episode.scenes[i].narration,[],{topic:'Wind wave'});
  if(!qa.matches||qa.confidence<.75)continue;
  const focus=await inspectFocus(dest,'the clearly visible top crest of the ocean wave',episode.scenes[i].narration);
  chosen={path:dest,focus};credits.push(image);break;
 }
 if(!chosen)throw Error('No suitable distinct wave photo for shot '+i);
 media[i]=chosen;episode.scenes[i].visual='photo';episode.scenes[i].diagram=null;
 episode.scenes[i].pointOut={target:'wave crest',label:'लहर',kind:'arrow',at:.3};
}
for(const scene of episode.scenes){scene.effects=[];scene.beatTextHi='';}
const plan=buildAdvancedPlan(episode,timing,media,oldPlan.meta.sfx_map,join(folder,'video.mp4'),oldPlan.meta.voice,{fps,visualStyle:'reference-news',backgroundPalette:'white',seed:20261104});
await preparePointerAssets(join(folder,'pointers'));plan.meta.pointer_assets=join(folder,'pointers');
await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));
await writeFile(join(folder,'episode.json'),JSON.stringify(episode,null,2));
await writeFile(join(folder,'CREDITS.json'),JSON.stringify({media:credits,source:episode.research,scope:'Reviewed preview of new reference layout; original Hindi narration reused. Two distinct clips and two distinct photographs.'},null,2));
execFileSync(process.env.PYTHON||'python',['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
execFileSync(process.env.PYTHON||'python',['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
const title=await gemini(`Write one YouTube Shorts title in natural Hindi, max90 characters, only claims from these narration lines, no false danger or invented figures. JSON {"title":"..."}. ${JSON.stringify(episode.scenes.map(s=>s.narration))}`);
await writeFile(join(folder,'youtube-title.txt'),String(title.title||episode.title)+'\n');
for(const [file,suffix]of [['video.mp4','.mp4'],['youtube-title.txt','-youtube-title.txt'],['qa/video_contact.jpg','-contact.jpg'],['episode.json','-episode.json'],['CREDITS.json','-CREDITS.json']])await copyFile(join(folder,file),resolve('samples/reference-layout-sample'+suffix));
console.log('REFERENCE_SAMPLE_READY samples/reference-layout-sample.mp4');
