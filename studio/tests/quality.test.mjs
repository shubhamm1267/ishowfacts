import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialIssues,shotReview,renderedIssues,narrationIssues,repairReviewed,QualityError,narrationTempo} from '../lib/quality.mjs';
import {verificationGemini,runWithProviders,finalizeEpisode,repairMediaBrief,applyEditorialTextRepair,applyComedyEdges,repairComedyEdges} from '../lib/core.mjs';
import {framingReviewer} from '../lib/visual-quality.mjs';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const source={extract:'The animal is the tallest living terrestrial animal. Its diet includes leaves. Males engage in necking.'};
const episode={scenes:[{},{}]};

test('comedy repair changes only opening and ending narration, preserving approved structure',()=>{
 const original={facts:['a','b','c'],scenes:[{narration:'first',factIndex:0,videoQuery:'original'},{narration:'middle',factIndex:1},{narration:'last',factIndex:2,duration:5}]};
 const changed=applyComedyEdges(original,{opening:'new first',ending:'new last',facts:['wrong']});
 assert.equal(changed.scenes[0].narration,'new first');assert.equal(changed.scenes[2].narration,'new last');
 assert.deepEqual(changed.scenes[1],original.scenes[1]);assert.deepEqual(changed.facts,original.facts);
 assert.equal(changed.scenes[0].videoQuery,'original');assert.equal(changed.scenes[2].duration,5);
 assert.equal(original.scenes[0].narration,'first');
 assert.throws(()=>applyComedyEdges(original,{opening:'missing ending'}),/Incomplete/);
});

test('one targeted comedy proposal preserves the middle and malformed output cannot replace narration',async()=>{
 const saved=globalThis.fetch;let calls=0,valid=true;
 const original={language:'en',scenes:[{narration:'first'},{narration:'middle'},{narration:'last'}]};
 try{
  globalThis.fetch=async(url,options)=>{calls++;assert.match(JSON.parse(options.body).contents[0].parts[0].text,/TARGETED COMEDY EDGE REPAIR/);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(valid?{opening:'new first',ending:'new last'}:{opening:'missing ending'})}]}}]});};
  const result=await runWithProviders({GEMINI_API_KEY:'one',GEMINI_API_KEY_2:'two',GEMINI_API_KEY_3:'three'},()=>repairComedyEdges(original,{extract:'Source facts'}));
  assert.equal(calls,1);assert.equal(result.scenes[1].narration,'middle');
  valid=false;assert.equal(await runWithProviders({GEMINI_API_KEY:'one'},()=>repairComedyEdges(original,{extract:'Source facts'})),null);
 }finally{globalThis.fetch=saved;}
});

test('editorial text repair preserves shot identity, media and timing while accepting text-only responses',()=>{
 const story={headlineText:'Old hook',language:'hi',facts:['one','two','three'],scenes:[{factIndex:0,narration:'old',visual:'video',videoQuery:'original animal',duration:5,pointOut:{target:'animal',label:'old'}}]};
 const update={facts:['a','b','c'],headlineText:'New hook',scenes:[{narration:'corrected',line1:'Caption',visual:'diagram',videoQuery:'wrong animal',duration:100,pointOutLabel:'new'}]};
 const fixed=applyEditorialTextRepair(story,update);
 assert.equal(fixed.scenes[0].visual,'video');assert.equal(fixed.scenes[0].videoQuery,'original animal');assert.equal(fixed.scenes[0].duration,5);
 assert.equal(fixed.scenes[0].factIndex,0);assert.equal(fixed.scenes[0].narration,'corrected');assert.equal(fixed.scenes[0].pointOut.label,'new');
 assert.equal(story.scenes[0].narration,'old');assert.equal(fixed.headlineText,'New hook');
 assert.throws(()=>applyEditorialTextRepair(story,{...update,scenes:[]}),/shot count/);
 assert.throws(()=>applyEditorialTextRepair(story,{...update,scenes:[{narration:'fixed',factIndex:2}]}),/fact assignment/);
});

test('repair iterations retain earlier rejection reasons and expose exact final issues',async()=>{
 const history=[];let n=0;
 await assert.rejects(repairReviewed({}, {
  attempts:2,review:async()=>({review:{approved:false},issues:[['Opening needs comedy','Unsupported causal claim','Incorrect Hindi spelling'][n++]]}),
  repair:async(e,issues,attempt,previous)=>{history.push(previous);return e;}
 }),e=>e instanceof QualityError&&e.message.includes('Incorrect Hindi spelling')&&e.issues[0]==='Incorrect Hindi spelling');
 assert.deepEqual(history,[[],['Opening needs comedy']]);
});

test('energetic narration corrects only slow outliers with a bounded pitch-preserving tempo',()=>{
 const line='one two three four five six seven eight nine ten';
 assert.equal(narrationTempo(line,5,{energetic:true}),1.12);
 assert.equal(narrationTempo(line,2,{energetic:true}),1);
 assert.equal(narrationTempo(line,5,{energetic:false}),1);
 assert.equal(narrationTempo('one two',4,{energetic:true}),1);
 assert.equal(narrationTempo(line,NaN,{energetic:true}),1);
});
const approved=()=>({languageReview:{approved:true,issues:[]},spokenClaimChallenge:{approved:true,issues:[]},hookEvidence:{premiseSupported:true,answered:true,sourceQuote:"the tallest living terrestrial animal",reason:"The source supports the opening premise and supplied answer."},approved:true,confidence:.95,topicMatches:true,hookAnswered:true,scopePreserved:true,headlineFaithful:true,naturalDialogue:true,
 facts:['the tallest living terrestrial animal','Its diet includes leaves','Males engage in necking'].map((sourceQuote,index)=>({index,sourceQuote,supported:true,confidence:.95})),
 scenes:[0,1].map(index=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:"Its diet includes leaves"})),issues:[]});
const frame=()=>({topicMatches:true,exactEntityMatches:true,realMedia:true,noEmbeddedText:true,noEmbeddedBranding:true,noPlaceholder:true,subjectVisible:true,roleAppropriate:true,cropVisible:true,requiredFeatureVisible:true,focus:[.8,.4],confidence:.95});

test('hidden-anatomy context contracts name the visible animal rather than requiring cells in whole-animal footage',async()=>{
 const {prepareMediaContracts}=await import('../lib/core.mjs');const saved=globalThis.fetch;
 const source={title:'Camel',extract:'Camel red blood cells are oval rather than circular in shape.'};
 const episode={scenes:[{narration:'An opening'},{narration:'Their cells have an oval shape.',subjectEntity:'Camel blood cells',factIndex:0}]};
 try{
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({scenes:[{index:1,changeToContext:true,shownActionRequired:false,subjectEntity:'Camel blood cells',visualQuery:'camel standing outdoors',videoQuery:'camel resting outdoors',sourceQuote:source.extract,reason:'Invisible cellular fact uses animal context'}]})}]}}]});
  const applied=await runWithProviders({GEMINI_API_KEY:'test'},()=>prepareMediaContracts(episode,source));
  assert.equal(applied[0].subjectEntity,'Camel');assert.equal(episode.scenes[1].subjectEntity,'Camel');
  assert.equal(episode.scenes[1].narration,'Their cells have an oval shape.');assert.equal(episode.scenes[1].visualRole,'context');
 }finally{globalThis.fetch=saved;}
});
test('editorial approval requires exact source evidence, all shots and preserved hook/scope',()=>{
 assert.deepEqual(editorialIssues(approved(),episode,source),[]);
 const unsupported=approved();unsupported.facts[0].sourceQuote='An invented claim that is not present';
 assert.match(editorialIssues(unsupported,episode,source).join(' '),/source excerpt/);
 const wrong=approved();wrong.hookAnswered=false;wrong.scopePreserved=false;wrong.scenes.pop();
 assert.equal(editorialIssues(wrong,episode,source).length,3);
 assert.ok(editorialIssues({approved:true},episode,source).length>0);
});

test('random fact evidence must belong to its assigned source rather than another topic',()=>{
 const review=approved();
 const grouped={extract:source.extract,articles:review.facts.map(f=>({extract:f.sourceQuote}))};
 assert.deepEqual(editorialIssues(review,episode,grouped),[]);
 review.facts[0].sourceQuote=review.facts[1].sourceQuote;
 assert.match(editorialIssues(review,episode,grouped).join(' '),/source excerpt/);
});

test('approved metadata cannot excuse an unsupported opening or uncited spoken assertion',()=>{
 const review=approved();review.hookEvidence.premiseSupported=false;
 assert.match(editorialIssues(review,episode,source).join(' '),/Opening premise/);
 review.hookEvidence.premiseSupported=true;review.scenes[1].sourceQuote='An unsupported causal explanation';
 assert.match(editorialIssues(review,episode,source).join(' '),/Scene 2 narration lacks/);
 const compilation={extract:source.extract,articles:[{extract:'Its diet includes leaves'},{extract:'Males engage in necking'}]};
 const assigned={scenes:[{factIndex:0},{factIndex:1}]};
 assert.match(editorialIssues(approved(),assigned,compilation).join(' '),/Scene 2 narration lacks/);
});
test('an earlier legal win cannot omit a reversal in its cited source context',()=>{
 const original='The High Court exempted the product from tax.';
 const reversal='In May 2009 the Court of Appeal reversed the earlier decision.';
 const evidence={extract:source.extract+' '+original+' '+reversal};
 const review=approved();review.scenes[0].sourceQuote=original;review.scenes[1].sourceQuote=reversal;
 const story={scenes:[{factIndex:0,narration:'कंपनी ने कोर्ट में जीतकर टैक्स से छूट ले ली।'},{factIndex:0,narration:'लेकिन बाद में अपील में फैसला पलट गया।'}]};
 assert.deepEqual(editorialIssues(review,story,evidence),[]);
 story.scenes[1].narration='इस तरह कंपनी टैक्स से बच गई!';
 assert.match(editorialIssues(review,story,evidence).join(' '),/omits the adjacent appeal reversal/);
 story.scenes[0].narration='2008 में कोर्ट ने कंपनी को टैक्स से छूट दी थी।';
 story.scenes[1].narration='उस समय यह फैसला आया था।';
 assert.deepEqual(editorialIssues(review,story,evidence),[]);
});

test('wrong media and lost crop fail separately; only normalized focus can repair framing',()=>{
 const record=frame();record.cropVisible=false;
 let result=shotReview({frames:[record]},1);assert.equal(result.sourceApproved,true);assert.equal(result.cropApproved,false);assert.deepEqual(result.focus,[{at:.5,point:[.8,.4]}]);
 record.focus=[80,40];assert.deepEqual(shotReview({frames:[record]},1).focus,[]);
 record.topicMatches=false;assert.equal(shotReview({frames:[record]},1).sourceApproved,false);
 record.topicMatches=true;record.exactEntityMatches=false;record.roleAppropriate=true;
 assert.equal(shotReview({frames:[record]},1).sourceApproved,false,'context cannot excuse a different named species');
 assert.equal(shotReview({frames:[frame()]},3).sourceApproved,false);
});
test('shot reviews accept direct arrays without relaxing any evidence or crop checks',()=>{
 const rows=[frame(),frame(),frame()];
 assert.deepEqual(shotReview(rows,3),shotReview({frames:rows},3));
 assert.equal(shotReview(rows,3).cropApproved,true);
 assert.equal(shotReview(rows.slice(0,2),3).sourceApproved,false);
 assert.equal(shotReview([null],1).sourceApproved,false);
 assert.equal(shotReview([{...frame(),realMedia:false}],1).sourceApproved,false);
 assert.equal(shotReview([{...frame(),confidence:.7}],1).sourceApproved,false);
 assert.equal(shotReview([{...frame(),cropVisible:false}],1).cropApproved,false);
});

test('final exported frame review identifies only the affected scene, malformed review rejects all',()=>{
 const good={topicMatches:true,exactEntityMatches:true,subjectVisible:true,headlineCorrect:true,layoutCorrect:true,noPlaceholder:true,confidence:.95};
 assert.deepEqual(renderedIssues({approved:true,confidence:.95,frames:[good,{...good,subjectVisible:false,reason:'Subject cropped out'}]},[2,4]).indices,[4]);
 assert.deepEqual(renderedIssues({},[2,4]).indices,[2,4]);
 assert.deepEqual(renderedIssues({approved:true,confidence:.95,frames:[{...good,exactEntityMatches:false}]},[4]).indices,[4]);
});
test('natural voice gate rejects robotic timbre despite correct transcript and approval',()=>{
 const review={approved:true,confidence:.95,issues:[],naturalness:8,pronunciation:8,deliveryConsistency:8,roboticArtifacts:false,masculineDelivery:true};
 assert.deepEqual(narrationIssues(review,{requireNatural:true}),[]);
 assert.match(narrationIssues({...review,roboticArtifacts:true},{requireNatural:true}).join(' '),/Robotic/);
 assert.ok(narrationIssues({approved:true,confidence:.99,issues:[]},{requireNatural:true}).length>0);
});
test('automatic editorial repairs are bounded, re-reviewed and cannot return unchecked output',async()=>{
 let repairs=0,reviews=0;
 const result=await repairReviewed({revision:0},{review:async c=>{reviews++;return{issues:c.revision?[]:['Wrong hook'],review:{revision:c.revision}};},repair:async c=>{repairs++;return{revision:c.revision+1};}});
 assert.equal(result.repairs,1);assert.equal(repairs,1);assert.equal(reviews,2);
 await assert.rejects(repairReviewed({},{attempts:1,review:async()=>({issues:['Still wrong']}),repair:async()=>({})}),QualityError);
});
test('independent review rotates starting key slots and retains quota/auth fallback',async()=>{
 const saved=globalThis.fetch,seen=[];
 try{
  globalThis.fetch=async(url,init)=>{
   const key=init.headers['x-goog-api-key'];seen.push(key);
   return key==='second'?new Response('',{status:401}):Response.json({candidates:[{content:{parts:[{text:'{"approved":true}'}]}}]});
  };
  await runWithProviders({GEMINI_API_KEY:'first',GEMINI_API_KEY_2:'second',GEMINI_API_KEY_3:'third'},()=>verificationGemini('review',null,1));
  assert.deepEqual(seen,['second','third']);
  seen.length=0;
  await runWithProviders({GEMINI_API_KEY:'first',GEMINI_API_KEY_2:'second',GEMINI_API_KEY_3:'third'},()=>verificationGemini('review',null,2));
  assert.deepEqual(seen,['third']);
 }finally{globalThis.fetch=saved;}
});

test('review requests reasoning on supported models and ignores thought parts in JSON parsing',async()=>{
 const saved=globalThis.fetch,configs=[];
 try{
  globalThis.fetch=async(url,init)=>{
   configs.push(JSON.parse(init.body).generationConfig);
   return Response.json({candidates:[{content:{parts:[{thought:true,text:'not output JSON'},{text:'{"approved":false,"issues":["Unsupported cause"]}'}]}}]});
  };
  for(const model of ['gemini-3.5-flash-lite','gemini-2.5-flash','custom-model']){
   const result=await runWithProviders({GEMINI_API_KEY:'test',GEMINI_MODEL:model},()=>verificationGemini('challenge'));
   assert.equal(result.approved,false);
  }
  assert.deepEqual(configs.map(c=>c.thinkingConfig),[{thinkingLevel:'medium'},{thinkingBudget:1024},undefined]);
 }finally{globalThis.fetch=saved;}
});
test('malformed review citations are repaired without rewriting an approved storyboard',async()=>{
 const saved=globalThis.fetch,calls=[];
 const story={language:'en',topic:'Wildlife',facts:approved().facts.map(f=>f.sourceQuote),scenes:[{factIndex:0,visual:'photo',narration:'Wildlife has unusual traits.'},{factIndex:1,visual:'photo',narration:'Wildlife has varied diets.'},{factIndex:2,visual:'photo',narration:'Wildlife has different behaviour.'}]};
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;calls.push(prompt);
   const review=approved();review.scenes=story.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:review.facts[index].sourceQuote}));
   if(prompt.startsWith('SPOKEN CLAIM CHALLENGE'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({approved:true,issues:[]})}]}}]});
   if(prompt.startsWith('REPAIR REVIEW CITATIONS ONLY'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({facts:review.facts})}]}}]});
   review.facts=review.facts.slice(0,1);
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(review)}]}}]});
  };
  const result=await runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(story,source));
  assert.deepEqual(result,story);assert.equal(calls.length,2);assert.equal(calls.filter(p=>p.startsWith('REPAIR REVIEW CITATIONS ONLY')).length,1);
 }finally{globalThis.fetch=saved;}
});

test('shot and hook citation repair preserves the approved story and cannot approve a rejected premise',async()=>{
 const saved=globalThis.fetch,calls=[];
 const story={language:'en',facts:approved().facts.map(f=>f.sourceQuote),scenes:[0,1,2].map(factIndex=>({factIndex,visual:'photo'}))};
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;calls.push(prompt);
   const valid=approved();valid.scenes=story.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:valid.facts[index].sourceQuote}));
   if(prompt.startsWith('SPOKEN CLAIM CHALLENGE'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({approved:true,issues:[]})}]}}]});
   if(prompt.startsWith('REPAIR REVIEW CITATIONS ONLY'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({facts:valid.facts,scenes:valid.scenes,hookSourceQuote:valid.hookEvidence.sourceQuote})}]}}]});
   valid.scenes[1].sourceQuote='omitted ... source text';valid.hookEvidence.sourceQuote='omitted ... source text';
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(valid)}]}}]});
  };
  assert.deepEqual(await runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(story,source)),story);
  assert.equal(calls.length,2);assert.equal(calls.filter(p=>p.startsWith('REPAIR REVIEW CITATIONS ONLY')).length,1);
  const rejected=approved();rejected.hookEvidence.premiseSupported=false;
  assert.match(editorialIssues(rejected,episode,source).join(' '),/Opening premise/);
 }finally{globalThis.fetch=saved;}
});

test('the combined spoken-claim verdict blocks guarantees despite broad editorial approval',async()=>{
 const saved=globalThis.fetch;
 const story={language:'en',headlineText:'The animal has unusual traits 🤔',facts:approved().facts.map(f=>f.sourceQuote),scenes:[0,1,2].map(factIndex=>({factIndex,visual:'photo',narration:source.extract,line1:'Animal',line2:'Traits',visualQuery:'animal leaves'}))};
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   const result=approved();result.scenes=story.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:result.facts[index].sourceQuote}));
   result.spokenClaimChallenge={approved:false,issues:['Unsupported guarantee of a perfect result']};
   const answer=prompt.startsWith('AUTOMATIC EDITORIAL REPAIR')?story:result;
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]});
  };
  await assert.rejects(runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(story,source)),error=>error instanceof QualityError&&error.issues.some(i=>i.includes('Unsupported guarantee')));
 }finally{globalThis.fetch=saved;}
});
test('local framing preserves chosen fit without inventing an AI subject or pointer location',async()=>{
 const saved=globalThis.fetch,assets=await mkdtemp(join(tmpdir(),'crop-review-'));
 try{
  globalThis.fetch=()=>{throw Error('Visual review must not call Gemini');};
  const verify=framingReviewer({root:'.',python:'python',assets,fit:'contain',run:async()=>JSON.stringify({frames:[{approved:true,issues:[],hashUseful:false}],warnings:[]})});
  const result=await verify(['source.jpg'],{subjectEntity:'Peacock'},'Peacock','test',{title:'Peacock in a garden'});
  assert.equal(result.mediaFit,'contain');assert.deepEqual(result.subjectFocus,[]);assert.equal(result.focus,undefined);
 }finally{globalThis.fetch=saved;}
});

test('media search repair requires source evidence and cannot overwrite spoken content or add code',async()=>{
 const saved=globalThis.fetch;let valid=true;
 try{
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({subjectEntity:'Relevant animal',visualQuery:'animal leaves',videoQuery:'animal feeding',visualRole:'context',sourceQuote:valid?'Its diet includes leaves':'This invented supporting quotation is absent',narration:'changed',facts:['changed'],script:'unsafe'})}]}}]});
  const scene={narration:'Unchanged source-backed line',factIndex:1};
  const result=await runWithProviders({GEMINI_API_KEY:'test'},()=>repairMediaBrief(scene,source,'Wildlife'));
  assert.deepEqual(Object.keys(result).sort(),['subjectEntity','videoQuery','visualQuery','visualRole']);assert.equal(scene.narration,'Unchanged source-backed line');
  valid=false;assert.equal(await runWithProviders({GEMINI_API_KEY:'test'},()=>repairMediaBrief(scene,source,'Wildlife')),null);
 }finally{globalThis.fetch=saved;}
});

test('Hindi and causal checks use one combined request with explicit verdicts',async()=>{
 const saved=globalThis.fetch,seen=new Set();
 const story={language:'hi',headlineText:'एक खास जानवर 🤔',facts:approved().facts.map(f=>f.sourceQuote),scenes:[0,1,2].map(factIndex=>({factIndex,visual:'photo',narration:'क्या कभी इस जानवर को देखा है?',line1:'जानवर',line2:'खास',visualQuery:'animal'}))};
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   const kind=prompt.startsWith('EDITORIAL EVIDENCE REVIEW')?'editorial':prompt.startsWith('SPOKEN CLAIM CHALLENGE')?'claims':'hindi';
   seen.add(kind);assert.match(prompt,/COMBINED REVIEW/);assert.match(prompt,/CAUSAL MECHANISM AUDIT/);
   const review=approved();review.scenes=story.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:review.facts[index].sourceQuote}));
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(kind==='editorial'?review:{approved:true,issues:[]})}]}}]});
  };
  assert.deepEqual(await runWithProviders({GEMINI_API_KEY:'parallel-a',GEMINI_API_KEY_2:'parallel-b',GEMINI_API_KEY_3:'parallel-c'},()=>finalizeEpisode(story,source)),story);
  assert.deepEqual([...seen],['editorial']);
 }finally{globalThis.fetch=saved;}
});

test('local duration check still rejects a script that is too short',async()=>{
 const saved=globalThis.fetch;
 const story={language:'en',headlineText:'The animal has unusual traits 🤔',facts:approved().facts.map(f=>f.sourceQuote),scenes:[0,1,2].map(factIndex=>({factIndex,visual:'photo',narration:source.extract,line1:'Animal',line2:'Traits',visualQuery:'animal leaves'}))};
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   const result=approved();result.scenes=story.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:result.facts[index].sourceQuote}));
   const answer=prompt.startsWith('SPOKEN CLAIM CHALLENGE')?{approved:true,issues:[]}:prompt.startsWith('AUTOMATIC EDITORIAL REPAIR')?story:result;
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]});
  };
  await assert.rejects(runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(story,source,{seconds:30})),error=>error instanceof QualityError&&error.issues.some(i=>i.includes('Narration has'))&&!error.issues.some(i=>i.includes('Opening needs'))&&!error.issues.some(i=>i.includes('Final spoken line')));
 }finally{globalThis.fetch=saved;}
});


test('local validation failures use bounded repair and still require a fresh review',async()=>{
 let repairs=0,reviews=0;
 const result=await repairReviewed({valid:false},{validate:e=>{if(!e.valid)throw new QualityError('Invalid',['Fix hook']);},repair:async(e,issues)=>{repairs++;assert.deepEqual(issues,['Fix hook']);return{valid:true};},review:async()=>{reviews++;return{review:{approved:true},issues:[]};}});
 assert.equal(repairs,1);assert.equal(reviews,1);assert.equal(result.episode.valid,true);
});

test('weak comedy flags do not trigger proposals, rechecks or full storyboard rewrites',async()=>{
 const saved=globalThis.fetch;let reviews=0,claims=0,proposals=0;
 const story={language:'en',headlineText:'Animal mystery',facts:approved().facts.map(f=>f.sourceQuote),scenes:[0,1,2].map(factIndex=>({factIndex,visual:'photo',narration:('Why does this animal have these traits? '+source.extract+' ').repeat(2),line1:'Animal',line2:'Traits',visualQuery:'animal leaves'}))};
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;let answer;
   if(prompt.startsWith('SPOKEN CLAIM CHALLENGE')){claims++;answer={approved:true,issues:[]};}
   else if(prompt.startsWith('TARGETED COMEDY EDGE REPAIR')){proposals++;answer={opening:story.scenes[0].narration+' Like a walking ladder!',ending:story.scenes[2].narration+' The ladder wins again!'};}
   else if(prompt.startsWith('SELECT COMEDY REPAIR'))answer={index:0,comedyHook:true,comicEnding:true,faithful:true,natural:true};
   else if(prompt.startsWith('AUTOMATIC EDITORIAL REPAIR'))assert.fail('Comedy-only repairs must not rewrite the full storyboard');
   else{reviews++;answer=approved();answer.comedyHook=reviews>1;answer.comicEnding=reviews>1;answer.scenes=story.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:answer.facts[index].sourceQuote}));}
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]});
  };
  const result=await runWithProviders({GEMINI_API_KEY:'one',GEMINI_API_KEY_2:'two',GEMINI_API_KEY_3:'three'},()=>finalizeEpisode(story,source,{seconds:30}));
  assert.equal(proposals,0);assert.equal(reviews,1);assert.equal(claims,0);
  assert.deepEqual(result.scenes[1],story.scenes[1]);assert.deepEqual(result.facts,story.facts);
 }finally{globalThis.fetch=saved;}
});

test('missing optional comedy fields do not trigger another API request',async()=>{
 const saved=globalThis.fetch;let focused=0,rewrites=0;
 const story={language:'en',headlineText:'Animal mystery',facts:approved().facts.map(f=>f.sourceQuote),scenes:[0,1,2].map(factIndex=>({factIndex,visual:'photo',narration:('Why does this animal have these traits? '+source.extract+' ').repeat(2),line1:'Animal',line2:'Traits',visualQuery:'animal leaves'}))};
 try{
  globalThis.fetch=async(url,init)=>{
   const prompt=JSON.parse(init.body).contents[0].parts[0].text;
   let answer;
   if(prompt.startsWith('REVIEW MISSING COMEDY FLAGS')){focused++;answer={comedyHook:true,comicEnding:true};}
   else if(prompt.startsWith('SPOKEN CLAIM CHALLENGE'))answer={approved:true,issues:[]};
   else if(prompt.startsWith('AUTOMATIC EDITORIAL REPAIR')){rewrites++;answer=story;}
   else{answer=approved();answer.scenes=story.scenes.map((_,index)=>({index,relevant:true,faithful:true,natural:true,confidence:.95,sourceQuote:answer.facts[index].sourceQuote}));}
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]});
  };
  assert.deepEqual(await runWithProviders({GEMINI_API_KEY:'test'},()=>finalizeEpisode(story,source,{seconds:30})),story);
  assert.equal(focused,0);assert.equal(rewrites,0);
 }finally{globalThis.fetch=saved;}
});


test('context contracts preserve speech and reject unsupported evidence relaxation',async()=>{
 const {prepareMediaContracts}=await import('../lib/core.mjs');const saved=globalThis.fetch;
 const story={scenes:[{narration:'Opening',subjectEntity:'Animal'},{narration:'General conditional fact',subjectEntity:'Animal colour',factIndex:0},{narration:'Look at this action',subjectEntity:'Animal action',factIndex:0}]};
 try{
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({scenes:[{index:0,changeToContext:true,shownActionRequired:false,subjectEntity:'Wrong opening'},{index:1,changeToContext:true,shownActionRequired:false,subjectEntity:'Animal',visualQuery:'animal feeding',videoQuery:'animal feeding',sourceQuote:'Its diet includes leaves',narration:'overwritten'},{index:2,changeToContext:true,shownActionRequired:true,subjectEntity:'Animal'}]})}]}}]});
  const applied=await runWithProviders({GEMINI_API_KEY:'test'},()=>prepareMediaContracts(story,source));
  assert.equal(applied.length,1);assert.equal(story.scenes[0].subjectEntity,'Animal');assert.equal(story.scenes[1].visualRole,'context');assert.equal(story.scenes[1].narration,'General conditional fact');assert.equal(story.scenes[2].subjectEntity,'Animal action');
 }finally{globalThis.fetch=saved;}
});

test('clean footage gate rejects captions, watermarks and missing cleanliness evidence before crop repair',()=>{
 const good=frame();assert.equal(shotReview([good],1,{requireClean:true}).sourceApproved,true);
 for(const key of ['noEmbeddedText','noEmbeddedBranding','noPlaceholder']){
  assert.equal(shotReview([{...good,[key]:false}],1,{requireClean:true}).sourceApproved,false);
  const missing={...good};delete missing[key];assert.equal(shotReview([missing],1,{requireClean:true}).sourceApproved,false);
 }
});
