import Fuse from 'fuse.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const words=text=>(String(text||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[a-z0-9]+/g)||[])
 .filter(w=>w.length>2&&!['the','and','with','for','from','video','photo','stock','close','shot','footage'].includes(w));
const stem=word=>word.replace(/(?:es|s)$/,'');
export function metadataScore(title,subject){
 const wanted=words(subject),found=words(title);
 if(!wanted.length||!found.length)return 0;
 const fuse=new Fuse(found,{includeScore:true,threshold:.3,ignoreLocation:true});
 const matched=w=>found.some(t=>stem(t)===stem(w))||(w.length>=5&&fuse.search(w).some(r=>(r.score??1)<=.3));
 return wanted.filter(matched).length/wanted.length;
}
export function metadataReview(media,scene,topic){
 // Search queries are not evidence: only actual provider metadata is compared.
 const title=[media?.title,...(Array.isArray(media?.tags)?media.tags:[])].filter(Boolean).join(' ');
 const subject=scene.subjectEntity||scene.visualQuery||topic;
 const exactScore=metadataScore(title,subject);
 // An already source-reviewed context brief may illustrate a historical or
 // invisible explanation with the same topic object. It is not proof of the
 // described historical model/action. Never widen a different entity or a
 // pointed-at/evidence shot to the overall topic.
 const topicWords=words(topic),subjectWords=words(subject);
 const sameTopic=topicWords.length>0&&topicWords.every(w=>subjectWords.some(s=>stem(s)===stem(w)));
 const contextScore=scene.visualRole==='context'&&!scene.pointOut&&!scene.shownActionRequired&&sameTopic?metadataScore(title,topic):0;
 const score=Math.max(exactScore,contextScore);
 const prohibited=/\b(?:green[ -]?screen|blue[ -]?screen|chroma[ -]?key|mockup|placeholder|watermark|template|ai[ -]generated|cartoon|illustration|animation|3d[ -]?render|subtitles?|logo)\b/i.test(title);
 const topicPresent=!sameTopic||metadataScore(title,topic)>=.6;
 return {approved:!prohibited&&topicPresent&&score>=.6,score,exactScore,contextTopicMatch:contextScore>exactScore,subject,title,method:'fuzzy-metadata',semanticIdentityChecked:false};
}
export function hashDistance(a,b){
 if(!/^[a-f0-9]{16}$/i.test(a||'')||!/^[a-f0-9]{16}$/i.test(b||''))return 64;
 let n=BigInt('0x'+a)^BigInt('0x'+b),bits=0;while(n){n&=n-1n;bits++;}return bits;
}
export async function checkFrames(paths,{run,python,root,source=true,fit='cover'}){
 const report=JSON.parse(await run(python,[join(root,'scripts','local_media_check.py'),'--request',JSON.stringify({paths,source,fit})]));
 if(!Array.isArray(report.frames)||report.frames.length!==paths.length||!report.frames.every(f=>typeof f.approved==='boolean'&&Array.isArray(f.issues)))throw Error('Incomplete local frame analysis');
 return report;
}
export function framingReviewer({run,python,root,assets,fit='cover',onReject=()=>{},onWarning=()=>{}}){
 const accepted=[],warned=new Set();
 return async(paths,scene,topic,id,media={})=>{
  const folder=join(assets,'visual-review-'+id);await mkdir(folder,{recursive:true});
  const metadata=metadataReview(media,scene,topic);
  if(!metadata.approved){await writeFile(join(folder,'local-review.json'),JSON.stringify({approved:false,metadata},null,2));onReject({id,reason:'Provider title/tags do not sufficiently match the requested subject, or describe a placeholder'});return null;}
  const report=await checkFrames(paths,{run,python,root,fit});
  const hashes=report.frames.filter(f=>f.hashUseful).map(f=>f.hash);
  const duplicate=hashes.length>0&&accepted.some(group=>hashes.every(h=>group.some(old=>hashDistance(h,old)<=3)));
  const issues=report.frames.flatMap(f=>f.issues);
  if(duplicate)issues.push('Near-duplicate footage already selected for another scene');
  const result={...report,approved:report.frames.every(f=>f.approved)&&!duplicate,metadata,issues,
   method:'local-technical-and-metadata',semanticIdentityChecked:false,actionChecked:false,brandingChecked:false};
  await writeFile(join(folder,'local-review.json'),JSON.stringify(result,null,2));
  for(const warning of report.warnings||[])if(!warned.has(warning)){warned.add(warning);onWarning(warning);}
  if(!result.approved){onReject({id,reason:issues.join('; ').slice(0,500)});return null;}
  if(hashes.length)accepted.push(hashes);
  // No model can identify the named subject here. Keep the user's framing and
  // never manufacture a target position from an edge/colour centroid.
  return {subjectFocus:[],mediaFit:fit,visualReview:folder,matches:true,confidence:metadata.score,
   anchors:{},confidences:{},features:{}};
 };
}
export async function reviewRenderedVideo(plan,episode,{run,python='python3',root=process.cwd(),assets}){
 const folder=join(assets,'final-cut-review');await mkdir(folder,{recursive:true});
 const probe=JSON.parse(await run('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',plan.meta.out]));
 const video=probe.streams?.find(s=>s.codec_type==='video'),issues=[],indices=[];
 if(!video||video.width<1||video.height<1)issues.push('Export has no valid video stream');
 const outputSize=plan.meta.output_size||plan.meta.size;
 if(video&&Array.isArray(outputSize)&&(video.width!==outputSize[0]||video.height!==outputSize[1]))issues.push('Export dimensions differ from the approved plan');
 if(!probe.streams?.some(s=>s.codec_type==='audio'))issues.push('Export has no audio stream');
 if(!Number.isFinite(Number(probe.format?.duration))||Math.abs(Number(probe.format.duration)-plan.meta.duration)>1.5)issues.push('Export duration differs from the approved plan');
 const frames=plan.scenes.flatMap((scene,index)=>{
  const end=plan.scenes[index+1]?.start??plan.meta.duration;
  return (scene.reference_media?.media_type==='video'?[.15,.5,.85]:[.5]).map(fraction=>({index,time:scene.start+(end-scene.start)*fraction,path:join(folder,`scene-${index}-${fraction}.jpg`)}));
 });
 if(!frames.length)issues.push('Export has no scene frames to check');
 // Bounded batches avoid one process per frame and dozens of encoders at once.
 for(let offset=0;offset<frames.length;offset+=6)await run('ffmpeg',['-v','error','-y','-i',plan.meta.out,...frames.slice(offset,offset+6).flatMap(f=>['-ss',String(f.time),'-frames:v','1','-an','-vf','scale=640:640:force_original_aspect_ratio=decrease','-q:v','3','-threads','1',f.path])]);
 const report=frames.length?await checkFrames(frames.map(f=>f.path),{run,python,root,source:false}):{frames:[],warnings:[]};
 report.frames.forEach((f,i)=>{if(!f.approved){indices.push(frames[i].index);issues.push(`Scene ${frames[i].index+1}: ${f.issues.join('; ')}`);}});
 const result={approved:issues.length===0,issues,indices:[...new Set(indices)],framesChecked:frames.length,
  method:'local-technical',semanticIdentityChecked:false,headlineSpellingChecked:false,layoutSemanticsChecked:false,report};
 await writeFile(join(folder,'review.json'),JSON.stringify(result,null,2));return result;
}
