// Pinterest search from Nexo 1.8.0; vendored with its MIT licence for deployment.
import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generationFetch,checkGenerationCancelled} from './core.mjs';
import {metadataReview} from './local-visual-quality.mjs';
import {usableVideoDimensions} from './video-resolution.mjs';

export function pinterestMediaUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(?:v\d*|i)\.pinimg\.com$/.test(u.hostname)?u.href:null;}catch{return null;}
}
async function limited(url,max=2_000_000,range=null){
 if(!pinterestMediaUrl(url))throw Error('Untrusted Pinterest media host');
 const r=await generationFetch(url,{redirect:'error',signal:AbortSignal.timeout(10000),...(range?{headers:{Range:`bytes=${range.offset}-${range.offset+range.length-1}`}}:{})});
 if(!r.ok){await r.body?.cancel();throw Error(`Pinterest media HTTP ${r.status}`);}
 const chunks=[];let bytes=0;
 try{for await(const c of r.body){bytes+=c.length;if(bytes>max)throw Error('Pinterest response exceeds size limit');chunks.push(c);}}catch(e){await r.body?.cancel().catch(()=>{});throw e;}
 const data=Buffer.concat(chunks);
 if(range){if(r.status!==206||data.length!==range.length)throw Error('Pinterest byte range was not honored');return data;}
 return data;
}
// Mirror a bounded HLS excerpt locally. FFmpeg never opens remote manifest URLs.
export async function downloadPinterestExcerpt(url,dest,{run,seconds=12}={}){
 const dir=dest+'.nexo';await mkdir(dirname(dest),{recursive:true});await mkdir(dir,{recursive:true});
 try{
  let text='';
  for(let depth=0;depth<3;depth++){
   text=(await limited(url)).toString('utf8');if(!text.startsWith('#EXTM3U'))throw Error('Not an HLS manifest');
   const lines=text.split(/\r?\n/),variants=[];
   for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){
    const next=lines.slice(i+1).find(l=>l.trim()&&!l.startsWith('#'));if(next)variants.push({url:new URL(next,url).href,height:Number(/RESOLUTION=\d+x(\d+)/.exec(lines[i])?.[1]||0)});
   }
   if(!variants.length)break;
   const selected=variants.filter(v=>v.height<=1280).sort((a,b)=>b.height-a.height)[0]||variants.sort((a,b)=>a.height-b.height)[0];url=selected.url;
   if(depth===2)throw Error('Nested HLS limit');
  }
  const output=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:60','#EXT-X-MEDIA-SEQUENCE:0'];
  let duration=0,pending=null,count=0,bytes=0,segmentRange=null,lastEnd=0;
  const byteRange=(value,fallback=0)=>{const m=/^(\d+)(?:@(\d+))?$/.exec(value);if(!m||Number(m[1])<1||Number(m[1])>20_000_000)throw Error('Invalid HLS byte range');return {length:Number(m[1]),offset:m[2]?Number(m[2]):fallback};};
  for(const raw of text.split(/\r?\n/)){
   checkGenerationCancelled();const line=raw.trim();
   if(line.startsWith('#EXT-X-KEY:')&&!line.includes('METHOD=NONE'))throw Error('Encrypted HLS is not supported');
   if(line.startsWith('#EXT-X-MAP:')){
    const uri=/URI="([^"]+)"/.exec(line)?.[1];if(!uri)throw Error('Invalid HLS init segment');
    const range=/BYTERANGE="([^"]+)"/.exec(line)?.[1];
    const data=await limited(new URL(uri,url).href,8_000_000,range?byteRange(range):null);await writeFile(join(dir,'init.mp4'),data);bytes+=data.length;output.push('#EXT-X-MAP:URI="init.mp4"');
   }
   if(line.startsWith('#EXT-X-BYTERANGE:'))segmentRange=byteRange(line.slice(17),lastEnd);
   if(line.startsWith('#EXTINF:'))pending=Number(line.slice(8).split(',')[0]);
   else if(line&&!line.startsWith('#')&&pending!==null){
    if(!Number.isFinite(pending)||pending<=0||pending>60)throw Error('Invalid HLS segment duration');
    const data=await limited(new URL(line,url).href,20_000_000,segmentRange);if(segmentRange)lastEnd=segmentRange.offset+segmentRange.length;segmentRange=null;bytes+=data.length;if(bytes>60_000_000)throw Error('Pinterest excerpt exceeds byte limit');
    const name=`segment-${count++}.ts`;await writeFile(join(dir,name),data);output.push(`#EXTINF:${pending},`,name);duration+=pending;pending=null;
    if(duration>=Math.min(15,seconds)||count>=12)break;
   }
  }
  if(!count)throw Error('No usable HLS segments');
  output.push('#EXT-X-ENDLIST');const manifest=join(dir,'excerpt.m3u8');await writeFile(manifest,output.join('\n'));
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-protocol_whitelist','file,crypto','-allowed_extensions','ALL','-i',manifest,'-t',String(Math.min(15,seconds)),'-map','0:v:0','-an','-c:v','copy','-avoid_negative_ts','make_zero','-movflags','+faststart',dest],null,{timeoutMs:20000});
 }finally{await rm(dir,{recursive:true,force:true});}
}

export function createNexoProvider({packageDirectory,run,search,download=downloadPinterestExcerpt,now=Date.now,budgetMs=120000,lookupMs=35000,sourcePolicy={}}={}){
 const require=createRequire(import.meta.url);
 if(!search){
  const axios=packageDirectory?require(join(packageDirectory,'node_modules/axios/dist/node/axios.cjs')):require('axios');
  axios.defaults.timeout=8000;axios.defaults.maxContentLength=5_000_000;
  const pinterest=packageDirectory?require(join(packageDirectory,'node_modules/nexo-aio-downloader/src/lib/pinterest.js')):require('../vendor/nexo/pinterest.cjs');
  search=(query,limit)=>pinterest.search(query,limit);
 }
 const sessions=new WeakMap();
 return async(query,dest,{session,used,inspect,subject,scene,topic='',seconds=4})=>{
  if(!sessions.has(session))sessions.set(session,{queries:new Map(),acquisitionMs:0,rejected:new Map()});const state=sessions.get(session);
  const row={provider:'Pinterest / Nexo',query,queries:[],status:'searching',results:0,candidates:0,reviewed:0,rejected:0};session.metrics.searches.push(row);
  const start=now();let acquisitionMs=0;
  const exhausted=()=>state.acquisitionMs>=budgetMs||acquisitionMs>=lookupMs;
  // CPU frame checks/encoding and time spent on other scenes must not expire
  // Pinterest before later scenes get their first search. Charge only retrieval.
  const retrieve=async operation=>{const began=now();try{return await operation();}finally{const elapsed=Math.max(0,now()-began);state.acquisitionMs+=elapsed;acquisitionMs+=elapsed;}};
  if(exhausted()){row.status='budget exhausted';return null;}
  try{
   checkGenerationCancelled();
   const brief=scene||{subjectEntity:subject||query};
   const queries=[...new Set([query,subject,brief.visualRole==='context'&&!brief.pointOut&&!brief.shownActionRequired?topic:null].filter(Boolean).map(q=>String(q).trim().toLowerCase()))].slice(0,3);
   const briefKey=JSON.stringify([subject,brief.visualRole,topic]);
   if(!state.rejected.has(briefKey))state.rejected.set(briefKey,new Set());const rejected=state.rejected.get(briefKey);
   const title=p=>[p.title,p.description].filter(Boolean).join(' ').slice(0,500);
   const seen=new Set();
   for(const key of queries){
    if(exhausted()||row.candidates>=4)break;
    row.queries.push(key);
    if(!state.queries.has(key))state.queries.set(key,retrieve(()=>search(key+' video',40)));
    const result=await state.queries.get(key);checkGenerationCancelled();
    if(!result.status){row.error=result.message||'Pinterest search failed';continue;}
    const pins=(result.data?.pins||[]).filter(p=>p.is_video&&pinterestMediaUrl(p.video_url));row.results+=pins.length;
    const ranked=pins.map(pin=>({pin,review:metadataReview({title:title(pin)},brief,topic,sourcePolicy)}))
     .filter(({pin,review})=>Object.values(pin.videos?.list||{}).some(v=>usableVideoDimensions(v.width,v.height))&&review.approved)
     .sort((a,b)=>b.review.score-a.review.score);
    for(const {pin} of ranked){
    checkGenerationCancelled();if(exhausted()||row.candidates>=4)break;
    const id='pinterest:'+createHash('sha256').update(pin.video_url).digest('hex');if(used.has(id)||rejected.has(id)||seen.has(id))continue;seen.add(id);used.add(id);row.candidates++;
    let accepted=false;
    try{
     await rm(dest,{force:true});await retrieve(()=>download(pin.video_url,dest,{run,seconds:Math.max(4,seconds+.5)}));
     const item={id,file:dest,provider:'Pinterest / Nexo',source:pin.pin_url,title:title(pin),author:pin.uploader?.full_name||pin.uploader?.username||'Pinterest uploader',license:'Original creator rights; reuse permission not supplied by Pinterest',licenseUrl:pin.pin_url,rightsVerified:false,requiresAttribution:true};
     row.reviewed++;const prepared=await inspect(item);if(prepared){accepted=true;row.status='selected';return {...item,...prepared};}row.rejected++;rejected.add(id);
    }catch(e){checkGenerationCancelled();row.error=String(e.message).slice(0,250);}
    finally{if(!accepted)used.delete(id);}
    }
   }
   row.status='no verified match';return null;
  }catch(e){checkGenerationCancelled();row.status='unavailable';row.error=String(e.message).slice(0,250);return null;}
  finally{row.seconds=Math.round((now()-start)/10)/100;row.acquisitionSeconds=Math.round(acquisitionMs/10)/100;}
 };
}
