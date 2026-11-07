// Reviewed render from fixed JSON fixtures; no new Gemini/voice/API requests.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareExplainers} from '../lib/explainer.mjs';
import {prepareHeadlineAssets} from '../lib/reference-style.mjs';

const folder=resolve('studio/jobs/motion-preview');await mkdir(folder,{recursive:true});
const base=JSON.parse(await readFile('studio/jobs/polished-hq-preview/plan.json','utf8'));
const fixtures=[
 {animation:'wave-field',heading:'हवा से पानी में हलचल',nodes:[{icon:'wind',label:'पानी पर बहती हवा',detail:'हवा सतह को ऊर्जा देती है'},{icon:'water',label:'हवा के संपर्क की दूरी',detail:'इसी दूरी को फेच कहते हैं'}]},
 {animation:'solar-flow',heading:'धूप से बिजली तक',nodes:[{icon:'solar',label:'सोलर पैनल पर धूप',detail:'प्रकाश से ऊर्जा मिलती है'},{icon:'energy',label:'विद्युत ऊर्जा',detail:'पैनल बिजली उत्पन्न करता है'}]},
 {animation:'comparison',heading:'दो अलग ऊर्जा स्रोत',nodes:[{icon:'solar',label:'सौर ऊर्जा',detail:'स्रोत है सूर्य का प्रकाश'},{icon:'wind',label:'पवन ऊर्जा',detail:'स्रोत है बहती हवा'}]},
 {animation:'process-flow',heading:'ऊर्जा का सफर',nodes:[{icon:'solar',label:'सूर्य का प्रकाश',detail:'पैनल तक पहुँचता है'},{icon:'solar',label:'सोलर पैनल',detail:'विद्युत ऊर्जा बनाता है'},{icon:'energy',label:'विद्युत उपकरण',detail:'बिजली का उपयोग करता है'}]},
];
const plan=structuredClone(base);delete plan.meta.voice;plan.sounds=[];
plan.meta.title='Motion system preview';plan.meta.duration=16;plan.meta.out=join(folder,'showcase.mp4');plan.meta.end_fade=.15;
plan.meta.headline_hi='अब कहानी समझाएगा एनीमेशन 🔍';plan.meta.headline_highlight='अब कहानी';
plan.meta.headline_image=await prepareHeadlineAssets(plan.meta.headline_hi,plan.meta.headline_highlight,join(folder,'headline'));
plan.scenes=fixtures.map((fixture,i)=>({...structuredClone(base.scenes[2]),start:i*4,page:'black',camera:'static',title:['',''],elements:[{...fixture,type:'infographic',professional:true,dur:4,at:0}]}));
await writeFile(join(folder,'storyboard.json'),JSON.stringify(fixtures,null,2));
await prepareExplainers(plan,folder);await writeFile(join(folder,'plan.json'),JSON.stringify(plan,null,2));
execFileSync('python',['scripts/paper_doc.py','contact',join(folder,'plan.json'),join(folder,'qa')],{stdio:'inherit'});
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'plan.json')],{stdio:'inherit'});
await copyFile(join(folder,'showcase.mp4'),'samples/dynamic-motion-showcase.mp4');
await copyFile(join(folder,'qa/showcase_contact.jpg'),'samples/dynamic-motion-showcase-contact.jpg');
await copyFile(join(folder,'storyboard.json'),'samples/dynamic-motion-showcase.json');

// Also demonstrate the change in a real narrated project video: only its
// fetch-definition scene changes; existing footage/photos and voice stay.
const integrated=structuredClone(base);
integrated.meta.out=join(folder,'ocean-video.mp4');
integrated.scenes[2].elements=[{...fixtures[0],type:'infographic',professional:true,dur:integrated.scenes[3].start-integrated.scenes[2].start,at:0}];
await prepareExplainers(integrated,join(folder,'integrated'));
await writeFile(join(folder,'ocean-plan.json'),JSON.stringify(integrated,null,2));
execFileSync('python',['scripts/paper_doc.py','render',join(folder,'ocean-plan.json')],{stdio:'inherit'});
await copyFile(join(folder,'ocean-video.mp4'),'samples/dynamic-ocean-sample.mp4');
await copyFile('samples/polished-hq-sample-CREDITS.json','samples/dynamic-ocean-sample-CREDITS.json');
console.log('READY samples/dynamic-motion-showcase.mp4 and samples/dynamic-ocean-sample.mp4');
