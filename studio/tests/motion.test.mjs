import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {explainerSVG,animationKinds,prepareExplainers} from '../lib/explainer.mjs';
import {mkdtemp,stat,utimes,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeDiagram} from '../lib/core.mjs';
import {buildAdvancedPlan} from '../lib/director.mjs';
import {demoEpisode} from '../lib/core.mjs';

test('motion JSON survives normalization and compilation; arbitrary animation code is discarded',()=>{
 const raw={animation:'wave-field',heading:'हवा का असर',reason:'This narration needs a water-surface mechanism.',nodes:[{icon:'wind',label:'हवा'},{icon:'water',label:'पानी'}]};
 const diagram=normalizeDiagram(raw);assert.equal(diagram.animation,'wave-field');
 assert.equal(normalizeDiagram({...raw,animation:'eval(document.cookie)'}).animation,'process-flow');
 assert.equal(normalizeDiagram({...raw,animation:'solar-flow'}).animation,'process-flow');
 const episode=demoEpisode();episode.scenes[1].visual='diagram';episode.scenes[1].diagram=diagram;
 const plan=buildAdvancedPlan(episode,episode.scenes.map((_,i)=>({start:4*i,duration:4})),episode.scenes.map(()=>null),{},'/tmp/out.mp4',null,{demo:true,visualStyle:'reference-news'});
 assert.equal(plan.scenes[1].elements.find(e=>e.type==='infographic').animation,'wave-field');
});
test('compiled motion respects shot duration, reuses complete assets and repairs missing frames',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'motion-render-'));
 const original={meta:{fps:2},scenes:[{elements:[{type:'infographic',professional:true,dur:1,animation:'process-flow',nodes:[{label:'हवा',icon:'wind'},{label:'पानी',icon:'water'}]}]}]};
 const plan=structuredClone(original);await prepareExplainers(plan,folder);
 const output=plan.scenes[0].elements[0];assert.equal(output.frame_count,3);assert.equal(output.video_fps,2);assert.equal(output.anim,'none');
 const first=join(output.frames,'000000.png'),last=join(output.frames,'000002.png');
 const old=new Date('2000-01-01');await utimes(first,old,old);
 await prepareExplainers(structuredClone(original),folder);
 assert.equal((await stat(first)).mtimeMs,old.getTime());
 await rm(last);await prepareExplainers(structuredClone(original),folder);
 assert.equal((await readFile(last))[0],0x89);assert.ok((await stat(first)).mtimeMs>old.getTime());
});
test('all motion families render safely; time seeking is deterministic and input labels are escaped',()=>{
 for(const animation of animationKinds){
  const el={animation,heading:'<script>unsafe</script>',nodes:[{icon:'wind',label:'हवा',detail:'पानी के ऊपर'},{icon:'water',label:'पानी',detail:'ऊर्जा का असर'}]};
  const middle=explainerSVG(el,.5);explainerSVG(el,.95);
  assert.equal(explainerSVG(el,.5),middle);
  assert.doesNotMatch(middle,/<script>/);assert.match(middle,/&lt;script&gt;/);
  assert.notEqual(middle,explainerSVG(el,.15));
  const render=new Resvg(middle,{font:{loadSystemFonts:false}}).render();
  assert.equal(render.width,960);assert.equal(render.height,animation==='radio-link'?1225:1560);
 }
});
test('process diagrams preserve explicit relationships instead of adding a false sequential chain',()=>{
 const el={animation:'process-flow',nodes:[{label:'A'},{label:'B'},{label:'C'}],links:[{from:0,to:2,label:'direct'}]};
 const svg=explainerSVG(el,1);
 assert.match(svg,/M620 360H/);assert.match(svg,/H620m17-12/);assert.match(svg,/direct/);
 assert.doesNotMatch(svg,/M480 624v/);
});
