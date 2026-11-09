// Run the pinned OmniDL extractors without launching its web server or GUI.
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const original=childProcess.spawn;
childProcess.spawn=(command,args,options={})=>original(command,args,{...options,windowsHide:true});
syncBuiltinESMExports();
const [url,python]=process.argv.slice(2);
process.env.REQUEST_TIMEOUT_MS='20000';
// Resolve entry points from the same interpreter used by the deployed app.
const result=childProcess.spawnSync(python,['-c','import sysconfig,json,os; p=sysconfig.get_path("scripts"); print(json.dumps([os.path.join(p,"yt-dlp"+(".exe" if os.name=="nt" else "")),os.path.join(p,"gallery-dl"+(".exe" if os.name=="nt" else ""))]))'],{encoding:'utf8',windowsHide:true,timeout:5000});
if(result.status!==0)throw Error('OmniDL Python tools unavailable');
[process.env.YTDLP_PATH,process.env.GALLERYDL_PATH]=JSON.parse(result.stdout);
process.env.PYTHON_PATH=python;
const entry=new URL('../studio/node_modules/omnidl/backend/src/extractors/index.js',import.meta.url);
const {extractors}=await import(entry.href);
const host=new URL(url).hostname;
const platform=host.endsWith('youtube.com')||host==='youtu.be'?'YouTube':host.endsWith('instagram.com')?'Instagram':host.endsWith('pinterest.com')?'Pinterest':host.endsWith('facebook.com')?'Facebook':host.endsWith('tiktok.com')?'TikTok':null;
if(!platform)throw Error('Unsupported OmniDL source');
const raw=await extractors[platform](url,'',AbortSignal.timeout(22000));
const {normalize}=await import(new URL('../normalize.js',entry).href);
const media=normalize(raw,platform,url);
// Signed CDN links are consumed privately by the adapter, never logged.
process.stdout.write(JSON.stringify({...media,license:raw.license||null}));
