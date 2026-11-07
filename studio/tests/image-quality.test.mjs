import test from 'node:test';
import assert from 'node:assert/strict';
import {imageDimensions,highQualityImage,readImageBytes} from '../lib/image-quality.mjs';
import {Resvg} from '@resvg/resvg-js';

test('photo downloads stop oversized streaming bodies before buffering the complete file',async()=>{
 await assert.rejects(readImageBytes(new Response('small',{headers:{'Content-Length':'100'}}),10),/download limit/);
 let cancelled=false;
 const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(6));},cancel(){cancelled=true;}});
 await assert.rejects(readImageBytes(new Response(body),10),/download limit/);assert.equal(cancelled,true);
 assert.equal((await readImageBytes(new Response('photo'),10)).toString(),'photo');
});
test('actual raster dimensions reject small sources despite claimed thumbnail metadata',()=>{
 const small=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="340" height="281"/>').render().asPng();
 assert.deepEqual(imageDimensions(small),{width:340,height:281});assert.equal(highQualityImage(imageDimensions(small)),false);
 assert.equal(highQualityImage({width:1920,height:1200}),true);assert.equal(highQualityImage({width:1192,height:800}),false);
 assert.equal(imageDimensions(Buffer.from('not an image')),null);
});
test('JPEG parser reads baseline and progressive native dimensions and rejects truncated markers',()=>{
 for(const marker of [0xC0,0xC2]){
  const bytes=Buffer.from([0xff,0xd8,0xff,marker,0,11,8,4,56,7,128,1,1,0x11,0]);
  assert.deepEqual(imageDimensions(bytes),{height:1080,width:1920});
  assert.equal(highQualityImage(imageDimensions(bytes)),true);
  assert.equal(imageDimensions(bytes.subarray(0,9)),null);
 }
});
