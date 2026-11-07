import {mkdir,writeFile} from 'node:fs/promises';
import {cartesiaVoice} from '../lib/core.mjs';
import {execFileSync} from 'node:child_process';
const folder='studio/jobs/presenter-voice-check';await mkdir(folder,{recursive:true});
for(const voice of ['hi-IN-anuj','hi-IN']){
 try{
  const file=`${folder}/${voice}.wav`;
  await cartesiaVoice('क्या तुमने कभी सोचा है, साबुन के बुलबुले रंगीन क्यों दिखते हैं?',voice,file,{delivery:'hook'});
  const stats=JSON.parse(execFileSync('python',['scripts/measure_speech_pitch.py',file],{encoding:'utf8'}));
  console.log(voice,JSON.stringify(stats));await writeFile(`${file}.json`,JSON.stringify(stats,null,2));
 }catch(e){console.log(voice,'unavailable:',e.message.slice(0,100));}
}
