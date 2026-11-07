import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import {TITLE_FAMILY,FONT_OPTIONS,wordGeometry,wordSVG} from './typography.mjs';

const escapeXML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const textXML = s => escapeXML(s).replace(/ /g,'&#160;');
const emojiPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
export function normalizeHookTitle(raw) {
  const segments = [...new Intl.Segmenter('hi',{granularity:'grapheme'}).segment(String(raw || ''))].map(s=>s.segment);
  const supported = ['😲','😱','🤔','🔍','⚡'];
  const emojis = segments.filter(s=>emojiPattern.test(s));
  const last = emojis.at(-1);
  const emoji = supported.includes(last) ? last : '😲';
  const text = segments.filter(s=>!emojiPattern.test(s)).join('').replace(/[\uFE0F\u200D]/g,'').replace(/\s+/g,' ').trim().normalize('NFC');
  return text ? text+' '+emoji : '';
}

function emojiSVG(emoji) {
  if(emoji==='😱')return '<defs><linearGradient id="shock" x2="0" y2="1"><stop stop-color="#6F8DCA"/><stop offset=".48" stop-color="#FFF0A3"/><stop offset="1" stop-color="#FFC846"/></linearGradient></defs><circle cx="34" cy="34" r="31" fill="url(#shock)"/><ellipse cx="23" cy="25" rx="7" ry="9" fill="white"/><ellipse cx="45" cy="25" rx="7" ry="9" fill="white"/><ellipse cx="34" cy="46" rx="8" ry="13" fill="#49341F"/><path d="M8 35Q-1 65 23 66L21 43ZM60 35Q69 65 45 66L47 43Z" fill="#FFDA68" stroke="#D9A345" stroke-width="1.5"/>';
  if (emoji==='⚡') return '<path d="M38 2L8 39H29L21 67L57 24H35Z" fill="#ffdc36" stroke="#e29227" stroke-width="3"/>';
  if (emoji==='🔍') return '<circle cx="25" cy="25" r="21" fill="#bcecf6" stroke="#dadce0" stroke-width="7"/><path d="M42 43L62 64" stroke="#589abf" stroke-width="12" stroke-linecap="round"/>';
  const mouth=emoji==='🤔'?'<path d="M23 43Q35 37 45 42" stroke="#614524" stroke-width="4" fill="none"/><path d="M32 61L47 44L55 48L48 62" fill="#ffce4a" stroke="#c88c28" stroke-width="3"/>':'<ellipse cx="34" cy="49" rx="9" ry="12" fill="#62452c"/>';
  return `<circle cx="34" cy="34" r="31" fill="#ffd65a" stroke="#e4ab31" stroke-width="3"/><ellipse cx="23" cy="28" rx="4" ry="6" fill="#503b29"/><ellipse cx="45" cy="28" rx="4" ry="6" fill="#503b29"/><path d="M15 17Q22 11 29 16M38 16Q46 11 53 17" stroke="#72502c" stroke-width="3" fill="none"/>${mouth}`;
}

export function layoutHeadline(headline, {compact=false}={}) {
  const value=normalizeHookTitle(headline);
  if(!value)throw Error('Empty on-video headline');
  const parts=value.split(' '),emoji=parts.pop(),text=parts.join(' ');
  const options=FONT_OPTIONS;
  const words=text.split(' ');
  const baseSize=compact?48:72;
  const boxes=words.map(word=>({width:wordGeometry(word,baseSize).width,x:0}));
  const gap=compact?16:28,available=compact?930:868;
  const inkWidth=boxes.reduce((n,b)=>n+(b?.width||100),0);
  const ratio=Math.min(1,(available-gap*(words.length-1))/Math.max(1,inkWidth)),size=baseSize*ratio;
  if(size<(compact?40:50)||words.length>10)throw Error('Headline too long at readable size; rewrite it shorter');
  const total=inkWidth*ratio+gap*(words.length-1);
  let x=compact?(1080-total-64)/2:44+(available-total)/2;
  const placed=words.map((word,i)=>{
    const item={word,x,xText:x-(boxes[i]?.x||0)*ratio,width:(boxes[i]?.width||100)*ratio};
    x+=item.width+gap;return item;
  });
  return {value,text,emoji,options,size,placed,gap,right:x-gap,compact};
}

// Shape Hindi in SVG; reserve actual visible ink gaps and a fixed emoji lane.
export async function prepareHeadlineAssets(headline, highlight, folder, {compact=false}={}) {
  await mkdir(folder,{recursive:true});
  const {text,emoji,options,size,placed,gap,right}=layoutHeadline(headline,{compact});
  const prefix=text.startsWith(String(highlight||''))&&highlight ? String(highlight) : text.split(' ').slice(0,2).join(' ');
  const height=compact?62:164;
  const textNodes=placed.map(({word,x},i)=>wordSVG(word,x,compact?46:108,size,i<prefix.split(' ').length?'#ffff00':'#fffffa')).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><rect width="1080" height="${height}" fill="#000000"/><path d="M0 ${height-2}H1080" stroke="#ffff00" stroke-width="4"/>${textNodes}<g transform="translate(${compact?right+14:960} ${compact?6:48}) scale(${compact?.68:.95})">${emojiSVG(emoji)}</g></svg>`;
  const out=join(folder,'headline.png');
  const rendered=new Resvg(svg,options).render();
  const pixels=rendered.pixels;
  // Check the actual image on EVERY title, not only fixture strings. Glyph
  // antialiasing may spill a little past vector bounds; reserve that tolerance.
  for(let i=1;i<placed.length;i++){
    const from=Math.ceil(placed[i-1].x+placed[i-1].width)+3,to=Math.floor(placed[i].x)-4;
    if(to-from<7)throw Error('Headline spacing failed: rewrite the title');
    for(let x=from;x<to;x++)for(let y=1;y<height-6;y++){
      const offset=(y*1080+x)*4;
      if(pixels[offset]+pixels[offset+1]+pixels[offset+2]>40)throw Error('Headline glyph overlap detected; rewrite the title');
    }
  }
  await writeFile(join(folder,'headline.svg'),svg);
  await writeFile(out,rendered.asPng());
  await writeFile(join(folder,'headline-layout.json'),JSON.stringify({size,gap,right,words:placed},null,2));
  return out;
}

export async function prepareOverlayTextAssets(plan,folder){
  const font=FONT_OPTIONS.font;
  await mkdir(folder,{recursive:true});
  async function label(text,name,maxSize=40){
    const words=String(text).normalize('NFC').trim().split(/\s+/),gap=14;
    const boxes=words.map(word=>({width:wordGeometry(word,maxSize).width,x:0}));
    const ink=boxes.reduce((n,b)=>n+(b?.width||0),0),ratio=Math.min(1,(820-gap*(words.length-1))/Math.max(1,ink));
    if(ratio*maxSize<26)throw Error('Hindi label too long; rewrite the label');
    const width=Math.ceil(ink*ratio+gap*(words.length-1)+36);let x=18;
    const nodes=words.map((word,i)=>{const node=wordSVG(word,x,56,maxSize*ratio,'#FFE347');x+=boxes[i].width*ratio+gap;return node;}).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="82"><rect width="100%" height="100%" rx="10" fill="#111A24" fill-opacity=".95"/>${nodes}</svg>`;
    const path=join(folder,name+'.png');await writeFile(path,new Resvg(svg,{font}).render().asPng());return path;
  }
  for(const [i,scene]of plan.scenes.entries()){
    if(scene.beat_text_hi)scene.beat_text_image=await label(scene.beat_text_hi,`beat-${i}`);
    const pointer=scene.reference_media?.pointer;
    if(pointer?.label)pointer.label_image=await label(pointer.label,`pointer-${i}`,36);
    for(const [j,element]of scene.elements.entries()){
      if(element.type==='text'&&/[\u0900-\u097F]/.test(element.text||'')){
        const path=await label(element.text,`fallback-${i}-${j}`,48);
        scene.elements[j]={type:'photo',image:path,width:Math.min(850,plan.meta.size?.[0]||1080),x:540,y:(plan.meta.size?.[1]||1920)*.55,at:element.at||0,anim:'fade',sfx:false};
      }
    }
  }
}

// Real SVG assets. Centre (200,200) denotes the verified source-image feature.
export function pointerSVG(kind, progress) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0)), color = '#ffdd36';
  const shape = kind === 'circle'
    ? `<circle cx="200" cy="200" r="49" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${p * 308} 1000" transform="rotate(-90 200 200)"/>`
    : kind === 'underline'
      ? `<path d="M147 219 Q200 228 253 219" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${p * 110} 1000"/>`
      : `<path d="M72 79 Q152 70 186 174" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${p * 173} 1000"/>
         <path d="M172 164L200 200L204 153" fill="none" stroke="${color}" stroke-width="9" stroke-linejoin="round" opacity="${p > .7 ? 1 : 0}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".85"/></filter></defs><g filter="url(#s)">${shape}</g></svg>`;
}
export async function preparePointerAssets(folder) {
  await mkdir(folder, { recursive: true });
  for (const kind of ['arrow', 'circle', 'underline']) {
    await writeFile(join(folder, `${kind}.svg`), pointerSVG(kind, 1));
    for (let i = 0; i < 12; i++)
      await writeFile(join(folder, `${kind}-${String(i).padStart(2, '0')}.png`), new Resvg(pointerSVG(kind, (i + 1) / 12)).render().asPng());
  }
}

export async function prepareFocusReview(source, point, output) {
  const bytes=await readFile(source);
  const mime=bytes[0]===0x89?'image/png':'image/jpeg';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720"><image href="data:${mime};base64,${bytes.toString('base64')}" width="960" height="720" preserveAspectRatio="none"/><circle cx="${point[0]*960}" cy="${point[1]*720}" r="28" fill="none" stroke="#ffe500" stroke-width="5"/></svg>`;
  await writeFile(output,new Resvg(svg).render().asPng());
  return output;
}
export function normalizePointOut(raw) {
  if (!raw || typeof raw.target !== 'string' || !raw.target.trim()) return null;
  return { target: raw.target.trim().slice(0,100), label: String(raw.label || '').trim().slice(0,32),
    kind: ['arrow','circle','underline'].includes(raw.kind) ? raw.kind : 'arrow',
    at: Math.max(.08, Math.min(.8, Number(raw.at) || .25)) };
}
export function focusTracks(raw, count) {
  if (!Array.isArray(raw?.frames) || raw.frames.length !== count) return [];
  const valid = raw.frames.every(f => f.visible === true && Number(f.confidence) >= .85 &&
    Array.isArray(f.point) && f.point.length === 2 && f.point.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1));
  return valid ? raw.frames.map((f,i) => ({ at: count === 1 ? 0 : [.12,.5,.85][i], point: f.point })) : [];
}
