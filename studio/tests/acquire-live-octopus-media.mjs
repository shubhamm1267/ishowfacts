import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {commonsImage,openverseImage,gemini} from '../lib/core.mjs';
import {stockVideo,syntheticStock} from '../lib/stock-video.mjs';
const run=JSON.parse(await readFile('studio/jobs/live-male-octopus/run.json','utf8'));
const source=resolve('studio/jobs/live-male-octopus',run.id),folder=join(source,'reviewed','fresh-media');await mkdir(folder,{recursive:true});
const original=JSON.parse(await readFile(join(source,'CREDITS.json'),'utf8'));
const used=new Set(original.images.flatMap(m=>[m.title,m.id,m.openverseId].filter(Boolean)));
const photos=[];
for(const [index,query] of ['Octopus cyanea underwater','Octopus cyanea'].entries()){
 let chosen=await readFile(join(folder,`photo-${index}.json`),'utf8').then(JSON.parse,()=>null);
 if(chosen){used.add(chosen.title);if(chosen.openverseId)used.add(chosen.openverseId);}
 for(let attempt=0;attempt<5&&!chosen;attempt++){
  const dest=join(folder,`photo-${index}.jpg`);
  const media=await (attempt<2?commonsImage(query,dest,used):openverseImage('octopus underwater',dest,used)).catch(()=>null);
  if(!media)continue;used.add(media.title);if(media.openverseId)used.add(media.openverseId);
  if(syntheticStock(media.title)||/merculiano|haeckel|drawing|engraving|plate\b/i.test(media.title))continue;
  const review=await gemini('Strictly inspect this image. It MUST be a real camera photograph of a living octopus, not squid/cuttlefish, drawing, scientific illustration, painting, computer graphics, toy or AI picture. Good sharpness and suitable for a documentary. Return JSON {real_octopus_photo:true,confidence:0.95,reason:string}. Reject ambiguous images.',dest);
  if(review.real_octopus_photo===true&&review.confidence>=.9)chosen=media;
 }
 if(!chosen)throw Error('No verified fresh octopus photo for '+query);
 await writeFile(join(folder,`photo-${index}.json`),JSON.stringify(chosen,null,2));
 photos.push(chosen);console.log('New real photo:',chosen.title);
}
const duration=JSON.parse(await readFile(join(source,'reviewed','timing.json'),'utf8')).timing[1].duration;
const inspect=async media=>{
 const dimensions=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',media.file],{encoding:'utf8'})).streams[0];
 if(Math.min(dimensions.width,dimensions.height)<1080)return null;
 const frames=join(folder,'frames');await mkdir(frames,{recursive:true});
 execFileSync('ffmpeg',['-v','error','-y','-stream_loop','-1','-i',media.file,'-t',String(duration+.5),'-an','-vf','fps=24,scale=1920:1920:force_original_aspect_ratio=decrease','-start_number','0',join(frames,'%06d.jpg')]);
 const names=(await readdir(frames)).filter(n=>n.endsWith('.jpg')).sort();
 const review=await gemini('Check EVERY frame. Must be actual camera footage of a real living octopus underwater. Reject cartoon, illustrated creature, animation, 3D/CGI, AI artwork, toys, squids, unrelated animals, humans or unclear footage. Return JSON {real_octopus_footage:true,confidence:0.95,reason:string}. Do not infer authenticity from the supplied request.',[.15,.5,.85].map(f=>join(frames,names[Math.floor(f*(names.length-1))])));
 if(!review.real_octopus_footage||review.confidence<.9)return null;
 return {frames,fps:24,frameCount:names.length,width:dimensions.width,height:dimensions.height};
};
let clip;
for(const query of ['octopus swimming','octopus sea','octopus hiding']){
 console.log('Searching real footage:',query);
 clip=await stockVideo(query,join(folder,'real-clip.mp4'),{used,inspect}).catch(()=>null);
 if(clip)break;
}
if(!clip)throw Error('No verified second real octopus clip');
await writeFile(join(source,'reviewed','final-media.json'),JSON.stringify({photos,clip},null,2));console.log('Fresh real media approved');
