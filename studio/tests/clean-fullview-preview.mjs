// Re-render the reviewed project sample with the current clean style and
// a freshly proofread hook. Reuses genuine narration and licensed source media.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {polishEpisodeHeadline,inspectFocus} from '../lib/core.mjs';
import {prepareHeadlineAssets,preparePointerAssets,normalizeHookTitle} from '../lib/reference-style.mjs';
const folder=resolve('studio/jobs/reference-layout-preview');
const episode=JSON.parse(await readFile(join(folder,'episode.json'),'utf8'));
const edited=await polishEpisodeHeadline(episode,episode.research,'hi');
const plan=JSON.parse(await readFile(join(folder,'plan.json'),'utf8'));
plan.meta.headline_hi=edited.headlineText;plan.meta.headline_highlight=edited.headlineHighlight;
plan.meta.headline_image=await prepareHeadlineAssets(edited.headlineText,edited.headlineHighlight,join(folder,'headline-clean'));
plan.meta.media_fit='cover';plan.meta.out=join(folder,'clean-video.mp4');
for(const scene of plan.scenes){
  const media=scene.reference_media;
  if(media?.media_type==='photo'&&media.pointer){
    const tracks=await inspectFocus(media.image,media.pointer.target,episode.scenes[plan.scenes.indexOf(scene)].narration);
    media.pointer=tracks.length?{...media.pointer,tracks}:null;
  }
}
await preparePointerAssets(plan.meta.pointer_assets);
await writeFile(join(folder,'clean-plan.json'),JSON.stringify(plan,null,2));
await writeFile(join(folder,'clean-episode.json'),JSON.stringify(edited,null,2));
execFileSync(process.env.PYTHON||'python',['scripts/paper_doc.py','contact',join(folder,'clean-plan.json'),join(folder,'qa-clean')],{stdio:'inherit'});
execFileSync(process.env.PYTHON||'python',['scripts/paper_doc.py','render',join(folder,'clean-plan.json')],{stdio:'inherit'});
await copyFile(join(folder,'clean-video.mp4'),resolve('samples/clean-fullview-sample.mp4'));
await copyFile(join(folder,'qa-clean/clean-video_contact.jpg'),resolve('samples/clean-fullview-sample-contact.jpg'));
await writeFile(resolve('samples/clean-fullview-sample-title.txt'),normalizeHookTitle(edited.headlineText)+'\n');
console.log('CLEAN_SAMPLE_READY samples/clean-fullview-sample.mp4');
