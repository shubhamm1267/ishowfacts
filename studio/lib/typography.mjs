import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';

// Use a text face with normal counters/spacing instead of a rounded display
// face. Keep Devanagari syllables intact: never letter-space individual matras.
export const TITLE_FONT=fileURLToPath(new URL('../../assets/fonts/noto/NotoSansDevanagari-Bold.ttf',import.meta.url));
export const TITLE_FAMILY='Noto Sans Devanagari';
export const TITLE_WEIGHT=700;
export const FONT_OPTIONS={font:{fontFiles:[TITLE_FONT],loadSystemFonts:false,defaultFontFamily:TITLE_FAMILY}};
export const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const cache=new Map(),segmenter=new Intl.Segmenter('hi',{granularity:'grapheme'});
export function wordGeometry(word,size){
 const key=word+'|'+size;if(cache.has(key))return cache.get(key);
 // An orthographic syllable is the indivisible unit: matras, nukta and
 // conjunct consonants remain attached. Add breathing room BETWEEN units.
 const parts=/[\u0900-\u097F]/u.test(word)?[...segmenter.segment(word.normalize('NFC'))].map(p=>p.segment):[word];
 const tracking=parts.length>1?size*.05:0;let x=0;
 const placed=parts.map(text=>{
  const box=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="240"><text x="40" y="140" font-family="${TITLE_FAMILY}" font-weight="700" font-size="${size}">${escapeText(text)}</text></svg>`,FONT_OPTIONS).innerBBox();
  if(!box)throw Error('Cannot shape title text');
  const item={text,x,width:box.width,left:box.x-40};x+=box.width+tracking;return item;
 });
 const result={width:x-tracking,placed,tracking};cache.set(key,result);return result;
}
export function wordSVG(word,x,y,size,color='currentColor'){
 const geometry=wordGeometry(word,size);
 return `<g aria-label="${escapeText(word)}">`+geometry.placed.map(p=>`<text xml:space="preserve" x="${x+p.x-p.left}" y="${y}" font-family="${TITLE_FAMILY}" font-weight="700" font-size="${size}" fill="${color}">${escapeText(p.text)}</text>`).join('')+'</g>';
}
