export function resourceBudget(memoryBytes){
 const lowMemory=Number.isFinite(memoryBytes)&&memoryBytes>0&&memoryBytes<=1024*1024*1024;
 return {lowMemory,processConcurrency:lowMemory?1:3,mediaConcurrency:lowMemory?1:3,ffmpegThreads:lowMemory?1:2};
}

export async function runSceneWorkers(count,concurrency,operation){
 const results=new Array(count);let next=0;
 const worker=async()=>{while(next<count){const i=next++;results[i]=await operation(i);}};
 await Promise.all(Array.from({length:Math.min(count,Math.max(1,concurrency))},worker));
 return results;
}

export function createProcessLimiter(limit=3){
 const scheduler=createKeyScheduler();
 const slots=Array.from({length:Math.max(1,limit)},(_,i)=>String(i));
 return async operation=>{
  const slot=await scheduler.acquire(slots);
  try{return await operation();}finally{slot.release();}
 };
}

// One in-flight request per credential. Concurrent callers take an idle project
// instead of queueing behind the preferred one; waiting callers retain FIFO order.
export function createKeyScheduler(){
 const active=new Set(),waiting=[];
 function dispatch(){
  for(let i=0;i<waiting.length;){
   const task=waiting[i],key=task.keys.find(k=>!active.has(k));
   if(!key){i++;continue;}
   waiting.splice(i,1);active.add(key);let released=false;
   task.resolve({key,release(){if(released)return;released=true;active.delete(key);dispatch();}});
  }
 }
 return {acquire(keys){
  const unique=[...new Set(keys.filter(Boolean))];
  if(!unique.length)return Promise.reject(Error('No request credentials available'));
  return new Promise(resolve=>{waiting.push({keys:unique,resolve});dispatch();});
 }};
}

// Keep roughly five-second cuts as the requested film grows.
export function mediaBudget(seconds){
 const extra=Math.min(2,Math.max(0,Math.ceil((Number(seconds)-30)/10)||0));
 const total=Number(seconds)>50?Math.min(20,Math.ceil(Number(seconds)/5)):5+2*extra;
 return {videos:total,photos:0,total,preferVideo:true};
}

export function assignMediaTypes(episode,budget){
 if(episode.scenes.length!==budget.total)throw Error(`Media plan needs ${budget.total} shots for this duration`);
 episode.scenes.forEach((scene,i)=>{
  scene.visual=budget.preferVideo?'video':i%2===0?'video':'photo';
  scene.diagram=null;
  if(scene.visualRole==='diagram')scene.visualRole='context';
 });
 return episode;
}

export function mediaBudgetIssues(images,budget){
 const videos=images.filter(image=>image?.video===true).length;
 const photos=images.filter(image=>image&&image.video!==true).length;
 if(budget.preferVideo)return images.length===budget.total&&videos+photos===budget.total?[]:['Every shot requires a verified clip or fallback photo'];
 return images.length===budget.total&&videos===budget.videos&&photos===budget.photos?[]:
  [`Expected ${budget.videos} verified clips + ${budget.photos} photos; received ${videos} clips + ${photos} photos`];
}
