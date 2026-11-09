import {mkdir,rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {generationFetch,generationSignal,checkGenerationCancelled} from './core.mjs';

export function omniSourceURL(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const h=u.hostname.replace(/^www\./,'');
  if(h==='youtube.com'&&u.pathname==='/watch'&&/^[\w-]{11}$/.test(u.searchParams.get('v')||''))return 'https://www.youtube.com/watch?v='+u.searchParams.get('v');
  if(h==='youtube.com'&&/^\/shorts\/[\w-]{11}\/?$/.test(u.pathname))return 'https://www.youtube.com/watch?v='+u.pathname.split('/')[2];
  if(h==='youtu.be'&&/^\/[\w-]{11}$/.test(u.pathname))return 'https://www.youtube.com/watch?v='+u.pathname.slice(1);
  if(h==='instagram.com'&&/^\/(reel|p)\/[\w-]+\/?$/.test(u.pathname)||h==='pinterest.com'&&/^\/pin\/[\w-]+\/?$/.test(u.pathname)||h==='facebook.com'&&/^\/(reel|watch|.+\/videos)\b/.test(u.pathname)||h==='tiktok.com'&&/^\/@[\w.-]+\/video\/\d+/.test(u.pathname))return u.origin+u.pathname+u.search;
 }catch{}return null;
}
const digest=v=>createHash('sha256').update(v).digest('hex');
export function omniFormats(media){
 return (media.items||[]).filter(i=>i.type==='video').flatMap(i=>i.formats||[])
  .filter(f=>f.kind==='video'&&Number.parseInt(f.label)>=720)
  .sort((a,b)=>{const tier=f=>Number.parseInt(f.label)===1080?0:Number.parseInt(f.label)===720?1:2;return tier(a)-tier(b);});
}
export async function downloadSource(option,dest,{timeoutMs=45000}={}){
 const url=new URL(option.url);
 const hosts=['googlevideo.com','pinimg.com','cdninstagram.com','fbcdn.net','tiktokcdn.com','tiktokcdn-us.com','byteoversea.com','tiktok.com'];
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw Error('Untrusted OmniDL media host');
 const headers={};for(const key of ['User-Agent','Referer','Origin','Accept'])if(option.headers?.[key])headers[key]=option.headers[key];
 const deadline=AbortSignal.timeout(timeoutMs),jobSignal=generationSignal();
 const signal=jobSignal?AbortSignal.any([deadline,jobSignal]):deadline;
 const response=await generationFetch(url,{headers,redirect:'error',signal});
 if(!response.ok){await response.body?.cancel();throw Error('OmniDL source HTTP '+response.status);}
 const max=100*1024*1024;if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw Error('OmniDL source exceeds 100 MB');}
 let bytes=0;await mkdir(dirname(dest),{recursive:true});
 const part=dest+'.part';
 try{await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,next){bytes+=chunk.length;next(bytes>max?Error('OmniDL source exceeds 100 MB'):null,chunk);}}),createWriteStream(part),{signal});
  if(bytes<1000)throw Error('Empty OmniDL source');
  const {rename}=await import('node:fs/promises');await rename(part,dest);
 }finally{await rm(part,{force:true});}
}
// Discovery is separate from OmniDL: OmniDL accepts post URLs, not topic searches.
export function createOmniProvider({run,root,python='python3',discover,extract,download=downloadSource,now=Date.now,budgetMs=90000}={}){
 const sessions=new WeakMap();
 discover??=async query=>{
  const raw=await run(python,['-m','yt_dlp','--ignore-config','--flat-playlist','--skip-download','--dump-json','--playlist-end','3','--socket-timeout','6','--retries','0','--extractor-retries','0','ytsearch3:'+query],null,{timeoutMs:15000});
  return raw.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).map(d=>({url:d.webpage_url||d.url,title:d.title}));
 };
 extract??=async url=>JSON.parse(await run(process.execPath,[join(root,'scripts','omnidl_extract.mjs'),url,python],null,{timeoutMs:25000}));
 return async(query,dest,{session,used,inspect,topic='',subject='',seconds=4})=>{
  if(!sessions.has(session))sessions.set(session,{queries:new Map(),sources:new Map(),offsets:new Map(),spent:0});
  const state=sessions.get(session),row={provider:'OmniDL',query:topic||subject||query,status:'searching',results:0,reviewed:0,rejected:0};session.metrics.searches.push(row);
  const retrieval=async operation=>{const t=now();try{return await operation();}finally{state.spent+=Math.max(0,now()-t);}};
  if(state.spent>=budgetMs){row.status='budget exhausted';return null;}
  try{
   const key=String(topic||subject||query).trim();
   if(!state.queries.has(key))state.queries.set(key,retrieval(()=>discover(key+' real footage')));
   const rows=await state.queries.get(key);row.results=rows.length;
   for(const candidate of rows.slice(0,3)){
    checkGenerationCancelled();if(state.spent>=budgetMs)break;
    const url=omniSourceURL(candidate.url);if(!url)continue;
    try{
     if(!state.sources.has(url))state.sources.set(url,retrieval(async()=>{
      const media=await extract(url),formats=omniFormats(media);
      if(!formats.length)throw Error('OmniDL has no 720p-or-better source');
      const file=join(dirname(dest),'omni-sources',digest(url)+'.mp4');let last;
      for(const format of formats.slice(0,2))try{
       const option=format.sourceOptions?.[0]?.[0]||{url:format.sources?.[0]};
       await download(option,file);return {media,file,resolution:Number.parseInt(format.label),duration:Number(media.items?.find(i=>i.type==='video')?.duration)||0};
      }catch(error){checkGenerationCancelled();last=error;}
      throw last||Error('OmniDL source unavailable');
     }));
     const source=await state.sources.get(url);
     for(let attempt=0;attempt<3;attempt++){
      const offset=state.offsets.get(url)||0;state.offsets.set(url,offset+1);
      const length=Math.max(4,seconds),start=source.duration>60?Math.floor((.03+(offset%20)*.045)*Math.max(0,source.duration-length)):offset*(length+.5);
      if(source.duration&&start+length>source.duration)break;
      const id='omnidl:'+digest(url+':'+start);if(used.has(id))continue;used.add(id);let accepted=false;
      try{
       await run('ffmpeg',['-v','error','-y','-ss',String(start),'-i',source.file,'-t',String(length),'-an','-c:v','libx264','-preset','veryfast','-crf','18','-threads','1','-movflags','+faststart',dest],null,{timeoutMs:20000});
       const item={id,file:dest,provider:'OmniDL',source:url,title:source.media.title,tags:[source.media.caption||''],author:source.media.creator||source.media.username||'',license:source.media.license||'Original creator rights; reuse permission not established',licenseUrl:url,rightsVerified:false,requiresAttribution:true,sourceStart:start,sourceEnd:start+length,sourceResolution:source.resolution};
       row.reviewed++;const prepared=await inspect(item);if(prepared){accepted=true;row.status='selected';return {...item,...prepared};}row.rejected++;
      }finally{if(!accepted)used.delete(id);}
     }
    }catch(error){checkGenerationCancelled();row.error=String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,220);}
   }
   row.status='no verified match';return null;
  }catch(error){checkGenerationCancelled();row.status='unavailable';row.error=String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,220);return null;}
 };
}
