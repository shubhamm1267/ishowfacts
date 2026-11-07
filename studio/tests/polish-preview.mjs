// Reuse owned sample narration; reacquire source originals for HD review.
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareHeadlineAssets,preparePointerAssets} from '../lib/reference-style.mjs';
import {prepareExplainers} from '../lib/explainer.mjs';
import {gemini,inspectFocus,inspectVideoFrames,commonsImage} from '../lib/core.mjs';
import {stockVideo} from '../lib/stock-video.mjs';

const folder=resolve('studio/jobs/polished-hq-preview');await mkdir(folder,{recursive:true});
const old=resolve('studio/jobs/reference-layout-preview');
const plan=JSON.parse(await readFile(join(old,'clean-plan.json'),'utf8'));
const episode=JSON.parse(await readFile(join(old,'clean-episode.json'),'utf8'));
const headline='समुद्र की लहरें बनती कैसे हैं? 🤔';
plan.meta.headline_hi=headline;plan.meta.headline_highlight='समुद्र की';
plan.meta.headline_image=await prepareHeadlineAssets(headline,'समुद्र की',join(folder,'headline'));
plan.meta.out=join(folder,'video.mp4');plan.meta.media_fit='cover';
const credits=[{id:'vecteezy:68545203',provider:'Vecteezy',source:'https://www.vecteezy.com/video/68545203',author:'Rus Wandi',license:'Vecteezy Free License',licenseUrl:'https://www.vecteezy.com/licensing-agreement',requiresAttribution:true,attribution:'Video: Rus Wandi / Vecteezy.com'}];const used=new Set(['vecteezy:68545203']);
async function frames(file,i){
 const target=join(folder,`frames-${i}`);await mkdir(target,{recursive:true});
 const end=plan.scenes[i+1]?.start??plan.meta.duration-.45,duration=end-plan.scenes[i].start;
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file],{encoding:'utf8'}));
 if(Math.min(info.streams[0].width,info.streams[0].height)<1080)return null;
 execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',file,'-t',String(duration+.5),'-an','-vf','fps=24,scale=1920:1920:force_original_aspect_ratio=decrease','-start_number','0',join(target,'%06d.jpg')]);
 const files=(await readdir(target)).filter(n=>n.endsWith('.jpg')).sort();
 const checks=[.12,.5,.85].map(f=>join(target,files[Math.min(files.length-1,Math.floor(duration*24*f))]));
 if(!await inspectVideoFrames(checks,'ocean waves',episode.scenes[i].narration,'Wind wave'))return null;
 return {frames:target,frame_count:files.length,video_fps:24};
}
console.log('Rebuilding first clip from its 1080p original');
const original=resolve('studio/jobs/stock-video-check/sample-clip.mp4');
Object.assign(plan.scenes[0].reference_media,await frames(original,0));
console.log('Finding a second HD source (720p sources rejected)');
const second=await stockVideo('ocean surf',join(folder,'second.mp4'),{used,inspect:async item=>frames(item.file,3)});
if(!second)throw Error('No second HD free clip available');
plan.scenes[3].reference_media={...plan.scenes[3].reference_media,...second,media_type:'video',image:second.file,pointer:null,attribution:second.requiresAttribution?second.attribution:''};credits.push(second);
for(const [i,query]of [[1,'breaking ocean wave'],[4,'storm ocean wave']]){
 console.log(`Selecting high-resolution photo ${i+1}`);let accepted;
 const target=join(folder,`photo-${i}.jpg`);
 for(let n=0;n<3;n++){
  const photo=await commonsImage(query,target,used);if(!photo)break;used.add(photo.title);
  if(!await inspectVideoFrames([target],'ocean wave',episode.scenes[i].narration,'Wind wave'))continue;
  accepted=photo;break;
 }
 if(!accepted)throw Error('No high-quality relevant photo found');
 const focus=i===1?await inspectFocus(target,'the visible crest of a breaking ocean wave',episode.scenes[i].narration):[];
 plan.scenes[i].reference_media={...plan.scenes[i].reference_media,image:target,pointer:focus.length?{target:'wave crest',label:'लहर',kind:'arrow',at:.3,tracks:focus}:null};credits.push(accepted);
}
// The single narrated definition needs a visual explanation; no diagrams
// replace the other four actual-media shots.
const s=plan.scenes[2];s.title=['',''];s.camera='static';s.elements=[{type:'infographic',professional:true,heading:'लहरों को हवा कैसे बढ़ाती है?',style:'mechanism',
 nodes:[{label:'हवा की दिशा',detail:'पानी के ऊपर बहती हवा',icon:'wind'},{label:'संपर्क की दूरी',detail:'इसी दूरी को फेच कहते हैं',icon:'water'}],
 links:[{from:0,to:1,label:'पानी के ऊपर का रास्ता'}],at:0}];
await prepareExplainers(plan,folder);await preparePointerAssets(join(folder,'pointers'));plan.meta.pointer_assets=join(folder,'pointers');
await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));
await writeFile(join(folder,'CREDITS.json'),JSON.stringify({source:episode.research,media:credits,review:'Reviewed HD demonstration, original narration reused.'},null,2));
execFileSync('python',['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
await copyFile(join(folder,'video.mp4'),resolve('samples/polished-hq-sample.mp4'));
await copyFile(join(folder,'qa/video_contact.jpg'),resolve('samples/polished-hq-sample-contact.jpg'));
await copyFile(join(folder,'CREDITS.json'),resolve('samples/polished-hq-sample-CREDITS.json'));
console.log('HQ_SAMPLE_READY samples/polished-hq-sample.mp4');
