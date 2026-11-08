import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpisode, validateThreeFacts, licenseInfo, isFreesoundCC0, buildPlan, demoEpisode,
  semanticEffectAllowed, normalizeDiagram, resolveVoiceProfile, speechPerformance,
  mediaTitleMismatch, randomFactsSource, runWithProviders, wikipediaSource,
  gemini,runWithGeminiUsage,chooseTopic,topicSelectionContext,topicWasUsed,TOPIC_CATEGORIES,generationFetch,createWikimediaGate,wikimediaRetryMs } from '../lib/core.mjs';
import { validateInput,VIDEO_TTL_MS,expireJob,normalizeFrontendOrigin,makeServer,processTool } from '../server.mjs';
import {mkdir,writeFile,stat,readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('Wikimedia pacing serializes requests and respects shared Retry-After cooldown',async()=>{
 let clock=1000,calls=0;const starts=[];
 const gate=createWikimediaGate({now:()=>clock,wait:async ms=>{clock+=ms;}});
 const operation=()=>{calls++;starts.push(clock);return new Response('{}');};
 await Promise.all([gate.run(operation),gate.run(operation),gate.run(operation)]);
 assert.deepEqual(starts,[1000,2000,3000]);
 await gate.run(()=>new Response('',{status:429,headers:{'Retry-After':'60'}}));
 await assert.rejects(gate.run(operation),/retry after 60 seconds/);assert.equal(calls,3);
 clock+=60000;await gate.run(operation);assert.equal(calls,4);
 assert.equal(wikimediaRetryMs('5',0),5000);
 assert.equal(wikimediaRetryMs('Thu, 01 Jan 1970 00:01:00 GMT',0),60000);
 assert.equal(wikimediaRetryMs(null,0),10000);
 const controller=new AbortController();controller.abort(Error('cancelled'));
 await assert.rejects(gate.run(operation,controller.signal),/cancelled/);assert.equal(calls,4);
});

test('Wikimedia requests identify the app while other providers retain their headers',async()=>{
 const saved=globalThis.fetch;const calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),headers:new Headers(options.headers)});return new Response('{}');};
  await generationFetch('https://en.wikipedia.org/w/api.php');
  await generationFetch('https://example.org/api',{headers:{Authorization:'test'}});
  assert.match(calls[0].headers.get('user-agent'),/IShowFacts.*github.com\/shubhamm1267\/ishowfacts/);
  assert.equal(calls[1].headers.get('user-agent'),null);assert.equal(calls[1].headers.get('authorization'),'test');
 }finally{globalThis.fetch=saved;}
});

test('cancellation aborts provider fetches and renderer processes without affecting another scope',async()=>{
 const saved=globalThis.fetch;
 const controller=new AbortController();let entered;
 const ready=new Promise(resolve=>entered=resolve);
 globalThis.fetch=async(url,options)=>new Promise((resolve,reject)=>{
  options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});entered();
 });
 try{
  const pending=runWithProviders({},()=>generationFetch('https://example.org'),controller.signal);
  await ready;controller.abort(Error('cancelled test'));await assert.rejects(pending,/cancelled test/);
 }finally{globalThis.fetch=saved;}
 const renderController=new AbortController();
 const process=runWithProviders({},()=>processTool(globalThis.process.execPath,['-e','setInterval(()=>{},1000)']),renderController.signal);
 const assertion=assert.rejects(process,/cancelled render/);
 setTimeout(()=>renderController.abort(Error('cancelled render')),150);
 await assertion;
 assert.equal(await runWithProviders({},()=>processTool(globalThis.process.execPath,['-e','process.stdout.write("ready")'])), 'ready');
});

test('cancel endpoint stops active work, persists cancelled status and releases the generation slot',async()=>{
 const saved=globalThis.fetch,server=makeServer();let entered,aborted=false;
 const attemptedTopic='Cancellation topic '+randomUUID();
 const ready=new Promise(resolve=>entered=resolve);
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith(base))return saved(url,options);
  return new Promise((resolve,reject)=>{
   options.signal.addEventListener('abort',()=>{aborted=true;reject(options.signal.reason);},{once:true});entered();
  });
 };
 try{
  const response=await saved(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:attemptedTopic,voiceProvider:'fish',providerKeys:{GEMINI_API_KEY:'test',FISH_API_KEY:'test'}})});
  assert.equal(response.status,202);const job=await response.json();await ready;
  const cancel=await saved(base+'/api/jobs/'+job.id+'/cancel',{method:'POST'});assert.equal(cancel.status,202);
  assert.equal((await cancel.json()).cancelRequested,true);
  let status;
  for(let i=0;i<50;i++){
   status=await(await saved(base+'/api/jobs/'+job.id)).json();if(status.status==='cancelled')break;
   await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(status.status,'cancelled');assert.equal(aborted,true);assert.equal(status.videoUrl,null);
  assert.deepEqual(status.selectedTopics,[attemptedTopic]);
  const history=JSON.parse(await readFile(new URL('../data/topic-history.json',import.meta.url),'utf8'));
  assert.equal(topicWasUsed(attemptedTopic,history),true,'cancelled research remains excluded before any footage search');
  for(let i=0;i<50;i++){if(!(await(await saved(base+'/api/health')).json()).busy)break;await new Promise(r=>setTimeout(r,20));}
  assert.equal((await(await saved(base+'/api/health')).json()).busy,false);
  assert.equal((await saved(base+'/api/jobs/'+job.id+'/cancel',{method:'POST'})).status,200);
 }finally{
  globalThis.fetch=saved;await new Promise(ok=>server.close(ok));
  const path=new URL('../data/topic-history.json',import.meta.url);
  const history=JSON.parse(await readFile(path,'utf8'));
  await writeFile(path,JSON.stringify(history.filter(row=>row.topic!==attemptedTopic),null,2));
 }
});

test('deployment origin normalization tolerates copied quotes and trailing slashes without allowing other sites',async()=>{
 assert.equal(normalizeFrontendOrigin(' "https://facts-example.netlify.app/" '),'https://facts-example.netlify.app');
 for(const invalid of ['*','null','not-a-url','https://user:password@example.com','file:///tmp'])assert.equal(normalizeFrontendOrigin(invalid),null);
 const server=makeServer({frontendOrigin:' "https://facts-example.netlify.app/" '});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const good=await fetch(base+'/api/health',{headers:{Origin:'https://facts-example.netlify.app'}});
  assert.equal(good.status,200);assert.equal(good.headers.get('access-control-allow-origin'),'https://facts-example.netlify.app');
  assert.equal((await good.json()).deployment.frontendOrigin,'https://facts-example.netlify.app');
  const bad=await fetch(base+'/api/health',{headers:{Origin:'https://facts-example.netlify.app.attacker.example'}});
  assert.equal(bad.status,403);assert.equal(bad.headers.get('access-control-allow-origin'),null);
  const detail=await bad.json();assert.equal(detail.configuredFrontendOrigin,'https://facts-example.netlify.app');
  assert.equal(detail.receivedOrigin,'https://facts-example.netlify.app.attacker.example');
 }finally{await new Promise(ok=>server.close(ok));}
});

test('missing job responses identify the backend instance and cannot be cached',async()=>{
 const server=makeServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const health=await(await fetch(base+'/api/health')).json();
  assert.match(health.instanceId,/^[a-f0-9-]{36}$/);
  const response=await fetch(base+'/api/jobs/'+randomUUID());
  assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');
  const missing=await response.json();assert.equal(missing.code,'JOB_NOT_FOUND');assert.equal(missing.instanceId,health.instanceId);
 }finally{await new Promise(ok=>server.close(ok));}
});

test('random fact mode is explicit and unknown modes retain topic research',()=>{
 const providerKeys={GEMINI_API_KEY:'test',CARTESIA_API_KEY:'test'};
 assert.equal(validateInput({providerKeys,factMode:'random'}).factMode,'random');
 assert.equal(validateInput({providerKeys,factMode:'unknown'}).factMode,'topic');
});

test('browser topic exclusions are bounded and survive input validation without requiring server history',()=>{
 const providerKeys={GEMINI_API_KEY:'test',CARTESIA_API_KEY:'test'};
 const input=validateInput({providerKeys,recentTopics:[' Popcorn ','Popcorn','Soap bubble']});
 assert.deepEqual(input.recentTopics,['Popcorn','Soap bubble']);
 for(const recentTopics of ['Popcorn',[{}],Array(101).fill('Popcorn')])assert.throws(()=>validateInput({providerKeys,recentTopics}),/Recent topics/);
});

test('automatic selection cycles all categories and reserves different categories for compilations',()=>{
 const history=[],seen=[];
 for(let i=0;i<TOPIC_CATEGORIES.length;i++){
  const category=topicSelectionContext(history).categories[0];seen.push(category.id);
  history.push({topic:'Subject '+i,category:category.id});
 }
 assert.equal(new Set(seen).size,TOPIC_CATEGORIES.length);
 assert.equal(topicSelectionContext(history).categories[0].id,seen[0]);
 assert.deepEqual(topicSelectionContext([{category:'nature'}],3).categories.map(c=>c.id),['consumer','money','history']);
 assert.equal(topicSelectionContext([{category:'consumer'},{category:'custom'}]).categories[0].id,'money');
});

test('permanent topic matching catches formatting and canonical aliases beyond the prompt window',()=>{
 const history=[{topic:'Shopping cart',url:'https://en.wikipedia.org/wiki/Shopping_cart',category:'consumer'}];
 assert.equal(topicWasUsed(' SHOPPING_cart ',history),true);
 assert.equal(topicWasUsed({title:'Shopping trolley',url:history[0].url},history),true);
 assert.equal(topicWasUsed('Barcode',history),false);
 assert.equal(topicWasUsed('Shopping cart',[...history,...Array.from({length:24},(_,i)=>({topic:'Other '+i}))]),true);
});

test('automatic Gemini selection retries recent topics and sends the required category and history',async()=>{
 const saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   assert.match(prompt,/Money & everyday economics/);assert.match(prompt,/Shopping cart/);
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({topic:++calls===1?'Shopping_cart':'Banknote'})}]}}]});
  };
  const result=await runWithProviders({GEMINI_API_KEY:'test'},()=>chooseTopic({history:[{topic:'Shopping cart',category:'consumer'}]}));
  assert.equal(result,'Banknote');assert.equal(calls,2);
 }finally{globalThis.fetch=saved;}
});

test('automatic selection includes older used topics and names rejected suggestions on retry',async()=>{
 const saved=globalThis.fetch;let calls=0;
 const history=[{topic:'Voynich manuscript',category:'mystery'},...Array.from({length:70},(_,i)=>({topic:'Archived subject '+i,category:'nature'}))];
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   assert.match(prompt,/Full used topic names/);assert.match(prompt,/Voynich manuscript/);
   if(calls)assert.match(prompt,/Already rejected suggestions in THIS request: \["Voynich manuscript"\]/);
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({topic:++calls===1?'Voynich manuscript':'Zipper'})}]}}]});
  };
  assert.equal(await runWithProviders({GEMINI_API_KEY:'test'},()=>chooseTopic({history})),'Zipper');assert.equal(calls,2);
 }finally{globalThis.fetch=saved;}
});

test('random facts research keeps three independent sources and rejects duplicate topics',async()=>{
 const saved=globalThis.fetch;
 let topics=['Popcorn','Giraffe','Rainbow'];
 try{
  globalThis.fetch=async(url)=>{
   const address=String(url);
   if(address.includes('generativelanguage.googleapis.com'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({topics})}]}}]});
   if(address.includes('/page/summary/')){
    const title=decodeURIComponent(address.split('/').at(-1));
    return Response.json({title,extract:(title+' has a documented mechanism and other well established source evidence. ').repeat(6),content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/'+title}}});
   }
   return Response.json({query:{pages:{1:{extract:''}}}});
  };
  await runWithProviders({GEMINI_API_KEY:'test'},async()=>{
   const source=await randomFactsSource();
   assert.deepEqual(source.articles.map(a=>a.title),topics);
   assert.equal(new Set(source.articles.map(a=>a.url)).size,3);
   assert.deepEqual(source.articles.map(a=>a.category.id),['consumer','money','history']);
   assert.match(source.extract,/SOURCE 3: Rainbow/);
   await assert.rejects(randomFactsSource({history:[{topic:'Popcorn',category:'consumer'}]}),/recently used topic/);
   await assert.rejects(randomFactsSource({history:[{topic:'Corn snack alias',url:'https://en.wikipedia.org/wiki/Popcorn',category:'consumer'}]}),/recently used source/);
   topics=['Popcorn','Popcorn','Rainbow'];
   await assert.rejects(randomFactsSource(),/three distinct/);
  });
 }finally{globalThis.fetch=saved;}
});

test('research includes article mechanisms beyond the definition and retains summary on lookup failure',async()=>{
 const saved=globalThis.fetch,summary='A documented subject with a reliable introductory definition. '.repeat(4);
 const full=summary+'Mechanism: a detailed explanation beyond the introductory paragraph.';
 let fail=false;
 try{
  globalThis.fetch=async url=>{
   if(String(url).includes('/page/summary/'))return Response.json({title:'Subject',extract:summary});
   assert.equal(new URL(url).searchParams.has('exintro'),false);
   if(fail)throw Error('Full article temporarily unavailable');
   return Response.json({query:{pages:{1:{extract:full}}}});
  };
  assert.equal((await wikipediaSource('Subject')).extract,full);
  fail=true;assert.equal((await wikipediaSource('Subject')).extract,summary.trim());
 }finally{globalThis.fetch=saved;}
});

test('completed job and all assets remain through minute 29 and cleanup deletes the folder after minute 30',async()=>{
 const id=randomUUID(),root=resolve(process.env.JOBS_DIR||fileURLToPath(new URL('../jobs/',import.meta.url))),folder=join(root,id);
 const completedAt=Date.now(),savedNow=Date.now;
 await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'status.json'),JSON.stringify({id,status:'complete',expiresAt:new Date(completedAt+VIDEO_TTL_MS).toISOString()}));
 await writeFile(join(folder,'video.mp4'),'retention fixture');
 await mkdir(join(folder,'assets'),{recursive:true});
 await writeFile(join(folder,'assets','clip.mp4'),'temporary clip fixture');
 try{
  assert.equal(VIDEO_TTL_MS,30*60*1000);
  Date.now=()=>completedAt+29*60*1000;
  await expireJob(id);assert.ok((await stat(join(folder,'video.mp4'))).isFile());
  assert.ok((await stat(join(folder,'assets','clip.mp4'))).isFile());
  Date.now=()=>completedAt+30*60*1000+1;
  await expireJob(id);await assert.rejects(stat(folder),{code:'ENOENT'});
 }finally{Date.now=savedNow;}
});

test('reference output always requests clips plus photos, including stale photos-only settings',()=>{
 const providerKeys={GEMINI_API_KEY:'test',CARTESIA_API_KEY:'test'};
 assert.equal(validateInput({providerKeys,mediaMode:'photos'}).mediaMode,'mixed');
 assert.equal(validateInput({providerKeys,visualStyle:'paper',mediaMode:'photos'}).mediaMode,'photos');
});

test('validates storyboard and requires a real narration per scene', () => {
  const episode = demoEpisode();
  assert.equal(episode.scenes.length, 4);
  assert.deepEqual(validateThreeFacts(episode), []);
  assert.equal(episode.scenes[0].line1, 'EIGHT');
  assert.throws(() => normalizeEpisode({ scenes: [{ narration: 'one', line1: 'A', visualQuery: 'cat' }] }), /incomplete/i);
});

test('long compilations retain all twenty shots and duration reaches the backend',()=>{
 const episode=demoEpisode();
 episode.scenes=Array.from({length:20},(_,i)=>({...episode.scenes[i%4],factIndex:Math.min(2,Math.floor(i/7))}));
 assert.equal(normalizeEpisode(episode).scenes.length,20);
 const providerKeys={GEMINI_API_KEY:'test',CARTESIA_API_KEY:'test'};
 for(const seconds of [20,25,30,35,40,50,90,100])assert.equal(validateInput({providerKeys,seconds}).seconds,seconds);
 assert.equal(validateInput({providerKeys,seconds:150}).seconds,100);
 assert.equal(validateInput({providerKeys}).seconds,30);
});

test('a Short must contain three distinct factual claims, each mapped to a story beat', () => {
  const episode = demoEpisode();
  episode.facts[2] = episode.facts[0];
  assert.match(validateThreeFacts(episode).join(' '), /distinct/);
  episode.facts[2] = 'They can squeeze through narrow spaces.';
  episode.scenes[2].factIndex = 1;
  episode.scenes[3].factIndex = 1;
  assert.match(validateThreeFacts(episode).join(' '), /fact 3/);
  episode.scenes[2].factIndex = 2;
  episode.scenes[3].factIndex = 2;
  assert.deepEqual(validateThreeFacts(episode), []);
});

test('studio background option accepts white, black and story-random only', () => {
  const before = process.env.DEMO_MODE;
  process.env.DEMO_MODE = '1';
  try {
    for (const mode of ['white', 'black', 'random'])
      assert.equal(validateInput({ backgroundPalette: mode, demo: true }).backgroundPalette, mode);
    assert.equal(validateInput({ backgroundPalette: 'neon', demo: true }).backgroundPalette, 'random');
  } finally {
    if (before === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = before;
  }
});

test('rejects incompatible image licenses, accepts CC0 and CC BY', () => {
  const meta = license => ({ LicenseShortName: { value: license }, Artist: { value: '<b>Creator</b>' } });
  assert.equal(licenseInfo(meta('CC0')).allowed, true);
  assert.equal(licenseInfo(meta('CC BY 4.0')).allowed, true);
  assert.equal(licenseInfo(meta('CC BY-SA 4.0')).allowed, false);
  assert.equal(licenseInfo(meta('CC BY-NC 4.0')).allowed, false);
  assert.equal(licenseInfo(meta('CC BY 4.0')).author, 'Creator');
});

test('Freesound API CC0 URL is recognized, BY and NC sounds are rejected', () => {
  assert.equal(isFreesoundCC0('http://creativecommons.org/publicdomain/zero/1.0/'), true);
  assert.equal(isFreesoundCC0('https://creativecommons.org/publicdomain/zero/1.0/'), true);
  assert.equal(isFreesoundCC0('http://creativecommons.org/licenses/by/4.0/'), false);
  assert.equal(isFreesoundCC0('http://creativecommons.org/licenses/by-nc/3.0/'), false);
});

test('builds phrase-synced audiovisual plan without default SFX when missing', () => {
  const episode = demoEpisode();
  const timing = episode.scenes.map((_, i) => ({ start: i * 2, duration: 2 }));
  const plan = buildPlan(episode, timing, [null, null, null, null], {}, '/tmp/video.mp4', null, { demo: true, fps: 10 });
  assert.equal(plan.meta.duration, 8.4);
  assert.equal(plan.meta.whoosh_db, null);
  assert.equal(plan.scenes.length, 4);
  assert.equal(plan.scenes[1].start, 2);
  assert.equal(plan.scenes[1].elements[0].sfx, false);
  assert.equal(plan.scenes[2].elements[1].sfx, false);
});

test('rejects live jobs with no keys; demo only when explicitly enabled', () => {
  const previous = process.env.DEMO_MODE;
  const keys = ['GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'CARTESIA_API_KEY', 'CARTESIA_VOICE_ID', 'FREESOUND_API_KEY'];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  delete process.env.DEMO_MODE;
  assert.throws(() => validateInput({ demo: true }), /disabled/);
  assert.throws(() => validateInput({ topic: 'octopus' }), /Gemini and Cartesia keys are required/);
  process.env.DEMO_MODE = '1';
  assert.equal(validateInput({ demo: true, topic: 'x', seconds: 100 }).seconds, 100);
  for (const k of keys) if (before[k]) process.env[k] = before[k];
  if (previous === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = previous;
});

test('removes unrelated rulers and flasks from a story, keeps genuinely spoken measurements', () => {
  assert.equal(semanticEffectAllowed({ narration: 'Ten species belong to this small fish family.' }, 'ruler'), false);
  assert.equal(semanticEffectAllowed({ narration: 'Length reaches 18 cm.' }, 'ruler'), true);
  assert.equal(semanticEffectAllowed({ narration: 'Fish use water to hunt.' }, 'thermometer'), false);
  assert.equal(semanticEffectAllowed({ narration: 'It reaches 180 degrees Celsius.' }, 'thermometer'), true);
  const story = normalizeEpisode({ title: 'Facts', topic: 'Archerfish', scenes: Array.from({ length: 3 }, () => ({
    narration: 'These fish swim in rivers.', line1: 'FISH', line2: 'FACT', visualQuery: 'Toxotes',
    effects: [{ type: 'ruler' }, { type: 'flask' }, { type: 'sparkle' }],
  })) });
  assert.deepEqual(story.scenes[0].effects.map(e => e.type), ['sparkle']);
});

test('selectable male narrator profiles map to native accents with distinct speaking roles', () => {
  assert.equal(resolveVoiceProfile('hi-IN').locale, 'hi-IN');
  assert.equal(resolveVoiceProfile('hi-IN-anuj').locale, 'hi-IN');
  assert.notEqual(resolveVoiceProfile('hi-IN-anuj').voiceId, resolveVoiceProfile('hi-IN-ayush').voiceId);
  assert.notEqual(resolveVoiceProfile('hi-IN-rakesh').voiceId, resolveVoiceProfile('hi-IN-ayush').voiceId);
  assert.equal(resolveVoiceProfile('en-US').language, 'en');
  assert.equal(resolveVoiceProfile('en-GB').accent, 'british');
  assert.throws(() => resolveVoiceProfile('xx-XX'), /Unsupported/);
  assert.ok(speechPerformance({ delivery: 'hook' }).speed > speechPerformance({ delivery: 'suspense' }).speed);
});

test('prevents namesake amusement rides in nature fact footage', () => {
  assert.equal(mediaTitleMismatch('File:Electric Eel roller coaster ride.jpg', 'Electrophorus electric eel'), true);
  assert.equal(mediaTitleMismatch('File:Electric Eel.jpg', 'Electrophorus electric eel'), false);
  assert.equal(mediaTitleMismatch('File:Electric eel T-shirt.jpg', 'Electrophorus electric eel'), true);
  assert.equal(mediaTitleMismatch('File:Electric Eel Roller Coaster.jpg', 'Electric Eel roller coaster'), false);
});

test('fruit documentary rejects banana-money banknotes and disease images', () => {
  assert.equal(mediaTitleMismatch('File:Japanese occupation Banana money ten dollars.jpg', 'green plantain banana fruit'), true);
  assert.equal(mediaTitleMismatch('File:Banana Bunch Top Virus.jpg', 'banana bunch fruit'), true);
  assert.equal(mediaTitleMismatch('File:Banana plant Musa acuminata.jpg', 'banana bunch fruit'), false);
  assert.equal(mediaTitleMismatch('File:Banana currency banknotes.jpg', 'banana money banknote history'), false);
});

test('vetted 2–4 node animations reject malformed Gemini diagram references', () => {
  const diagram = normalizeDiagram({ heading: 'CAUSE', nodes: [
    { label: 'Sunlight' }, { label: 'Air' }, { label: 'Blue sky' }],
  links: [{ from: 0, to: 1 }, { from: 4, to: 8 }] });
  assert.equal(diagram.nodes.length, 3);
  assert.equal(diagram.links.length, 1);
  assert.equal(normalizeDiagram({ nodes: [{ label: 'One' }] }), null);
});


test('previous bubbles and waterfalls cannot reappear under common renamed topics',()=>{
 const history=[{topic:'Soap bubble'},{topic:'Waterfall'}];
 for(const topic of ['water bubbles','Soap bubbles','BUBBLES','Water falls','Waterfalls'])assert.equal(topicWasUsed(topic,history),true,topic);
 assert.equal(topicWasUsed('Water turbine',history),false);
 const long=[...history,...Array.from({length:200},(_,i)=>({topic:'New '+i}))];assert.equal(topicWasUsed('water bubble',long),true);
});

test('preview persists exact narration without credentials and approval resumes without rewriting',{timeout:15000},async()=>{
 const savedFetch=globalThis.fetch,previousDemo=process.env.DEMO_MODE;
 process.env.DEMO_MODE='1';
 const server=makeServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 let folder,id,entered;const ttsTexts=[];const ready=new Promise(resolve=>entered=resolve);
 try{
  const response=await savedFetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demo:true,previewFirst:true,providerKeys:{FISH_API_KEY:'test-secret'}})});
  assert.equal(response.status,202);id=(await response.json()).id;
  let job;
  for(let i=0;i<100;i++){
   job=await(await savedFetch(base+'/api/jobs/'+id)).json();
   if(job.status!=='running'&&job.expiresAt)break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(job.status,'awaiting_approval');assert.ok(job.preview.narration);
  assert.equal(job.videoUrl,null);assert.equal((await(await savedFetch(base+'/api/health')).json()).busy,false);
  folder=join(resolve(process.env.JOBS_DIR||fileURLToPath(new URL('../jobs/',import.meta.url))),id);
  const text=await readFile(join(folder,'approved-story.json'),'utf8');
  assert.equal(text.includes('test-secret'),false);
  const snapshot=JSON.parse(text);
  assert.equal(job.preview.narration,snapshot.episode.scenes.map(s=>s.narration).join('\n\n'));
  // Resume a saved story and intercept TTS before media/render work.
  snapshot.input.demo=false;snapshot.input.voiceProvider='fish';snapshot.input.mediaMode='photos';snapshot.input.visualStyle='paper';
  await writeFile(join(folder,'approved-story.json'),JSON.stringify(snapshot));
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://api.fish.audio/v1/tts','approval must not research or rewrite the story');
   ttsTexts.push(JSON.parse(options.body).text);entered();
   return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  };
  const approve=await savedFetch(base+'/api/jobs/'+id+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({providerKeys:{GEMINI_API_KEY:'test',FISH_API_KEY:'test'}})});
  assert.equal(approve.status,202);await ready;
  assert.ok(ttsTexts.includes(snapshot.episode.scenes[0].narration));
  assert.equal((await savedFetch(base+'/api/jobs/'+id+'/approve',{method:'POST',body:'{}'})).status,409);
  await savedFetch(base+'/api/jobs/'+id+'/cancel',{method:'POST'});
  for(let i=0;i<100;i++){
   if(!(await(await savedFetch(base+'/api/health')).json()).busy)break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal((await(await savedFetch(base+'/api/jobs/'+id)).json()).status,'cancelled');
 }finally{
  if(id)await savedFetch(base+'/api/jobs/'+id+'/cancel',{method:'POST'});
  globalThis.fetch=savedFetch;
  if(previousDemo===undefined)delete process.env.DEMO_MODE;else process.env.DEMO_MODE=previousDemo;
  await new Promise(ok=>server.close(ok));
  if(folder)await rm(folder,{recursive:true,force:true});
 }
});



test('daily-exhausted credentials are attempted once per job; usage counts actual HTTP calls without secrets',async()=>{
 const saved=globalThis.fetch,usage={};let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({error:{message:'GenerateRequestsPerDay limit exceeded'}},{status:429});};
  await runWithProviders({GEMINI_API_KEY:'private-a',GEMINI_API_KEY_2:'private-b',GEMINI_API_KEY_3:'private-c'},()=>runWithGeminiUsage(usage,async()=>{
   await assert.rejects(gemini('first'),/Gemini unavailable/);
   await assert.rejects(gemini('second'),/Gemini unavailable/);
  }));
  assert.equal(calls,3);assert.equal(usage.requests,3);assert.deepEqual(usage.statuses,{'429':3});
  assert.equal(JSON.stringify(usage).includes('private-'),false);
  await runWithProviders({GEMINI_API_KEY:'private-a'},()=>runWithGeminiUsage({},()=>assert.rejects(gemini('new job'),/Gemini unavailable/)));
  assert.equal(calls,4,'new job can retry the credential');
 }finally{globalThis.fetch=saved;}
});

test('Gemini usage records successful token counts and rejects crypto stock for historical tokens',async()=>{
 const saved=globalThis.fetch,usage={};
 try{
  globalThis.fetch=async()=>Response.json({usageMetadata:{promptTokenCount:12,candidatesTokenCount:4},candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]});
  assert.deepEqual(await runWithProviders({GEMINI_API_KEY:'private'},()=>runWithGeminiUsage(usage,()=>gemini('example'))),{ok:true});
  assert.deepEqual(usage,{requests:1,statuses:{'200':1},inputTokens:12,outputTokens:4});
  assert.equal(mediaTitleMismatch('spinning a bitcoin on a table','old company scrip token'),true);
  assert.equal(mediaTitleMismatch('spinning a bitcoin on a table','bitcoin'),false);
 }finally{globalThis.fetch=saved;}
});
