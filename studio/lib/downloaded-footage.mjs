import {readFile,realpath,stat} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {checkGenerationCancelled} from './core.mjs';
import {metadataScore} from './local-visual-quality.mjs';

// Optional local test bridge for footage downloaded by an external application.
// Never labels a successful download as permission to republish the source.
export async function createDownloadedFootageProvider({index,run}){
 if(!index)return null;
 const root=await realpath(dirname(resolve(index)));
 const data=JSON.parse(await readFile(index,'utf8'));
 if(!Array.isArray(data.entries)||data.entries.length>64)throw Error('Invalid downloaded footage index');
 const entries=[];
 for(const item of data.entries){
  if(typeof item.file!=='string'||isAbsolute(item.file))throw Error('Footage index requires relative source paths');
  const file=await realpath(resolve(root,item.file)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel))throw Error('Downloaded footage escapes its index directory');
  if(!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.start<0||item.end<=item.start)throw Error('Invalid source time range');
  const size=await stat(file);
  if(!size.isFile()||size.size>100*1024*1024)throw Error('Downloaded footage exceeds test size limit');
  entries.push({...item,file,id:'downloaded:'+createHash('sha256').update(JSON.stringify([file,item.start,item.end])).digest('hex')});
 }
 return async(query,dest,{session,used,inspect,topic='',subject='',seconds=4})=>{
  const row={provider:data.provider||'Downloaded footage',query,status:'searching',results:0,reviewed:0,rejected:0};
  session.metrics.searches.push(row);
  const candidates=entries.filter(e=>metadataScore(e.topic,topic||subject)>=.8&&e.end-e.start>=seconds&&!used.has(e.id));
  row.results=candidates.length;
  for(const entry of candidates.slice(0,4)){
   checkGenerationCancelled();if(used.has(entry.id))continue;used.add(entry.id);let accepted=false;
   try{
    await run('ffmpeg',['-v','error','-y','-ss',String(entry.start),'-i',entry.file,'-t',String(Math.min(seconds,entry.end-entry.start)),
     '-an','-c:v','libx264','-preset','ultrafast','-threads','1','-movflags','+faststart',dest],null,{timeoutMs:20000});
    const media={id:entry.id,file:dest,provider:row.provider,title:entry.title,tags:entry.tags||[],source:entry.source,author:entry.author,
     license:entry.license||'Reuse permission not established',licenseUrl:entry.licenseUrl||entry.source,
     rightsVerified:entry.rightsVerified===true,requiresAttribution:true,attribution:entry.author||'',sourceStart:entry.start,sourceEnd:Math.min(entry.end,entry.start+seconds)};
    row.reviewed++;const prepared=await inspect(media);
    if(prepared){accepted=true;row.status='selected';return {...media,...prepared};}
    row.rejected++;
   }catch(error){checkGenerationCancelled();row.error=String(error.message).slice(0,200);}
   finally{if(!accepted)used.delete(entry.id);}
  }
  row.status='no verified match';return null;
 };
}
