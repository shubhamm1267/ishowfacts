// Reviewed reference-template preview: new proofread Hindi speech, existing
// licensed original media; no footage/logo copied from the reference creator.
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Resvg} from '@resvg/resvg-js';
import {gemini,auditHindiEpisode,auditHindiNarration,cartesiaVoice} from '../lib/core.mjs';
import {prepareHeadlineAssets,prepareOverlayTextAssets} from '../lib/reference-style.mjs';
import {prepareExplainers} from '../lib/explainer.mjs';

const folder=resolve('studio/jobs/reference-3x4-preview');await mkdir(folder,{recursive:true});
const plan=JSON.parse(await readFile('studio/jobs/polished-hq-preview/plan.json','utf8'));
const source=JSON.parse(await readFile('samples/polished-hq-sample-CREDITS.json','utf8')).source;
const episode={title:'हवा और समुद्र की लहरें',headlineText:'हवा लहरें कैसे बनाती है? 🤔',headlineHighlight:'हवा लहरें',facts:[
 'हवा पानी की सतह को ऊर्जा देकर लहरें पैदा करती है।','हवा की दिशा में पानी से उसके संपर्क की दूरी को फेच कहते हैं।','लहरें हज़ारों किलोमीटर चल सकती हैं और उनका आकार हवा तथा पानी की गहराई पर निर्भर करता है।'],
 scenes:[
 {narration:'क्या तुमने कभी सोचा है, हवा समुद्र में लहरें कैसे बनाती है?',delivery:'hook',line1:'हवा और लहरें',line2:'कैसे बनती हैं'},
 {narration:'हवा पानी की सतह को ऊर्जा देती है। समझो, पानी की डांस क्लास शुरू!',delivery:'reveal',line1:'हवा की ऊर्जा',line2:'पानी में हलचल'},
 {narration:'पानी की सतह पर हवा के बहने की दूरी को फेच कहते हैं।',delivery:'explain',line1:'हवा के संपर्क में',line2:'पानी की सतह'},
 {narration:'ये लहरें किनारे तक पहुँचने से पहले हज़ारों किलोमीटर चल सकती हैं।',delivery:'reveal',line1:'लहरों का सफर',line2:'हज़ारों किलोमीटर'},
 {narration:'लहरों का आकार हवा की रफ़्तार और पानी की गहराई पर भी निर्भर करता है।',delivery:'payoff',line1:'लहरों का आकार',line2:'कई बातों पर निर्भर'}
 ]};
console.log('Native Hindi copyedit and independent final-copy review');
let corrected,problem='';
for(let attempt=0;attempt<3;attempt++){
 corrected=await gemini(`Proofread the provided Hindi JSON with a native editor's care. Keep EXACTLY five scenes, their order and meanings. Check natural spelling, grammar, matras and source-backed terminology, especially fetch meaning contact distance in wind direction. Keep the opening question and clearly figurative harmless dance-class joke; no invented physical facts. Preserve all JSON fields and delivery values. Every user-facing string must be natural Hindi. Return the WHOLE corrected JSON. SOURCE:${source.extract}\nDRAFT:${JSON.stringify(corrected||episode)}\nREPAIR REQUIRED:${problem}`);
 if(corrected.scenes?.length!==5)throw Error('Copyeditor changed scene count');
 try{await auditHindiEpisode(corrected,source);problem='';break;}catch(e){problem=e.message;console.log('Review requests correction:',problem);}
}
if(problem)throw Error(problem);
await writeFile(join(folder,'episode.json'),JSON.stringify(corrected,null,2));
console.log('Generating fresh expressive Hindi narration');
let next=0;const voices=Array(5),durations=Array(5);
await Promise.all([0,1].map(async()=>{while(next<5){
 const i=next++,file=join(folder,`voice-${i}.wav`),transcript=corrected.scenes[i].narration;
 let reused=false;try{reused=(await readFile(file+'.txt','utf8'))===transcript;}catch{}
 if(!reused){
  for(let attempt=0;attempt<2;attempt++)try{await cartesiaVoice(transcript,'hi-IN-ayush',file,corrected.scenes[i]);break;}catch(e){if(attempt)throw e;console.log(`Retrying voice ${i+1} after provider timeout/error`);}
  await writeFile(file+'.txt',transcript);
 }
 voices[i]=file;durations[i]=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{encoding:'utf8'}));
}}));
await writeFile(join(folder,'voice-list.txt'),voices.map(v=>`file '${v.replaceAll('\\','/')}'`).join('\n'));
const voice=join(folder,'narration.wav');execFileSync('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',join(folder,'voice-list.txt'),'-ac','1','-ar','44100',voice]);
await writeFile(join(folder,'audio-review.json'),JSON.stringify(await auditHindiNarration(voice,corrected),null,2));
plan.meta.voice=voice;plan.sounds=[];plan.meta.size=[1080,1440];plan.meta.headline_height=62;plan.meta.template='reference-3x4';plan.meta.duration=durations.reduce((a,b)=>a+b,0)+.3;plan.meta.out=join(folder,'video.mp4');
plan.meta.headline_hi=corrected.headlineText;plan.meta.headline_highlight=corrected.headlineHighlight;
plan.meta.headline_image=await prepareHeadlineAssets(corrected.headlineText,corrected.headlineHighlight,join(folder,'headline'),{compact:true});
// Original neutral sample mark, deliberately not the reference creator's logo.
const demoLogo=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="212" height="216"><rect width="212" height="216" fill="#F0E82E"/><path d="M43 143V54h65q47 0 47 37t-47 37H73v15Zm30-41h33q18 0 18-12t-18-12H73Z" fill="#24373E"/><path d="M45 166h119" stroke="#24373E" stroke-width="12"/></svg>').render().asPng();
await writeFile(join(folder,'demo-logo.png'),demoLogo);execFileSync('python',['scripts/prepare_logo.py',join(folder,'demo-logo.png'),join(folder,'logo.png')]);plan.meta.logo_image=join(folder,'logo.png');
let start=0;
for(let i=0;i<5;i++){
 const scene=plan.scenes[i];scene.start=start;start+=durations[i];scene.title=['',''];scene.beat_text_hi='';scene.camera='static';
 if(scene.reference_media?.media_type==='video'){
  const original=i===0?resolve('studio/jobs/stock-video-check/sample-clip.mp4'):resolve('studio/jobs/polished-hq-preview/second.mp4');
  const target=join(folder,`frames-${i}`);await mkdir(target,{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',original,'-t',String(durations[i]+.5),'-an','-vf','fps=24,scale=1920:1920:force_original_aspect_ratio=decrease','-start_number','0',join(target,'%06d.jpg')]);
  Object.assign(scene.reference_media,{frames:target,frame_count:(await readdir(target)).filter(n=>n.endsWith('.jpg')).length,video_fps:24});
 }
}
plan.scenes[2].elements=[{type:'infographic',professional:true,animation:'wave-field',heading:'हवा से पानी में हलचल',dur:durations[2],nodes:[{icon:'wind',label:'पानी पर बहती हवा',detail:'सतह को ऊर्जा मिलती है'},{icon:'water',label:'हवा के संपर्क की दूरी',detail:'इसी दूरी को फेच कहते हैं'}]}];
await prepareExplainers(plan,folder);await prepareOverlayTextAssets(plan,join(folder,'labels'));await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));
execFileSync('python',['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
await copyFile(join(folder,'video.mp4'),'samples/reference-3x4-sample.mp4');await copyFile(join(folder,'qa/video_contact.jpg'),'samples/reference-3x4-sample-contact.jpg');await copyFile(join(folder,'episode.json'),'samples/reference-3x4-sample-episode.json');await copyFile('samples/polished-hq-sample-CREDITS.json','samples/reference-3x4-sample-CREDITS.json');
// Separate silent art-direction preview, not an aviation advice video.
const art={meta:{...plan.meta,voice:undefined,duration:6,out:join(folder,'illustrated.mp4'),headline_hi:'हवाई जहाज़ में संचार कैसे होता है? 🤔',headline_highlight:'हवाई जहाज़'},subjects:{},sounds:[],scenes:[{start:0,title:['',''],page:'white',camera:'static',elements:[{type:'infographic',professional:true,animation:'radio-link',heading:'संचार का चित्रात्मक दृश्य',dur:6,nodes:[{icon:'phone',label:'मोबाइल फ़ोन',detail:'चित्रात्मक उदाहरण'},{icon:'radio',label:'रेडियो संचार',detail:'पायलट और नियंत्रण कक्ष'}]}]}]};
art.meta.headline_image=await prepareHeadlineAssets(art.meta.headline_hi,art.meta.headline_highlight,join(folder,'art-headline'),{compact:true});await prepareExplainers(art,join(folder,'art'));await writeFile(join(folder,'art-plan.json'),JSON.stringify(art,null,2));
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'art-plan.json')],{stdio:'inherit'});await copyFile(join(folder,'illustrated.mp4'),'samples/illustrated-radio-preview.mp4');
console.log('READY reference-3x4-sample.mp4 / illustrated-radio-preview.mp4');
