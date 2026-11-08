import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Resvg} from '@resvg/resvg-js';
import {validateLogoUpload} from '../server.mjs';
import {prepareHeadlineAssets,layoutHeadline,prepareOverlayTextAssets} from '../lib/reference-style.mjs';
import {hindiTextIssues} from '../lib/hindi-quality.mjs';
import {auditHindiEpisode,auditHindiNarration,writeEpisode,demoEpisode,runWithProviders} from '../lib/core.mjs';
import {prepareExplainers} from '../lib/explainer.mjs';
import {FONT_OPTIONS} from '../lib/typography.mjs';

test('reference header matches the thin 62px strip, bounded text and yellow rule',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'reference-title-'));
 const text='हवा लहरें कैसे बनाती है? 😱',layout=layoutHeadline(text,{compact:true});
 assert.ok(layout.size>=40);assert.ok(layout.right+64<1080);
 await prepareHeadlineAssets(text,'हवा लहरें',folder,{compact:true});
 const svg=await readFile(join(folder,'headline.svg'),'utf8');
 assert.match(svg,/height="62"/);assert.match(svg,/M0 60H1080/);assert.match(svg,/stroke="#ffff00"/);
 assert.match(svg,/हवा/);assert.match(svg,/लहरें/);
});
test('real rasterized Hindi headlines keep visible gaps and remain inside the compact strip',async()=>{
 for(const title of ['हवा लहरें कैसे बनाती है? 🤔','बुलबुले रंगीन क्यों दिखते हैं? 😲','पृथ्वी का चुंबक कैसे बचाता है? 🔍','बुलबुला आखिर होता क्या है? 🤔','प्रकाश पानी में कैसे मुड़ता है? 😲','चुंबकीय क्षेत्र हमें कैसे बचाता है? 🔍']){
  const folder=await mkdtemp(join(tmpdir(),'title-ink-'));
  await prepareHeadlineAssets(title,title.split(' ').slice(0,2).join(' '),folder,{compact:true});
  const svg=await readFile(join(folder,'headline.svg'),'utf8'),render=new Resvg(svg,FONT_OPTIONS).render(),pixels=render.pixels;
  const {words}=JSON.parse(await readFile(join(folder,'headline-layout.json'),'utf8'));
  const ink=(x,y)=>{const i=(y*1080+x)*4;return pixels[i]+pixels[i+1]+pixels[i+2]>40;};
  for(let i=1;i<words.length;i++){
   const start=Math.ceil(words[i-1].x+words[i-1].width)+3,end=Math.floor(words[i].x)-4;
   assert.ok(end-start>=7,'minimum visible separation');
   for(let x=start;x<end;x++)for(let y=1;y<57;y++)assert.equal(ink(x,y),false,`glyph invades word gap at ${x},${y}`);
  }
  assert.match(svg,/Noto Sans Devanagari/);assert.doesNotMatch(svg,/letter-spacing/);
 }
});
test('logo accepts raster content only, rejects spoofed types, SVG and oversized data',()=>{
 const bytes=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="yellow"/></svg>').render().asPng();
 const value='data:image/png;base64,'+bytes.toString('base64');assert.equal(validateLogoUpload(value),value);
 assert.throws(()=>validateLogoUpload(value.replace('image/png','image/jpeg')),/content/);
 assert.throws(()=>validateLogoUpload('data:image/svg+xml;base64,PHN2Zz4='),/PNG/);
 assert.throws(()=>validateLogoUpload('a'.repeat(1_400_001)),/smaller/);
 assert.equal(validateLogoUpload(null),'');
});
test('Hindi rejects broken encoding and detached matras; independent review fails closed',async()=>{
 assert.ok(hindiTextIssues({title:'बरय गिरती है'}).length);
 assert.ok(hindiTextIssues({title:'िगलत अक्षर'}).length);
 assert.deepEqual(hindiTextIssues({title:'हवा लहरें कैसे बनाती है? 😱'}),[]);
 const saved=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:'{"approved":false,"issues":["wrong word"]}'}]}}]});
  await assert.rejects(runWithProviders({GEMINI_API_KEY:'test'},()=>auditHindiEpisode({title:'पानी की लहरें'},{})),/did not pass/);
 }finally{globalThis.fetch=saved;}
});
test('Hindi copyeditor outage cannot silently return an unchecked creative draft',async()=>{
 const draft=demoEpisode();draft.headlineText='हवा लहरें कैसे बनाती है? 😱';draft.facts=['पहला तथ्य सही है।','दूसरा तथ्य अलग है।','तीसरा तथ्य अलग है।'];
 draft.scenes.forEach(s=>{s.line1='पानी की लहरें';s.line2='हवा का असर';s.narration='हवा पानी की सतह पर बहती है।';});
 const saved=globalThis.fetch;let copyCalls=0;
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   if(prompt.includes('copyeditor')){copyCalls++;return new Response('unavailable',{status:400});}
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(draft)}]}}]});
  };
  await assert.rejects(runWithProviders({GEMINI_API_KEY:'test'},()=>writeEpisode('waves',{url:'https://example.com',extract:'Wind makes surface waves.'},'hi',20)),/Hindi copy review failed: Gemini HTTP 400/);
  assert.equal(copyCalls,1);
 }finally{globalThis.fetch=saved;}
});
test('English fact metadata is translated without regenerating the already proofread Hindi storyboard',async()=>{
 const draft=demoEpisode();draft.headlineText='जिराफ की गर्दन का कमाल 😲';draft.facts=['A source claim about height.','A separate claim about food.','A separate claim about behaviour.'];
 draft.scenes.forEach((s,i)=>{s.line1='जिराफ की गर्दन';s.line2='ऊँचा कद';s.narration=i?'जिराफ ऊँचे पेड़ों से पत्ते खाते हैं।':'क्या तुम्हें पता है, जिराफ इतना ऊँचा होता है?';});
 draft.scenes.forEach(scene=>{scene.narration+=' '+Array(6).fill('?? ????? ?? ?????? ??????? ???').join(' ');});
 const facts=['जिराफ का कद ऊँचा होता है।','जिराफ पेड़ों के पत्ते खाते हैं।','नर जिराफ गर्दन से लड़ते हैं।'];
 const saved=globalThis.fetch;let drafts=0,copies=0,translations=0;
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;let response;
   if(prompt.includes('Act as a native'))response={headline:'जिराफ की गर्दन का कमाल 😲'};
   else if(prompt.includes('copyeditor')){copies++;response={facts:draft.facts,scenes:draft.scenes.map(({narration,line1,line2})=>({narration,line1,line2}))};}
   else if(prompt.startsWith('Translate EACH')){translations++;response={facts};}
   else if(prompt.includes('Independently review FINAL'))response={approved:true,issues:[]};
   else if(prompt.startsWith('SPOKEN CLAIM CHALLENGE'))response={approved:true,issues:[]};
   else if(prompt.startsWith('EDITORIAL EVIDENCE REVIEW'))response={languageReview:{approved:true,issues:[]},spokenClaimChallenge:{approved:true,issues:[]},comedyHook:true,comicEnding:true,hookEvidence:{premiseSupported:true,answered:true,sourceQuote:"Source facts provided for the test",reason:"The opening premise and answer match the supplied source."},approved:true,confidence:.95,topicMatches:true,hookAnswered:true,scopePreserved:true,headlineFaithful:true,naturalDialogue:true,facts:[0,1,2].map(index=>({index,supported:true,confidence:.95,sourceQuote:'Source facts provided for the test'})),scenes:draft.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:"Source facts provided for the test"})),issues:[]};
   else{drafts++;response=draft;}
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(response)}]}}]});
  };
  const episode=await runWithProviders({GEMINI_API_KEY:'test'},()=>writeEpisode('Giraffe',{url:'https://example.com',extract:'Source facts provided for the test'},'hi',20));
  assert.deepEqual(episode.facts,facts);assert.equal(drafts,1);assert.equal(copies,1);assert.equal(translations,1);
 }finally{globalThis.fetch=saved;}
});
test('all reference Hindi overlays and illustrated animation fit the new viewport',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'reference-art-'));
 const plan={meta:{size:[1080,1440],headline_height:62,fps:1},scenes:[{beat_text_hi:'हवा का असर',reference_media:{pointer:{label:'लहर की चोटी'}},elements:[{type:'infographic',professional:true,dur:1,animation:'radio-link',heading:'हवाई जहाज़ में संचार',nodes:[{icon:'phone',label:'मोबाइल फ़ोन'},{icon:'radio',label:'रेडियो संचार'}]}]}]};
 await prepareOverlayTextAssets(plan,join(folder,'labels'));await prepareExplainers(plan,folder);
 assert.ok((await readFile(plan.scenes[0].beat_text_image)).length>1000);
 assert.ok(plan.scenes[0].reference_media.pointer.label_image);
 const element=plan.scenes[0].elements[0];assert.equal(element.y,751);
 const svg=await readFile(join(element.frames,'explainer.svg'),'utf8');
 const rendered=new Resvg(svg,{font:{loadSystemFonts:false}}).render();assert.equal(rendered.width,1080);assert.equal(rendered.height,1378);
});
test('Hindi voice audit sends WAV data and requires explicit confidence and approval',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'voice-audit-')),path=join(folder,'voice.wav');
 const bytes=Buffer.alloc(48);bytes.write('RIFF');bytes.write('WAVE',8);await writeFile(path,bytes);
 const saved=globalThis.fetch;let valid=false;
 try{
  globalThis.fetch=async(url,init)=>{
   const parts=JSON.parse(init.body).contents[0].parts;
   assert.equal(parts[1].inlineData.mimeType,'audio/wav');
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({approved:true,issues:[],...(valid?{confidence:.99}:{} )})}]}}]});
  };
  await assert.rejects(runWithProviders({GEMINI_API_KEY:'test'},()=>auditHindiNarration(path,{scenes:[{narration:'पानी की लहरें'}]})),/did not pass/);
  valid=true;assert.equal((await runWithProviders({GEMINI_API_KEY:'test'},()=>auditHindiNarration(path,{scenes:[{narration:'पानी की लहरें'}]}))).approved,true);
 }finally{globalThis.fetch=saved;}
});


test('English headline polishing asks for English and rejects Hindi output',async()=>{
 const {polishEpisodeHeadline}=await import('../lib/core.mjs'),saved=globalThis.fetch;
 const headline='Why Zippers Stay Shut \u{1F914}';
 try{
  globalThis.fetch=async(url,init)=>{const p=JSON.parse(init.body).contents[0].parts[0].text;assert.match(p,/Use natural English in Latin script only/);assert.doesNotMatch(p,/Hindi must be natural Devanagari/);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({headline})}]}}]});};
  const e=await runWithProviders({GEMINI_API_KEY:'test'},()=>polishEpisodeHeadline({scenes:[{narration:'A zipper holds things together.'}]},{extract:'Source'},'en'));assert.equal(e.headlineText,headline);
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({headline:'\u0917\u0932\u0924 \u092d\u093e\u0937\u093e \u{1F914}'})}]}}]});
  await assert.rejects(runWithProviders({GEMINI_API_KEY:'test'},()=>polishEpisodeHeadline({scenes:[{narration:'English'}]},{extract:'Source'},'en')),/language/);
 }finally{globalThis.fetch=saved;}
});


test('English narration review checks English speech and natural delivery',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'english-audio-')),path=join(folder,'speech.wav');
 await writeFile(path,Buffer.from('RIFF0000WAVE'));
 try{
  globalThis.fetch=async(url,init)=>{const p=JSON.parse(init.body).contents[0].parts[0].text;assert.match(p,/generated English narration/);assert.match(p,/natural male conversational English/);assert.doesNotMatch(p,/\$\{spokenLanguage\}/);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({approved:true,confidence:.95,issues:[],naturalness:8,pronunciation:8,deliveryConsistency:8,roboticArtifacts:false,masculineDelivery:true,transcript_en:'Ever wondered why?'})}]}}]});};
  const result=await runWithProviders({GEMINI_API_KEY:'test'},()=>auditHindiNarration(path,{language:'en',scenes:[{narration:'Ever wondered why?'}]},{requireNatural:true}));assert.equal(result.approved,true);
 }finally{globalThis.fetch=saved;}
});
