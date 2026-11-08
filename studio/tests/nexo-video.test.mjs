import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pinterestMediaUrl,downloadPinterestExcerpt,createNexoProvider} from '../lib/nexo-video.mjs';

test('bundled Nexo adapter loads and rejects unrelated media hosts',()=>{
 assert.equal(typeof createNexoProvider(),'function');
 assert.equal(pinterestMediaUrl('https://v1.pinimg.com/videos/a.m3u8'),'https://v1.pinimg.com/videos/a.m3u8');
 for(const url of ['http://v1.pinimg.com/a','https://v1.pinimg.com.evil.test/a','https://u:p@v1.pinimg.com/a','https://127.0.0.1/a','https://v1.pinimg.com:8080/a'])assert.equal(pinterestMediaUrl(url),null);
});

test('HLS excerpts reject foreign segment URLs before FFmpeg can fetch them',async()=>{
 const original=globalThis.fetch,dir=await mkdtemp(join(tmpdir(),'nexo-hls-'));
 globalThis.fetch=async()=>new Response('#EXTM3U\n#EXTINF:4,\nhttp://127.0.0.1/private\n');
 try{await assert.rejects(downloadPinterestExcerpt('https://v1.pinimg.com/a.m3u8',join(dir,'out.mp4'),{run:()=>assert.fail('Unsafe manifest reached FFmpeg')}),/Untrusted Pinterest/);}
 finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});

test('HLS downloads stop at excerpt duration and FFmpeg reads only local segments',async()=>{
 const original=globalThis.fetch,dir=await mkdtemp(join(tmpdir(),'nexo-hls-'));let downloads=0;
 globalThis.fetch=async url=>String(url).endsWith('.m3u8')?new Response('#EXTM3U\n#EXTINF:6,\na.ts\n#EXTINF:6,\nb.ts\n#EXTINF:6,\nc.ts\n'):new Response(Buffer.alloc(++downloads));
 try{
  await downloadPinterestExcerpt('https://v1.pinimg.com/a.m3u8',join(dir,'out.mp4'),{seconds:10,run:async(cmd,args)=>{
   assert.equal(cmd,'ffmpeg');assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file,crypto');
   const manifest=await readFile(args[args.indexOf('-i')+1],'utf8');assert.ok(!manifest.includes('https:'));assert.match(manifest,/segment-1\.ts/);assert.ok(!manifest.includes('segment-2'));
  }});assert.equal(downloads,2);
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});

test('fragmented MP4 HLS honors initialization and segment byte ranges',async()=>{
 const original=globalThis.fetch,dir=await mkdtemp(join(tmpdir(),'nexo-hls-'));const ranges=[];
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('.m3u8'))return new Response('#EXTM3U\n#EXT-X-MAP:URI="movie.cmfv",BYTERANGE="4@0"\n#EXTINF:6,\n#EXT-X-BYTERANGE:5@4\nmovie.cmfv\n#EXTINF:6,\n#EXT-X-BYTERANGE:3\nmovie.cmfv\n');
  const range=options.headers.Range;ranges.push(range);const [a,b]=range.slice(6).split('-').map(Number);return new Response(Buffer.alloc(b-a+1),{status:206});
 };
 try{await downloadPinterestExcerpt('https://v1.pinimg.com/a.m3u8',join(dir,'out.mp4'),{seconds:10,run:async()=>{}});assert.deepEqual(ranges,['bytes=0-3','bytes=4-8','bytes=9-11']);}
 finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});


test('alternate query is tried before fallback and rejected clips are released',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nexo-search-')),queries=[],used=new Set();
 const pin={is_video:true,video_url:'https://v1.pinimg.com/a.m3u8',title:'banana plant',pin_url:'https://www.pinterest.com/pin/123/',videos:{list:{low:{width:360,height:640}}}};
 const provider=createNexoProvider({search:async q=>{queries.push(q);return {status:true,data:{pins:q.startsWith('rare')?[]:[pin]}};},download:async()=>{}});
 const session={metrics:{searches:[]}};
 try{
  const result=await provider('rare query',join(dir,'out.mp4'),{session,used,subject:'banana plant',topic:'banana',scene:{subjectEntity:'banana plant',visualRole:'context'},inspect:async()=>null});
  assert.equal(result,null);assert.ok(queries.includes('banana plant video'));assert.equal(used.size,0);assert.equal(session.metrics.searches[0].reviewed,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('matching rejects generic texture missing the actual topic',async()=>{
 const {metadataReview}=await import('../lib/local-visual-quality.mjs');
 assert.equal(metadataReview({title:'textured metal silver sheet'},{subjectEntity:'metal thimble texture'},'Thimble').approved,false);
});

test('process JSON output excludes decoder warnings on stderr',async()=>{
 const {processTool}=await import('../server.mjs');
 const output=await processTool(process.execPath,['-e','process.stderr.write("warning\\n");process.stdout.write(JSON.stringify({width:360}))']);
 assert.equal(JSON.parse(output).width,360);
});
