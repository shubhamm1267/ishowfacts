import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';
import {gsap} from 'gsap';
import {TITLE_FAMILY,FONT_OPTIONS,wordGeometry,wordSVG} from './typography.mjs';

const options=FONT_OPTIONS;
const rendererHash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).update(await readFile(new URL('./typography.mjs',import.meta.url))).update(await readFile(options.font.fontFiles[0])).update(gsap.version).digest('hex');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const metrics=new Map();
function measure(word,size){
 const key=word+'|'+size;
 if(!metrics.has(key))metrics.set(key,{width:wordGeometry(word,size).width,x:0});
 return metrics.get(key)||{width:0,x:0};
}
export function textBlock(text,cx,y,width,size,color){
 const words=String(text||'').split(/\s+/).filter(Boolean),lines=[];let line=[],used=0;
 for(const word of words){const w=measure(word,size).width;if(line.length&&used+w+size*.3>width){lines.push(line);line=[];used=0;}line.push(word);used+=w+size*.3;}if(line.length)lines.push(line);
 return lines.slice(0,3).map((words,i)=>{
  const total=words.reduce((n,w)=>n+measure(w,size).width,0)+(words.length-1)*size*.3;let x=cx-total/2;
  return words.map(word=>{const m=measure(word,size),node=wordSVG(word,x,y+i*size*1.25,size,color);x+=m.width+size*.3;return node;}).join('');
 }).join('');
}
function icon(kind){
 const paths={
  phone:'<rect x="-36" y="-70" width="72" height="140" rx="12"/><path d="M-16-53H16M-12 51H12"/>',
  radio:'<path d="M-45 68L0-50L45 68M-29 22H29M-38 48L22-9M38 48L-22-9M-30-50Q0-80 30-50M-48-65Q0-111 48-65"/><circle cy="-45" r="6"/>',
  plane:'<path d="M0-78L14-15L67 23V39L14 20L10 59L31 74H-31L-10 59L-14 20L-67 39V23L-14-15Z"/>',
  wind:'<path d="M-58-28H20Q55-28 48-50Q41-71 23-54M-68-2H48Q75-2 65 21Q55 40 40 26M-47 27H10Q36 27 26 47"/>',
  water:'<path d="M-65-18Q-43-45-20-18T25-18T70-18M-65 15Q-43-12-20 15T25 15T70 15M-65 48Q-43 21-20 48T25 48T70 48"/>',
  solar:'<path d="M-62-5H60L77 60H-77ZM-31-5L-37 60M4-5V60M35-5L43 60M-68 26H67M-4 61V79M-30 80H26"/><circle cx="36" cy="-47" r="21"/><path d="M36-84V-75M72-47H80M10-75L17-68M62-75L55-68"/>',
  leaf:'<path d="M-48 55Q-100-45 61-65Q91 65-48 55ZM-49 55L39-38M-17 22L-28-15M9-6L44 2"/>',
  energy:'<path d="M18-75L-48 10H-9L-19 76L55-19H13Z"/>',
  heat:'<path d="M-14-50Q-14-78 14-50V23A31 31 0 1 1-28 23V-50M0-35V43M28-32H47M28-6H42"/>',
  clock:'<circle r="65"/><path d="M0-43V0L32 21M-8-84H8"/>',
  heart:'<path d="M0 58Q-100-4-57-49Q-20-78 0-39Q24-79 59-48Q100-3 0 58ZM-54 5H-24L-11-20L5 31L23 5H55"/>',
  globe:'<circle r="65"/><ellipse rx="28" ry="65"/><path d="M-64 0H64M-51-38H51M-51 38H51"/>',
  object:'<path d="M0-66L60-32V38L0 71L-60 38V-32ZM-60-32L0 3L60-32M0 3V71"/>'
 };
 return `<g fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">${paths[kind]||paths.object}</g>`;
}

export const animationKinds=['wave-field','solar-flow','comparison','process-flow','radio-link'];
const clamp=v=>Math.max(0,Math.min(1,v));
const timelines=new WeakMap();
function motion(el,p){
 let entry=timelines.get(el);
 if(!entry){
  const state={intro:0,action:0,explain:0,outcome:0};
  const timeline=gsap.timeline({paused:true});
  timeline.to(state,{intro:1,duration:.18,ease:'power3.out'},0)
   .to(state,{action:1,duration:.38,ease:'power2.inOut'},.12)
   .to(state,{explain:1,duration:.22,ease:'power2.out'},.39)
   .to(state,{outcome:1,duration:.24,ease:'power3.out'},.65);
  entry={state,timeline};timelines.set(el,entry);gsap.ticker.sleep();
 }
 entry.timeline.totalTime(clamp(p),false);return entry.state;
}
function nodeLabel(node,x,y,width=340){
 return textBlock(node?.label||'',x,y,width,40,'#F4F8FC')+textBlock(node?.detail||'',x,y+58,width,27,'#9DB6C8');
}
function waveScene(el,p,m){
 const amplitude=18+38*m.action;
 const surface=(offset=0)=>Array.from({length:95},(_,i)=>{const x=i*11;return `${i?'L':'M'}${x} ${690+offset+Math.sin(x/104-p*Math.PI*5)*amplitude}`;}).join(' ');
 const flow=Array.from({length:9},(_,i)=>{
  const x=((i*154+p*600)%1200)-120,y=395+(i%3)*65;
  return `<path d="M${x} ${y}h${64+i%3*20}m-13-9 13 9-13 9" fill="none" stroke="#DFF5FD" stroke-width="3" opacity="${m.action*.5}"/>`;
 }).join('');
 const particles=Array.from({length:12},(_,i)=>{const x=100+(i%6)*150,y=805+Math.floor(i/6)*180,phase=p*5*Math.PI-x/104;return `<ellipse cx="${x}" cy="${y}" rx="34" ry="21" fill="none" stroke="#68D4EB" stroke-opacity=".15"/><circle cx="${x+34*Math.cos(phase)*m.action}" cy="${y+21*Math.sin(phase)*m.action}" r="6" fill="#A8EEFA" opacity="${m.action*.8}"/>`;}).join('');
 return `<g opacity="${m.intro}">${flow}<path d="${surface()}L1040 1200H0Z" fill="url(#water)"/><path d="${surface(46)}" fill="none" stroke="#24A5BF" stroke-opacity=".3" stroke-width="3"/><path d="${surface()}" fill="none" stroke="#ADF6FF" stroke-width="5"/>${particles}
 <g opacity="${m.explain}"><path d="M100 1160H850m-15-12 15 12-15 12M100 1144v32M850 1144v32" fill="none" stroke="#FFE18B" stroke-width="3"/>${nodeLabel(el.nodes[1],480,1245,750)}</g>
 ${nodeLabel(el.nodes[0],480,245,750)}</g>`;
}
function solarScene(el,p,m){
 const sun=`<g transform="translate(218 380) rotate(${p*12})"><circle r="75" fill="url(#sun)"/>${Array.from({length:12},(_,i)=>`<path d="M0-100V-125" transform="rotate(${i*30})" stroke="#FFD27C" stroke-width="5" stroke-linecap="round"/>`).join('')}</g>`;
 const rays=Array.from({length:6},(_,i)=>{const t=(p*1.4+i/6)%1;return `<path d="M${270+t*310} ${450+t*280}l24 24" stroke="#FFE2A0" stroke-width="${4+(i%2)}" opacity="${m.action*(1-t)*.8}"/>`;}).join('');
 const cells=Array.from({length:15},(_,i)=>`<path d="M${-150+(i%5)*61} ${-96+Math.floor(i/5)*66}h53v57h-53Z" fill="#155875" stroke="#62BDDB" stroke-width="1.5"/>`).join('');
 return `<g opacity="${m.intro}">${sun}${rays}<g transform="translate(480 800)"><ellipse cy="185" rx="290" ry="35" fill="#030C16" opacity=".5"/><path d="M-170 110v70m340-70v70" stroke="#617D93" stroke-width="18"/><g transform="matrix(1 -.22 .35 .75 0 0)"><rect x="-177" y="-125" width="354" height="254" rx="9" fill="#0A253D" stroke="#9FD6E3" stroke-width="7"/>${cells}<path d="M-160-110L160 110" stroke="white" stroke-opacity=".1" stroke-width="35"/></g></g>
 <path d="M660 845V1080H310" fill="none" stroke="#314D64" stroke-width="9"/><path d="M660 845V1080H310" fill="none" stroke="#FFE18B" stroke-width="5" stroke-dasharray="${600*m.outcome} 900"/>
 <g opacity="${m.explain}">${nodeLabel(el.nodes[0],590,270,560)}${nodeLabel(el.nodes[1],480,1210,760)}</g></g>`;
}
function processScene(el,p,m,comparison){
 const nodes=el.nodes.slice(0,4),count=nodes.length;
 const explicitLinks=Array.isArray(el.links)&&el.links.length>0;
 const stages=nodes.map((node,i)=>{
  const x=comparison?260+(i%2)*440:480,y=comparison?560+Math.floor(i/2)*570:360+i*(count>3?290:400);
  const q=clamp((p-i*.14)*4),scale=.9+.1*q;
  const glyph=icon(node.icon);
  return `<g opacity="${q}" transform="translate(${x} ${y+35*(1-q)}) scale(${scale})"><ellipse cy="99" rx="132" ry="25" fill="#000" opacity=".2"/><path d="M-115-73L0-120L115-73V55L0 102L-115 55Z" fill="url(#device)" stroke="#54768C" stroke-width="2"/><path d="M-115-73L0-25L115-73M0-25V102" fill="none" stroke="#6D91A9" stroke-opacity=".4"/><g transform="translate(0 -18) scale(.65)" color="${i%2?'#FFE1A0':'#80E5EF'}">${glyph}</g>${nodeLabel(node,0,175,comparison?360:730)}</g>`+
   (!comparison&&!explicitLinks&&i<count-1?`<g opacity="${clamp((p-i*.14-.12)*4)}"><path d="M480 ${y+264}v${count>3?15:115}m-12-16 12 16 12-16" fill="none" stroke="#77E5EE" stroke-width="4"/></g>`:'');
 }).join('');
 const connections=!comparison&&explicitLinks?el.links.map((link,i)=>{
  if(!Number.isInteger(link.from)||!Number.isInteger(link.to)||link.from<0||link.to<=link.from||link.to>=count)return '';
  const a=360+link.from*(count>3?290:400),b=360+link.to*(count>3?290:400),edge=865+i*12;
  return `<g opacity="${clamp((p-link.to*.14-.08)*4)}"><path d="M620 ${a}H${edge-24}Q${edge} ${a} ${edge} ${a+24}V${b-24}Q${edge} ${b} ${edge-24} ${b}H620m17-12-17 12 17 12" fill="none" stroke="#77E5EE" stroke-width="3"/>${textBlock(link.label||'',768,(a+b)/2,150,23,'#9DB6C8')}</g>`;
 }).join(''):'';
 return stages+connections;
}
function radioScene(el,p,m){
 const cloud=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})" fill="#F9FFFF" opacity=".8"><ellipse rx="110" ry="28"/><circle cx="-45" cy="-22" r="36"/><circle cy="-35" r="50"/><circle cx="50" cy="-15" r="30"/></g>`;
 const planeX=475+Math.sin(p*Math.PI*2)*24,planeY=455-Math.sin(p*Math.PI)*30;
 const windows=Array.from({length:9},(_,i)=>`<rect x="${-195+i*43}" y="-21" width="25" height="33" rx="10" fill="#29546F"/><path d="M${-191+i*43}-17v16" stroke="#8FC1D4" stroke-width="3" stroke-linecap="round"/>`).join('');
 const radio=Array.from({length:4},(_,i)=>{const q=(p*1.5+i/4)%1;return `<path d="M${120-q*70} ${770-q*230}Q${225+q*95} ${680-q*260} ${330+q*90} ${740-q*260}" fill="none" stroke="#16798A" stroke-width="4" opacity="${(1-q)*m.action*.7}"/>`;}).join('');
 const pilot=`<g transform="translate(715 850)"><path d="M-115 130Q-110 34 0 28Q105 36 115 130Z" fill="#F3F6F6" stroke="#93B5BD" stroke-width="3"/><path d="M-15 52L0 110L15 52" fill="#244A64"/><path d="M-45 34L-18 78L0 51L18 78L45 34" fill="#FFF"/><rect x="-25" y="4" width="50" height="48" rx="12" fill="#E4A16F"/><ellipse cy="-47" rx="66" ry="75" fill="#F1B887"/><path d="M-66-50Q-73-140 10-127Q74-122 66-43L44-88Q-5-63-46-88Z" fill="#293D4D"/><path d="M-42-35q13-8 25 0m34 0q13-8 25 0" fill="none" stroke="#3E4143" stroke-width="4"/><circle cx="-29" cy="-21" r="4" fill="#263645"/><circle cx="29" cy="-21" r="4" fill="#263645"/><path d="M-19 9Q0 ${18+5*Math.sin(p*20)} 20 7" fill="none" stroke="#875A4D" stroke-width="4" stroke-linecap="round"/><path d="M-72-18Q-79-137 0-137Q80-138 73-18" fill="none" stroke="#244A64" stroke-width="12"/><rect x="-82" y="-35" width="23" height="50" rx="11" fill="#294C61"/><rect x="59" y="-35" width="23" height="50" rx="11" fill="#294C61"/><path d="M72 0Q80 35 28 31" fill="none" stroke="#294C61" stroke-width="6"/><rect x="16" y="24" width="23" height="12" rx="6" fill="#173347"/><path d="M-82 59h28m-28 10h28m108-10h28m-28 10h28" stroke="#D9AD49" stroke-width="5"/></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1225" viewBox="0 0 960 1225"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#A4D9E1"/><stop offset="1" stop-color="#EDF8F7"/></linearGradient><linearGradient id="fuselage" x2="0" y2="1"><stop stop-color="#FFF"/><stop offset=".55" stop-color="#F0F7F8"/><stop offset="1" stop-color="#A0C7D4"/></linearGradient></defs>
 <rect width="960" height="1225" fill="url(#sky)"/>
 ${cloud(100-p*90,290,.95)}${cloud(815-p*50,175,.7)}${cloud(850-p*100,610,1.1)}
 ${textBlock(el.heading||'',480,103,810,47,'#183F55')}
 <g transform="translate(${planeX} ${planeY}) rotate(${-3+Math.sin(p*6)*1.5})"><ellipse cy="89" rx="330" ry="18" fill="#538BA3" opacity=".08"/><path d="M-260-13L-340-120L-290-120L-180-26" fill="#2D859E"/><path d="M-310-2Q-360 28-305 41L225 41Q344 38 354 7Q350-9 276-24L-255-24Z" fill="url(#fuselage)" stroke="#5C96A9" stroke-width="2"/><path d="M-310 23H286" stroke="#2F8EA6" stroke-width="10"/>${windows}<path d="M251-22L292-17L316-2H254Z" fill="#2A536A"/><path d="M-15 7L-148 136L-78 138L88 31Z" fill="#D6EAF0" stroke="#81AFBF" stroke-width="2"/><path d="M14-20L-72-111L-37-114L108-19Z" fill="#DBEFF1"/><ellipse cx="-53" cy="68" rx="47" ry="27" fill="#8FBAC9"/><ellipse cx="-87" cy="68" rx="15" ry="22" fill="#264F64"/></g>
 ${radio}<g transform="translate(225 836)"><path d="M-63 70L0-135L63 70M-46 13H46M-29-45H29M-58 51L29-45M58 51L-29-45" fill="none" stroke="#52859B" stroke-width="9" stroke-linejoin="round"/><circle cy="-143" r="12" fill="#E7AD50"/></g>
 <path d="M0 1020Q220 918 430 1000T960 990V1225H0Z" fill="#A6CFCC"/>
 <g opacity="${m.explain}">${pilot}<g transform="translate(415 790) rotate(${-9+Math.sin(p*5)*2})"><rect x="-59" y="-97" width="118" height="210" rx="18" fill="#23495E"/><rect x="-49" y="-77" width="98" height="157" rx="7" fill="#D9F0F1"/><path d="M-15-86H15" stroke="#9FC2CC" stroke-width="4"/><circle cy="95" r="8" fill="#89ADBC"/><path d="M-26 7L31-18L-5 22L-9 7L-26 7M-9 7L-10-13" fill="#388DA0"/></g></g>
 ${textBlock(el.nodes?.[0]?.label||'',275,1086,380,37,'#183F55')}${textBlock(el.nodes?.[0]?.detail||'',275,1138,380,25,'#38697B')}
 ${textBlock(el.nodes?.[1]?.label||'',730,1086,350,37,'#183F55')}${textBlock(el.nodes?.[1]?.detail||'',730,1138,350,25,'#38697B')}
 </svg>`;
}
export function explainerSVG(el,p){
 const kind=animationKinds.includes(el.animation)?el.animation:(el.style==='contrast'?'comparison':'process-flow');
 const m=motion(el,p),accent=kind==='solar-flow'?'#FFE1A0':'#80E5EF';
 if(kind==='radio-link')return radioScene(el,p,m);
 const scene=kind==='wave-field'?waveScene(el,p,m):kind==='solar-flow'?solarScene(el,p,m):processScene(el,p,m,kind==='comparison');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1560" viewBox="0 0 960 1560"><defs>
 <linearGradient id="back" x2=".8" y2="1"><stop stop-color="#142B43"/><stop offset="1" stop-color="#050D1A"/></linearGradient>
 <linearGradient id="water" x2="0" y2="1"><stop stop-color="#167F9C" stop-opacity=".9"/><stop offset="1" stop-color="#091D35"/></linearGradient>
 <linearGradient id="device" x2="1" y2="1"><stop stop-color="#28546D"/><stop offset="1" stop-color="#11273D"/></linearGradient>
 <radialGradient id="sun"><stop stop-color="#FFF5BC"/><stop offset="1" stop-color="#FFBD53"/></radialGradient>
 <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#8CB3CF" stroke-opacity=".055"/></pattern>
 </defs><rect width="960" height="1560" fill="url(#back)"/><rect width="960" height="1560" fill="url(#grid)"/>
 <path d="M60 168H900" stroke="#58728A" stroke-opacity=".35"/><path d="M60 168H${60+160*m.intro}" stroke="${accent}" stroke-width="4"/>
 ${textBlock(el.heading||'',480,108,820,47,'#F3F8FC')}
 <g transform="translate(${480*(1-(1+.025*m.action))} ${750*(1-(1+.025*m.action))}) scale(${1+.025*m.action})">${scene}</g>
 <path d="M60 1480H900" stroke="#58728A" stroke-opacity=".35"/></svg>`;
}

export async function prepareExplainers(plan,folder){
 for(const [i,scene] of plan.scenes.entries()){
  for(let j=0;j<scene.elements.length;j++){
   const el=scene.elements[j];if(el.type!=='infographic'||!el.professional)continue;
   const target=join(folder,`explainer-${i}`);await mkdir(target,{recursive:true});
   const duration=Math.max(1,Math.min(12,Number(el.dur)||4));
   const fps=plan.meta.fps||24,count=Math.ceil(duration*fps)+1;
   const width=plan.meta.size?.[0]||1080,top=plan.meta.headline_height||164,height=(plan.meta.size?.[1]||1920)-top;
   const artHeight=el.animation==='radio-link'?1225:1560,scale=Math.min(width/960,height/artHeight);
   const frame=p=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${el.animation==='radio-link'?'#D8EFF0':'#0B1B2C'}"/><g transform="translate(${(width-960*scale)/2} ${(height-artHeight*scale)/2}) scale(${scale})">${explainerSVG(el,p)}</g></svg>`;
   const key=createHash('sha256').update(JSON.stringify({el,duration,fps,width,height,rendererHash})).digest('hex');
   let cached=false;
   try{
    const manifest=JSON.parse(await readFile(join(target,'manifest.json'),'utf8'));
    const files=new Set(await readdir(target));
    cached=manifest.key===key&&Array.from({length:count},(_,n)=>`${String(n).padStart(6,'0')}.png`).every(n=>files.has(n))&&files.has('explainer.svg');
   }catch{/* Missing or incomplete assets are rebuilt. */}
   try{if(!cached){
    for(let n=0;n<count;n++)await writeFile(join(target,`${String(n).padStart(6,'0')}.png`),new Resvg(frame(n/(count-1)),options).render().asPng());
    await writeFile(join(target,'explainer.svg'),frame(1));
    await writeFile(join(target,'manifest.json'),JSON.stringify({key,count,fps,duration}));
   }
   }finally{timelines.get(el)?.timeline.kill();timelines.delete(el);}
   scene.camera='static';scene.title=['',''];
   scene.elements[j]={type:'svg_explainer',frames:target,frame_count:count,video_fps:fps,width,x:width/2,y:top+height/2,at:0,anim:'none',sfx:false};
  }
 }
}
