import {writeFile} from 'node:fs/promises';
import {providerValue} from './core.mjs';

export const HEYGEN_FREE_MODEL='heygen-voice-1-turbo-free';
export const DEFAULT_HEYGEN_VOICE='GjEYDLj9QcrWiwxXmBbE'; // Yash: public male voice, selected by reference-style audition on Turbo Free.
export function heygenSpeechMode(){return providerValue('HEYGEN_SPEECH_API')||'turbo-free';}
export function heygenModel(){return heygenSpeechMode()==='catalog'?'catalog-default-engine':HEYGEN_FREE_MODEL;}
export function validateHeygenSettings(){
 const mode=heygenSpeechMode();
 if(!['catalog','turbo-free'].includes(mode))throw Error('Invalid HeyGen speech API setting');
 if(mode==='catalog'&&providerValue('HEYGEN_ALLOW_CATALOG')!=='1')throw Error('shubham-voice uses HeyGen catalog speech, which may consume credits. Enable HEYGEN_ALLOW_CATALOG=1 after choosing this mode. No other voice was substituted.');
 if(mode==='turbo-free'&&(providerValue('HEYGEN_MODEL')||HEYGEN_FREE_MODEL)!==HEYGEN_FREE_MODEL)throw Error('HeyGen integration requires the Turbo Free model');
}
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
// Turbo ignores API pitch/speed parameters. Apply these locally BEFORE measuring
// scene duration, so media cuts and SFX follow the actual processed narration.
export function heygenPerformance(scene={},style='energetic',language='hi'){
 const energetic=style==='energetic'&&language==='hi';
 const bounded=(name,fallback,lo,hi)=>{
  const raw=providerValue(name),value=raw.trim()?Number(raw):fallback;
  return Number.isFinite(value)?Math.max(lo,Math.min(hi,value)):fallback;
 };
 const pitchSemitones=energetic?bounded('HEYGEN_PITCH_SEMITONES',3,-3,3):0;
 const speed=energetic?bounded('HEYGEN_TEMPO',1.08,.95,1.2):1;
 const filter=(pitchSemitones||speed!==1)
  ?`rubberband=tempo=${speed}:pitch=${(2**(pitchSemitones/12)).toFixed(6)}:formant=preserved:pitchq=quality`
  :null;
 return {pitchSemitones,speed,filter};
}
export function heygenSpeechText(text,scene={},style='energetic'){
 const clean=String(text).replace(/\[[^\]]*\]/g,'').trim();
 const role=scene.delivery||'explain';
 // A few expressive beats, rather than forcing a new exaggerated performance
 // at every cut. Native sentence punctuation supplies ordinary prosody.
 const tag=style==='balanced'?'':({hook:'[excited]',reveal:'[surprised]',payoff:'[playful]'})[role]||'';
 return [tag,clean].filter(Boolean).join(' ');
}
export const NATURAL_SPEECH_TRIM='silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB,areverse,apad=pad_dur=0.08';
export async function heygenVoice(text,language,dest,scene={},style='energetic'){
 const key=providerValue('HEYGEN_API_KEY');if(!key)throw Error('HeyGen API key missing');
 // Catalog voices use a separate API; require an explicit billing choice.
 const model=providerValue('HEYGEN_MODEL')||HEYGEN_FREE_MODEL;
 const mode=heygenSpeechMode();
 validateHeygenSettings();
 const voice=providerValue(language==='hi'?'HEYGEN_VOICE_HI_ID':'HEYGEN_VOICE_EN_ID')||DEFAULT_HEYGEN_VOICE;
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(voice))throw Error('Invalid HeyGen voice ID');
 let response;
 for(let attempt=0;attempt<4;attempt++){
  try{response=await fetch(mode==='catalog'?'https://api.heygen.com/v3/voices/speech':'https://api.heygen.com/v3/models/audio/tts',{
   method:'POST',headers:{'X-Api-Key':key,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(90000),
   body:JSON.stringify(mode==='catalog'
     ?{voice_id:voice,language:language==='en'?'en':'hi',text:String(text).replace(/\[[^\]]*\]/g,'').trim(),output_format:{encoding:'wav',sample_rate_hertz:44100}}
     :{model,voice_id:voice,language:language==='en'?'en':'hi',text:heygenSpeechText(text,scene,style)})
  });}catch{if(attempt===3)throw Error('HeyGen network/timeout after retries');await pause(1000*2**attempt);continue;}
  if(response.ok)break;
  const status=response.status;await response.text();
  if(![429,500,502,503,504].includes(status)||attempt===3)throw Error(`HeyGen HTTP ${status}; speech unavailable or check API settings`);
  const retry=response.headers.get('retry-after'),seconds=Number(retry);
  const delay=retry&&Number.isFinite(seconds)?seconds*1000:1000*2**attempt;
  if(delay>30000)throw Error('HeyGen speech capacity busy; retry later');
  await pause(Math.max(500,delay));
 }
 const result=await response.json(),url=result.data?.audio_url;
 const address=new URL(url||'https://invalid.local');
 if(address.protocol!=='https:'||!['heygen.com','heygen.ai'].some(host=>address.hostname===host||address.hostname.endsWith('.'+host)))throw Error('HeyGen returned an unsupported audio download host');
 const download=await fetch(address,{signal:AbortSignal.timeout(45000),redirect:'error'});
 if(!download.ok)throw Error(`HeyGen audio download HTTP ${download.status}`);
 if(Number(download.headers.get('content-length'))>12000000)throw Error('HeyGen audio too large');
 const bytes=Buffer.from(await download.arrayBuffer());
 if(bytes.length<44||bytes.length>12000000||bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WAVE')throw Error('HeyGen returned invalid WAV audio');
 await writeFile(dest,bytes);
 return {provider:'HeyGen',model:mode==='catalog'?'catalog-default-engine':model,engine:result.data?.engine||null,voiceId:voice,requestId:response.headers.get('x-request-id')||null};
}
