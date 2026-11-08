import {readFile,rm,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {generationFetch,checkGenerationCancelled} from './core.mjs';

export function instagramVideoUrl(value){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.port||url.username||url.password||!['instagram.com','www.instagram.com'].includes(url.hostname))return null;
  const match=/^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})\/?$/.exec(url.pathname);
  return match?`https://www.instagram.com/reel/${match[1]}/`:null;
 }catch{return null;}
}
export function instagramLinks(text){
 const decoded=String(text).replace(/&amp;/g,'&').replace(/\\\//g,'/').replace(/\\u002[fF]/g,'/');
 return [...new Set((decoded.match(/https:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?/g)||[]).map(instagramVideoUrl).filter(Boolean))];
}
const words=text=>String(text).toLowerCase().match(/[a-z0-9]+/g)||[];
export function matchingInstagramRows(rows,subject){
 const wanted=words(subject).filter(w=>!['the','a','an','of','and'].includes(w));
 return rows.filter(row=>instagramVideoUrl(row.url)&&row.subjects?.some(label=>{
  const terms=words(label);return wanted.length&&wanted.every(word=>terms.includes(word));
 }));
}
const articleHosts=['hindustantimes.com','indianexpress.com','timesofindia.indiatimes.com','indiatimes.com','octonation.com','nasa.gov','aquariumofpacific.org','montereybayaquarium.org','san-diego-zoo.org','sandiegozoo.org'];
function articleUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&articleHosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:null;}catch{return null;}
}
async function smallPage(url,signal){
 let current=url;
 for(let i=0;i<3;i++){
  const response=await generationFetch(current,{redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});
  if([301,302,303,307,308].includes(response.status)){
   await response.body?.cancel();const next=new URL(response.headers.get('location'),current);
   // Discovery follows only known public search/article domains, not arbitrary hosts.
   if(!articleUrl(next.href))throw Error('Discovery redirect outside known public articles');current=next.href;continue;
  }
  if(!response.ok){await response.body?.cancel();throw Error(`Instagram discovery HTTP ${response.status}`);}
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>1500000)throw Error('Discovery page too large');chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
 }
 throw Error('Too many discovery redirects');
}
export async function discoverInstagram(subject,{signal=AbortSignal.timeout(12000)}={}){
 const query=String(subject).slice(0,90)+' Instagram video';
 const page=await smallPage('https://www.bing.com/search?format=rss&q='+encodeURIComponent(query),signal);
 const urls=instagramLinks(page);
 const articles=[...new Set([...page.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map(m=>articleUrl(m[1].replace(/&amp;/g,'&'))).filter(Boolean))].slice(0,3);
 for(const url of articles){
  if(signal.aborted)break;
  try{urls.push(...instagramLinks(await smallPage(url,signal)));}catch{checkGenerationCancelled();}
 }
 return [...new Set(urls)].map(url=>({url,subjects:[subject],discovery:'public search/article embed'}));
}

// The index contains source pointers, not guessed URLs or copied footage.
// Unknown source rights remain explicit in credits; a download is not a licence.
export function createInstagramProvider({run,python='python3',root,discover=discoverInstagram,catalogue,now=Date.now,budgetMs=60000}={}){
 const sessions=new WeakMap();
 async function stateFor(session){
  if(!sessions.has(session))sessions.set(session,{queries:new Map(),used:new Set(),spent:0,failures:0,disabled:false,index:null});
  const state=sessions.get(session);
  if(!state.index)state.index=catalogue||readFile(new URL('../data/instagram-footage.json',import.meta.url),'utf8').then(JSON.parse).catch(()=>[]);
  return {state,index:await state.index};
 }
 return async(query,dest,{session,used,subject,inspect,seconds=4})=>{
  checkGenerationCancelled();
  const {state,index}=await stateFor(session);
  const row={provider:'Instagram',query:subject||query,status:'searching',results:0,candidates:0,reviewed:0,rejected:0};session.metrics.searches.push(row);
  if(state.disabled||state.spent>=budgetMs){row.status='unavailable';return null;}
  const started=now();
  try{
   const key=String(subject||query).trim().toLowerCase();
   const reserveId=url=>'instagram:'+new URL(url).pathname.split('/')[2];
   const known=matchingInstagramRows(index,key).filter(c=>!used.has(reserveId(instagramVideoUrl(c.url)))&&!state.used.has(instagramVideoUrl(c.url)));
   let candidates=known;
   if(!candidates.length){
    if(!state.queries.has(key))state.queries.set(key,discover(subject||query,{signal:AbortSignal.timeout(Math.min(12000,Math.max(1,budgetMs-state.spent)))}));
    try{candidates=await state.queries.get(key);}catch(error){checkGenerationCancelled();row.error=error.message;row.status='unavailable';return null;}
   }
   row.results=candidates.length;
   let attempts=0;
   for(const candidate of candidates){
    checkGenerationCancelled();
    const url=instagramVideoUrl(candidate.url);if(!url||state.used.has(url)||used.has(reserveId(url)))continue;
    if(attempts++>=2||now()-started+state.spent>=budgetMs)break;
    row.candidates++;state.used.add(url);used.add(reserveId(url));
    const metadata=dest+'.instagram.json';
    try{
     await rm(dest,{force:true}); // Never mistake an earlier candidate for this URL.
     await run(python,[join(root,'scripts','instagram_download.py'),'--url',url,'--output',dest,'--metadata',metadata],null,{timeoutMs:Math.min(20000,Math.max(1000,budgetMs-state.spent-(now()-started)))});
     const info=JSON.parse(await readFile(metadata,'utf8'));
     if(info.source!==url||info.id!==new URL(url).pathname.split('/')[2])throw Error('Instagram source identity mismatch');
     const size=(await stat(dest)).size;if(size<1000||size>80*1024*1024)throw Error('Instagram download outside size limit');
     const item={id:reserveId(url),file:dest,provider:'Instagram',source:url,title:String(info.title||subject||query).slice(0,220),author:String(info.author||'Instagram creator').slice(0,120),
      license:'Original creator rights; reuse permission not supplied by Instagram',licenseUrl:url,requiresAttribution:true,attribution:`Video: ${String(info.author||'Instagram creator').slice(0,120)} / Instagram`,attributionUrl:url,rightsVerified:false};
     const hash=createHash('sha256');for await(const chunk of createReadStream(dest))hash.update(chunk);item.sourceSha256=hash.digest('hex');
     const hashKey='footage-sha256:'+item.sourceSha256;
     if(used.has(hashKey)){row.rejected++;continue;}
     used.add(hashKey);row.reviewed++;
     const prepared=await inspect(item);
     if(prepared){row.status='selected';state.failures=0;return {...item,...prepared};}
     row.rejected++;
    }catch(error){
     checkGenerationCancelled();row.error=String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,500);
     state.failures++;
     if(state.failures>=2||/login|sign in|challenge|429|403|No module named/.test(row.error)){state.disabled=true;break;}
    }finally{await rm(metadata,{force:true});await rm(dest+'.part',{force:true});}
   }
   row.status=state.disabled?'unavailable':'no verified match';return null;
  }finally{state.spent+=Math.max(0,now()-started);}
 };
}
