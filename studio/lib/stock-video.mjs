import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import { providerValue,licenseInfo,mediaTitleMismatch } from './core.mjs';

const MAX = () => Math.min(120, Math.max(5, Number(process.env.STOCK_VIDEO_MAX_MB) || 80)) * 1024 * 1024;
const allowed = host => ['vecteezy.com', 'mixkit.co', 'pexels.com', 'coverr.co'].some(d => host === d || host.endsWith('.' + d))||['commons.wikimedia.org','upload.wikimedia.org'].includes(host);
const digest=value=>createHash('sha256').update(value).digest('hex');

// Upload descriptions carry licence credits; media pixels stay uncluttered.
// Keep the structured provenance too, even when attribution is optional.
export function uploadDescription(credits,sources=[]){
 const clean=value=>String(value||'').replace(/[\r\n\u0000-\u001f]+/g,' ').trim();
 const rows=[...new Map(credits.map(item=>[item.id||item.source||item.title,item])).values()];
 const blocks=rows.map(item=>[
  clean(item.title||item.attribution||'Media'),
  `Creator: ${clean(item.author||item.creator||item.credit||'See original source')}`,
  `Source: ${clean(item.source||item.url||item.attributionUrl)}`,
  `License: ${clean(item.license)}${item.licenseUrl?' — '+clean(item.licenseUrl):''}`,
  ...(item.attribution?[clean(item.attribution)]:[]),
  ...(item.attributionUrl&&item.attributionUrl!==item.source?['Credit link: '+clean(item.attributionUrl)]:[]),
  'Changes: excerpted/cropped/resized; original clip audio removed where applicable.'
 ].join('\n'));
 return ['Fact sources:',...sources.map(s=>`${clean(s.name)}: ${clean(s.url)}`),'',
  'Media credits — keep these with your published video:',...blocks.map(b=>'\n'+b)].join('\n')+'\n';
}

export function moveCreditsToDescription(plan){
 for(const scene of plan.scenes||[]){
  if(scene.reference_media)scene.reference_media.attribution='';
  for(const element of scene.elements||[])if('attribution' in element)element.attribution='';
 }
 plan.meta.attribution_placement='upload-description';
 return plan;
}

// Disk stores only approved original footage, never API keys or download URLs.
// A cache hit still needs current licence checks and the caller's scene review.
export function createStockMediaCache({directory,maxBytes=256*1024*1024,ttlMs=20*60*1000,now=Date.now}){
 let queue=Promise.resolve();
 const locked=operation=>{const result=queue.then(operation);queue=result.catch(()=>{});return result;};
 async function sweep(){
  let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return;throw e;}
  const rows=[];let bytes=0;
  for(const name of names.filter(n=>/^[a-f0-9]{64}\.mp4\.[a-f0-9-]{36}\.part$/.test(n))){
   const path=join(directory,name);try{if(now()-(await stat(path)).mtimeMs>=ttlMs)await rm(path,{force:true});}catch{/* Gone already. */}
  }
  for(const name of names.filter(n=>/^[a-f0-9]{64}\.mp4$/.test(n))){
   const path=join(directory,name);let info;try{info=await stat(path);}catch{continue;}
   if(now()-info.mtimeMs>=ttlMs){await rm(path,{force:true});continue;}
   rows.push({path,size:info.size,time:info.mtimeMs});bytes+=info.size;
  }
  for(const row of rows.sort((a,b)=>a.time-b.time)){
   if(bytes<=maxBytes)break;await rm(row.path,{force:true});bytes-=row.size;
  }
 }
 return {
  prune:()=>locked(sweep),
  get:(key,dest)=>locked(async()=>{
   await sweep();try{await copyFile(join(directory,digest(key)+'.mp4'),dest);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}
  }),
  put:(key,source)=>locked(async()=>{
   const info=await stat(source);if(info.size>maxBytes)return;
   await mkdir(directory,{recursive:true});const path=join(directory,digest(key)+'.mp4'),temp=path+'.'+randomUUID()+'.part';
   try{await copyFile(source,temp);await rename(temp,path);}finally{await rm(temp,{force:true});}
   await sweep();
  })
 };
}

export function createStockSession({cache=null}={}){
 return {cache,requests:new Map(),metrics:{metadataRequests:0,metadataHits:0,cacheHits:0}};
}
export function stockLookup(session,key,operation){
 if(session.requests.has(key)){session.metrics.metadataHits++;return session.requests.get(key);}
 if(session.requests.size>=128)session.requests.delete(session.requests.keys().next().value);
 session.metrics.metadataRequests++;
 const pending=Promise.resolve().then(operation);session.requests.set(key,pending);
 pending.catch(()=>{if(session.requests.get(key)===pending)session.requests.delete(key);});
 return pending;
}
const scope=()=>digest(providerValue('VECTEEZY_ACCOUNT_ID')+'\0'+providerValue('VECTEEZY_API_KEY'));
const normalizedQuery=query=>String(query).trim().replace(/\s+/g,' ').toLowerCase();
const mixkitSearchURL=query=>`https://mixkit.co/free-stock-video/${encodeURIComponent(normalizedQuery(query).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}/`;
function vecteezySearch(query,session){
 const account=providerValue('VECTEEZY_ACCOUNT_ID'),key=providerValue('VECTEEZY_API_KEY');
 if(!/^\d+$/.test(account)||!key)return Promise.resolve(null);
 const url=new URL(`https://api.vecteezy.com/v2/${account}/resources`);
 Object.entries({term:normalizedQuery(query),content_type:'video',license_type:'commercial',ai_generated:'false',per_page:'12'}).forEach(([k,v])=>url.searchParams.set(k,v));
 return stockLookup(session,scope()+':'+url,async()=>(await request(url,{Authorization:`Bearer ${key}`})).json());
}
export async function prefetchStockVideo(query,{session}){
 try{
  const result=await vecteezySearch(query,session);
  if(!result?.resources?.length){const url=mixkitSearchURL(query);await stockLookup(session,url,()=>textPage(url));}
 }catch{/* Best effort: a failed lookup is evicted, so normal acquisition retries. */}
}

export function stockFile(files){
 return files.filter(f=>['mp4','mov'].includes(f.extension)&&f.size_in_bytes>0&&f.size_in_bytes<=MAX()&&
  (!(Number(f.width)>0&&Number(f.height)>0)||Math.min(Number(f.width),Number(f.height))>=1080))
  .sort((a,b)=>a.size_in_bytes-b.size_in_bytes)[0];
}

async function request(url, headers = {}, timeoutMs = 15_000, method = 'GET') {
  let current = new URL(url);
  for (let n = 0; n < 5; n++) {
    if (current.protocol !== 'https:' || !allowed(current.hostname) || current.username || current.password)
      throw Error('Stock media URL outside approved providers');
    const response = await fetch(current, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if ([301,302,303,307,308].includes(response.status)) {
      current = new URL(response.headers.get('location'), current);
      headers = {}; // Never forward API credentials to a CDN or redirect.
      continue;
    }
    if (!response.ok) throw Error(`Stock provider HTTP ${response.status}`);
    return response;
  }
  throw Error('Too many stock provider redirects');
}

async function textPage(url) {
  const response = await request(url);
  return (await response.text()).slice(0, 3_000_000);
}

async function download(url, dest, {commons=false}={}) {
  const response = await request(url,{},45_000);
  if (Number(response.headers.get('content-length')) > MAX()) {await response.body?.cancel();throw Error('Stock clip too large');}
  let size=0,header=Buffer.alloc(0);const temporary=dest+'.'+randomUUID()+'.part';
  const guard=new Transform({transform(chunk,encoding,done){
   size+=chunk.length;if(size>MAX())return done(Error('Stock clip exceeds download limit'));
   if(header.length<12)header=Buffer.concat([header,chunk.subarray(0,12-header.length)]);
   const mp4=header.subarray(4,8).toString()==='ftyp';
   const webm=header.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
   const ogg=header.subarray(0,4).toString()==='OggS';
   if(header.length>=12&&!mp4&&!(commons&&(webm||ogg)))return done(Error('Stock download is not an MP4/MOV or supported Commons video'));
   done(null,chunk);
  },flush(done){done(size<1000?Error('Stock download is not an MP4/MOV'):null);}});
  try {
    await pipeline(Readable.fromWeb(response.body),guard,createWriteStream(temporary));
    await rename(temporary,dest);
  } finally {await rm(temporary,{force:true});}
}

export function mixkitItem(html) {
  // Some Restricted items have misleading JSON-LD videoFree URLs. Require
  // the actual download licence marker and reject Restricted anywhere.
  if (/data-license=["']videoRestricted["']|Mixkit Restricted License/i.test(html)) return null;
  if (!/data-license=["']videoFree["']/.test(html)) return null;
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(block[1]); } catch { continue; }
    const all = Array.isArray(data) ? data : data['@graph'] || [data];
    const item = all.find(x => x['@type'] === 'VideoObject');
    if (item?.contentUrl && !/restricted/i.test(item.copyrightNotice || ''))
      return { title: item.name || item.headline || '', url: item.contentUrl };
  }
  return null;
}

export function vecteezyFree(html) {
  return /<h1\b[^>]*>[^]*?\bFree Video\s*<\/h1>/i.test(html)
    && /license_type=free/.test(html) && !/<h1\b[^>]*>[^<]*\bPro Video/i.test(html);
}

// Documentary stock must be real footage, not a cartoon tagged "not AI".
export function syntheticStock(title=''){
 return /\b(?:cartoon|animat(?:ed|ion)|illustrat(?:ed|ion)|3d|cgi|render(?:ed|ing)?|motion graphics?|seamless loop|alpha channel|transparent background|striped background|abstract|gradient background|background pattern|geometric pattern)\b/i.test(title);
}

export async function stockVideo(query, dest, { used = new Set(), inspect,subject='',seconds=7,session=createStockSession() } = {}) {
  const account = providerValue('VECTEEZY_ACCOUNT_ID'), key = providerValue('VECTEEZY_API_KEY');
  const cacheKey=id=>scope()+':'+id;
  async function restore(id){
   try{if(await session.cache?.get(cacheKey(id),dest)){session.metrics.cacheHits++;return true;}}catch{/* Cache loss never blocks a licensed download. */}
   return false;
  }
  const words=text=>(String(text).toLowerCase().match(/[a-z]{3,}/g)||[]).filter(w=>!['the','and','for','with','from','how','why'].includes(w));
  const forms=word=>[word,word.replace(/s$/,''),word.replace(/es$/,'')];
  const subjectWords=words(subject);
  // Cheap ranking saves downloads of popular but unrelated results. Actual
  // frame inspection remains mandatory; a title is not proof of relevance.
  const relevance=title=>subjectWords.filter(w=>words(title).some(t=>forms(w).some(f=>forms(t).includes(f)))).length;
  const candidates = [];
  let failure;
  if (/^\d+$/.test(account) && key) {
    try {
      const base = `https://api.vecteezy.com/v2/${account}`;
      const headers = { Authorization: `Bearer ${key}` };
      const data = await vecteezySearch(query,session);
      const ranked=(data.resources||[]).map((item,index)=>({item,index,score:relevance(item.title)}))
        .sort((a,b)=>b.score-a.score||a.index-b.index);
      for (const {item} of ranked) {
        if (item.content_type !== 'video' || used.has(`vecteezy:${item.id}`) || syntheticStock(item.title)) continue;
        const files = item.file_metadata?.available_file_types || [];
        const file = stockFile(files);
        if (!file) continue; // Never acquire a multi-GB source/unknown-size file.
        candidates.push({id:`vecteezy:${item.id}`,acquire:async () => {
          if(used.has(`vecteezy:${item.id}`))return null;
          used.add(`vecteezy:${item.id}`);
          const source = `https://www.vecteezy.com/video/${item.id}`;
          const page = await stockLookup(session,scope()+':'+source,()=>textPage(source));
          if (!vecteezyFree(page)) return null;
          let author = '';
          for (const block of page.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
            try {
              const metadata = JSON.parse(block[1]);
              const items = Array.isArray(metadata) ? metadata : metadata['@graph'] || [metadata];
              const owner = items.find(x => typeof x.copyrightNotice === 'string');
              if (owner) author = owner.copyrightNotice.replace(/[\r\n<>]/g, '').slice(0, 100);
            } catch { /* skip unrelated metadata */ }
          }
          if (!author) return null; // Mandatory creator credit must be known.
          const metadata = await stockLookup(session,scope()+':'+base+'/resources/'+item.id,async()=>(await request(`${base}/resources/${item.id}`,headers)).json());
          if (metadata.license_type !== 'commercial' || metadata.ai_generated === true) return null;
          // Official licensed download, never a watermarked preview URL.
          // Obtain current entitlement/attribution even when original bytes are cached.
          const ticket = await (await request(`${base}/resources/${item.id}/download?file_type=${file.extension}`, headers)).json();
          if (!ticket.url || ticket.download_status_url) return null;
          if(!await restore(`vecteezy:${item.id}`))await download(ticket.url, dest);
          return { id: `vecteezy:${item.id}`, file: dest, provider: 'Vecteezy', title: item.title,
            source, license: 'Vecteezy Free License', licenseUrl: 'https://www.vecteezy.com/licensing-agreement',
            author, attribution: `Video: ${author} / Vecteezy.com`, requiresAttribution: true,
            attributionUrl: ticket?.required_attribution_url || source };
        }});
      }
    } catch (e) { failure = e; }
  }
  async function reviewCandidates() {
    // Bound expensive downloads/reviews before falling back to a checked photo.
    // This is per provider; Mixkit remains available after Vecteezy candidates.
    const limit=Math.min(5,Math.max(1,Number(process.env.STOCK_VIDEO_CANDIDATES)||2));
    let attempts=0;
    for (const {id,acquire} of candidates.splice(0)) {
      // Another scene may have reserved this candidate while we reviewed the
      // previous one. Skipping its ID must not consume a download/review slot.
      if(used.has(id))continue;
      if(attempts++>=limit)break;
      try {
        const item=await acquire();if(!item)continue;
        used.add(item.id);
        const prepared=await inspect(item);
        if(prepared){
         try{await session.cache?.put(cacheKey(item.id),item.file);}catch{/* Optional cache cannot fail a verified shot. */}
         return {...item,...prepared};
        }
      }catch(e){failure=e;}
    }
    return null;
  }
  const fromVecteezy=await reviewCandidates();
  if(fromVecteezy)return fromVecteezy;
  candidates.length=0; // Remaining Vecteezy candidates must not consume Mixkit's budget.
  // Only query Mixkit when Vecteezy has no usable result.
  try {
    const searchURL=mixkitSearchURL(query);
    const html = await stockLookup(session,searchURL,()=>textPage(searchURL));
    const links = [...new Set([...html.matchAll(/href="(\/free-stock-video\/[a-z0-9-]+-\d+\/)"/g)].map(m => m[1]))]
      .sort((a,b)=>relevance(b)-relevance(a)).slice(0, 3);
    for (const link of links) {
      if (used.has(link)) continue;
      candidates.push({id:link,acquire:async () => {
        if(used.has(link))return null;
        used.add(link);
        const source = 'https://mixkit.co' + link, item = mixkitItem(await stockLookup(session,source,()=>textPage(source)));
        if (!item || syntheticStock(item.title)) return null;
        if(!await restore(link))await download(item.url, dest);
        return { id: link, file: dest, provider: 'Mixkit', title: item.title, source,
          license: 'Mixkit Stock Video Free License', licenseUrl: 'https://mixkit.co/license/#videoFree', requiresAttribution: false };
      }});
    }
  } catch (e) { failure ||= e; }
  const fromMixkit=await reviewCandidates();
  if(fromMixkit)return fromMixkit;
  // Additional free licensed providers share the same download and visual gates.
  for(const provider of ['pexels','coverr']){
   const apiKey=providerValue(provider==='pexels'?'PEXELS_API_KEY':'COVERR_API_KEY');
   if(!apiKey)continue;
   try{
    const url=new URL(provider==='pexels'?'https://api.pexels.com/v1/videos/search':'https://api.coverr.co/videos');
    url.searchParams.set('query',normalizedQuery(query));
    if(provider==='pexels'){url.searchParams.set('per_page','12');url.searchParams.set('size','medium');}
    else{url.searchParams.set('page_size','12');url.searchParams.set('urls','true');url.searchParams.set('filter','is_ai_generated:false');}
    const headers=provider==='pexels'?{Authorization:apiKey}:{'x-api-key':apiKey};
    const data=await stockLookup(session,provider+':'+digest(apiKey)+':'+url,async()=>(await request(url,headers)).json());
    const rows=(provider==='pexels'?data.videos:data.hits)||[];
    for(const row of rows){
     const id=provider+':'+row.id;
     if(used.has(id)||row.is_ai_generated===true||row.is_premium===true||row.sponsored===true)continue;
     const title=provider==='pexels'?new URL(row.url).pathname.split('/').filter(Boolean).at(-1).replace(/-\d+$/,'').replaceAll('-',' '):row.title;
     if(syntheticStock(title))continue;
     const file=provider==='pexels'?(row.video_files||[]).filter(f=>f.file_type==='video/mp4'&&Math.min(f.width||0,f.height||0)>=1080).sort((a,b)=>a.width*a.height-b.width*b.height)[0]:null;
     const link=provider==='pexels'?file?.link:Math.min(row.max_width||0,row.max_height||0)>=1080?row.urls?.mp4_download:null;
     if(!link)continue;
     candidates.push({id,acquire:async()=>{
      if(used.has(id))return null;used.add(id);
      if(!await restore(id))await download(link,dest);
      const name=provider==='pexels'?'Pexels':'Coverr',author=provider==='pexels'?row.user?.name||'Pexels creator':row.contributor?.name||'Coverr creator';
      return {id,file:dest,provider:name,title,source:provider==='pexels'?row.url:'https://coverr.co/videos/'+(row.slug||row.id),author,
       license:name+' License',licenseUrl:provider==='pexels'?'https://www.pexels.com/license/':'https://coverr.co/license',
       requiresAttribution:true,attribution:`Video by ${author} on ${name}`,attributionUrl:provider==='pexels'?row.user?.url||row.url:'https://coverr.co',
       ...(provider==='coverr'?{downloadTrackingId:String(row.id)}:{})};
     }});
    }
    const selected=await reviewCandidates();
    if(selected){
     if(provider==='coverr')await request('https://api.coverr.co/videos/'+encodeURIComponent(selected.downloadTrackingId)+'/stats/downloads',{...headers},15000,'PATCH');
     return selected;
    }
   }catch(e){failure ||= e;}
  }
  // The same Commons source used for photos also hosts original licensed video.
  // Keep the same HD, licence, diversity and caller inspection requirements.
  try{
   const result=await commonsVideo(query,dest,{used,inspect,subject,session});
   if(result)return result;
  }catch(e){failure ||= e;}
  if (failure) throw failure;
  return null;
}

export async function commonsVideo(query,dest,{used=new Set(),inspect,subject='',session=createStockSession()}={}){
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 Object.entries({action:'query',generator:'search',gsrsearch:String(query).slice(0,90)+' filetype:video',gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|extmetadata|size|mime',format:'json'}).forEach(([k,v])=>url.searchParams.set(k,v));
 const result=await stockLookup(session,'commons-video:'+url,async()=>(await request(url,{},12000)).json());
 const pages=Object.values(result.query?.pages||{}).sort((a,b)=>(a.index??999)-(b.index??999));
 let attempts=0;
 for(const page of pages){
  const info=page.imageinfo?.[0],id='commons-video:'+page.title;
  if(!info||used.has(id)||!['video/webm','video/ogg','application/ogg','video/mp4'].includes(info.mime)||Math.min(info.width||0,info.height||0)<1080||!(info.size>1000&&info.size<=MAX())||syntheticStock(page.title)||mediaTitleMismatch(page.title,subject||query))continue;
  const credit=licenseInfo(info.extmetadata);
  if(!credit.allowed)continue;
  let address;try{address=new URL(info.url);}catch{continue;}
  if(address.protocol!=='https:'||address.hostname!=='upload.wikimedia.org'||address.username||address.password||address.port)continue;
  if(attempts++>=2)break;
  used.add(id);
  try{
   const key='commons:'+id;let cached=false;
   try{cached=await session.cache?.get(key,dest)||false;}catch{}
   if(cached)session.metrics.cacheHits++;else await download(address,dest,{commons:true});
   const source='https://commons.wikimedia.org/wiki/'+encodeURIComponent(page.title.replaceAll(' ','_'));
   const item={id,file:dest,provider:'Wikimedia Commons',title:page.title,source,...credit,
    requiresAttribution:/^cc by/i.test(credit.license),attribution:`Video: ${credit.author||'Wikimedia Commons contributor'} / Wikimedia Commons (${credit.license})`};
   const prepared=await inspect(item);
   if(!prepared)continue;
   try{await session.cache?.put(key,dest);}catch{}
   return {...item,...prepared};
  }catch{/* Rejected/download-failed candidates cannot become unchecked media. */}
 }
 return null;
}
