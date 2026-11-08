import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeStoryOptions,runWithProviders,finalizeEpisode} from '../lib/core.mjs';
import {makeServer} from '../server.mjs';
import {creativeHookNote} from '../lib/quality.mjs';

const facts=['The animal is the tallest living terrestrial animal.','Its diet includes leaves from trees.','Males engage in necking with their necks.'];
const source={title:'Giraffe',extract:facts.join(' '),url:'https://example.com/giraffe'};
const lines=label=>facts.map((fact,i)=>`${i===0?label:'Now consider this detail.'} ${fact} ${'This is another way to explain the same source backed observation clearly to the viewer. '.repeat(2)}`);
function draft(label='Why does a giraffe look so unusual?'){
 return {title:'Giraffe mystery',headlineText:'Giraffe mystery',topic:'Giraffe',language:'en',facts,
  scenes:lines(label).map((narration,factIndex)=>({narration,factIndex,line1:'Giraffe',line2:'Unusual traits',visualQuery:'giraffe',subjectEntity:'giraffe',visual:'photo',effects:[]}))};
}
function verdict(episode){
 return {approved:true,confidence:.99,topicMatches:true,hookAnswered:true,scopePreserved:true,headlineFaithful:true,naturalDialogue:true,
  languageReview:{approved:true,issues:[]},spokenClaimChallenge:{approved:true,issues:[]},
  hookEvidence:{premiseSupported:true,answered:true,sourceQuote:facts[0],reason:'The source supports the opening premise and the explanation.'},
  facts:facts.map((sourceQuote,index)=>({index,sourceQuote,supported:true,confidence:.99})),
  scenes:episode.scenes.map((scene,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.99,sourceQuote:facts[scene.factIndex]})),issues:[]};
}
const response=data=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(data)}]}}]});

test('one Gemini draft returns three complete scripts with shared facts and immutable shot structure',async()=>{
 const saved=globalThis.fetch;let calls=0;
 try{
  const main=draft(),other=[draft('Guess why this giraffe is so unusual.'),draft('This giraffe has a surprising secret.')];
  main.storyOptions=other.map(e=>({title:e.title,headlineText:e.headlineText,scenes:e.scenes.map(s=>({...s,factIndex:99,visualQuery:'injected'}))}));
  globalThis.fetch=async(url,init)=>{
   calls++;const body=JSON.parse(init.body);assert.match(body.contents[0].parts[0].text,/THREE USER-SELECTABLE SCRIPTS/);
   const schema=body.generationConfig.responseJsonSchema;assert.ok(schema.required.includes('storyOptions'));
   assert.equal(schema.properties.storyOptions.minItems,2);assert.equal(schema.properties.storyOptions.maxItems,2);
   assert.equal(schema.properties.facts.minItems,3);assert.equal(schema.properties.facts.maxItems,3);
   return response(main);
  };
  const options=await runWithProviders({GEMINI_API_KEY:'test'},()=>writeStoryOptions('Giraffe',source,'en',30));
  assert.equal(calls,1);assert.equal(options.length,3);
  assert.equal(new Set(options.map(e=>e.scenes[0].narration)).size,3);
  for(const episode of options){assert.deepEqual(episode.facts,facts);assert.deepEqual(episode.scenes.map(s=>s.factIndex),[0,1,2]);assert.ok(episode.scenes.every(s=>s.visualQuery==='giraffe'));}
 }finally{globalThis.fetch=saved;}
});

test('creative preference rejection is informational, but a factual failure cannot be waived',async()=>{
 const saved=globalThis.fetch;let calls=0,badFact=false;
 try{
  const episode=draft();
  globalThis.fetch=async(url,init)=>{
   calls++;const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   if(prompt.startsWith('AUTOMATIC EDITORIAL REPAIR'))return response({facts,headlineText:episode.headlineText,scenes:episode.scenes.map(({narration,line1,line2})=>({narration,line1,line2}))});
   const review=verdict(episode);review.approved=false;review.issues=['Opening needs a short topic-linked funny desi comparison or playful surprise, not only a factual question.'];
   if(badFact)review.facts[0].supported=false;
   return response(review);
  };
  assert.deepEqual(await runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(episode,source,{seconds:30})),episode);assert.equal(calls,1);
  badFact=true;await assert.rejects(runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(episode,source,{seconds:30})),/Fact 1|pass review/);
 }finally{globalThis.fetch=saved;}
});

test('Gemini hook style suggestions never rewrite the selected opening or add another review',async()=>{
 const saved=globalThis.fetch;let calls=0;
 try{
  const episode=draft();
  globalThis.fetch=async(url,init)=>{
   calls++;const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   assert.match(prompt,/GEMINI HOOK REVIEW/);assert.match(prompt,/optional styleNotes only/);
   assert.doesNotMatch(prompt,/HOOK VARIETY CONTRACT|REQUIRED: a concrete curiosity hook/);
   const review=verdict(episode);review.approved=false;review.issues=['Hook needs more comedy and a stronger curiosity gap.','The ending lacks a humorous callback.'];
   return response(review);
  };
  const result=await runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(episode,source,{seconds:30}));
  assert.deepEqual(result,episode);assert.equal(calls,1);
  for(const issue of ['Hook is weak because its factual premise is unsupported.','The hook promise is not answered.','Opening contains incorrect Hindi spelling.','The ending adds an unsourced causal explanation.'])assert.equal(creativeHookNote(issue),false,issue);
 }finally{globalThis.fetch=saved;}
});

test('API selects the requested option and asks approval again after a correction, with no premature TTS',{timeout:20000},async()=>{
 const saved=globalThis.fetch,previousDemo=process.env.DEMO_MODE;process.env.DEMO_MODE='1';
 const server=makeServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 let id,folder,tts=0,reviews=0;const spoken=[];
 const get=async()=>await(await saved(base+'/api/jobs/'+id)).json();
 try{
  const first=await(await saved(base+'/api/jobs',{method:'POST',body:JSON.stringify({demo:true,previewFirst:true})})).json();id=first.id;
  for(let i=0;i<100;i++){const j=await get();if(j.status==='awaiting_approval'&&j.expiresAt)break;await new Promise(r=>setTimeout(r,20));}
  folder=join(resolve(process.env.JOBS_DIR||fileURLToPath(new URL('../jobs/',import.meta.url))),id);
  const snapshot=JSON.parse(await readFile(join(folder,'approved-story.json'),'utf8'));
  const options=[draft('First script opening.'),draft('Second script opening.'),draft('Third script opening.')];
  Object.assign(snapshot,{topic:'Giraffe',source,options:options.map(episode=>({episode,reviewed:false}))});
  Object.assign(snapshot.input,{demo:false,language:'en',voiceAccent:'en-US',voiceProvider:'fish',visualStyle:'paper',mediaMode:'photos',seconds:30});
  await writeFile(join(folder,'approved-story.json'),JSON.stringify(snapshot));
  const corrected=options[1].scenes[0].narration.replace('Second script opening.','Corrected second script opening.');
  globalThis.fetch=async(url,init)=>{
   if(String(url)==='https://api.fish.audio/v1/tts'){
    tts++;spoken.push(JSON.parse(init.body).text);
    return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
   }
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   if(prompt.startsWith('AUTOMATIC EDITORIAL REPAIR'))return response({facts,headlineText:options[1].headlineText,scenes:options[1].scenes.map(({narration,line1,line2},i)=>({narration:i===0?corrected:narration,line1,line2}))});
   assert.match(prompt,/EDITORIAL EVIDENCE REVIEW/);assert.match(prompt,/Second script opening|Corrected second script opening/);
   reviews++;const review=verdict(options[1]);if(reviews===1)review.spokenClaimChallenge={approved:false,issues:['A factual qualifier needs correction']};return response(review);
  };
  const approve=body=>saved(base+'/api/jobs/'+id+'/approve',{method:'POST',body:JSON.stringify({providerKeys:{GEMINI_API_KEY:'test',FISH_API_KEY:'test'},...body})});
  for(const optionIndex of [undefined,-1,3,'1'])assert.equal((await approve({optionIndex})).status,400);
  assert.equal((await approve({optionIndex:1})).status,202);
  let job;
  for(let i=0;i<200;i++){job=await get();if(job.status!=='running'&&job.expiresAt)break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(job.status,'awaiting_approval');assert.equal(tts,0);assert.equal(job.storyOptions.length,3);
  assert.ok(job.storyOptions[1].narration.startsWith(corrected));assert.equal(job.storyOptions[1].reviewed,true);assert.equal(job.storyOptions[0].reviewed,false);assert.match(job.previewNotice,/correct/i);
  assert.equal((await approve({optionIndex:1})).status,202);
  for(let i=0;i<150&&!tts;i++)await new Promise(r=>setTimeout(r,20));
  assert.ok(spoken.some(text=>text.trim()===corrected.trim()));assert.equal(reviews,2,'reviewed corrected option is not reviewed a third time');
  assert.equal((await approve({optionIndex:2})).status,409);
 }finally{
  if(id)await saved(base+'/api/jobs/'+id+'/cancel',{method:'POST'});
  for(let i=0;i<100;i++){if(!(await(await saved(base+'/api/health')).json()).busy)break;await new Promise(r=>setTimeout(r,20));}
  globalThis.fetch=saved;if(previousDemo===undefined)delete process.env.DEMO_MODE;else process.env.DEMO_MODE=previousDemo;
  await new Promise(ok=>server.close(ok));if(folder)await rm(folder,{recursive:true,force:true});
 }
});
