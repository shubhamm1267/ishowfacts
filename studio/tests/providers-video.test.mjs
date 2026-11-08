import test from 'node:test';
import assert from 'node:assert/strict';
import { gemini, runWithProviders, demoEpisode, wikipediaSource,commonsImage,openverseImage,inspectVideoFrames } from '../lib/core.mjs';
import { mixkitItem, vecteezyFree, syntheticStock, stockVideo,topicFootageAvailability,stockPhoto,createStockSession,createStockMediaCache,prefetchStockVideo,stockFile,stockLookup,commonsVideo,uploadDescription,moveCreditsToDescription } from '../lib/stock-video.mjs';
import {Resvg} from '@resvg/resvg-js';
import {mkdtemp,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { buildAdvancedPlan, validateAdvancedPlan } from '../lib/director.mjs';

const config = { GEMINI_API_KEY: 'test-primary', GEMINI_API_KEY_2: 'test-backup-2', GEMINI_API_KEY_3: 'test-backup-3' };
test('clean exports remove only media credit overlays and preserve public source/licence attribution',()=>{
 const credit={id:'youtube:123',title:'A named film',author:'Creator',source:'https://example.org/video',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',attribution:'Film by Creator',attributionUrl:'https://example.org/creator'};
 const plan={meta:{headline_hi:'A hook'},scenes:[{reference_media:{attribution:'Film by Creator',pointer:{target:'animal'}},elements:[{type:'video',attribution:'Film by Creator'},{type:'text',text:'Narrative label'}]}]};
 moveCreditsToDescription(plan);
 assert.equal(plan.scenes[0].reference_media.attribution,'');assert.equal(plan.scenes[0].elements[0].attribution,'');
 assert.equal(plan.scenes[0].elements[1].text,'Narrative label');assert.equal(plan.scenes[0].reference_media.pointer.target,'animal');
 const text=uploadDescription([credit,credit],[{name:'Fact source',url:'https://example.org/fact'}]);
 for(const value of ['Creator','https://example.org/video','CC BY 3.0','https://creativecommons.org/licenses/by/3.0/','https://example.org/creator','Changes:'])assert.ok(text.includes(value));
 assert.equal(text.split('A named film').length-1,1);assert.equal(credit.attribution,'Film by Creator');
});
test('research uses the complete article lead and keeps the successful summary on lead failure',async()=>{
 const saved=globalThis.fetch;
 const summary='A sourced summary about a distinctive animal and its scientific classification. '.repeat(4);
 const lead=summary+'They eat leaves high in trees and use their necks in combat. '.repeat(8);
 try{
  globalThis.fetch=async url=>String(url).includes('/summary/')?Response.json({title:'Giraffe',extract:summary,content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/Giraffe'}}}):Response.json({query:{pages:{'1':{title:'Giraffe',extract:lead}}}});
  assert.equal((await wikipediaSource('Giraffe')).extract,lead.trim());
  globalThis.fetch=async url=>String(url).includes('/summary/')?Response.json({title:'Giraffe',extract:summary}):new Response('busy',{status:429});
  assert.equal((await wikipediaSource('Giraffe')).extract,summary.trim());
 }finally{globalThis.fetch=saved;}
});

test('documentary stock rejects the observed non-AI cartoon and animation metadata',()=>{
 assert.equal(syntheticStock('Octopus Creature Swimming Motion with Colorful Tentacles and Small Bubbles Across an Orange and Black Striped Background.'),true);
 assert.equal(syntheticStock('Animated octopus underwater'),true);
 assert.equal(syntheticStock('Abstract peacock gradient background pattern'),true);
 assert.equal(syntheticStock('Octopus hiding underwater in sea - slow motion'),false);
});
test('stock review budget bounds Vecteezy downloads and still reaches Mixkit',async()=>{
 const saved=globalThis.fetch,setting=process.env.STOCK_VIDEO_CANDIDATES;
 const folder=await mkdtemp(join(tmpdir(),'stock-budget-')),seen=[];
 const bytes=Buffer.alloc(2000);bytes.write('ftyp',4);
 process.env.STOCK_VIDEO_CANDIDATES='2';
 try{
  globalThis.fetch=async address=>{
   const url=new URL(address),path=url.pathname;
   if(url.hostname==='api.vecteezy.com'){
    if(path.endsWith('/resources'))return Response.json({resources:Array.from({length:6},(_,i)=>({id:i+1,content_type:'video',title:'Real giraffe '+i,file_metadata:{available_file_types:[{extension:'mp4',size_in_bytes:2000}]}}))});
    if(path.endsWith('/download'))return Response.json({url:'https://static.vecteezy.com/'+path.split('/').at(-2)+'.mp4'});
    return Response.json({license_type:'commercial',ai_generated:false});
   }
   if(url.hostname==='www.vecteezy.com')return new Response('<h1>Giraffe Free Video</h1><a href="?license_type=free"><script type="application/ld+json">{"copyrightNotice":"Test Creator"}</script>');
   if(url.hostname==='static.vecteezy.com')return new Response(bytes);
   if(url.hostname==='mixkit.co'&&path.endsWith('giraffe-123/'))return new Response('<a data-license="videoFree"><script type="application/ld+json">{"@type":"VideoObject","name":"Real giraffe in grass","contentUrl":"https://assets.mixkit.co/123.mp4"}</script>');
   if(url.hostname==='mixkit.co')return new Response('<a href="/free-stock-video/giraffe-123/">Giraffe</a>');
   if(url.hostname==='assets.mixkit.co')return new Response(bytes);
   throw Error('Unexpected test URL');
  };
  const result=await runWithProviders({VECTEEZY_ACCOUNT_ID:'224151',VECTEEZY_API_KEY:'test'},()=>stockVideo('giraffe',join(folder,'clip.mp4'),{inspect:async item=>{seen.push(item.provider);return item.provider==='Mixkit'?{verified:true}:null;}}));
  assert.deepEqual(seen,['Vecteezy','Vecteezy','Mixkit']);assert.equal(result.provider,'Mixkit');
 }finally{globalThis.fetch=saved;if(setting===undefined)delete process.env.STOCK_VIDEO_CANDIDATES;else process.env.STOCK_VIDEO_CANDIDATES=setting;}
});
test('three clip workers prefer the actual topic and reserved IDs do not waste their candidate budget',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'topic-stock-')),bytes=Buffer.alloc(2000);
 bytes.write('ftyp',4);let unrelatedDownloads=0,mixkitCalls=0;
 try{
  globalThis.fetch=async address=>{
   const url=new URL(address),path=url.pathname;
   if(url.hostname==='api.vecteezy.com'){
    if(path.endsWith('/resources'))return Response.json({resources:['Woman holding food','African elephant eating','Elephant walking','Elephants in a herd'].map((title,i)=>({id:i+1,title,content_type:'video',file_metadata:{available_file_types:[{extension:'mp4',size_in_bytes:2000}]}}))});
    if(path.endsWith('/download'))return Response.json({url:'https://static.vecteezy.com/'+path.split('/').at(-2)+'.mp4'});
    return Response.json({license_type:'commercial',ai_generated:false});
   }
   if(url.hostname==='www.vecteezy.com')return new Response('<h1>Elephant Free Video</h1><a href="?license_type=free"><script type="application/ld+json">{"copyrightNotice":"Test Creator"}</script>');
   if(url.hostname==='static.vecteezy.com'){if(path==='/1.mp4')unrelatedDownloads++;return new Response(bytes);}
   mixkitCalls++;return new Response('Unavailable',{status:404});
  };
  const keys={VECTEEZY_ACCOUNT_ID:'224151',VECTEEZY_API_KEY:'test'},used=new Set();
  const results=await runWithProviders(keys,()=>Promise.all([0,1,2].map(i=>stockVideo('elephant food',join(folder,`clip-${i}.mp4`),{subject:'Elephant',used,inspect:async()=>({verified:true})}))));
  assert.deepEqual(results.map(r=>r.id).sort(),['vecteezy:2','vecteezy:3','vecteezy:4']);assert.equal(unrelatedDownloads,0);
  const reserved=new Set(),inspected=[];
  const result=await runWithProviders(keys,()=>stockVideo('elephant food',join(folder,'retry.mp4'),{subject:'Elephant',used:reserved,inspect:async item=>{
   inspected.push(item.id);if(item.id==='vecteezy:2'){reserved.add('vecteezy:3');return null;}return {verified:true};
  }}));
  assert.equal(result.id,'vecteezy:4');assert.deepEqual(inspected,['vecteezy:2','vecteezy:4']);assert.equal(mixkitCalls,0);
 }finally{globalThis.fetch=saved;}
});

test('Gemini uses primary, then backups only on failures; third succeeds', async () => {
  const saved = globalThis.fetch, seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(init.headers['x-goog-api-key']);
    if (seen.length < 3) return new Response('{"message":"quota"}', { status: seen.length === 1 ? 403 : 429 });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  try {
    assert.deepEqual(await runWithProviders(config, () => gemini('test')), { ok: true });
    assert.deepEqual(seen, Object.values(config));
  } finally { globalThis.fetch = saved; }
});
test('temporary Gemini server failures retry after all keys, with a bounded limit',async()=>{
 const saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>++calls<=3?new Response('busy',{status:503}):Response.json({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]});
  assert.deepEqual(await runWithProviders(config,()=>gemini('test')),{ok:true});assert.equal(calls,4);
  calls=0;globalThis.fetch=async()=>{calls++;return new Response('busy',{status:503});};
  await assert.rejects(runWithProviders(config,()=>gemini('test')),/Gemini unavailable/);assert.equal(calls,9);
  calls=0;globalThis.fetch=async()=>{calls++;return new Response('quota',{status:429});};
  await assert.rejects(runWithProviders(config,()=>gemini('test')),/Gemini unavailable/);assert.equal(calls,3);
 }finally{globalThis.fetch=saved;}
});

test('primary success never calls backups; invalid requests do not rotate; errors hide keys', async () => {
  const saved = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }); };
    await runWithProviders(config, () => gemini('test')); assert.equal(calls, 1);
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('bad ' + config.GEMINI_API_KEY, { status: 400 }); };
    await assert.rejects(runWithProviders(config, () => gemini('test')), e => /HTTP 400/.test(e.message) && !e.message.includes('test-primary'));
    assert.equal(calls, 1);
    calls = 0;
    globalThis.fetch = async () => { calls++; throw Error('network ' + config.GEMINI_API_KEY); };
    await assert.rejects(runWithProviders(config, () => gemini('test')), e => !e.message.includes('test-primary'));
    assert.equal(calls, 3);
  } finally { globalThis.fetch = saved; }
});
test('stock licence checks reject Restricted Mixkit despite misleading videoFree JSON', () => {
  const ld = '<script type="application/ld+json">{"@type":"VideoObject","name":"Ocean","contentUrl":"https://assets.mixkit.co/ocean.mp4"}</script>';
  assert.ok(mixkitItem('<a data-license="videoFree">Free</a>' + ld));
  assert.equal(mixkitItem('<a data-license="videoRestricted">Restricted</a>' + ld), null);
  assert.equal(mixkitItem(ld), null);
  assert.equal(vecteezyFree('<h1>Ocean Free Video</h1><a href="?license_type=free">'), true);
  assert.equal(vecteezyFree('<h1>Ocean Pro Video</h1>'), false);
});
test('director retains video frame sequence and attribution instead of flattening to photo', () => {
  const episode = demoEpisode();
  const media = { video: true, path: '/tmp/clip.mp4', frames: '/tmp/frames', fps: 10, frameCount: 20, attribution: 'Video by Vecteezy.com' };
  const plan = buildAdvancedPlan(episode, episode.scenes.map((_,i) => ({ start: i * 2, duration: 2 })), [media,null,null,null], {}, '/tmp/out.mp4', null, { demo: true });
  const el = plan.scenes[0].elements.find(e => e.type === 'video');
  assert.equal(el.frame_count, 20); assert.equal(el.attribution, media.attribution);
  assert.deepEqual(validateAdvancedPlan(plan), []);
});

test('a separately licensed video still remains a credited static image in the required 3+2 export',()=>{
 const episode=demoEpisode();episode.scenes.push({...episode.scenes.at(-1)});
 const moving={video:true,path:'/tmp/moving.mp4',frames:'/tmp/frames',fps:24,frameCount:96};
 const still={path:'/tmp/still.jpg',cutout:false,sourceMediaType:'video',attribution:'Video still: Creator / Vecteezy.com'};
 const images=[moving,still,moving,still,moving];
 const plan=buildAdvancedPlan(episode,episode.scenes.map((_,i)=>({start:i*4,duration:4})),images,{},'/tmp/out.mp4',null,{demo:true,visualStyle:'reference-news'});
 assert.deepEqual(plan.scenes.map(s=>s.reference_media.media_type),['video','photo','video','photo','video']);
 assert.equal(plan.scenes[1].reference_media.image,'/tmp/still.jpg');
 assert.equal(plan.scenes[1].reference_media.attribution,still.attribution);
});

test('voice-time prefetch shares in-flight lookups and isolates different provider credentials',async()=>{
 const saved=globalThis.fetch,session=createStockSession();let calls=0,release;
 const waiting=new Promise(resolve=>release=resolve);
 try{
  globalThis.fetch=async()=>{calls++;await waiting;return Response.json({resources:[{id:1}]});};
  const first=runWithProviders({VECTEEZY_ACCOUNT_ID:'1',VECTEEZY_API_KEY:'first'},()=>Promise.all([
   prefetchStockVideo(' Soda   Water ',{session}),prefetchStockVideo('soda water',{session})]));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
  const second=runWithProviders({VECTEEZY_ACCOUNT_ID:'1',VECTEEZY_API_KEY:'second'},()=>prefetchStockVideo('soda water',{session}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);release();await Promise.all([first,second]);
  assert.equal(session.metrics.metadataHits,1);
 }finally{release();globalThis.fetch=saved;}
});

function footageFixture(){
 const bytes=Buffer.alloc(2000);bytes.write('ftyp',4);
 const counts={search:0,licence:0,download:0,ticket:0};let permitted=true,invalid=false,payload=null;
 return {counts,bytes,setPermitted:value=>permitted=value,setInvalid:value=>invalid=value,setPayload:value=>payload=value,
  fetch:async address=>{
   const url=new URL(address),path=url.pathname;
   if(url.hostname==='api.vecteezy.com'){
    if(path.endsWith('/resources')){counts.search++;return Response.json({resources:[{id:21,title:'Real soda bubbles',content_type:'video',file_metadata:{available_file_types:[{extension:'mp4',size_in_bytes:bytes.length}]}}]});}
    if(path.endsWith('/download')){counts.ticket++;return Response.json({url:'https://static.vecteezy.com/21.mp4',required_attribution_url:'https://www.vecteezy.com/video/21?credit=required'});}
    return Response.json({license_type:'commercial',ai_generated:false});
   }
   if(url.hostname==='www.vecteezy.com'){counts.licence++;return new Response(permitted?'<h1>Soda Free Video</h1><a href="?license_type=free"><script type="application/ld+json">{"copyrightNotice":"Test Creator"}</script>':'<h1>Soda Pro Video</h1>');}
   if(url.hostname==='static.vecteezy.com'){counts.download++;return new Response(invalid?Buffer.alloc(2000,65):payload||bytes);}
   return new Response('',{status:404});
  }};
}

test('approved clip cache saves downloads but rechecks licence, attribution and every new scene',async()=>{
 const saved=globalThis.fetch,fixture=footageFixture(),folder=await mkdtemp(join(tmpdir(),'stock-reuse-'));
 const cache=createStockMediaCache({directory:join(folder,'cache')}),keys={VECTEEZY_ACCOUNT_ID:'1',VECTEEZY_API_KEY:'test'};
 let reviews=0;
 try{
  globalThis.fetch=fixture.fetch;
  const acquire=async(name,session)=>runWithProviders(keys,()=>stockVideo('soda',join(folder,name),{session,inspect:async()=>{reviews++;return {verified:true};}}));
  const first=createStockSession({cache});await runWithProviders(keys,()=>prefetchStockVideo('soda',{session:first}));
  await acquire('first.mp4',first);assert.equal(fixture.counts.search,1);
  const second=createStockSession({cache}),result=await acquire('second.mp4',second);
  assert.equal(fixture.counts.download,1);assert.equal(fixture.counts.licence,2);assert.equal(fixture.counts.ticket,2);assert.equal(reviews,2);
  assert.equal(second.metrics.cacheHits,1);assert.equal(result.attributionUrl,'https://www.vecteezy.com/video/21?credit=required');
  assert.deepEqual(await readFile(join(folder,'second.mp4')),fixture.bytes);
  fixture.setPermitted(false);
  await assert.rejects(acquire('restricted.mp4',createStockSession({cache})),/HTTP 404/);
  assert.equal(reviews,2);assert.equal(fixture.counts.download,1);
 }finally{globalThis.fetch=saved;}
});

test('rejected footage never enters cache and another account cannot reuse cached bytes',async()=>{
 const saved=globalThis.fetch,fixture=footageFixture(),folder=await mkdtemp(join(tmpdir(),'stock-rejected-'));
 const cache=createStockMediaCache({directory:join(folder,'cache')});
 const acquire=(name,key,approved)=>runWithProviders({VECTEEZY_ACCOUNT_ID:'1',VECTEEZY_API_KEY:key},()=>stockVideo('soda',join(folder,name),{session:createStockSession({cache}),inspect:async()=>approved?{verified:true}:null}));
 try{
  globalThis.fetch=fixture.fetch;
  await assert.rejects(acquire('rejected.mp4','first',false),/HTTP 404/);
  await acquire('approved.mp4','first',true);assert.equal(fixture.counts.download,2);
  await acquire('other-account.mp4','second',true);assert.equal(fixture.counts.download,3);
 }finally{globalThis.fetch=saved;}
});

test('clip cache enforces disk budget, expires entries and tolerates deleted job caches',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'stock-bounds-')),directory=join(folder,'cache'),source=join(folder,'source.mp4');let time=Date.now();
 await writeFile(source,Buffer.alloc(2000));const cache=createStockMediaCache({directory,maxBytes:2500,ttlMs:60000,now:()=>time});
 await cache.put('first',source);assert.equal(await cache.get('first',join(folder,'hit.mp4')),true);
 await cache.put('second',source);
 let total=0;for(const name of await readdir(directory))total+=(await stat(join(directory,name))).size;
 assert.ok(total<=2500);time+=120000;await cache.prune();assert.deepEqual(await readdir(directory),[]);
 assert.equal(await cache.get('first',join(folder,'expired.mp4')),false);
 const missing=createStockMediaCache({directory:join(folder,'not-created')});await missing.prune();assert.equal(await missing.get('anything',join(folder,'absent.mp4')),false);
});

test('invalid streamed downloads leave existing output intact and remove partial files',async()=>{
 const saved=globalThis.fetch,fixture=footageFixture(),folder=await mkdtemp(join(tmpdir(),'stock-stream-')),dest=join(folder,'clip.mp4');
 await writeFile(dest,'previous valid output');fixture.setInvalid(true);
 try{
  globalThis.fetch=fixture.fetch;
  await assert.rejects(runWithProviders({VECTEEZY_ACCOUNT_ID:'1',VECTEEZY_API_KEY:'test'},()=>stockVideo('soda',dest,{inspect:async()=>assert.fail('invalid bytes cannot reach frame review')})),/MP4\/MOV/);
  assert.equal(await readFile(dest,'utf8'),'previous valid output');assert.deepEqual(await readdir(folder),['clip.mp4']);
 }finally{globalThis.fetch=saved;}
});

test('stream byte limit rejects oversized clips even without a content-length header',async()=>{
 const saved=globalThis.fetch,previous=process.env.STOCK_VIDEO_MAX_MB,fixture=footageFixture(),folder=await mkdtemp(join(tmpdir(),'stock-overflow-'));
 const large=Buffer.alloc(6*1024*1024);large.write('ftyp',4);fixture.setPayload(large);process.env.STOCK_VIDEO_MAX_MB='5';
 try{
  globalThis.fetch=fixture.fetch;
  await assert.rejects(runWithProviders({VECTEEZY_ACCOUNT_ID:'1',VECTEEZY_API_KEY:'test'},()=>stockVideo('soda',join(folder,'clip.mp4'),{inspect:async()=>assert.fail('oversized media cannot be inspected')})),/download limit/);
  assert.deepEqual(await readdir(folder),[]);
 }finally{globalThis.fetch=saved;if(previous===undefined)delete process.env.STOCK_VIDEO_MAX_MB;else process.env.STOCK_VIDEO_MAX_MB=previous;}
});

test('metadata rejects known low resolution and selects the smallest eligible HD file',()=>{
 const files=[{extension:'mp4',size_in_bytes:100,width:640,height:480},{extension:'mp4',size_in_bytes:4000,width:3840,height:2160},{extension:'mp4',size_in_bytes:2000,width:1920,height:1080}];
 assert.equal(stockFile(files),files[2]);assert.equal(stockFile([files[0]]),undefined);
 assert.ok(stockFile([{extension:'mp4',size_in_bytes:2000}]),'unknown dimensions still require the existing ffprobe check');
});

test('photo searches share empty results within a job and retry failed lookups',async()=>{
 const saved=globalThis.fetch,session=createStockSession(),lookup=(...args)=>stockLookup(session,...args);let calls=0,fail=false;
 try{
  globalThis.fetch=async()=>{calls++;if(fail)throw Error('temporary network failure');return Response.json({query:{pages:{}},results:[]});};
  const options={lookup};
  await Promise.all([0,1,2].map(()=>commonsImage('same subject','unused.jpg',new Set(),options)));
  assert.equal(calls,1);
  await Promise.all([0,1].map(()=>openverseImage('same subject','unused.jpg',new Set(),options)));
  assert.equal(calls,2);
  fail=true;await assert.rejects(commonsImage('retry subject','unused.jpg',new Set(),options));assert.equal(calls,3);
  fail=false;assert.equal(await commonsImage('retry subject','unused.jpg',new Set(),options),null);assert.equal(calls,4);
 }finally{globalThis.fetch=saved;}
});

test('Commons HD video fallback rejects incompatible licences/hosts and requires fresh frame approval',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'commons-video-')),bytes=Buffer.alloc(2000);bytes.set([0x1a,0x45,0xdf,0xa3]);let downloads=0,reviews=0;
 const page=(title,license,url='https://upload.wikimedia.org/video.webm',width=1920)=>({title:'File:'+title+'.webm',imageinfo:[{url,width,height:1080,size:2000,mime:'video/webm',extmetadata:{LicenseShortName:{value:license},Artist:{value:'Test creator'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}}]});
 try{
  globalThis.fetch=async address=>String(address).includes('api.php')?Response.json({query:{pages:{1:page('Restricted','CC BY-NC 4.0'),2:page('Other host','CC0','https://example.com/video.webm'),3:page('Low resolution','CC0',undefined,640),4:page('Actual waterfall','CC BY 4.0')}}}):(downloads++,new Response(bytes));
  const result=await commonsVideo('waterfall',join(folder,'clip.mp4'),{inspect:async()=>{reviews++;return{verified:true};}});
  assert.equal(result.provider,'Wikimedia Commons');assert.equal(result.requiresAttribution,true);assert.match(result.attribution,/Test creator/);assert.equal(downloads,1);assert.equal(reviews,1);
  assert.deepEqual(await readFile(join(folder,'clip.mp4')),bytes);
  assert.equal(await commonsVideo('waterfall',join(folder,'rejected.mp4'),{inspect:async()=>null}),null);
 }finally{globalThis.fetch=saved;}
});

test('normal stock pipeline reaches Commons video after stock providers have no results',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'commons-fallback-')),bytes=Buffer.alloc(2000);bytes.write('OggS');
 try{
  globalThis.fetch=async address=>{
   const url=new URL(address);
   if(url.hostname==='commons.wikimedia.org')return Response.json({query:{pages:{1:{title:'File:Waterfall.ogv',imageinfo:[{url:'https://upload.wikimedia.org/waterfall.ogv',width:1920,height:1080,size:2000,mime:'video/ogg',extmetadata:{LicenseShortName:{value:'Public domain'}}}]}}}});
   if(url.hostname==='upload.wikimedia.org')return new Response(bytes);
   return new Response('',{status:404});
  };
  const r=await stockVideo('waterfall',join(folder,'clip.mp4'),{inspect:async()=>({verified:true})});
  assert.equal(r.provider,'Wikimedia Commons');assert.equal(r.requiresAttribution,false);
 }finally{globalThis.fetch=saved;}
});

test('concurrent Gemini calls occupy three distinct projects and hold slots until bodies are consumed',async()=>{
 const saved=globalThis.fetch,active=new Set(),started=[],release=[];let peak=0;
 try{
  globalThis.fetch=async(url,init)=>{
   const key=init.headers['x-goog-api-key'];assert.ok(!active.has(key),'same project cannot have two active requests');
   active.add(key);started.push(key);peak=Math.max(peak,active.size);
   return {ok:true,json:async()=>{await new Promise(resolve=>release.push(resolve));active.delete(key);return{candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]};}};
  };
  const tasks=runWithProviders(config,()=>Promise.all(Array.from({length:6},()=>gemini('parallel work'))));
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(started.length,3);assert.equal(new Set(started).size,3);assert.equal(peak,3);
  release.splice(0).forEach(resolve=>resolve());
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(started.length,6);assert.equal(active.size,3);
  release.splice(0).forEach(resolve=>resolve());await tasks;
  assert.equal(active.size,0);assert.equal(peak,3);
 }finally{release.splice(0).forEach(resolve=>resolve());globalThis.fetch=saved;}
});


test('access-denied searches skip repeated calls within a job while every fallback is still checked',async()=>{
 const saved=globalThis.fetch,session=createStockSession(),calls=new Map();
 const keys={VECTEEZY_ACCOUNT_ID:'1',VECTEEZY_API_KEY:'vec',PEXELS_API_KEY:'pex',COVERR_API_KEY:'cov'};
 try{
  globalThis.fetch=async address=>{
   const host=new URL(address).hostname;calls.set(host,(calls.get(host)||0)+1);
   if(host==='commons.wikimedia.org')return Response.json({query:{pages:{}}});
   return new Response('',{status:403});
  };
  for(const query of ['popcorn kernels','popcorn cooking']){
   await assert.rejects(runWithProviders(keys,()=>stockVideo(query,'unused.mp4',{session,inspect:async()=>assert.fail('no download exists')})),error=>{
    for(const provider of ['Vecteezy','Mixkit','Pexels','Coverr','Wikimedia Commons'])assert.ok(error.message.includes(provider));
    assert.match(error.message,/api.pexels.com: Stock provider HTTP 403/);return true;
   });
  }
  for(const host of ['api.vecteezy.com','mixkit.co','api.pexels.com','api.coverr.co'])assert.equal(calls.get(host),1,host);
  assert.equal(calls.get('commons.wikimedia.org'),2);
  assert.equal(session.metrics.searches.length,10);
  assert.ok(session.metrics.searches.every(row=>typeof row.query==='string'));
  assert.doesNotMatch(JSON.stringify(session.metrics),/Authorization|Bearer|api_key/);
 }finally{globalThis.fetch=saved;}
});

test('Pexels photos use bounded HD images, preserve licensing and verify actual dimensions',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'pexels-photo-'));let downloads=0;
 const small=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="340" height="281"/>').render().asPng();
 const hd=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1920"/>').render().asPng();
 try{
  globalThis.fetch=async(address,options)=>{
   const url=new URL(address);
   if(url.hostname==='api.pexels.com'){
    assert.equal(options.headers.Authorization,'secret');assert.equal(url.pathname,'/v1/search');
    return Response.json({photos:[1,2].map(id=>({id,width:6000,height:8000,url:'https://www.pexels.com/photo/'+id,alt:'Popcorn',photographer:'Creator',src:{large2x:'https://images.pexels.com/'+id+'.jpg'}}))});
   }
   assert.equal(url.hostname,'images.pexels.com');assert.deepEqual(options.headers,{});assert.equal(url.searchParams.get('fit'),'max');assert.equal(url.searchParams.get('h'),'1920');
   downloads++;return new Response(downloads===1?small:hd);
  };
  const photo=await runWithProviders({PEXELS_API_KEY:'secret'},()=>stockPhoto('popcorn',join(folder,'photo.jpg')));
  assert.equal(downloads,2);assert.equal(photo.id,'pexels-photo:2');assert.equal(photo.height,1920);
  assert.equal(photo.license,'Pexels License');assert.equal(photo.author,'Creator');
 }finally{globalThis.fetch=saved;}
});

test('Pexels tries four candidates when the first three fail visual inspection',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'pexels-four-')),bytes=Buffer.alloc(2000);bytes.write('ftyp',4);let inspected=0;
 try{
  globalThis.fetch=async address=>{
   const host=new URL(address).hostname;
   if(host==='mixkit.co')return new Response('');
   if(host==='api.pexels.com')return Response.json({videos:[1,2,3,4].map(id=>({id,url:'https://www.pexels.com/video/popcorn-'+id,user:{name:'Creator'},video_files:[{file_type:'video/mp4',width:1920,height:1080,link:'https://videos.pexels.com/'+id+'.mp4'}]}))});
   return new Response(bytes);
  };
  const clip=await runWithProviders({PEXELS_API_KEY:'secret'},()=>stockVideo('popcorn',join(folder,'clip.mp4'),{inspect:async()=>++inspected===4?{verified:true}:null}));
  assert.equal(inspected,4);assert.equal(clip.id,'pexels:4');
 }finally{globalThis.fetch=saved;}
});

test('Pexels fallback retains mandatory inspection and creator credit',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'pexels-')),bytes=Buffer.alloc(2000);bytes.write('ftyp',4);let inspected=0;
 try{
  globalThis.fetch=async(address,options)=>{
   const u=new URL(address);
   if(u.hostname==='mixkit.co')return new Response('');
   if(u.hostname==='api.pexels.com'){assert.equal(options.headers.Authorization,'secret');return Response.json({videos:[{id:7,url:'https://www.pexels.com/video/coffee-cup-7/',user:{name:'Creator',url:'https://www.pexels.com/@creator'},video_files:[{file_type:'video/mp4',width:1920,height:1080,link:'https://videos.pexels.com/test.mp4'}]}]});}
   if(u.hostname==='videos.pexels.com'){assert.deepEqual(options.headers,{});return new Response(bytes);}
   throw Error('unexpected request');
  };
  const item=await runWithProviders({PEXELS_API_KEY:'secret'},()=>stockVideo('coffee',join(folder,'clip.mp4'),{inspect:async()=>{inspected++;return {verified:true};}}));
  assert.equal(inspected,1);assert.equal(item.provider,'Pexels');assert.equal(item.requiresAttribution,true);assert.match(item.attribution,/Creator/);
 }finally{globalThis.fetch=saved;}
});

test('Coverr excludes premium and synthetic footage and tracks only the selected download',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'coverr-')),bytes=Buffer.alloc(2000);bytes.write('ftyp',4);let tracked=0,inspected=0;
 try{
  globalThis.fetch=async(address,options)=>{
   const u=new URL(address);
   if(u.hostname==='mixkit.co')return new Response('');
   if(u.hostname==='api.coverr.co'){
    assert.equal(options.headers['x-api-key'],'secret');
    if(options.method==='PATCH'){tracked++;assert.match(u.pathname,/good\/stats\/downloads$/);return new Response(null,{status:204});}
    const row={title:'Coffee cup',slug:'coffee',max_width:1920,max_height:1080,urls:{mp4_download:'https://cdn.coverr.co/good.mp4'}};
    return Response.json({hits:[{...row,id:'premium',is_premium:true},{...row,id:'ai',is_ai_generated:true},{...row,id:'good',is_ai_generated:false,is_premium:false}]});
   }
   if(u.hostname==='cdn.coverr.co'){assert.deepEqual(options.headers,{});return new Response(bytes);}
   throw Error('unexpected request');
  };
  const item=await runWithProviders({COVERR_API_KEY:'secret'},()=>stockVideo('coffee',join(folder,'clip.mp4'),{inspect:async()=>{inspected++;return {verified:true};}}));
  assert.equal(item.id,'coverr:good');assert.equal(inspected,1);assert.equal(tracked,1);
 }finally{globalThis.fetch=saved;}
});

test('original paper-style video inspection also rejects embedded captions and branding',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'clean-video-')),image=join(folder,'frame.jpg');await writeFile(image,Buffer.from([255,216,255,217]));
 let row={matches:true,noEmbeddedText:true,noEmbeddedBranding:true,confidence:.95};
 try{
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({frames:[row]})}]}}]});
  const check=()=>runWithProviders({GEMINI_API_KEY:'test'},()=>inspectVideoFrames([image],'animal','animal','animal'));
  assert.equal(await check(),true);row.noEmbeddedText=false;assert.equal(await check(),false);row.noEmbeddedText=true;delete row.noEmbeddedBranding;assert.equal(await check(),false);
 }finally{globalThis.fetch=saved;}
});


test('automatic topic feasibility searches Instagram first and downloads nothing before approval',async()=>{
 const saved=globalThis.fetch,events=[];
 try{
  globalThis.fetch=async address=>{events.push(String(address));assert.equal(new URL(address).hostname,'api.pexels.com');return Response.json({videos:[{url:'https://www.pexels.com/video/steam-iron-123/',video_files:[{width:1080,height:1920}]}]});};
  const result=await runWithProviders({PEXELS_API_KEY:'test'},()=>topicFootageAvailability('Steam iron',{discover:async()=>{events.push('Instagram first');return [];}}));
  assert.equal(events[0],'Instagram first');assert.equal(result.available,true);assert.equal(result.metadataOnly,true);assert.equal(events.length,2);
  const noMatch=await runWithProviders({PEXELS_API_KEY:'test'},()=>topicFootageAvailability('Rare undiscovered object',{discover:async()=>[]}));assert.equal(noMatch.available,null,'nonmatching titles are inconclusive, not proof that a common subject has no footage');
  globalThis.fetch=async()=>Response.json({videos:[]});
  assert.equal((await runWithProviders({PEXELS_API_KEY:'test'},()=>topicFootageAvailability('Rare undiscovered object',{discover:async()=>[]}))).available,false);
  globalThis.fetch=async()=>new Response('',{status:403});
  const blocked=await runWithProviders({PEXELS_API_KEY:'test'},()=>topicFootageAvailability('Rare undiscovered object',{discover:async()=>[]}));assert.equal(blocked.available,null,'a blocked provider is uncertainty, not proof of missing footage');
 }finally{globalThis.fetch=saved;}
});


test('blank green-screen devices and chroma placeholders are rejected before downloading',()=>{
 for(const title of ['Woman Using Smartphone with Green Screen','Blank blue-screen phone','Chroma key tablet','Device placeholder mockup'])assert.equal(syntheticStock(title),true);
 assert.equal(syntheticStock('A person using a working smartphone alarm'),false);
});
