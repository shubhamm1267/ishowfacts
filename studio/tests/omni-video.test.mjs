import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createOmniProvider,omniFormats,omniSourceURL,downloadSource} from '../lib/omni-video.mjs';
import {footageChain} from '../lib/footage-chain.mjs';
import {usableVideoDimensions,preferredVideoFile} from '../lib/video-resolution.mjs';

test('OmniDL source URLs are public posts and formats prefer 1080p then 720p',()=>{
 assert.equal(omniSourceURL('https://youtu.be/085vQpDGZdw'),'https://www.youtube.com/watch?v=085vQpDGZdw');
 for(const url of ['http://youtube.com/watch?v=085vQpDGZdw','https://youtube.com.evil.test/watch?v=085vQpDGZdw','https://127.0.0.1/x','https://youtube.com/results?search_query=ice'])assert.equal(omniSourceURL(url),null);
 const formats=[360,2160,720,1080].map(h=>({kind:'video',label:h+'p'}));
 assert.deepEqual(omniFormats({items:[{type:'video',formats}]}).map(f=>f.label),['1080p','720p','2160p']);
 assert.equal(usableVideoDimensions(640,360),false);assert.equal(usableVideoDimensions(1280,720),true);
 assert.equal(preferredVideoFile({width:1920,height:1080},{width:1280,height:720})<0,true);
});

test('OmniDL searches once and shares one HD source download across separately verified excerpts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omni-live-'));let searches=0,extracts=0,downloads=0,checks=0;
 try{
  const provider=createOmniProvider({root:dir,run:async()=>'',discover:async()=>{searches++;return [{url:'https://www.youtube.com/watch?v=085vQpDGZdw'}];},
   extract:async()=>{extracts++;return {title:'Blood Falls',caption:'Taylor Glacier',items:[{type:'video',duration:600,formats:[{kind:'video',label:'1080p',sources:['https://example.test/source']}]}]};},download:async()=>{downloads++;}});
  const session={metrics:{searches:[]}},used=new Set();
  const options={session,used,topic:'Blood Falls',seconds:4,inspect:async item=>{checks++;assert.equal(item.provider,'OmniDL');assert.equal(item.sourceResolution,1080);return {checked:true};}};
  const results=await Promise.all([0,1].map(i=>provider('ice',join(dir,i+'.mp4'),options)));
  assert.equal(searches,1);assert.equal(extracts,1);assert.equal(downloads,1);assert.equal(checks,2);
  assert.notEqual(results[0].sourceStart,results[1].sourceStart);
  assert.ok(results.every(r=>r.checked&&r.rightsVerified===false));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('low quality and blocked OmniDL fall through in exact OmniDL Nexo Instagram order',async()=>{
 const calls=[],session={metrics:{searches:[]}};
 const chain=footageChain([
  ['OmniDL',async()=>{calls.push('OmniDL');throw Error('No HD source');}],
  ['Nexo',async()=>{calls.push('Nexo');return null;}],
  ['Instagram',async()=>{calls.push('Instagram');return {provider:'Instagram'};}]
 ]);
 assert.equal((await chain('subject','clip.mp4',{session})).provider,'Instagram');
 assert.deepEqual(calls,['OmniDL','Nexo','Instagram']);assert.equal(session.metrics.searches[0].provider,'OmniDL');
 calls.length=0;
 const primary=footageChain([['OmniDL',async()=>{calls.push('OmniDL');return {provider:'OmniDL'};}],['Nexo',async()=>assert.fail('Fallback ran after success')]]);
 assert.equal((await primary()).provider,'OmniDL');assert.deepEqual(calls,['OmniDL']);
});

test('OmniDL never downloads a 360p-only source or accepts a rejected excerpt',async()=>{
 const provider=createOmniProvider({run:async()=>'',root:'.',discover:async()=>[{url:'https://www.youtube.com/watch?v=085vQpDGZdw'}],
  extract:async()=>({items:[{type:'video',formats:[{kind:'video',label:'360p'}]}]}),download:()=>assert.fail('Low resolution source downloaded')});
 const session={metrics:{searches:[]}};
 assert.equal(await provider('ice','unused.mp4',{session,used:new Set(),topic:'ice',inspect:()=>assert.fail()}),null);
 assert.match(session.metrics.searches[0].error,/720p/);
});


test('an HD CDN body that stalls is aborted and its partial download is deleted',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omni-deadline-')),saved=globalThis.fetch;let cancelled=false;
 const keepAlive=setInterval(()=>{},1000);
 try{
  globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1500));},cancel(){cancelled=true;}}));
  await assert.rejects(downloadSource({url:'https://v1.pinimg.com/hd.mp4'},join(dir,'source.mp4'),{timeoutMs:100}),/abort/i);
  assert.equal(cancelled,true);assert.deepEqual(await readdir(dir),[]);
 }finally{clearInterval(keepAlive);globalThis.fetch=saved;await rm(dir,{recursive:true,force:true});}
});
