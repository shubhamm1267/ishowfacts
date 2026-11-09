import {checkGenerationCancelled} from './core.mjs';
export function footageChain(providers){
 return async(...args)=>{
  for(const [name,provider] of providers){
   if(!provider)continue;
   checkGenerationCancelled();
   try{const selected=await provider(...args);if(selected)return selected;}
   catch(error){
    checkGenerationCancelled();
    args[2]?.session?.metrics?.searches?.push({provider:name,status:'unavailable',results:0,reviewed:0,error:String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,200)});
   }
  }
  return null;
 };
}
