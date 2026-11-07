// Real API job: no reused episode, narration, SFX or reviewed media fixtures.
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
process.env.PYTHON='python';process.env.RENDER_FPS='24';
process.env.JOBS_DIR=resolve('studio/jobs/live-soap-bubbles');
await mkdir(process.env.JOBS_DIR,{recursive:true});
const {makeServer}=await import('../server.mjs');
const server=makeServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin=`http://127.0.0.1:${server.address().port}`;
try{
 const response=await fetch(origin+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:'Soap bubble',seconds:25,voiceAccent:'hi-IN-anuj',voiceStyle:'energetic',humorIntensity:'cheeky',visualStyle:'reference-news',mediaMode:'mixed',mediaFit:'cover'})});
 const submitted=await response.json();if(response.status!==202)throw Error(JSON.stringify(submitted));
 await writeFile(join(process.env.JOBS_DIR,'run.json'),JSON.stringify({id:submitted.id,port:server.address().port}));
 console.log('LIVE_JOB',submitted.id);let last='',job;
 do{
  await new Promise(ok=>setTimeout(ok,2500));
  job=await(await fetch(origin+`/api/jobs/${submitted.id}`)).json();
  if(job.stage!==last){console.log(job.progress,job.stage);last=job.stage;}
 }while(job.status==='running');
 if(job.status!=='complete')throw Error(JSON.stringify({error:job.error,warnings:job.warnings}));
 const folder=join(process.env.JOBS_DIR,job.id),prefix='samples/live-soap-bubbles';
 for(const [source,suffix]of [['video.mp4','.mp4'],['episode.json','-episode.json'],['plan.json','-plan.json'],['CREDITS.json','-CREDITS.json'],['audio-review.json','-voice-review.json'],['youtube-title.txt','-youtube-title.txt']])await copyFile(join(folder,source),prefix+suffix);
 if(job.contactUrl)await copyFile(join(folder,'qa/video_contact.jpg'),prefix+'-contact.jpg');
 await writeFile(prefix+'-status.json',JSON.stringify(job,null,2));
 console.log('LIVE_READY',prefix+'.mp4');
 console.log('CREDITS',await readFile(prefix+'-CREDITS.json','utf8'));
}finally{await new Promise(ok=>server.close(ok));}
