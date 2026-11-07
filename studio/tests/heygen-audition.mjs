import {mkdir,writeFile} from 'node:fs/promises';
import {heygenVoice} from '../lib/heygen.mjs';
import {runWithProviders} from '../lib/core.mjs';
const folder='studio/jobs/heygen-check';await mkdir(folder,{recursive:true});
for(const [name,id]of [['storyteller','M5iZBikqML8Qf1IzbJ31'],['ryan','fdfac679aea04f199a8e18b16e76c324']]){
 try{const info=await runWithProviders({HEYGEN_VOICE_HI_ID:id},()=>heygenVoice('कभी सोचा है, साबुन का बुलबुला आखिर होता क्या है? अरे साला, दिखता पूरा जादू है! पर अंदर बस हवा होती है।','hi',`${folder}/${name}.wav`,{delivery:'hook'}));await writeFile(`${folder}/${name}.json`,JSON.stringify(info,null,2));console.log(name,'ready',JSON.stringify(info));}
 catch(e){console.log(name,e.message);}
}
