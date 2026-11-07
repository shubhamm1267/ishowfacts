export function recordStage(job,stage,now=Date.now()){
 const timing=job._timing??={started:now,stageStarted:now,stage,stages:[]};
 if(stage!==timing.stage){
  timing.stages.push({stage:timing.stage,seconds:Math.max(0,now-timing.stageStarted)/1000});
  timing.stage=stage;timing.stageStarted=now;
 }
 if(job.status==='complete'||job.status==='failed')timing.finished=now;
}
export function timingSummary(job,now=Date.now()){
 const t=job._timing;if(!t)return null;
 return {elapsedSeconds:Math.round(((t.finished??now)-t.started)/100)/10,
  stages:t.stages.map(s=>({...s,seconds:Math.round(s.seconds*10)/10}))};
}
