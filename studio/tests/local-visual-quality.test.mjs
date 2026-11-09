import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createSemanticReviewer,metadataCandidate,metadataReview,metadataScore,hashDistance,framingReviewer,reviewRenderedVideo,checkFrames} from '../lib/local-visual-quality.mjs';

const exec=promisify(execFile),root=resolve('..'),python=process.env.PYTHON||'python3';
const run=async(command,args)=>(await exec(command,args,{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024})).stdout;

test('fuzzy metadata tolerates typos but rejects unrelated titles and placeholders',()=>{
 assert.ok(metadataScore('A pengiun walking on ice','penguin')>=.6);
 assert.equal(metadataReview({title:'Fox walking in snow'},{subjectEntity:'fox'},'Animals').approved,true);
 assert.equal(metadataReview({title:'Cars driving on a road'},{subjectEntity:'penguin'},'Animals').approved,false);
 assert.equal(metadataReview({title:'Smartphone green screen mockup'},{subjectEntity:'smartphone'},'Phone').approved,false);
 assert.equal(metadataReview({title:'123456'},{subjectEntity:'penguin'},'Animals').approved,false);
 assert.equal(hashDistance('0000000000000000','000000000000000f'),4);
 assert.equal(hashDistance('invalid','invalid'),64);
 assert.equal(metadataReview({title:'Ernő Rubik portrait'},{subjectEntity:'Erno Rubik'},"Rubik's Cube").approved,true);
 const scene={subjectEntity:'vintage cotton candy machine',visualRole:'context'};
 const media={title:'Close up on hand making cotton candy'};
 assert.equal(metadataReview(media,scene,'Cotton candy').approved,true);
 assert.equal(metadataReview(media,scene,'Cotton candy').contextTopicMatch,true);
 assert.equal(metadataReview(media,{...scene,visualRole:'evidence'},'Cotton candy').approved,false);
 assert.equal(metadataReview(media,{...scene,pointOut:{target:'vintage machine'}},'Cotton candy').approved,false);
 assert.equal(metadataReview({title:'Cotton candy stall'},{...scene,subjectEntity:'historical inventor portrait'},'Cotton candy').approved,false);
});

test('accepted source text and contextual animations do not waive subject or evidence matching',()=>{
 const policy={allowSourceText:true,allowStylized:true},scene={subjectEntity:'sloth',visualRole:'context'};
 assert.equal(metadataReview({title:'Sloth animation with subtitles'},scene,'Sloth',policy).approved,true);
 assert.equal(metadataReview({title:'Sloth animation with subtitles'},scene,'Sloth').approved,false);
 assert.equal(metadataReview({title:'Penguin animation with subtitles'},scene,'Sloth',policy).approved,false);
 assert.equal(metadataReview({title:'Sloth green screen mockup'},scene,'Sloth',policy).approved,false);
 assert.equal(metadataReview({title:'Sloth animation'},{...scene,visualRole:'evidence'},'Sloth',policy).approved,false);
});

test('local source checks reject blank/chroma/duplicates without any AI request',{timeout:45000},async()=>{
 const folder=await mkdtemp(join(tmpdir(),'local-source-')),saved=globalThis.fetch;
 try{
  globalThis.fetch=()=>{throw Error('No network allowed for local verification');};
  await run(python,['-c',`import cv2,numpy as np,sys,os
p=sys.argv[1];r=np.random.default_rng(42);a=r.integers(0,256,(480,640,3),dtype=np.uint8)
cv2.imwrite(os.path.join(p,'detail.png'),a)
cv2.imwrite(os.path.join(p,'blank.png'),np.zeros_like(a))
b=np.zeros_like(a);b[70:410,100:540]=[0,255,0];cv2.imwrite(os.path.join(p,'chroma.png'),b)
cv2.imwrite(os.path.join(p,'blur.png'),cv2.GaussianBlur(a,(101,101),30))`,folder]);
  const report=await checkFrames(['detail','blank','chroma','blur'].map(n=>join(folder,n+'.png')),{run,python,root});
  assert.equal(report.frames[0].approved,true);
  for(const frame of report.frames.slice(1))assert.equal(frame.approved,false,JSON.stringify(frame));
  assert.equal(report.semanticIdentityChecked,false);
  const verify=framingReviewer({run,python,root,assets:folder});
  const scene={subjectEntity:'fox'},media={title:'Fox in woodland'};
  assert.ok(await verify([join(folder,'detail.png')],scene,'Fox','first',media));
  assert.equal(await verify([join(folder,'detail.png')],scene,'Fox','duplicate',media),null);
  assert.equal(await verify([join(folder,'detail.png')],scene,'Fox','wrong',{title:'City traffic'}),null);
  const logged=JSON.parse(await readFile(join(folder,'visual-review-first','local-review.json'),'utf8'));
  assert.equal(logged.semanticIdentityChecked,false);assert.equal(logged.actionChecked,false);
 }finally{globalThis.fetch=saved;await rm(folder,{recursive:true,force:true});}
});

test('final export checks require video/audio/duration and all expected frame reports',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'local-export-'));let audio=true;
 try{
  const run=async(command,args)=>{
   if(command==='ffprobe')return JSON.stringify({streams:[{codec_type:'video',width:1080,height:1440},...(audio?[{codec_type:'audio'}]:[])],format:{duration:4}});
   if(command===python)return JSON.stringify({frames:[{approved:true,issues:[]}],warnings:[]});
   assert.equal(command,'ffmpeg');return '';
  };
  const plan={meta:{out:'film.mp4',duration:4,size:[1080,1000],output_size:[1080,1440]},scenes:[{start:0}]};
  let result=await reviewRenderedVideo(plan,{}, {run,python,root,assets:folder});
  assert.equal(result.approved,true);assert.equal(result.semanticIdentityChecked,false);assert.equal(result.headlineSpellingChecked,false);
  audio=false;result=await reviewRenderedVideo(plan,{}, {run,python,root,assets:folder});assert.equal(result.approved,false);assert.match(result.issues.join(' '),/audio/);
  await assert.rejects(checkFrames(['a','b'],{run,python,root}),/Incomplete local/);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('final review samples all scenes in a single real FFmpeg decode',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'one-pass-export-'));
 try{
  const file=join(folder,'film.mp4');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x240:rate=24:duration=2',
   '-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-shortest',file]);
  let decodes=0;
  const measured=async(command,args,...rest)=>{if(command==='ffmpeg'){decodes++;assert.ok(args.includes('-fps_mode'));assert.match(args[args.indexOf('-vf')+1],/select=/);}return run(command,args,...rest);};
  const plan={meta:{out:file,duration:2,size:[160,240],fps:24},scenes:[{start:0,reference_media:{media_type:'video'}},{start:1,reference_media:{media_type:'video'}}]};
  const result=await reviewRenderedVideo(plan,{}, {run:measured,python,root,assets:folder});
  assert.equal(decodes,1);assert.equal(result.approved,true,JSON.stringify(result.issues));assert.equal(result.framesChecked,6);
 }finally{await rm(folder,{recursive:true,force:true});}
});


test('Gemini reviews actual frames once per identical content and brief, not title alone',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'semantic-review-'));let calls=0;
 try{
  const file=join(folder,'frame.jpg');await writeFile(file,'sample image bytes');
  const scene={subjectEntity:'iron rich brine flowing from Blood Falls',visualRole:'evidence'};
  const media={title:'Blood Falls Antarctica',source:'https://example.org/blood-falls'};
  assert.equal(metadataReview(media,scene,'Blood Falls').approved,false);
  assert.equal(metadataCandidate(media,scene,'Blood Falls',{semanticVerification:true}),true);
  const verify=createSemanticReviewer({generate:async(prompt,paths,options)=>{
   calls++;assert.match(prompt,/appearance alone cannot prove/);assert.deepEqual(paths,[file]);assert.equal(options.maxAttempts,1);
   return {matches:true,confidence:.9,reason:'Red outflow visible against glacier',actionChecked:true,topicConnection:'direct',metadataConsistent:true,topicIdentityMatch:true,topicIsNamedPlace:true,depictedPlaceName:'Blood Falls',referenceCompatible:true,frames:[{subjectVisible:true,introOrOutro:false,compatible:true}]};
  }});
  const a=await verify([file],scene,'Blood Falls',media);
  await verify([file],scene,'Blood Falls',media);assert.equal(calls,1);assert.equal(a.approved,true);
  await verify([file],{...scene,shownActionRequired:'flowing'},'Blood Falls',media);assert.equal(calls,2);
  await writeFile(file,'different frames');await verify([file],scene,'Blood Falls',media);assert.equal(calls,3);
  const bad=createSemanticReviewer({generate:async()=>({matches:true})});
  await assert.rejects(bad([file],scene,'Blood Falls',media),/Incomplete Gemini/);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('semantic gate rescues weak titles but rejects unrelated pixels; technical failures skip Gemini',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'semantic-gate-'));let calls=0,technical=true,match=true;
 try{
  const verify=framingReviewer({root,assets:folder,python,run:async()=>JSON.stringify({frames:[{approved:technical,issues:technical?[]:['blank']}]}),
   verifySemantic:async()=>{calls++;return {approved:match,confidence:.9,reason:'wrong visible object',semanticIdentityChecked:true};}});
  const scene={subjectEntity:'iron rich brine flowing from Blood Falls',visualRole:'evidence'},media={title:'Blood Falls Antarctica'};
  assert.ok(await verify(['fake.jpg'],scene,'Blood Falls','accepted',media));
  match=false;assert.equal(await verify(['fake.jpg'],scene,'Blood Falls','rejected',media),null);
  technical=false;assert.equal(await verify(['fake.jpg'],scene,'Blood Falls','blank',media),null);assert.equal(calls,2);
  const report=JSON.parse(await readFile(join(folder,'visual-review-accepted','local-review.json'),'utf8'));
  assert.equal(report.semanticIdentityChecked,true);assert.equal(report.method,'local-technical-and-gemini');
 }finally{await rm(folder,{recursive:true,force:true});}
});


test('semantic context cannot waive intro frames, a contradictory experiment or generic location',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'context-regression-'));
 try{
  const file=join(folder,'frame.jpg');await writeFile(file,'frame');
  const scene={subjectEntity:'hydrous ferric oxides',visualRole:'context'};
  const base={matches:true,confidence:.95,reason:'Related science',actionChecked:false,topicConnection:'explanatory',metadataConsistent:true,topicIdentityMatch:true,topicIsNamedPlace:true,depictedPlaceName:'Blood Falls',referenceCompatible:true,frames:[{subjectVisible:true,introOrOutro:false,compatible:true}]};
  for(const change of [
   {metadataConsistent:false},
   {topicIdentityMatch:false},
   {depictedPlaceName:'Hormuz Island'},
   {depictedPlaceName:'unknown'},
   {topicConnection:'generic'},
   {frames:[{subjectVisible:false,introOrOutro:true,compatible:true}]},
   {frames:[{subjectVisible:true,introOrOutro:false,compatible:false}]}
  ]){
   const verify=createSemanticReviewer({generate:async()=>({...base,...change})});
   assert.equal((await verify([file],scene,'Blood Falls',{title:'Hydrogen and oxygen forming water'})).approved,false);
  }
  const verify=createSemanticReviewer({generate:async()=>base});
  assert.equal((await verify([file],scene,'Blood Falls',{title:'Iron oxide experiment'})).approved,true);
 }finally{await rm(folder,{recursive:true,force:true});}
});


test('reference image is compared separately and a visual contradiction overrides confident approval',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'reference-relevance-'));
 try{
  const frame=join(folder,'frame.jpg'),ref=join(folder,'reference.jpg');await writeFile(frame,'candidate');await writeFile(ref,'reference');
  const verify=createSemanticReviewer({referenceFor:async()=>({file:ref,title:'Reference landmark',source:'https://commons.wikimedia.org/example'}),generate:async(prompt,paths)=>{
   assert.deepEqual(paths,[ref,frame]);assert.match(prompt,/FIRST image.*reference photograph/);
   return {matches:true,confidence:.99,reason:'Reconstruction differs from the reference',topicConnection:'direct',metadataConsistent:true,topicIdentityMatch:true,topicIsNamedPlace:true,depictedPlaceName:'Blood Falls',referenceCompatible:false,frames:[{subjectVisible:true,introOrOutro:false,compatible:true}]};
  }});
  assert.equal((await verify([frame],{subjectEntity:'Blood Falls'},'Blood Falls',{title:'Blood Falls'})).approved,false);
 }finally{await rm(folder,{recursive:true,force:true});}
});


test('an independent reference critic can veto an optimistic first landmark review',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'landmark-critic-'));let calls=0;
 try{
  const frame=join(folder,'frame.jpg'),ref=join(folder,'ref.jpg');await writeFile(frame,'candidate');await writeFile(ref,'real site');
  const verify=createSemanticReviewer({referenceFor:async()=>({file:ref,title:'Blood Falls',source:'https://commons.wikimedia.org/example'}),generate:async(prompt)=>{
   calls++;
   if(calls===1)return {matches:true,confidence:.99,reason:'Looks like the title',topicConnection:'direct',metadataConsistent:true,topicIdentityMatch:true,topicIsNamedPlace:true,depictedPlaceName:'Taylor Glacier',referenceCompatible:true,frames:[{subjectVisible:true,introOrOutro:false,compatible:true}]};
   assert.match(prompt,/Independently compare terrain geometry/);assert.doesNotMatch(prompt,/Looks like the title/);
   return {sameSite:false,unmodifiedDocumentary:false,confidence:.95,compatibleFrames:[false],reason:'Morphology differs from reference'};
  }});
  const result=await verify([frame],{subjectEntity:'Blood Falls'},'Blood Falls',{title:'Blood Falls'});
  assert.equal(result.approved,false);assert.equal(calls,2);assert.match(result.reason,/Morphology/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
