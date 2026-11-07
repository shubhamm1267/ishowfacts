import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredSounds,buildAdvancedPlan} from '../lib/director.mjs';
import {demoEpisode,normalizeEpisode} from '../lib/core.mjs';

test('reference sound needs explicit query and reason; no cut whoosh or inferred impact boom',()=>{
 const episode=demoEpisode();episode.scenes.forEach(s=>{s.action='impact';s.effects=[{type:'flash'}];s.soundCue='';});
 assert.deepEqual(requiredSounds(episode,{visualStyle:'reference-news'}),[]);
 episode.scenes[1].soundCue='pop';episode.scenes[1].sfxQuery='quiet soap bubble pop';
 assert.deepEqual(requiredSounds(episode,{visualStyle:'reference-news'}),[]);
 episode.scenes[1].sfxReason='One visible bubble pops as the narrator mentions bursting.';
 episode.scenes[1].sfxAt=.7;
 assert.deepEqual(requiredSounds(episode,{visualStyle:'reference-news'}),['pop']);
 const plan=buildAdvancedPlan(episode,episode.scenes.map((_,i)=>({start:3*i,duration:3})),episode.scenes.map(()=>null),{pop:'/pop.mp3',whoosh:'/whoosh.mp3',boom:'/boom.mp3'},'/video.mp4',null,{demo:true,visualStyle:'reference-news'});
 assert.equal(plan.meta.whoosh_db,null);assert.equal(plan.sounds.length,1);assert.equal(plan.sounds[0].sfx,'pop');assert.equal(plan.sounds[0].t,5.1);
 assert.equal(plan.meta.audio_profile,'punchy-facts');assert.equal(plan.meta.lufs,-8.5);
 assert.ok(plan.scenes.every(s=>s.elements.every(e=>e.sfx===false)));
});
test('sound justification and cue timing survive storyboard normalization',()=>{
 const episode=demoEpisode();Object.assign(episode.scenes[0],{soundCue:'pop',sfxQuery:'bubble pop',sfxReason:'A bubble bursts on the indicated word.',sfxAt:.72});
 const normalized=normalizeEpisode(episode).scenes[0];assert.equal(normalized.sfxAt,.72);assert.match(normalized.sfxReason,/bubble/);
});
