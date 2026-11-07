// Actual Generate Video endpoint, no old sample episode/media/voice imports.
// node --env-file=studio/.env studio/tests/live-desi-sample.mjs
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
process.env.PYTHON='python';
const topic=process.env.DESI_SAMPLE_TOPIC||'Giraffe';
const slug=topic.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
if(!slug)throw Error('Sample topic needs a filename label');
process.env.JOBS_DIR=resolve('studio/jobs/live-desi-'+slug);await mkdir(process.env.JOBS_DIR,{recursive:true});
const {makeServer}=await import('../server.mjs');
const server=makeServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin=`http://127.0.0.1:${server.address().port}`,started=Date.now();
try{
 const response=await fetch(origin+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,seconds:27,voiceProvider:'heygen',voiceAccent:'hi-IN-anuj',voiceStyle:'energetic',humorIntensity:'edgy',visualStyle:'reference-news',mediaMode:'mixed',mediaFit:'cover'})});
 const submitted=await response.json();if(response.status!==202)throw Error(JSON.stringify(submitted));
 await writeFile(join(process.env.JOBS_DIR,'run.json'),JSON.stringify({id:submitted.id,port:server.address().port,startedAt:new Date(started).toISOString()}));
 console.log('LIVE_JOB',submitted.id,'topic',topic);let last='',job,pollErrors=0;
 do{
  await new Promise(ok=>setTimeout(ok,2500));
  try{
   job=await(await fetch(origin+`/api/jobs/${submitted.id}`,{headers:{Connection:'close'},signal:AbortSignal.timeout(15000)})).json();pollErrors=0;
  }catch(error){if(++pollErrors>=5)throw error;console.log('Retrying interrupted local progress poll');continue;}
  if(job.stage!==last){console.log(job.progress,job.stage,'elapsed',Math.round((Date.now()-started)/1000)+'s');last=job.stage;}
 }while(!job||job.status==='running');
 const prefix='samples/live-desi-'+slug;
 await writeFile(prefix+'-status.json',JSON.stringify(job,null,2));
 if(job.status!=='complete')throw Error(JSON.stringify({error:job.error,warnings:job.warnings}));
 const folder=join(process.env.JOBS_DIR,job.id);
 for(const [file,suffix]of [['video.mp4','.mp4'],['episode.json','-episode.json'],['plan.json','-plan.json'],['CREDITS.json','-CREDITS.json'],['audio-review.json','-audio-review.json'],['quality-report.json','-quality-report.json'],['final-audio-review.json','-final-audio-review.json'],['youtube-title.txt','-youtube-title.txt']])await copyFile(join(folder,file),prefix+suffix);
 if(job.contactUrl)await copyFile(join(folder,'qa/video_contact.jpg'),prefix+'-contact.jpg');
 await writeFile(prefix+'-performance.json',JSON.stringify({...job.performance,wallSeconds:Math.round((Date.now()-started)/1000),settings:{fps:Number(process.env.RENDER_FPS)||24,preset:process.env.PAPERDOC_PRESET||'veryfast',crf:Number(process.env.PAPERDOC_CRF)||17}},null,2));
 console.log('LIVE_READY',prefix+'.mp4',JSON.stringify(job.performance));
}finally{await new Promise(ok=>server.close(ok));}
