import test from 'node:test';
import assert from 'node:assert/strict';
import {runSceneWorkers,mediaBudget,assignMediaTypes,mediaBudgetIssues,createProcessLimiter,resourceBudget} from '../lib/media-workers.mjs';
import {commonsImage} from '../lib/core.mjs';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Resvg} from '@resvg/resvg-js';

test('small containers serialize heavy media work and bound encoder threads',()=>{
 for(const mib of [256,512,1024])assert.deepEqual(resourceBudget(mib*1048576),{lowMemory:true,processConcurrency:1,mediaConcurrency:1,ffmpegThreads:1});
 assert.deepEqual(resourceBudget(2048*1048576),{lowMemory:false,processConcurrency:3,mediaConcurrency:3,ffmpegThreads:2});
});

test('process limiter caps concurrent child work and releases a failed slot for queued work',async()=>{
 const limit=createProcessLimiter(3);let active=0,peak=0;const gates=[];
 const tasks=Array.from({length:8},(_,i)=>limit(async()=>{
  active++;peak=Math.max(peak,active);
  await new Promise(resolve=>gates.push(resolve));active--;
  if(i===1)throw Error('expected process failure');return i;
 }));
 const result=Promise.allSettled(tasks);
 for(let round=0;round<8;round++){await new Promise(resolve=>setImmediate(resolve));gates.splice(0).forEach(resolve=>resolve());}
 const rows=await result;assert.equal(peak,3);assert.equal(active,0);
 assert.equal(rows.filter(r=>r.status==='fulfilled').length,7);assert.equal(rows[1].status,'rejected');
 assert.equal(await limit(async()=>42),42);
});

test('short-video budgets aim for distinct 3-4 second shots and grow with duration',()=>{
 for(const [seconds,total] of [[20,6],[25,8],[30,9],[35,10],[40,12],[45,13],[50,15],[90,18],[100,20]])
  assert.deepEqual(mediaBudget(seconds),{videos:total,photos:0,total,preferVideo:true});
});

test('assigning video-first shots preserves story order, narration and cut timing',()=>{
 const episode={scenes:Array.from({length:7},(_,i)=>({visual:'photo',narration:'Line '+i,start:i*5,duration:5,factIndex:Math.min(2,Math.floor(i/3))}))};
 const before=episode.scenes.map(({narration,start,duration,factIndex})=>({narration,start,duration,factIndex}));
 assignMediaTypes(episode,{videos:7,photos:0,total:7,preferVideo:true});
 assert.deepEqual(episode.scenes.map(s=>s.visual),Array(7).fill('video'));
 assert.deepEqual(episode.scenes.map(({narration,start,duration,factIndex})=>({narration,start,duration,factIndex})),before);
 assert.throws(()=>assignMediaTypes({scenes:[]},mediaBudget(25)),/8 shots/);
});

test('video-first output accepts all clips or verified still fallbacks but never missing media',()=>{
 const budget={videos:5,photos:0,total:5,preferVideo:true};
 assert.deepEqual(mediaBudgetIssues([{video:true},{},{video:true},{},{video:true}],budget),[]);
 assert.deepEqual(mediaBudgetIssues([{video:true},{},{},{},{}],budget),[]);
 assert.deepEqual(mediaBudgetIssues(Array.from({length:5},()=>({video:true})),budget),[]);
 assert.ok(mediaBudgetIssues([{video:true},null,{video:true},{},{video:true}],budget).length);
});

test('two bounded media workers overlap waits and preserve scene order when the first is slower',async()=>{
 let releaseFirst;const barrier=new Promise(ok=>releaseFirst=ok);let active=0,maxActive=0;const finished=[];
 const result=await runSceneWorkers(5,2,async i=>{
  active++;maxActive=Math.max(maxActive,active);
  if(i===0)await barrier;
  if(i===4)releaseFirst();
  finished.push(i);active--;return 'scene-'+i;
 });
 assert.equal(maxActive,2);assert.equal(finished[0],1);assert.deepEqual(result,['scene-0','scene-1','scene-2','scene-3','scene-4']);
});
test('parallel Commons searches reserve different ranked photos before download completes',async()=>{
 const saved=globalThis.fetch,used=new Set(),folder=await mkdtemp(join(tmpdir(),'commons-parallel-'));
 const bytes=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1280"><rect width="1920" height="1280" fill="blue"/></svg>').render().asPng();
 const downloads=[];
 try{
  globalThis.fetch=async address=>{
   if(String(address).includes('/w/api.php'))return Response.json({query:{pages:Object.fromEntries([1,2].map(i=>[i,{index:i,title:'File:Giraffe-'+i+'.png',imageinfo:[{width:1920,height:1280,mime:'image/png',size:bytes.length,url:'https://upload.wikimedia.org/giraffe-'+i+'.png',extmetadata:{LicenseShortName:{value:'CC0'},LicenseUrl:{value:'https://creativecommons.org/publicdomain/zero/1.0/'},Artist:{value:'Photographer'}}}]}]))}});
   downloads.push(String(address));await Promise.resolve();
   const response=new Response(bytes);Object.defineProperty(response,'url',{value:String(address)});return response;
  };
  const results=await Promise.all([commonsImage('giraffe',join(folder,'one.png'),used),commonsImage('giraffe',join(folder,'two.png'),used)]);
  assert.ok(results.every(Boolean));assert.equal(new Set(results.map(r=>r.title)).size,2);assert.equal(new Set(downloads).size,2);
 }finally{globalThis.fetch=saved;}
});
