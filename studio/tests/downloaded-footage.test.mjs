import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDownloadedFootageProvider} from '../lib/downloaded-footage.mjs';

test('optional downloaded footage bridge trims separate excerpts and requires real inspection',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'downloaded-test-'));
 try{
  const index=join(dir,'index.json');await writeFile(join(dir,'source.mp4'),'test bytes');
  await writeFile(index,JSON.stringify({provider:'OmniDL test',entries:[0,10].map(start=>({file:'source.mp4',topic:'Blood Falls',start,end:start+8,title:'Blood Falls',source:'https://example.org/documentary'}))}));
  let downloads=0,inspections=0;
  const provider=await createDownloadedFootageProvider({index,run:async(command,args)=>{downloads++;assert.equal(command,'ffmpeg');assert.equal(args[args.indexOf('-t')+1],'4');}});
  const options={session:{metrics:{searches:[]}},used:new Set(),topic:'Blood Falls',seconds:4,inspect:async media=>{
   inspections++;assert.equal(media.rightsVerified,false);assert.match(media.license,/not established/);return inspections===1?null:{checked:true};
  }};
  const result=await provider('Blood Falls',join(dir,'excerpt.mp4'),options);
  assert.equal(result.sourceStart,10);assert.equal(result.checked,true);assert.equal(downloads,2);assert.equal(options.used.size,1);
  assert.equal(await provider('Axolotl',join(dir,'excerpt.mp4'),{...options,topic:'Axolotl'}),null);
  assert.equal(downloads,2);
  assert.equal(await createDownloadedFootageProvider({run:()=>assert.fail()}),null);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('downloaded footage rejects paths outside its index and invalid time ranges',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'downloaded-paths-'));
 try{
  const index=join(dir,'index.json');await writeFile(join(dir,'source.mp4'),'test');
  await writeFile(index,JSON.stringify({entries:[{file:index,start:0,end:4}]}));
  await assert.rejects(createDownloadedFootageProvider({index}),/relative source/);
  await writeFile(index,JSON.stringify({entries:[{file:'source.mp4',start:4,end:0}]}));
  await assert.rejects(createDownloadedFootageProvider({index}),/time range/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
