import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {heygenVoice,heygenSpeechText,heygenPerformance,HEYGEN_FREE_MODEL,DEFAULT_HEYGEN_VOICE,heygenSpeechMode} from '../lib/heygen.mjs';
import {runWithProviders,fishVoice,FISH_FREE_MODEL,DEFAULT_FISH_VOICE} from '../lib/core.mjs';
import {validateInput} from '../server.mjs';
import {wordGeometry} from '../lib/typography.mjs';

test('default voice and speech mode remain compatible with the free-only choice',()=>{
 assert.equal(DEFAULT_HEYGEN_VOICE,'GjEYDLj9QcrWiwxXmBbE');
 assert.equal(heygenSpeechMode(),'turbo-free');
});

test('Fish routes browser settings to the requested free voice and returns WAV without fallback',async()=>{
 const input=validateInput({voiceProvider:'fish',providerKeys:{GEMINI_API_KEY:'test',FISH_API_KEY:'fish-secret',FISH_VOICE_ID:DEFAULT_FISH_VOICE,FISH_MODEL:'paid-model'}});
 assert.equal(input.voiceProvider,'fish');assert.equal(input.providerKeys.FISH_MODEL,undefined);
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'fish-')),dest=join(folder,'voice.wav');let calls=0;
 const wav=Buffer.alloc(64);wav.write('RIFF');wav.write('WAVE',8);
 try{
  globalThis.fetch=async(url,init)=>{
   calls++;assert.equal(url,'https://api.fish.audio/v1/tts');
   assert.equal(init.headers.model,FISH_FREE_MODEL);assert.equal(init.headers.Authorization,'Bearer fish-secret');
   assert.equal(init.redirect,'error');const body=JSON.parse(init.body);
   assert.equal(body.reference_id,DEFAULT_FISH_VOICE);assert.equal(body.prosody.speed,1.16);
   assert.equal(body.format,'wav');assert.equal(body.condition_on_previous_chunks,true);
   return new Response(wav);
  };
  const info=await runWithProviders(input.providerKeys,()=>fishVoice('hello','hi',dest));
  assert.equal(info.voiceId,DEFAULT_FISH_VOICE);assert.deepEqual(await readFile(dest),wav);assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;return new Response('fish-secret',{status:402});};
  await assert.rejects(runWithProviders(input.providerKeys,()=>fishVoice('hello','hi',dest)),e=>/HTTP 402/.test(e.message)&&!e.message.includes('fish-secret'));
  assert.equal(calls,2);
  await assert.rejects(runWithProviders({...input.providerKeys,FISH_MODEL:'s2.1-pro'},()=>fishVoice('hello','hi',dest)),/paid fallback is disabled/);
  assert.equal(calls,2);
  globalThis.fetch=async()=>new Response('<html>not audio</html>');
  await assert.rejects(runWithProviders(input.providerKeys,()=>fishVoice('hello','hi',dest)),/invalid WAV/);
 }finally{globalThis.fetch=saved;}
});

test('browser voice tuning reaches processing without enabling a billed speech model',()=>{
 const input=validateInput({voiceProvider:'heygen',providerKeys:{GEMINI_API_KEY:'test',HEYGEN_API_KEY:'test',HEYGEN_PITCH_SEMITONES:'0.8',HEYGEN_TEMPO:'1.08',HEYGEN_MODEL:'paid-model',HEYGEN_ALLOW_CATALOG:'1'}});
 assert.equal(input.providerKeys.HEYGEN_MODEL,undefined);
 assert.equal(input.providerKeys.HEYGEN_ALLOW_CATALOG,undefined);
 runWithProviders(input.providerKeys,()=>{
  const performance=heygenPerformance({},'energetic','hi');
  assert.equal(performance.pitchSemitones,.8);
  assert.equal(performance.speed,1.08);
 });
});

test('HeyGen reference delivery preserves formants, bounds settings and leaves balanced/English unchanged',()=>{
 runWithProviders({HEYGEN_PITCH_SEMITONES:'2.5',HEYGEN_TEMPO:'1.1'},()=>{
  const performance=heygenPerformance({},'energetic','hi');
  assert.equal(performance.pitchSemitones,2.5);assert.equal(performance.speed,1.1);
  assert.match(performance.filter,/tempo=1.1:pitch=1.155353:formant=preserved/);
  assert.equal(heygenPerformance({},'balanced','hi').filter,null);
  assert.equal(heygenPerformance({},'energetic','en').filter,null);
 });
 runWithProviders({HEYGEN_PITCH_SEMITONES:'99',HEYGEN_TEMPO:'-1'},()=>{
  assert.equal(heygenPerformance().pitchSemitones,3);assert.equal(heygenPerformance().speed,.95);
 });
 runWithProviders({HEYGEN_PITCH_SEMITONES:'NaN',HEYGEN_TEMPO:'bad'},()=>{
  assert.equal(heygenPerformance().pitchSemitones,3);assert.equal(heygenPerformance().speed,1.08);
 });
});

test('HeyGen generates explicit free Hindi TTS, uses delivery tags and downloads only WAV',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'heygen-')),dest=join(folder,'voice.wav'),saved=globalThis.fetch;const calls=[];
 const wav=Buffer.alloc(64);wav.write('RIFF');wav.write('WAVE',8);
 try{
  globalThis.fetch=async(url,init)=>{
   calls.push(String(url));
   if(String(url).includes('/tts')){const body=JSON.parse(init.body);assert.equal(body.model,HEYGEN_FREE_MODEL);assert.equal(body.language,'hi');assert.match(body.text,/^\[excited\]/);assert.equal(body.speed,undefined);assert.equal(body.pitch_shift,undefined);return Response.json({data:{audio_url:'https://resource.heygen.ai/test.wav'}});}
   assert.equal(init.headers,undefined);return new Response(wav);
  };
  const info=await runWithProviders({HEYGEN_SPEECH_API:'turbo-free',HEYGEN_API_KEY:'secret-test',HEYGEN_MODEL:HEYGEN_FREE_MODEL},()=>heygenVoice('हवा कैसे बहती है?','hi',dest,{delivery:'hook'}));
  assert.equal(info.provider,'HeyGen');assert.deepEqual(await readFile(dest),wav);assert.equal(calls.length,2);
 }finally{globalThis.fetch=saved;}
});
test('HeyGen auth failure never bills a fallback, leaks credentials or downloads an arbitrary host',async()=>{
 const saved=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response('secret-test',{status:401});};
  await assert.rejects(runWithProviders({HEYGEN_SPEECH_API:'turbo-free',HEYGEN_API_KEY:'secret-test'},()=>heygenVoice('नमस्ते','hi','unused.wav')),e=>/HTTP 401/.test(e.message)&&!e.message.includes('secret-test'));
  assert.equal(calls,1);
  globalThis.fetch=async()=>Response.json({data:{audio_url:'https://evil.example/audio.wav'}});
  await assert.rejects(runWithProviders({HEYGEN_SPEECH_API:'turbo-free',HEYGEN_API_KEY:'secret-test'},()=>heygenVoice('नमस्ते','hi','unused.wav')),/unsupported audio/);
  await assert.rejects(runWithProviders({HEYGEN_SPEECH_API:'turbo-free',HEYGEN_API_KEY:'secret-test',HEYGEN_MODEL:'heygen-voice-1'},()=>heygenVoice('नमस्ते','hi','unused.wav')),/Free model/);
 }finally{globalThis.fetch=saved;}
});
test('Hindi orthographic spacing applies to arbitrary words and keeps matras/conjuncts attached',()=>{
 for(const word of ['होता','बनाती','लहरें','पृथ्वी','क्षेत्र','क्यों','प्रश्न','खुशियाँ','ज़िंदगी','संपर्क']){
  const geometry=wordGeometry(word,48);
  assert.equal(geometry.placed.map(p=>p.text).join(''),word.normalize('NFC'));
  assert.ok(geometry.width>0);
  for(let i=1;i<geometry.placed.length;i++)assert.ok(geometry.placed[i].x-geometry.placed[i-1].x-geometry.placed[i-1].width>=2.39);
  assert.ok(geometry.placed.every(p=>!/^\p{Mark}/u.test(p.text)));
 }
 assert.deepEqual(wordGeometry('क्यों',48).placed.map(p=>p.text),['क्यों']);
});
test('HeyGen needs its own key, not Cartesia; default edgy remains user-selectable',()=>{
 const input=validateInput({voiceProvider:'heygen',providerKeys:{GEMINI_API_KEY:'test',HEYGEN_API_KEY:'test'}});
 assert.equal(input.voiceProvider,'heygen');assert.equal(input.humorIntensity,'edgy');
 assert.equal(validateInput({voiceProvider:'heygen',humorIntensity:'clean',providerKeys:{GEMINI_API_KEY:'test',HEYGEN_API_KEY:'test'}}).humorIntensity,'clean');
 assert.match(heygenSpeechText('hello [unsupported]',{delivery:'payoff'}),/^\[playful\] hello$/);
});

test('Shubham catalog speech requires explicit credit opt-in and never substitutes another voice',async()=>{
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'shubham-')),dest=join(folder,'voice.wav');let calls=0;
 const wav=Buffer.alloc(64);wav.write('RIFF');wav.write('WAVE',8);
 try{
  globalThis.fetch=async(url,init)=>{
   calls++;
   if(String(url).endsWith('/voices/speech')){
    const body=JSON.parse(init.body);assert.equal(body.voice_id,'c3aeb85687ff4a46a8cb4f491a622f98');assert.equal(body.model,undefined);assert.equal(body.output_format.encoding,'wav');assert.doesNotMatch(body.text,/\[excited\]/);
    return Response.json({data:{audio_url:'https://resource.heygen.ai/shubham.wav',engine:'starfish'}});
   }
   return new Response(wav);
  };
  await assert.rejects(runWithProviders({HEYGEN_API_KEY:'test',HEYGEN_SPEECH_API:'catalog',HEYGEN_ALLOW_CATALOG:'0'},()=>heygenVoice('नमस्ते','hi',dest)),/may consume credits/);
  assert.equal(calls,0);
  const info=await runWithProviders({HEYGEN_API_KEY:'test',HEYGEN_SPEECH_API:'catalog',HEYGEN_ALLOW_CATALOG:'1',HEYGEN_VOICE_HI_ID:'c3aeb85687ff4a46a8cb4f491a622f98'},()=>heygenVoice('नमस्ते','hi',dest,{delivery:'hook'}));
  assert.equal(info.voiceId,'c3aeb85687ff4a46a8cb4f491a622f98');assert.equal(info.engine,'starfish');assert.equal(calls,2);
 }finally{globalThis.fetch=saved;}
});


test('English Fish selection uses its dedicated voice without changing Hindi routing',async()=>{
 const {fishVoiceId,DEFAULT_FISH_EN_VOICE}=await import('../lib/core.mjs');
 const keys={FISH_API_KEY:'secret',FISH_VOICE_ID:DEFAULT_FISH_VOICE,FISH_VOICE_EN_ID:'0f63dce1a01b4991b56940c0e6a1464f'};
 const input=validateInput({voiceProvider:'fish',voiceAccent:'en-US',providerKeys:{GEMINI_API_KEY:'test',...keys}});
 assert.equal(input.language,'en');assert.equal(input.providerKeys.FISH_VOICE_EN_ID,DEFAULT_FISH_EN_VOICE);
 const saved=globalThis.fetch,folder=await mkdtemp(join(tmpdir(),'english-fish-')),wav=Buffer.alloc(64);wav.write('RIFF');wav.write('WAVE',8);
 try{
  globalThis.fetch=async(url,init)=>{const b=JSON.parse(init.body);assert.equal(b.reference_id,DEFAULT_FISH_EN_VOICE);assert.equal(b.prosody.speed,1.1);assert.equal(init.headers.model,FISH_FREE_MODEL);return new Response(wav);};
  await runWithProviders(keys,async()=>{assert.equal(fishVoiceId('hi'),DEFAULT_FISH_VOICE);assert.equal(fishVoiceId('en'),DEFAULT_FISH_EN_VOICE);await fishVoice('Ever wondered why?', 'en',join(folder,'voice.wav'));});
 }finally{globalThis.fetch=saved;}
});
