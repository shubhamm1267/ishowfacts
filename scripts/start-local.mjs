import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=4300;
let child,stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  stopping=true;
  child?.kill(signal);
});

function run(args,cwd,env=process.env){
  return new Promise((ok,fail)=>{
    child=spawn(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true});
    child.once('error',fail);
    child.once('exit',(code,signal)=>{
      child=null;
      if(stopping||code===0)ok();
      else fail(Error(`Command stopped (${signal||code}).`));
    });
  });
}

try{
  if(!process.env.npm_execpath)throw Error('Run npm start from the project folder.');
  console.log('Building frontend...');
  await run([process.env.npm_execpath,'run','build','--prefix','web'],root);
  if(!stopping){
    console.log(`Starting frontend and backend: http://127.0.0.1:${port}`);
    await run(['--env-file-if-exists=.env','server.mjs'],resolve(root,'studio'),{
      ...process.env,HOST:'127.0.0.1',PORT:String(port),FRONTEND_ORIGIN:`http://127.0.0.1:${port}`,
      PYTHON:process.env.PYTHON||(process.platform==='win32'?'python':'python3')
    });
  }
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}
