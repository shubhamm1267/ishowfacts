export async function readImageBytes(response,maxBytes=8_000_000){
 if(Number(response.headers?.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('Image exceeds download limit');}
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw Error('Image exceeds download limit');chunks.push(chunk);}
 return Buffer.concat(chunks);
}

export function imageDimensions(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 if(bytes[0]!==255||bytes[1]!==216)return null;
 let at=2;
 while(at+4<bytes.length){
  if(bytes[at]!==255)return null;
  while(bytes[at]===255)at++;
  const marker=bytes[at++];if(marker===0xD9||marker===0xDA)return null;
  if(marker===0x01||(marker>=0xD0&&marker<=0xD7))continue;
  if(at+2>bytes.length)return null;
  const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)return null;
  if([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(marker)&&length>=7)return {height:bytes.readUInt16BE(at+3),width:bytes.readUInt16BE(at+5)};
  at+=length;
 }
 return null;
}
export function highQualityImage(dimensions){return !!dimensions&&Math.min(dimensions.width,dimensions.height)>=900&&Math.max(dimensions.width,dimensions.height)>=1600;}
