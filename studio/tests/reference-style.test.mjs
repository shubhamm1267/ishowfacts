import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { focusTracks, normalizePointOut, preparePointerAssets, pointerSVG, normalizeHookTitle, prepareHeadlineAssets, layoutHeadline } from '../lib/reference-style.mjs';
import {explainerSVG,prepareExplainers} from '../lib/explainer.mjs';
import { demoEpisode } from '../lib/core.mjs';
import { buildAdvancedPlan } from '../lib/director.mjs';
import { validateInput, makeServer } from '../server.mjs';

test('unverified/absent focus never becomes a pointer; valid tracks retain coordinates',()=>{
  assert.deepEqual(focusTracks({frames:[{visible:false,confidence:.99,point:[.5,.5]}]},1),[]);
  assert.deepEqual(focusTracks({frames:[{visible:true,confidence:.7,point:[.5,.5]}]},1),[]);
  assert.deepEqual(focusTracks({frames:[{visible:true,confidence:.99,point:[2,.5]}]},1),[]);
  assert.deepEqual(focusTracks({frames:[{visible:true,confidence:.95,point:[.2,.7]}]},1),[{at:0,point:[.2,.7]}]);
  assert.equal(normalizePointOut({target:''}),null);
});
test('reference layout preserves banner and full media; pointer needs real inspected focus',()=>{
  const episode=demoEpisode();
  episode.scenes[0].pointOut=normalizePointOut({target:'visible eye',label:'Eye',kind:'circle',at:.3});
  const make=focus=>buildAdvancedPlan(episode,episode.scenes.map((_,i)=>({start:i*2,duration:2})),
    [{path:'/tmp/photo.jpg',focus},null,null,null],{},'/tmp/out.mp4',null,{demo:true,visualStyle:'reference-news'});
  const without=make([]),withFocus=make([{at:0,point:[.2,.4]}]);
  assert.equal(without.scenes[0].reference_media.pointer,null);
  assert.deepEqual(withFocus.scenes[0].reference_media.pointer.tracks,[{at:0,point:[.2,.4]}]);
  assert.equal(withFocus.meta.headline_hi,without.meta.headline_hi);
  assert.equal(withFocus.scenes[0].elements.length,0);
});
test('SVG animation assets are real SVG and reveal frames differ',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'svg-pointer-'));
  await preparePointerAssets(folder);
  assert.match(await readFile(join(folder,'arrow.svg'),'utf8'),/<svg/);
  assert.notDeepEqual(await readFile(join(folder,'arrow-00.png')),await readFile(join(folder,'arrow-11.png')));
});
test('reference style is the new API default with original paper opt-in',()=>{
  const old=process.env.DEMO_MODE;process.env.DEMO_MODE='1';
  try{assert.equal(validateInput({demo:true}).visualStyle,'reference-news');assert.equal(validateInput({demo:true,visualStyle:'paper'}).visualStyle,'paper');}
  finally{if(old===undefined)delete process.env.DEMO_MODE;else process.env.DEMO_MODE=old;}
});

test('arrow ends at the target without a dot; hook gets exactly one final emoji',()=>{
  assert.doesNotMatch(pointerSVG('arrow',1),/<circle/);
  assert.equal(normalizeHookTitle('लहरें कैसे बनती हैं? 😲 🤔'),'लहरें कैसे बनती हैं? 🤔');
  assert.equal(normalizeHookTitle('लहरें कैसे बनती हैं?'),'लहरें कैसे बनती हैं? 😲');
});
test('headline is shaped as a real SVG asset with bold Devanagari font',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'headline-shaping-'));
  const png=await prepareHeadlineAssets('लहरें किनारे तक आती कैसे हैं? 😲','लहरें किनारे',folder);
  assert.ok((await readFile(png)).length>1000);
  const svg=await readFile(join(folder,'headline.svg'),'utf8');
  assert.match(svg,/लहरें/);assert.match(svg,/किनारे/);assert.match(svg,/xml:space="preserve"/);
});

test('completed jobs expose a separate downloadable upload title after restart',async()=>{
  const id=randomUUID(), title='पानी की लहरें कैसे बनती हैं?';
  const folder=resolve(process.env.JOBS_DIR||fileURLToPath(new URL('../jobs/',import.meta.url)),id);
  await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'status.json'),JSON.stringify({id,status:'complete',title:'Episode title',youtubeTitle:title,video:true,warnings:[],sources:[],expiresAt:new Date(Date.now()+600000).toISOString()}));
  await writeFile(join(folder,'youtube-title.txt'),title+'\n');
  const server=makeServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try{
    const base=`http://127.0.0.1:${server.address().port}/api/jobs/${id}`;
    const status=await(await fetch(base)).json();assert.equal(status.youtubeTitle,title);
    assert.equal(status.uploadTitleUrl,`/api/jobs/${id}/title`);
    const download=await fetch(base+'/title');assert.equal(download.status,200);
    assert.equal(await download.text(),title+'\n');assert.match(download.headers.get('content-disposition'),/youtube-title.txt/);
  }finally{await new Promise(ok=>server.close(ok));}
});

test('title ink bounds reserve word gaps and emoji space; oversized headlines require rewriting',()=>{
  const layout=layoutHeadline('समुद्र की लहरें बनती कैसे हैं? 🤔');
  assert.ok(layout.size>=50);assert.ok(layout.right<=912.01);
  for(let i=1;i<layout.placed.length;i++)assert.ok(layout.placed[i].x-layout.placed[i-1].x-layout.placed[i-1].width>=27.99);
  assert.throws(()=>layoutHeadline('यह अत्यधिक लंबा शीर्षक इतने सारे शब्दों के कारण इस वीडियो की निर्धारित जगह से पूरी तरह बाहर निकल जाएगा 😲'),/too long/);
});
test('missing media does not manufacture a basic explainer; explicit reasoning enables professional diagram',()=>{
  const episode=demoEpisode();
  const timing=episode.scenes.map((_,i)=>({start:i*2,duration:2}));
  const plan=buildAdvancedPlan(episode,timing,[null,null,null,null],{},'/tmp/out.mp4',null,{demo:true,visualStyle:'reference-news'});
  assert.ok(!plan.scenes.some(s=>s.elements.some(e=>e.type==='infographic')));
  episode.scenes[1].visual='diagram';episode.scenes[1].diagram={reason:'The spoken internal mechanism cannot be seen in footage.',nodes:[{label:'Input',detail:'Wind',icon:'wind'},{label:'Result',detail:'Wave',icon:'water'}],links:[{from:0,to:1}],style:'mechanism'};
  const explicit=buildAdvancedPlan(episode,timing,[null,null,null,null],{},'/tmp/out.mp4',null,{demo:true,visualStyle:'reference-news'});
  assert.equal(explicit.scenes[1].elements.find(e=>e.type==='infographic').professional,true);
  assert.notEqual(explainerSVG(episode.scenes[1].diagram,.1),explainerSVG(episode.scenes[1].diagram,1));
});
