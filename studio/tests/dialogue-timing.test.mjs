import test from 'node:test';
import assert from 'node:assert/strict';
import {hindiHookIssues,groupFactScenes,applyHindiCopy,unsupportedDrama,hookContextFor,hookFamily,repeatedHookIssues,narrationFormatIssues,episodePrompt,HINDI_HOOK_BANK} from '../lib/episode-prompt.mjs';
import {recordStage,timingSummary} from '../lib/job-timing.mjs';

test('early source-backed contrasts count as shocking hooks without a fixed question catchphrase',()=>{
 for(const line of ['अरे यार, ये पेंगुइन सिर्फ बर्फ में ही नहीं, बल्कि भूमध्य रेखा के पास भी मिलते हैं!',
  'अरे यार, आज के ये क्यूट पेंगुइन जितने मासूम दिखते हैं, इनके पूर्वज उतने ही विशालकाय थे!']){
  assert.equal(hookFamily(line),'shocking');assert.deepEqual(hindiHookIssues({scenes:[{narration:line}]}),[]);
 }
 assert.ok(hindiHookIssues({scenes:[{narration:'नमस्ते दोस्तों, पेंगुइन सिर्फ बर्फ में नहीं रहते!'}]}).length);
 assert.ok(hindiHookIssues({scenes:[{narration:'यह एक पक्षी है और इसके शरीर पर पंख हैं।'}]}).length);
});

test('all 35 supplied Hindi hook examples are available under their five actual categories',()=>{
 assert.deepEqual(Object.keys(HINDI_HOOK_BANK),['curiosity','shocking','desi-surprise','mystery','challenge']);
 assert.equal(Object.values(HINDI_HOOK_BANK).flat().length,35);
 for(const [category,examples] of Object.entries(HINDI_HOOK_BANK))
  for(const line of examples)assert.equal(hookFamily(line),category,line);
 const prompt=episodePrompt('Animal',{url:'https://example.org',extract:'Evidence'},'hi',30,'edgy',null,hookContextFor([]));
 for(const lines of Object.values(HINDI_HOOK_BANK))for(const line of lines)assert.ok(prompt.includes(line));
 assert.match(prompt,/Do not invent survey statistics/);
});

test('all five hook families rotate and stale stored family labels cannot suppress the real opening',()=>{
 const families=Object.keys(HINDI_HOOK_BANK);
 for(let i=0;i<families.length;i++){
  const actual=families[i],opening=HINDI_HOOK_BANK[actual][0];
  const context=hookContextFor([{opening,style:'curiosity'}]);
  assert.equal(context.style,families[(i+1)%families.length]);
  assert.ok(repeatedHookIssues({scenes:[{narration:HINDI_HOOK_BANK[actual][1]}]},context).length);
  assert.deepEqual(repeatedHookIssues({scenes:[{narration:HINDI_HOOK_BANK[context.style][0]}]},context),[]);
 }
});

test('thought to saw substitutions and repetition after one intervening video are rejected',()=>{
 const history=[{opening:'क्या तुमने कभी सोचा है कि यह कैसे चलता है?'},{opening:'इस छोटे से राज के पीछे बड़ी कहानी छिपी है!'}];
 const context=hookContextFor(history);
 assert.ok(repeatedHookIssues({scenes:[{narration:'क्या तुमने कभी देखा है कि बिल्ली कैसे फिसलती है?'}]},context).some(x=>x.includes('template')));
 const opening='बिल्ली इतनी लचीली क्यों है? भाई, मेरा सिस्टम ही हैंग हो गया!';
 assert.equal(hookFamily(opening),'curiosity','a later comic callback must not disguise the curiosity opening');
});

test('Hindi curiosity must arrive before a long comic setup, not at the end of the shot',()=>{
 const late='अरे भाई यह जानवर बिना किसी गर्म स्वेटर या थर्मल इनर के बर्फ में मस्त घूमता रहता है, लेकिन इसे ठंड क्यों नहीं लगती?';
 assert.ok(hindiHookIssues({scenes:[{narration:late}]}).length);
 const early='इस जानवर को बर्फ में ठंड क्यों नहीं लगती? भाई, इसका अपना विंटर सूट है!';
 assert.deepEqual(hindiHookIssues({scenes:[{narration:early}]}),[]);
});

test('hook history rotates styles and rejects the same construction across topics',()=>{
 const previous={opening:'क्या तुमने कभी सोचा है कि झरना पीछे क्यों जाता है?',style:'curiosity'};
 const context=hookContextFor([previous]);
 assert.equal(context.style,'shocking');
 assert.equal(hookFamily('भाई, कभी गौर किया है?'),'observation');
 assert.equal(hookContextFor([{opening:'पहले अंदाजा लगाओ!',style:'challenge'}]).style,'curiosity');
 assert.ok(repeatedHookIssues({scenes:[{narration:'क्या तुमने कभी सोचा है कि पॉपकॉर्न क्यों फूटता है?'}]},context).length);
 assert.deepEqual(repeatedHookIssues({scenes:[{narration:'भाई, पॉपकॉर्न के अंदर ये कैसा झोल है?'}]},context),[]);
 assert.equal(hindiHookIssues({scenes:[{narration:'देखो भाई, झरना कैसे बनता है?'}]}).length,1);
 assert.deepEqual(hindiHookIssues({scenes:[{narration:'झरने के पीछे छिपा है कटाव का राज!'}]}),[]);
});

test('voiceover stays separate from headline emoji and production directions',()=>{
 const episode=narration=>({headlineText:'झरने का राज 🤔',scenes:[{narration}]});
 assert.deepEqual(narrationFormatIssues(episode('भाई, ये झरना पीछे कैसे खिसकता है?')),[]);
 for(const line of ['HOOK: भाई, सुनो!','सीन 1: झरना देखो।','[तेज बोलें] झरना पीछे जाता है।','झरना पीछे जाता है! 🤔'])
  assert.equal(narrationFormatIssues(episode(line)).length,1);
 const prompt=episodePrompt('Waterfall',{url:'https://example.org',extract:'Evidence'},'hi',90,'edgy',{total:18},hookContextFor([]));
 assert.match(prompt,/315 spoken words \/ 90 seconds/);
 assert.match(prompt,/EXACTLY 18 narrated shots/);
 assert.match(prompt,/three distinct complete fact stories/);
 assert.match(prompt,/FIRST 1-3 seconds/);
 assert.match(prompt,/no HOOK\/INTRO\/SCENE\/END labels/);
});
test('curiosity opens the dialogue before explanation or a slang exclamation',()=>{
 for(const narration of ['क्या तुम्हें पता है, जिराफ़ सबसे ऊँचा ज़मीनी जानवर है?','भाई, कभी सोचा है कि ये कैसे होता है?','मान लो, तुम्हें ऐसा करना पड़े!'])assert.deepEqual(hindiHookIssues({scenes:[{narration}]}),[]);
 assert.equal(hindiHookIssues({scenes:[{narration:'अरे साला! यह जानवर बड़ा होता है।'}]}).length,1);
});
test('direct stakes and contradictions can hook without a fixed question catchphrase',()=>{
 for(const narration of ['तुम वही पैसे देते हो, लेकिन पैकेट में सामान कम मिलता है।','ये चीज़ दिखती साधारण है, मगर इसका काम अलग है।','अरे यार, इस चॉकलेट पर ये सफेद परत कहाँ से आ जाती है?'])assert.deepEqual(hindiHookIssues({scenes:[{narration}]}),[]);
 for(const narration of ['नमस्ते दोस्तों, क्या तुम्हें पता है?', 'इस वीडियो में हम बताएंगे कि ये कैसे होता है।',''])assert.equal(hindiHookIssues({scenes:[{narration}]}).length,1);
});
test('job timing measures stage durations and freezes elapsed time on completion',()=>{
 const job={status:'running'};recordStage(job,'Starting',1000);recordStage(job,'Research',1500);recordStage(job,'Research',2000);recordStage(job,'Voice',4000);
 assert.deepEqual(timingSummary(job,4500),{elapsedSeconds:3.5,stages:[{stage:'Starting',seconds:.5},{stage:'Research',seconds:2.5}]});
 job.status='complete';recordStage(job,'Ready',6000);assert.equal(timingSummary(job,99000).elapsedSeconds,5);
 assert.equal(timingSummary(job,99000).stages.at(-1).seconds,2);
});
test('fact ordering repair preserves the opening and within-fact scene order before copyedit',()=>{
 const episode={scenes:[{factIndex:0,id:'hook'},{factIndex:1,id:'B'},{factIndex:0,id:'A'},{factIndex:2,id:'C'},{factIndex:1,id:'B2'}]};
 assert.deepEqual(groupFactScenes(episode).scenes.map(s=>s.id),['hook','A','B','B2','C']);
 const invalid={scenes:[{factIndex:2,id:'hook'},{factIndex:0,id:'A'}]};
 assert.deepEqual(groupFactScenes(invalid).scenes.map(s=>s.id),['hook','A']);
 const remapped=groupFactScenes({facts:['A','B','C'],scenes:[{factIndex:2,id:'hook'},{factIndex:0,id:'A'},{factIndex:2,id:'C'},{factIndex:1,id:'B'}]});
 assert.deepEqual(remapped.facts,['C','A','B']);assert.deepEqual(remapped.scenes.map(s=>s.id),['hook','C','A','B']);
 assert.deepEqual(remapped.scenes.map(s=>s.factIndex),[0,0,1,2]);
});
test('copyediting cannot overwrite fact mappings, media or diagram geometry',()=>{
 const episode={facts:['A','B','C'],scenes:[{narration:'draft',factIndex:1,visualQuery:'giraffe',pointOut:{target:'neck',label:'old'},diagram:{heading:'old',reason:'invisible mechanism',nodes:[{icon:'heart',label:'old'}],links:[]}}]};
 const result=applyHindiCopy(episode,{facts:['A','B','C'],scenes:[{narration:'corrected',factIndex:0,visualQuery:'wrong subject',pointOutLabel:'new',diagram:{heading:'new',nodes:[{icon:'phone',label:'new'}],links:[]}}]});
 assert.equal(result.scenes[0].factIndex,1);assert.equal(result.scenes[0].visualQuery,'giraffe');assert.equal(result.scenes[0].diagram.nodes[0].icon,'heart');
 assert.equal(result.scenes[0].pointOut.label,'new');assert.equal(episode.scenes[0].narration,'draft');
 assert.throws(()=>applyHindiCopy(episode,{facts:['A','B','C'],scenes:[]}),/one text update/);
});
test('headline cannot turn normal animal behaviour into unsourced lethal danger',()=>{
 assert.equal(unsupportedDrama('जिराफ की गर्दन का खौफनाक राज 😲',{extract:'Male giraffes use their necks in combat.'}),true);
 assert.equal(unsupportedDrama('जिराफ की गर्दन का डबल काम 😲',{extract:'Male giraffes use their necks in combat.'}),false);
 assert.equal(unsupportedDrama('इस ज़हर का घातक असर 😲',{extract:'This poison can kill the animal.'}),false);
});


test('English stories use native curiosity hooks and audience humour rather than Hindi directions',()=>{
 const p=episodePrompt('Zipper',{url:'https://example.org',extract:'Source'},'en',30,'edgy',{total:5},{style:'challenge',recent:[]});
 assert.match(p,/ENGLISH AUDIENCE AND DELIVERY/);assert.match(p,/grocery packaging, airports, smartphones/);assert.match(p,/Recent English hooks/);assert.match(p,/at least 96 spoken words/);assert.doesNotMatch(p,/USER'S HINDI SHORTS STYLE/);assert.doesNotMatch(p,/Preserve correct Hindi while/);
 assert.equal(hookFamily('Guess why your zipper does this?'),'challenge');
});


test('English opening names the actual subject before unrelated comic setup',async()=>{
 const {englishHookIssues}=await import('../lib/episode-prompt.mjs');
 const episode={topic:'Silly Putty',scenes:[{subjectEntity:'Silly Putty',narration:'Like trying to fold a stubborn piece of cold lasagna, what happens to Silly Putty?'}]};
 assert.equal(englishHookIssues(episode).length,1);
 episode.scenes[0].narration='Why does Silly Putty act like confused chewing gum?';assert.deepEqual(englishHookIssues(episode),[]);
});
