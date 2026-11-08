import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {instagramVideoUrl,instagramLinks,matchingInstagramRows,createInstagramProvider,discoverInstagram} from '../lib/instagram-video.mjs';
import {createStockSession,stockVideo} from '../lib/stock-video.mjs';
import {runWithProviders} from '../lib/core.mjs';

const urls=['https://www.instagram.com/reel/ABC123/','https://www.instagram.com/reel/DEF456/'];
const catalogue=urls.map(url=>({url,subjects:['octopus']}));
test('Instagram discovery accepts canonical posts, deduplicates embeds and rejects unsafe hosts',()=>{
 assert.equal(instagramVideoUrl('https://instagram.com/p/ABC123/?igsh=example'),urls[0]);
 for(const value of ['http://instagram.com/p/ABC123','https://instagram.com.evil.test/p/ABC123','https://u:p@instagram.com/p/ABC123','https://instagram.com:8080/p/ABC123','https://instagram.com/profile/','https://localhost/reel/ABC123'])assert.equal(instagramVideoUrl(value),null);
 assert.deepEqual(instagramLinks('<iframe src="https://www.instagram.com/p/ABC123/"></iframe> https://www.instagram.com/reel/ABC123/'),[urls[0]]);
 assert.equal(matchingInstagramRows(catalogue,'octopus').length,2);
 assert.equal(matchingInstagramRows(catalogue,'archerfish').length,0);
 assert.equal(matchingInstagramRows(catalogue,'blue ringed octopus').length,0,'a more specific identity cannot be replaced with generic octopus metadata');
});
test('public discovery follows only allowlisted article embeds and never fetches private endpoints',async()=>{
 const saved=globalThis.fetch;const calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));return new Response(calls.length===1?'<rss><item><link>http://127.0.0.1/private</link></item><item><link>https://www.hindustantimes.com/story</link></item></rss>':'<a href="https://www.instagram.com/reel/ABC123/">video</a>');};
 try{const rows=await discoverInstagram('octopus');assert.equal(rows[0].url,urls[0]);assert.equal(calls.length,2);assert.ok(!calls.some(u=>u.includes('127.0.0.1')));}finally{globalThis.fetch=saved;}
});
test('primary source is inspected before acceptance, unique across scenes, with honest provenance',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'facts-instagram-'));let downloads=0,reviews=0;
 const run=async(cmd,args)=>{
  downloads++;const source=args[args.indexOf('--url')+1],output=args[args.indexOf('--output')+1],metadata=args[args.indexOf('--metadata')+1];
  await writeFile(output,Buffer.alloc(2048,downloads));await writeFile(metadata,JSON.stringify({source,id:new URL(source).pathname.split('/')[2],title:'Octopus',author:'Creator'}));
 };
 try{
  const provider=createInstagramProvider({run,root:'.',catalogue,discover:async()=>[]});const session=createStockSession(),used=new Set();
  const inspect=async item=>{reviews++;assert.equal(item.provider,'Instagram');return {verified:true};};
  const a=await provider('octopus',join(folder,'a.mp4'),{subject:'octopus',session,used,inspect});
  const b=await provider('octopus',join(folder,'b.mp4'),{subject:'octopus',session,used,inspect});
  assert.notEqual(a.id,b.id);assert.equal(a.rightsVerified,false);assert.equal(downloads,2);assert.equal(reviews,2);
  assert.equal(await provider('octopus',join(folder,'c.mp4'),{subject:'octopus',session,used,inspect}),null);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('cleanliness rejection tries another source; source byte duplicates cannot masquerade as a new clip',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'facts-instagram-'));let reviews=0;
 const provider=createInstagramProvider({root:'.',catalogue,run:async(cmd,args)=>{
  const source=args[args.indexOf('--url')+1];await writeFile(args[args.indexOf('--output')+1],Buffer.alloc(2048,1));await writeFile(args[args.indexOf('--metadata')+1],JSON.stringify({source,id:new URL(source).pathname.split('/')[2]}));
 }});
 try{const result=await provider('octopus',join(folder,'clip.mp4'),{session:createStockSession(),used:new Set(),subject:'octopus',inspect:async()=>{reviews++;return null;}});assert.equal(result,null);assert.equal(reviews,1);}finally{await rm(folder,{recursive:true,force:true});}
});
test('blocked downloader is disabled for the rest of a job; a new job can retry',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'facts-instagram-'));
 let attempts=0;const provider=createInstagramProvider({root:'.',catalogue,run:async()=>{attempts++;throw Error('Instagram HTTP 403');}});
 const inspect=async()=>assert.fail('blocked downloads must not reach QA'),session=createStockSession();
 const args={session,used:new Set(),subject:'octopus',inspect};
 try{
 assert.equal(await provider('octopus',join(folder,'unused.mp4'),args),null);
 assert.equal(await provider('octopus',join(folder,'unused.mp4'),args),null);assert.equal(attempts,1);
 await provider('octopus',join(folder,'unused.mp4'),{...args,used:new Set(),session:createStockSession()});assert.equal(attempts,2);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('cancellation propagates instead of silently falling back',async()=>{
 const controller=new AbortController();controller.abort(Error('cancel test'));
 const provider=createInstagramProvider({root:'.',catalogue,run:async()=>assert.fail('cancelled work started')});
 await assert.rejects(runWithProviders({},()=>provider('octopus','unused.mp4',{session:createStockSession(),used:new Set(),subject:'octopus'}),controller.signal),/cancel test/);
});
test('stock orchestration invokes Instagram before any stock provider and falls back on unavailable primary',async()=>{
 const saved=globalThis.fetch;let calls=0,primary=false;
 globalThis.fetch=async()=>{calls++;assert.equal(primary,true);return new Response('');};
 try{
  const result=await stockVideo('octopus','unused.mp4',{instagram:async()=>{primary=true;return {provider:'Instagram',verified:true};}});
  assert.equal(result.provider,'Instagram');assert.equal(calls,0);
  primary=false;
  await assert.rejects(runWithProviders({VECTEEZY_API_KEY:'',VECTEEZY_ACCOUNT_ID:'',PEXELS_API_KEY:'',COVERR_API_KEY:''},()=>stockVideo('octopus','unused.mp4',{instagram:async()=>{primary=true;return null;},inspect:async()=>null})),/No verified clip/);
  assert.ok(calls>0);
 }finally{globalThis.fetch=saved;}
});
