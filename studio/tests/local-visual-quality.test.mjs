import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {metadataReview,metadataScore,hashDistance,framingReviewer,reviewRenderedVideo,checkFrames} from '../lib/local-visual-quality.mjs';

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
