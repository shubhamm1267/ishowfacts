import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {prepareHeadlineAssets} from '../lib/reference-style.mjs';
import {Resvg} from '@resvg/resvg-js';
const folder='studio/jobs/title-font-proof';await mkdir(folder,{recursive:true});
const titles=['हवा लहरें कैसे बनाती है? 🤔','बुलबुले रंगीन क्यों दिखते हैं? 😲','पृथ्वी का चुंबक कैसे बचाता है? 🔍'];
for(let i=0;i<titles.length;i++)await prepareHeadlineAssets(titles[i],titles[i].split(' ').slice(0,2).join(' '),`${folder}/${i}`,{compact:true});
const images=await Promise.all(titles.map((_,i)=>readFile(`${folder}/${i}/headline.png`)));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="210">${images.map((b,i)=>`<image href="data:image/png;base64,${b.toString('base64')}" y="${i*70}" width="1080" height="62"/>`).join('')}</svg>`;
await writeFile(`${folder}/proof.png`,new Resvg(svg).render().asPng());
