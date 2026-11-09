
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mkdir,
  readFile,
  writeFile,
  stat,
  readdir,
  copyFile,
  rename,
  rm
} from 'node:fs/promises';
import { createReadStream,readFileSync } from 'node:fs';
import {totalmem} from 'node:os';
import { spawn } from 'node:child_process';
import { stockVideo,stockPhoto,createStockSession,createStockMediaCache,topicFootageAvailability,stockLookup,uploadDescription,moveCreditsToDescription } from './lib/stock-video.mjs';
import {createInstagramProvider} from './lib/instagram-video.mjs';
import {createNexoProvider} from './lib/nexo-video.mjs';
import {usableVideoDimensions} from './lib/video-resolution.mjs';
import { preparePointerAssets, prepareHeadlineAssets, prepareOverlayTextAssets, normalizeHookTitle } from './lib/reference-style.mjs';
import { prepareExplainers } from './lib/explainer.mjs';
import {heygenVoice,heygenPerformance,NATURAL_SPEECH_TRIM,DEFAULT_HEYGEN_VOICE,HEYGEN_FREE_MODEL,heygenModel,heygenSpeechMode,validateHeygenSettings} from './lib/heygen.mjs';
import {recordStage,timingSummary} from './lib/job-timing.mjs';
import {runSceneWorkers,mediaBudget,assignMediaTypes,mediaBudgetIssues,createProcessLimiter,resourceBudget} from './lib/media-workers.mjs';
import {framingReviewer,reviewRenderedVideo} from './lib/local-visual-quality.mjs';
import {QualityError,narrationTempo} from './lib/quality.mjs';
import {hookContextFor,hookFamily} from './lib/episode-prompt.mjs';

import {
  chooseTopic,
  topicSelectionContext,
  topicWasUsed,
  randomFactsSource,
  wikipediaSource,
  writeEpisode,
  writeStoryOptions,
  finalizeEpisode,
  prepareMediaContracts,
  commonsImage,
  openverseImage,
  freesound,
  cartesiaVoice,
  fishVoice, fishVoiceId, FISH_FREE_MODEL, validateFishSettings,
  demoEpisode,
  clamp,
  auditHindiNarration,
  auditSoundCue,
  gemini,
  mediaSearchQueries,
  mediaVideoQuery,
  repairMediaBrief,
  resolveVoiceProfile,
  runWithProviders, runWithGeminiUsage, generationSignal, checkGenerationCancelled
} from './lib/core.mjs';

import {
  buildAdvancedPlan,
  requiredSounds
} from './lib/director.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, '..');

const PUBLIC = join(
  ROOT,
  'web',
  'dist',
  'paper-facts',
  'browser'
);

const JOBS = resolve(
  process.env.JOBS_DIR || join(DIR, 'jobs')
);
const stockMediaCache=createStockMediaCache({directory:join(JOBS,'.stock-cache')});

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4300);

const ALLOWED_ORIGIN =
  process.env.FRONTEND_ORIGIN || 'http://localhost:4200';

export function normalizeFrontendOrigin(value) {
  const input=String(value||'').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
  try {
    const url=new URL(input);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
    return url.origin;
  } catch { return null; }
}

// Only one video is generated at a time.
let busy = false;
let activeJob = null;
const jobControllers=new Map();

const jobs = new Map();
const instanceId=randomUUID();
const memoryNumber=path=>{try{const n=Number(readFileSync(path,'utf8').trim());return Number.isFinite(n)&&n>0&&n<2**60?n:0;}catch{return 0;}};
const memoryLimit=Math.min(...[totalmem(),process.constrainedMemory?.(),memoryNumber('/sys/fs/cgroup/memory.max'),memoryNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes')].filter(n=>n>0));
const resources=resourceBudget(memoryLimit);

export const VIDEO_TTL_MS = 30 * 60 * 1000;

export async function expireJob(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return;
  }

  const folder = resolve(JOBS, id);
  if(!folder.startsWith(JOBS+sep))throw Error('Job cleanup path outside jobs directory');
  const statusFile = join(folder, 'status.json');

  let saved;

  try {
    saved = JSON.parse(
      await readFile(statusFile, 'utf8')
    );
  } catch {
    return;
  }

  if (saved.status === 'running') {
    return;
  }

  if (activeJob?.id === id) {
    return;
  }

  let expiresAt = Date.parse(saved.expiresAt || '');

  if (!Number.isFinite(expiresAt)) {
    try {
      const info = await stat(statusFile);
      expiresAt = info.mtimeMs + VIDEO_TTL_MS;
    } catch {
      return;
    }
  }

  if (Date.now() < expiresAt) {
    return;
  }

  try {
    await rm(folder, {
      recursive: true,
      force: true
    });

    jobs.delete(id);

    console.log('[CLEANUP] Deleted expired job:', id);
  } catch (error) {
    console.error(
      '[CLEANUP] Could not delete job:',
      id,
      error.message
    );
  }
}

async function cleanExpiredJobs() {
  let entries = [];

  try {
    entries = await readdir(JOBS, {
      withFileTypes: true
    });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      /^[a-f0-9-]{36}$/i.test(entry.name)
    ) {
      await expireJob(entry.name);
    }
  }
  try{await stockMediaCache.prune();}catch{/* An optional cache cannot block job cleanup. */}
}

function safeJob(job) {
  const {
    id,
    status,
    stage,
    progress,
    title,
    topic,
    error,
    warnings,
    sources,
    video,
    duration,
    demo,
    contact
  } = job;

  return {
    id,
    instanceId,
    selectedTopics:job.selectedTopics||[],
    status,
    cancelRequested:!!job.cancelRequested,
    youtubeTitle: job.youtubeTitle || null,
    category:job.category||null,
    size: job.size || [1080,1920],
    performance:timingSummary(job)||job.performance||null,
    renderPerformance:job.renderPerformance||null,
    storyPreparationSeconds:job.storyPreparationSeconds||null,
    preview:job.preview||null,
    storyOptions:job.storyOptions||null,
    previewNotice:job.previewNotice||null,
    geminiUsage:job.geminiUsage||null,
    uploadTitleUrl: status === 'complete' ? `/api/jobs/${id}/title` : null,
    uploadDescriptionUrl: status === 'complete' ? `/api/jobs/${id}/description` : null,
    stage,
    progress,
    title,
    topic,
    error,
    warnings,
    sources,
    demo,
    duration,
    video: !!video,
    expiresAt: job.expiresAt || null,

    videoUrl: video
      ? `/api/jobs/${id}/video`
      : null,

    downloadUrl: video
      ? `/api/jobs/${id}/download`
      : null,

    storyboardUrl: status === 'complete'
      ? `/api/jobs/${id}/episode`
      : null,

    animationPlanUrl: status === 'complete'
      ? `/api/jobs/${id}/plan`
      : null,

    contactUrl: contact
      ? `/api/jobs/${id}/contact`
      : null
  };
}

async function checkpoint(job, stage, progress) {
  if(job.status==='running')checkGenerationCancelled();
  recordStage(job,stage);
  job.stage = stage;
  job.progress = progress;
  if(process.env.RENDER)console.log('[MEMORY]',JSON.stringify({job:job.id,stage,nodeMiB:Math.round(process.memoryUsage().rss/1048576),containerMiB:Math.round((memoryNumber('/sys/fs/cgroup/memory.current')||memoryNumber('/sys/fs/cgroup/memory/memory.usage_in_bytes'))/1048576),limitMiB:Math.round(memoryLimit/1048576)}));

  const pending=join(JOBS,job.id,`status-${randomUUID()}.tmp`);
  try{
    await writeFile(pending,JSON.stringify(safeJob(job),null,2));
    await rename(pending,join(JOBS,job.id,'status.json'));
  }finally{await rm(pending,{force:true});}
}

export function validateInput(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw Error('Invalid request');
  }

  if (
    data.topic !== undefined &&
    typeof data.topic !== 'string'
  ) {
    throw Error('Topic must be text');
  }

  const topic = String(data.topic || '').trim();

  if (topic.length > 140) {
    throw Error('Topic too long');
  }

  const voice = resolveVoiceProfile(
    data.voiceAccent ||
    (data.language === 'en' ? 'en-US' : 'hi-IN-anuj')
  );

  const language = voice.language;

  const voiceStyle = ['energetic', 'balanced'].includes(
    data.voiceStyle
  )
    ? data.voiceStyle
    : 'energetic';

  const humorIntensity = [
    'clean',
    'cheeky',
    'edgy'
  ].includes(data.humorIntensity)
    ? data.humorIntensity
    : 'edgy';

  const backgroundPalette = [
    'white',
    'black',
    'random'
  ].includes(data.backgroundPalette)
    ? data.backgroundPalette
    : 'random';

  const seconds = clamp(
    Number(data.seconds) || 30,
    15,
    100
  );

  const demo = data.demo === true;

  const rawKeys = data.providerKeys || {};

  if (
    typeof rawKeys !== 'object' ||
    Array.isArray(rawKeys)
  ) {
    throw Error('Invalid provider settings');
  }

  const providerKeys = {};
  const voiceProvider=data.voiceProvider||process.env.VOICE_PROVIDER||(process.env.FISH_API_KEY?'fish':process.env.HEYGEN_API_KEY?'heygen':'cartesia');
  if(!['fish','heygen','cartesia'].includes(voiceProvider))throw Error('Unsupported voice provider');

  const allowedKeys = [
    'FISH_API_KEY',
    'FISH_VOICE_ID','FISH_VOICE_HI_ID','FISH_VOICE_EN_ID',
    'HEYGEN_API_KEY',
    'HEYGEN_VOICE_HI_ID',
    'HEYGEN_VOICE_EN_ID',
    'HEYGEN_PITCH_SEMITONES',
    'HEYGEN_TEMPO',
    'GEMINI_API_KEY',
    'GEMINI_API_KEY_2',
    'GEMINI_API_KEY_3',
    'GEMINI_MODEL',
    'CARTESIA_API_KEY',
    'CARTESIA_MODEL',
    'CARTESIA_VERSION',
    'FREESOUND_API_KEY'
  ];

  for (const name of allowedKeys) {
    const value = rawKeys[name];

    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      continue;
    }

    if (
      typeof value !== 'string' ||
      value.length > 512
    ) {
      throw Error('Invalid setting: ' + name);
    }

    providerKeys[name] = value.trim();
  }

  if (demo && process.env.DEMO_MODE !== '1') {
    throw Error('Demo mode disabled');
  }

  if (
    !demo &&
    (
      !['GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3']
        .some(name => providerKeys[name] || process.env[name]) ||
      !(voiceProvider==='fish'?(providerKeys.FISH_API_KEY||process.env.FISH_API_KEY):voiceProvider==='heygen'?(providerKeys.HEYGEN_API_KEY||process.env.HEYGEN_API_KEY):(providerKeys.CARTESIA_API_KEY || process.env.CARTESIA_API_KEY))
    )
  ) {
    throw Error(
      `Gemini and ${voiceProvider==='fish'?'Fish Audio':voiceProvider==='heygen'?'HeyGen':'Cartesia'} keys are required. Open API Settings.`
    );
  }

  const logoDataUrl=validateLogoUpload(data.logoDataUrl);
  const recentTopics=data.recentTopics||[];
  if(!Array.isArray(recentTopics)||recentTopics.length>100||recentTopics.some(t=>typeof t!=='string'||!t.trim()||t.length>140))
    throw Error('Recent topics must contain at most 100 topic names');
  return {
    topic,
    recentTopics:[...new Set(recentTopics.map(t=>t.trim()))],
    previewFirst:data.previewFirst===true,
    language,
    factMode:data.factMode==='random'?'random':'topic',
    seconds,
    voiceAccent: voice.key,
    voiceProvider,
    voiceStyle,
    humorIntensity,
    backgroundPalette,
    mediaMode: data.visualStyle==='paper'&&data.mediaMode==='photos'?'photos':'mixed',
    visualStyle: data.visualStyle === 'paper' ? 'paper' : 'reference-news',
    mediaFit: data.mediaFit === 'contain' ? 'contain' : 'cover',
    logoDataUrl,
    demo,
    providerKeys
  };
}

export function validateLogoUpload(value){
  if(value===undefined||value===null||value==='')return '';
  if(typeof value!=='string'||value.length>1_400_000)throw Error('Logo must be an image smaller than 1 MB');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw Error('Logo must be a PNG, JPEG or WebP image');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<24||bytes.length>1_000_000||bytes.toString('base64')!==match[2])throw Error('Invalid logo image data');
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===255&&bytes[1]===216;
  const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!({png,jpeg,webp})[match[1]])throw Error('Logo content does not match its image type');
  return value;
}

// Executes Python and FFmpeg with a configurable timeout.
const limitProcess=createProcessLimiter(resources.processConcurrency);
export function processTool(command, args, onText, {timeoutMs: deadline} = {}) {
  // FFmpeg otherwise sizes its thread pools from the host CPU count, which
  // can greatly exceed the memory/CPU allocation of a small Render container.
  if(/(?:^|[\\/])ffmpeg(?:\.exe)?$/i.test(command))
    args=['-threads',String(resources.ffmpegThreads),'-filter_threads','1','-filter_complex_threads','1',...args.slice(0,-1),'-threads',String(resources.ffmpegThreads),args.at(-1)];
  return limitProcess(()=>new Promise((resolveJob, rejectJob) => {
    checkGenerationCancelled();
    const signal=generationSignal();
    const configuredMinutes = Number(
      process.env.RENDER_PROCESS_TIMEOUT_MINUTES || 45
    );

    const timeoutMinutes = Number.isFinite(
      configuredMinutes
    )
      ? Math.max(1, Math.min(180, configuredMinutes))
      : 45;

    const timeoutMs = Number.isFinite(deadline) ? Math.max(1000,Math.min(timeoutMinutes*60000,deadline)) : timeoutMinutes * 60 * 1000;

    let log = '';
    let stdout = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: ROOT,
      env: {...process.env,PAPERDOC_THREADS:String(resources.ffmpegThreads),...(resources.lowMemory?{OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1',NUMEXPR_NUM_THREADS:'1'}:{})},
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });

    let timer;

    const finish = (error, result) => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort',cancelProcess);

      if (error) {
        rejectJob(error);
      } else {
        resolveJob(result);
      }
    };

    const cancelProcess=()=>{
      if(process.platform==='win32'&&child.pid){
        spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
      }else if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
    };
    signal?.addEventListener('abort',cancelProcess,{once:true});
    if(signal?.aborted)cancelProcess();

    timer = setTimeout(() => {
      timedOut = true;

      console.error(
        `[PROCESS TIMEOUT] ${command} exceeded ${timeoutMinutes} minutes`
      );

      try {
        if (
          process.platform !== 'win32' &&
          child.pid
        ) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          // Process may have already exited.
        }
      }
    }, timeoutMs);

    for (const pipe of [child.stdout, child.stderr]) {
      pipe.setEncoding('utf8');

      pipe.on('data', chunk => {
        log = (log + chunk).slice(-9000);
        if(pipe===child.stdout)stdout=(stdout+chunk).slice(-1000000);

        if (typeof onText === 'function') {
          onText(chunk);
        }
      });
    }

    child.on('error', error => {
      finish(error);
    });

    child.on('close', code => {
      if(signal?.aborted){finish(signal.reason||Error('Generation cancelled'));return;}
      if (timedOut) {
        finish(
          Error(
            `${command} timed out after ${Math.round(timeoutMs / 1000)} seconds`
          )
        );
        return;
      }

      if (code === 0) {
        finish(null, stdout);
        return;
      }

      finish(
        Error(
          `${command} exited ${code}: ${log.slice(-900)}`
        )
      );
    });
  }));
}

async function mediaSeconds(path) {
  const output = await processTool(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path
    ]
  );

  const seconds = Number(output.trim());

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    throw Error('Audio duration could not be read');
  }

  return seconds;
}

export async function makeVoice(
  episode,
  voiceAccent,
  voiceStyle,
  folder,
  voiceProvider='cartesia'
) {
  const files = [];
  const timing = [];
  const durations = [];

  let t = 0;

  let nextVoice = 0;
  const makeNextVoice = async () => { while (nextVoice < episode.scenes.length) {
    const i = nextVoice++;
    const path = join(
      folder,
      `voice_${String(i).padStart(2, '0')}.wav`
    );

    const raw = join(
      folder,
      `voice_${String(i).padStart(2, '0')}_raw.wav`
    );

    if(voiceProvider==='fish')await fishVoice(episode.scenes[i].narration,voiceAccent.startsWith('en')?'en':'hi',raw,episode.scenes[i],voiceStyle);
    else if(voiceProvider==='heygen')await heygenVoice(episode.scenes[i].narration,voiceAccent.startsWith('en')?'en':'hi',raw,episode.scenes[i],voiceStyle);
    else await cartesiaVoice(
      episode.scenes[i].narration,
      voiceAccent,
      raw,
      episode.scenes[i],
      voiceStyle
    );

    const tempo=voiceProvider==='fish'?narrationTempo(episode.scenes[i].narration,await mediaSeconds(raw),{energetic:voiceStyle==='energetic',language:episode.language||(voiceAccent.startsWith('en')?'en':'hi')}):1;
    await processTool(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        raw,

        '-af',
        [tempo>1?`atempo=${tempo}`:null,voiceProvider==='heygen'?heygenPerformance(episode.scenes[i],voiceStyle,voiceAccent.startsWith('en')?'en':'hi').filter:null,
         voiceProvider!=='cartesia'?NATURAL_SPEECH_TRIM:'silenceremove=start_periods=1:start_duration=0:start_threshold=-42dB:stop_periods=-1:stop_duration=0.31:stop_threshold=-42dB,apad=pad_dur=0.05'].filter(Boolean).join(','),

        '-ar',
        '44100',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        path
      ]
    );

    const seconds = await mediaSeconds(path);

    files[i] = path;
    durations[i] = seconds;
  }};
  await Promise.all(Array.from({length:Math.min(2,episode.scenes.length)},makeNextVoice));
  for(const seconds of durations){timing.push({start:t,duration:seconds});t+=seconds;}

  const list = join(folder, 'concat.txt');

  await writeFile(
    list,
    files.map(f => `file '${f.replaceAll("'", "'\\''")}'`).join('\n')
  );

  const out = join(folder, 'narration.wav');

  const pitchDefaults = {
    'hi-IN': 1.14,
    'hi-IN-anuj': 1.18,
    'hi-IN-ayush': 1.19,
    'hi-IN-rakesh': 1.11
  };

  const pitchSetting = Number(
    process.env[
      `NARRATOR_PITCH_${voiceAccent.replace('hi-IN-', '').toUpperCase()}`
    ] ||
    (
      voiceAccent === 'hi-IN'
        ? process.env.NARRATOR_HINDI_PITCH
        : ''
    ) ||
    pitchDefaults[voiceAccent] ||
    1
  );

  const hindiPitch =
    voiceProvider==='cartesia'&&voiceAccent.startsWith('hi-IN') &&
    Number.isFinite(pitchSetting)
      ? Math.max(.94, Math.min(1.22, pitchSetting))
      : 1;

  const filters = [
    'highpass=f=80'
  ];

  if (Math.abs(hindiPitch - 1) > .005) {
    filters.push(
      `rubberband=pitch=${hindiPitch}:formant=preserved:pitchq=quality`
    );
  }

  if(voiceProvider!=='cartesia')filters.push('loudnorm=I=-18:LRA=11:TP=-2');
  else filters.push('acompressor=threshold=0.11:ratio=2.8:attack=5:release=90:makeup=1.6','loudnorm=I=-16:LRA=9:TP=-1.5','alimiter=limit=0.96');

  await processTool(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-af',
      filters.join(','),
      '-ar',
      '44100',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      out
    ]
  );

  return {
    timing,
    voice: out
  };
}

async function tryCutout(
  img,
  dest,
  guidance = null
) {
  if (process.env.ENABLE_REMBG !== '1') {
    return null;
  }

  try {
    const args = [
      join(DIR, 'prepare_cutout.py'),
      img,
      dest
    ];

    if (guidance?.anchors) {
      const anchorSpecs = Object.fromEntries(
        Object.entries(guidance.anchors).map(
          ([name, point]) => [
            name,
            {
              point,
              confidence:
                guidance.confidences?.[name] ?? 0
            }
          ]
        )
      );

      const specPath = dest.replace(
        /\.png$/,
        '.anchors.json'
      );

      await writeFile(
        specPath,
        JSON.stringify(anchorSpecs)
      );

      args.push(specPath);
    }

    await processTool(
      process.env.PYTHON || 'python3',
      args
    );

    const metadata = JSON.parse(
      await readFile(
        dest.replace(/\.png$/, '.bbox.json'),
        'utf8'
      )
    );

    // Segmentation's own mask/bounding-box checks remain; no Gemini cutout QA.

    return metadata;
  } catch {
    return null;
  }
}

async function makeDemoArt(path) {
  await processTool(
    process.env.PYTHON || 'python3',
    [
      join(DIR, 'demo_art.py'),
      path
    ]
  );
}

function previewEpisode(episode,topic,index=0){
  return {index,title:normalizeHookTitle(episode.headlineText||episode.title),headline:episode.headlineText||episode.title,topic,
    hook:episode.scenes[0].narration,narration:episode.scenes.map(scene=>scene.narration).join('\n\n')};
}

async function runJob(job, input, approved = null) {
  const folder = join(JOBS, job.id);
  const assets = join(folder, 'assets');

  try {
    if(!input.demo&&input.voiceProvider==='heygen')validateHeygenSettings();
    if(!input.demo&&input.voiceProvider==='fish')validateFishSettings(input.language);
    await mkdir(assets, {
      recursive: true
    });
    let preparedLogo='';
    let topic, source, episode;
    const strictMedia=!input.demo&&input.visualStyle==='reference-news'&&input.mediaMode==='mixed' ?mediaBudget(input.seconds):null;
    if (approved) {
      ({topic,source,episode}=approved);
      if(approved.storySnapshot){
        const snapshot=approved.storySnapshot,option=snapshot.options[approved.optionIndex];
        if(option.reviewed&&approved.retryMedia&&input.visualStyle==='reference-news'){
          await checkpoint(job,'Reviewing unavailable media briefs for the saved script',23);
          const contracts=await prepareMediaContracts(episode,source);
          await writeFile(join(folder,'media-contracts.json'),JSON.stringify(contracts,null,2));
          option.episode=episode;
          await writeFile(join(folder,'approved-story.json'),JSON.stringify(snapshot));
        }
        if(!option.reviewed){
          episode=await finalizeEpisode(episode,source,{requestedTopic:topic,seconds:input.seconds,hookContext:snapshot.hookContext,
            debugFolder:folder,reviewPrefix:`option-${approved.optionIndex}-`,onStage:stage=>checkpoint(job,stage,20)});
          if(input.visualStyle==='reference-news'){
            const contracts=await prepareMediaContracts(episode,source);
            await writeFile(join(folder,'media-contracts.json'),JSON.stringify(contracts,null,2));
          }
          if(strictMedia)assignMediaTypes(episode,strictMedia);
          option.episode=episode;option.reviewed=true;
          await writeFile(join(folder,'approved-story.json'),JSON.stringify(snapshot));
          job.storyOptions=snapshot.options.map((o,index)=>({...previewEpisode(o.episode,topic,index),reviewed:!!o.reviewed}));
        }
        job.preview=previewEpisode(episode,topic,approved.optionIndex);job.previewNotice=null;job.title=job.preview.title;
        let history=[];try{history=JSON.parse(await readFile(join(JOBS,'.hook-history.json'),'utf8'));}catch{}
        await writeFile(join(JOBS,'.hook-history.json'),JSON.stringify([...history,{opening:episode.scenes[0].narration,style:hookFamily(episode.scenes[0].narration),language:input.language}].slice(-20),null,2));
        await writeFile(join(folder,'episode.json'),JSON.stringify({...episode,research:source},null,2));
      }
    } else {


    await checkpoint(
      job,
      'Selecting and researching topic',
      5
    );

    // Permanent compact registry is separate from expiring job assets.
    const topicHistoryPath=join(DIR,'data','topic-history.json');
    let topicHistory=[];
    if(!input.demo){
      try{
        const saved=JSON.parse(await readFile(topicHistoryPath,'utf8'));
        if(!Array.isArray(saved)||saved.some(row=>typeof row?.topic!=='string'))throw Error('Invalid permanent topic history');
        topicHistory=saved;
      }catch(error){
        if(error.code!=='ENOENT')throw error;
        try{const saved=JSON.parse(await readFile(join(JOBS,'.topic-history.json'),'utf8'));if(Array.isArray(saved))topicHistory=saved.filter(row=>typeof row?.topic==='string');}catch(error){if(error.code!=='ENOENT')throw error;}
        // Recover previous delivered samples on first migration, not on every job.
        let names=[];try{names=await readdir(join(ROOT,'samples'));}catch(error){if(error.code!=='ENOENT')throw error;}
        for(const name of names.filter(name=>name.endsWith('-episode.json'))){
          try{
            const episode=JSON.parse(await readFile(join(ROOT,'samples',name),'utf8'));
            for(const article of episode.research?.articles||[episode.research||{title:episode.topic}]){
              if(article?.title&&!topicWasUsed(article,topicHistory))topicHistory.push({topic:article.title,url:article.url||null,category:'custom',createdAt:new Date().toISOString(),origin:'sample-migration'});
            }
          }catch{/* Unrelated legacy sample metadata cannot invalidate saved history. */}
        }
      }
    }
    // The browser's compact history also survives an ephemeral Render restart.
    for(const topic of input.recentTopics||[])if(!topicWasUsed(topic,topicHistory))topicHistory.push({topic,category:'custom',origin:'browser-history'});
    const attemptedTopics=[];
    const saveTopicHistory=async entries=>{
      await mkdir(dirname(topicHistoryPath),{recursive:true});
      const pendingHistory=topicHistoryPath+'.'+job.id+'.tmp';
      await writeFile(pendingHistory,JSON.stringify([...topicHistory,...attemptedTopics,...entries],null,2));
      await rename(pendingHistory,topicHistoryPath);
    };
    const rememberSelection=async(titles,categories)=>{
      job.selectedTopics=[...new Set([...(job.selectedTopics||[]),...titles])];
      attemptedTopics.push(...titles.map((topic,i)=>({topic,category:categories[i]?.id||'custom',createdAt:new Date().toISOString(),origin:'generation-attempt'})));
      // Reserve before research: failure/cancellation must not select it again.
      await saveTopicHistory([]);
      await checkpoint(job,'Researching selected topics',8);
    };

    if(input.demo){topic='Octopus';source={title:'Offline demonstration',url:null};}
    else if(input.factMode==='random'){
      source=await randomFactsSource({history:topicHistory,language:input.language,onTopicsSelected:rememberSelection});
      topic='Random facts: '+source.articles.map(a=>a.title).join(', ');
    }else{
      for(let attempt=0;attempt<3;attempt++){
        const category=topicSelectionContext(topicHistory).categories[0];
        const candidate=input.topic||await chooseTopic({history:[...topicHistory,...attemptedTopics],language:input.language});
        if(input.topic&&topicWasUsed(candidate,topicHistory))throw Error('This topic has already been used. Choose a new subject.');
        await rememberSelection([candidate],[category]);
        let availability=null;
        if(!input.topic&&input.visualStyle==='reference-news'&&input.mediaMode==='mixed'){
          await checkpoint(job,'Checking topic footage availability',7);
          availability=await topicFootageAvailability(candidate);
          await writeFile(join(folder,`topic-footage-${attempt}.json`),JSON.stringify({topic:candidate,...availability},null,2));
          if(availability.available===false)continue;
        }
        const researched={...await wikipediaSource(candidate),...(availability?.candidates?.length?{instagramCandidates:availability.candidates}:{})};
        if(input.topic&&topicWasUsed(researched,topicHistory))throw Error('This topic has already been used. Choose a new subject; changing its title or language does not make it new.');
        if(!topicWasUsed(researched,topicHistory)){
          topic=input.topic||researched.title;
          source={...researched,...(!input.topic?{category:topicSelectionContext(topicHistory).categories[0]}:{})};break;
        }
      }
      if(!source)throw Error('Could not select a fresh topic with available footage. Try another story.');
    }
    job.topic=topic;
    job.selectedTopics=[...new Set([...(job.selectedTopics||[]),...(source.articles||[source]).map(article=>article.title)])];
    job.category=source.articles?source.articles.map(a=>a.category.label).join(' / '):source.category?.label||null;

    if(!input.demo){
      const entries=(source.articles||[source]).map(article=>({topic:article.title,url:article.url,category:article.category?.id||'custom',createdAt:new Date().toISOString()}));
      await saveTopicHistory(entries);
      await writeFile(join(folder,'topic-selection.json'),JSON.stringify({automatic:!input.topic||input.factMode==='random',category:job.category,historyCount:topicHistory.length,duplicateCheck:'full permanent history before drafting',recentTopics:topicHistory.slice(-60).map(row=>row.topic),attempted:attemptedTopics,selected:entries},null,2));
    }

    await checkpoint(
      job,
      'Writing sourced facts storyboard with Gemini Lite',
      15
    );


    let hookHistory=[];
    if(!input.demo){
      try{const saved=JSON.parse(await readFile(join(JOBS,'.hook-history.json'),'utf8'));if(Array.isArray(saved))hookHistory=saved.filter(r=>typeof r?.opening==='string').slice(-20);}catch{/* First run or deleted history. */}
    }

    const hookContext=hookContextFor(hookHistory.filter(row=>(row.language||'hi')===input.language));
    if(strictMedia&&process.env.ENABLE_STOCK_VIDEO==='0')throw Error('Enable stock video for video-first generation');
    if(input.previewFirst&&!input.demo){
      const options=await writeStoryOptions(topic,source,input.language,input.seconds,input.humorIntensity,
        {debugFolder:folder,onStage:stage=>checkpoint(job,stage,18),mediaPolicy:strictMedia,hookContext});
      if(strictMedia)for(const option of options)assignMediaTypes(option,strictMedia);
      const {providerKeys,...savedInput}=input;
      await writeFile(join(folder,'approved-story.json'),JSON.stringify({input:savedInput,topic,source,hookContext,options:options.map(episode=>({episode,reviewed:false}))}));
      job.storyOptions=options.map((option,index)=>({...previewEpisode(option,topic,index),reviewed:false}));
      job.preview=job.storyOptions[0];job.title='Choose one of three scripts';
      job.previewNotice='Choose a script to make your video. Necessary fact and language corrections are handled automatically.';
      job.sources=source.articles?.map(article=>({name:article.title,url:article.url}))||(source.url?[{name:source.title,url:source.url}]:[]);
      job.status='awaiting_approval';await checkpoint(job,'Three scripts ready for your choice',24);return;
    }
    episode = input.demo
      ? demoEpisode()
      : await writeEpisode(
          topic,
          source,
          input.language,
          input.seconds,
          input.humorIntensity,
          {debugFolder:folder,onStage:stage=>checkpoint(job,stage,18),mediaPolicy:strictMedia,hookContext}
        );

    if(!input.demo&&input.visualStyle==='reference-news'){
      await checkpoint(job,'Checking context and visible-evidence media contracts',23);
      const contracts=await prepareMediaContracts(episode,source);
      await writeFile(join(folder,'media-contracts.json'),JSON.stringify(contracts,null,2));
    }

    if(!input.demo){
      const opening=episode.scenes[0].narration;
      await writeFile(join(JOBS,'.hook-history.json'),JSON.stringify([...hookHistory,{opening,style:hookFamily(opening),language:input.language}].slice(-20),null,2));
    }

    if(strictMedia)assignMediaTypes(episode,strictMedia);


    job.title = episode.title;

    job.sources = source.articles?.map(article=>({name:article.title,url:article.url})) || (source.url
      ? [
          {
            name: source.title,
            url: source.url
          }
        ]
      : []);

    await writeFile(
      join(folder, 'episode.json'),
      JSON.stringify(
        {
          ...episode,
          research: source
        },
        null,
        2
      )
    );

    if (input.previewFirst) {
      const {providerKeys,...savedInput}=input;
      await writeFile(join(folder,'approved-story.json'),JSON.stringify({input:savedInput,topic,source,episode}));
      job.preview={title:normalizeHookTitle(episode.headlineText||episode.title),headline:episode.headlineText||episode.title,topic,narration:episode.scenes.map(scene=>scene.narration).join('\n\n')};
      job.title=job.preview.title;
      job.status='awaiting_approval';
      await checkpoint(job,'Story ready for your approval',24);
      return;
    }
    }
    if(input.logoDataUrl){
      const logoSource=join(assets,'uploaded-logo');preparedLogo=join(assets,'logo.png');
      await writeFile(logoSource,Buffer.from(input.logoDataUrl.split(',')[1],'base64'));
      await processTool(process.env.PYTHON||'python3',['scripts/prepare_logo.py',logoSource,preparedLogo]);
    }
    const mediaConcurrency=Math.min(resources.mediaConcurrency,strictMedia?3:2);

    const stockSession=createStockSession({cache:stockMediaCache});
    let instagramCatalogue;
    if(source.instagramCandidates?.length){
      let index=[];try{index=JSON.parse(await readFile(join(DIR,'data','instagram-footage.json'),'utf8'));}catch{}
      instagramCatalogue=[...index,...source.instagramCandidates];
    }
    const existingInstagram=createInstagramProvider({run:processTool,python:process.env.PYTHON||'python3',root:ROOT,catalogue:instagramCatalogue});
    const sourcePolicy={allowSourceText:true,allowStylized:true};
    const nexo=createNexoProvider({packageDirectory:process.env.NEXO_PACKAGE_DIR,run:processTool,sourcePolicy});
    const instagram=nexo?async(...args)=>(await nexo(...args))||(await existingInstagram(...args)):existingInstagram;
    const mediaLookup=(key,operation)=>stockLookup(stockSession,key,operation);
    // Stock searches begin only after the primary Instagram lookup falls back.

    await checkpoint(
      job,
      `Preparing ${input.voiceProvider==='fish'?'Fish Audio S2.1 Pro Free':input.voiceProvider==='heygen'?'HeyGen '+(heygenSpeechMode()==='catalog'?'shubham-voice':'Turbo Free'):'Cartesia'} narrator audio`,
      25
    );

    const demoLength = clamp(
      Number(
        process.env.DEMO_SCENE_SECONDS
      ) || 1.8,
      .7,
      4
    );

    let narration = input.demo
      ? {
          timing: episode.scenes.map(
            (_, i) => ({
              start: i * demoLength,
              duration: demoLength
            })
          ),
          voice: null
        }
      : await makeVoice(
          episode,
          input.voiceAccent,
          input.voiceStyle,
          assets,
          input.voiceProvider
        );

    if(!input.demo){
      const measured=narration.timing.reduce((sum,shot)=>sum+shot.duration,0);
      if(!(measured>20))throw Error(`Narration too short (${measured.toFixed(2)}s): videos must exceed 20 seconds. Regenerate with a fuller script.`);
    }

    if(!input.demo){
      await checkpoint(job,'Checking '+(input.language==='en'?'English':'Hindi')+' pronunciation and complete narration',36);
      for(let attempt=0;attempt<2;attempt++){
        try{
          const review=await auditHindiNarration(narration.voice,episode,{requireNatural:true});
          await writeFile(join(folder,'audio-review.json'),JSON.stringify(review,null,2));break;
        }catch(error){
          await writeFile(join(folder,`audio-review-error-${attempt}.json`),JSON.stringify({error:error.message},null,2));
          if(attempt||!/^(Hindi|English) voice review did not pass/.test(error.message))throw error;
          narration=await makeVoice(episode,input.voiceAccent,input.voiceStyle,assets,input.voiceProvider);
        }
      }
    }

    await checkpoint(
      job,
      'Finding freely reusable Commons imagery',
      43
    );

    const images = new Array(episode.scenes.length).fill(null);
    const credits = [];
    const usedImages = new Set();
    let videoCount = 0, videoReservations = 0, completedMedia = 0;
    const maxVideos = strictMedia?.videos||clamp(Number(process.env.STOCK_VIDEO_MAX_SCENES) || 3, 1, 6);
    const verifyFraming=framingReviewer({run:processTool,python:process.env.PYTHON||'python3',root:ROOT,assets,fit:input.mediaFit,sourcePolicy,
      onWarning:warning=>job.warnings.push(warning),
      onReject:({id,reason})=>{const scene=Number(/^(?:video|photo|still)-(\d+)/.exec(id)?.[1]);if(Number.isFinite(scene)){const message=`Scene ${scene+1}: visual rejected: ${reason}`;if(!job.warnings.includes(message))job.warnings.push(message);}}});
    let visualPass=0;

    const prepareSceneMedia = async i => {
      job.stage=`Checking matching visual ${i+1}/${episode.scenes.length}`;
      const dest = join(
        assets,
        `image_${i}.jpg`
      );

      try {
        const scene = episode.scenes[i];
        const sceneSource=source.articles?.[scene.factIndex]||source;
        if (!input.demo && (visualPass===0||strictMedia) && input.mediaMode !== 'photos' && process.env.ENABLE_STOCK_VIDEO !== '0'
            && videoCount + videoReservations < maxVideos && scene.visual === 'video') {
          videoReservations++;
          try {
            const clip = await stockVideo(mediaVideoQuery(scene,sceneSource,topic), join(assets, `clip_${i}.mp4`), {
              instagram,scene,topic,sourcePolicy,
              used: usedImages,
              session:stockSession,
              subject:scene.subjectEntity||sceneSource.title||topic,
              seconds:narration.timing[i].duration+.75,
              creditPlacement:'description',
              inspect: async media => {
                const probe = JSON.parse(await processTool('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
                  '-show_entries', 'stream=width,height:format=duration', '-of', 'json', media.file]));
                const dimensions = probe.streams?.[0];
                const social=['Instagram','Pinterest / Nexo'].includes(media.provider);
                if (!usableVideoDimensions(dimensions?.width,dimensions?.height)) return null;
                if(social&&Number(probe.format?.duration)<narration.timing[i].duration)return null;
                const frames = join(assets, `clip_frames_${i}_${randomUUID()}`);
                await mkdir(frames, { recursive: true });
                const fps = clamp(Number(process.env.RENDER_FPS) || 24, 8, 60);
                const seconds = narration.timing[i].duration + .5;
                // Review three frames first; rejected candidates never expand
                // into hundreds of JPEGs or incur full frame-sequence work.
                const reviewPoints=[.12,.5,.85];
                const focusImages=reviewPoints.map((_,index)=>join(frames,`review-${index}.jpg`));
                // Decode once for all three review timestamps instead of
                // launching three competing decoders for the same clip.
                await processTool('ffmpeg',['-v','error','-y',...(social?[]:['-stream_loop','-1']),'-i',media.file,
                  ...reviewPoints.flatMap((fraction,index)=>[
                    '-ss',String(narration.timing[i].duration*fraction),'-frames:v','1','-an',
                    '-vf',"scale='min(960,iw)':'min(960,ih)':force_original_aspect_ratio=decrease",focusImages[index]])]);
                const framing=await verifyFraming(focusImages,scene,topic,`video-${i}-${visualPass}-${randomUUID()}`,media);
                if(!framing)return null;
                const focus=[];
                if(scene.pointOut)job.warnings.push(`Scene ${i+1}: exact pointer target is not located by local technical checks; pointer omitted`);
                await processTool('ffmpeg', ['-v', 'error', '-y', ...(social?[]:['-stream_loop','-1']), '-i', media.file,
                  '-t', String(seconds), '-an', '-vf', `fps=${fps},scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease`,
                  '-start_number', '0', join(frames, '%06d.jpg')]);
                const files=(await readdir(frames)).filter(n=>/^\d{6}\.jpg$/.test(n));
                if(files.length<2)return null;
                return { frames, fps, frameCount: files.length, width: dimensions.width, height: dimensions.height, focus,...framing };
              }
            });
            if (clip) {
              videoCount++;
              const { frames, fps, frameCount, width, height, focus,subjectFocus,mediaFit,visualReview, ...credit } = clip;
              credits.push({ ...credit, mediaType: 'video' });
              images[i] = { path: clip.file, video: true, frames, fps, frameCount, cutout: false,
                width, height,
                focus,subjectFocus,mediaFit,visualReview,
                attribution: clip.requiresAttribution ? clip.attribution : '' };
              scene.mediaUsed = 'video';
              return;
            }
          } catch (e) {
            job.warnings.push(`Scene ${i + 1}: stock video unavailable (${e.message}); trying a verified photo`);
          } finally {
            videoReservations--;
            // Keep provider/query diagnostics even when acquisition or a later
            // stage fails, without recording keys or signed download links.
            await writeFile(join(folder,`stock-search-${i}.json`),JSON.stringify(stockSession.metrics,null,2)).catch(()=>{});
          }
        }
        // Footage first; a verified photo is the allowed fallback.
        if (
          episode.scenes[i].visual === 'illustration' ||
          (
            episode.scenes[i].visual === 'diagram' &&
            episode.scenes[i].diagram?.nodes?.length >= 2
          )
        ) {
          images[i] = null;
          return;
        }

        if (input.demo) {
          if (i === 0) {
            await makeDemoArt(dest);
          }

          images[i] = {
            path: join(
              assets,
              'image_0.jpg'
            ),
            cutout: false
          };

        } else {
          let selected = null;

          const needsCutout =
            input.visualStyle === 'paper' && episode.scenes[i].visual === 'cutout';

          const queries = mediaSearchQueries(
            episode.scenes[i],
            sceneSource,
            topic
          );

          const attempts = Math.min(visualPass?2:(strictMedia?3:8),Math.max(
            1,
            Math.min(
              8,
              Number(
                process.env.IMAGE_CANDIDATES || 6
              )
            )
          ));

          for (
            let attempt = 0;
            attempt < attempts;
            attempt++
          ) {
            const search = queries[
              Math.min(
                attempt,
                queries.length - 1
              )
            ];

            let media = null;

            // The same stock provider also supplies licensed photos, which
            // avoids relying exclusively on Commons/Openverse after clip rejection.
            const tryStockPhoto=async()=>{
              try{return await stockPhoto(search,dest,{used:usedImages,session:stockSession});}
              catch(e){job.warnings.push(`Scene ${i+1}: stock photo search unavailable (${e.message})`);return null;}
            };
            if(attempt%2===0)media=await tryStockPhoto();

            if(!media)try {
              media = await commonsImage(
                search,
                dest,
                usedImages,
                {lookup:mediaLookup}
              );
            } catch {
              // Try Openverse.
            }

            if (!media) {
              try {
                media = await openverseImage(
                  search,
                  dest,
                  usedImages,
                  {lookup:mediaLookup}
                );
              } catch {
                // Try another candidate.
              }
            }

            if(!media&&attempt%2===1)media=await tryStockPhoto();
            if (!media) continue;

            usedImages.add(
              media.openverseId || media.title
            );

            let guidance = null;

            try {
              guidance=await verifyFraming([dest],scene,topic,`photo-${i}-${visualPass}-${attempt}`,media);
              if(!guidance)continue;
            } catch(e) {
              job.warnings.push(`Scene ${i+1}: local image inspection unavailable: ${e.message}`);
              continue;
            }

            if (
              needsCutout &&
              guidance?.cutoutSuitable === false &&
              attempt + 1 < attempts
            ) {
              continue;
            }

            const cutDest = join(
              assets,
              `cutout_${i}.png`
            );

            const result =
              needsCutout &&
              guidance?.cutoutSuitable !== false &&
              await tryCutout(
                dest,
                cutDest,
                {
                  ...guidance,
                  subject:
                    episode.scenes[i].visualQuery
                }
              );

            if (result?.rejected) {
              job.warnings.push(
                `Scene ${i + 1}: candidate cutout rejected (${result.rejected})`
              );
            }

            const bbox =
              result && !result.rejected
                ? result
                : null;

            if (
              needsCutout &&
              !bbox &&
              attempt + 1 < attempts
            ) {
              continue;
            }

            selected = {
              media,
              image: {
                path: bbox ? cutDest : dest,
                cutout: !!bbox,
                bbox,
                subjectFocus:guidance?.subjectFocus,mediaFit:guidance?.mediaFit,visualReview:guidance?.visualReview
              },
              guidance
            };

            break;
          }

          // A separate licensed source can supply an honest still photograph
          // when public photo search cannot find a verified image. It remains
          // a static JPEG, never an extra moving-video scene or a reused clip.
          if(!selected&&strictMedia&&visualPass>0){
            const stillSource=await stockVideo(mediaVideoQuery(scene,sceneSource,topic),join(assets,`photo_source_${i}.mp4`),{
              instagram,scene,topic,sourcePolicy,
              used:usedImages,subject:scene.subjectEntity||sceneSource.title||topic,session:stockSession,creditPlacement:'description',
              inspect:async media=>{
                const probe=JSON.parse(await processTool('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height:format=duration','-of','json',media.file]));
                const dimensions=probe.streams?.[0];
                if(!usableVideoDimensions(dimensions?.width,dimensions?.height))return null;
                const stillAt=Math.min(1,Number(probe.format?.duration)/2||.5);
                await processTool('ffmpeg',['-v','error','-y','-ss',String(stillAt),'-i',media.file,'-frames:v','1','-an','-q:v','2',dest]);
                const framing=await verifyFraming([dest],scene,topic,`still-${i}-${randomUUID()}`,media);
                return framing?{...framing,width:dimensions.width,height:dimensions.height,stillAt}:null;
              }
            });
            if(stillSource){
              const {subjectFocus,mediaFit,visualReview,width,height,stillAt,...credit}=stillSource;
              selected={media:{...credit,file:dest,mediaType:'photo',sourceMediaType:'video',sourceFrameAt:stillAt},
                image:{path:dest,cutout:false,subjectFocus,mediaFit,visualReview,width,height,
                  attribution:credit.requiresAttribution?credit.attribution:''},guidance:null};
              scene.mediaUsed='photo';
            }
          }

          if (selected) {
            credits.push(selected.media);

            const { bbox } = selected.image;

            for (
              const fx of episode.scenes[i].effects
            ) {
              if (fx.where !== 'subject') {
                continue;
              }

              const snap =
                bbox?.anchors?.[fx.type];

              if (
                snap?.trusted &&
                Array.isArray(snap.point)
              ) {
                fx.rel = snap.point;

                if (
                  Number.isFinite(snap.direction)
                ) {
                  fx.direction = snap.direction;
                }

              } else if (
                [
                  'spray',
                  'smoke',
                  'spark'
                ].includes(fx.type)
              ) {
                const previous = fx.type;

                fx.type = 'burst';
                fx.where = 'right';
                fx.text = 'THE ACTION';
                fx.rel = null;

                job.warnings.push(
                  `Scene ${i + 1}: ${previous} emitter not proven; graphic callout substituted`
                );

              } else if (
                selected.guidance?.anchors?.[fx.type]
              ) {
                fx.rel =
                  selected.guidance.anchors[fx.type];
              }
            }

            if(scene.pointOut&&!selected.image.cutout)job.warnings.push(`Scene ${i+1}: exact pointer target is not located by local technical checks; pointer omitted`);

            images[i] = selected.image;

          } else {
            // Reference jobs retry below and fail if no verified real media remains.
            images[i] = null;

            job.warnings.push(
              `No verified licensed photo for scene ${i + 1}; ${input.visualStyle==='reference-news'?'verified media retry required':'graphic fallback used'}`
            );
          }
        }
      } catch (e) {
        // Collect the failure; the reference quality gate below requires media.
        images[i] = null;

        job.warnings.push(
          `Scene ${i + 1} imagery unavailable: ${e.message}`
        );
      }
      finally {
        completedMedia++;
        job.progress=43+Math.floor(Math.min(completedMedia,episode.scenes.length)/episode.scenes.length*12);
      }
    };
    // Three mixed-media workers overlap provider/network waits; offline art is
    // sequential because its later shots share the first generated asset.
    await runSceneWorkers(episode.scenes.length,input.demo?1:mediaConcurrency,prepareSceneMedia);

    // One bounded retry for missing real media. Same generic path for all topics;
    // a rejected/missing visual must never silently become a text-only video.
    const requiresMedia=i=>!['diagram','illustration'].includes(episode.scenes[i].visual);
    if(!input.demo&&input.visualStyle==='reference-news'){
      const missing=images.map((image,i)=>!image&&requiresMedia(i)?i:-1).filter(i=>i>=0);
      if(missing.length){
        visualPass++;
        await checkpoint(job,'Retrying unverified visuals with alternate searches',55);
        await runSceneWorkers(missing.length,mediaConcurrency,async n=>{
          const i=missing[n],scene=episode.scenes[i];
          const sceneSource=source.articles?.[scene.factIndex]||source;
          const brief=await repairMediaBrief(scene,sceneSource,sceneSource.title||topic);
          await writeFile(join(folder,`media-brief-repair-${i}.json`),JSON.stringify({before:{subjectEntity:scene.subjectEntity,visualQuery:scene.visualQuery,visualRole:scene.visualRole},repair:brief},null,2));
          if(brief)Object.assign(scene,brief);
          else{
            const queries=mediaSearchQueries(scene,sceneSource,sceneSource.title||topic);
            scene.visualQuery=queries.at(-1)||scene.subjectEntity||source.title;
            scene.videoQuery=scene.visualQuery;
          }
          await prepareSceneMedia(i);
        });
      }
      const failed=images.map((image,i)=>!image&&requiresMedia(i)?i:-1).filter(i=>i>=0);
      if(failed.length)throw new QualityError('No verified licensed visual for scenes '+failed.map(i=>i+1).join(', '),[],failed);
      if(strictMedia){
        const issues=mediaBudgetIssues(images,strictMedia);
        if(issues.length)throw new QualityError('Some shots have no verified clip or fallback photo',issues);
      }
    }


    await writeFile(join(folder,'stock-performance.json'),JSON.stringify(stockSession.metrics,null,2));
    await writeFile(
      join(folder, 'episode.json'),
      JSON.stringify(
        {
          ...episode,
          research: source
        },
        null,
        2
      )
    );

    await checkpoint(
      job,
      'Finding Freesound CC0 effects',
      58
    );

    const sounds = {};
    const soundCredits = [];

    if (
      !input.demo &&
      (
        input.providerKeys.FREESOUND_API_KEY ||
        process.env.FREESOUND_API_KEY
      )
    ) {
      for (
        const effect of requiredSounds(episode,{visualStyle:input.visualStyle})
      ) {
        try {
          const intent = episode.scenes.find(
            scene => scene.soundCue === effect
          )?.sfxQuery || '';

          const item = await freesound(
            effect,
            join(
              assets,
              `sfx_${effect}.mp3`
            ),
            intent,
            {strict:input.visualStyle==='reference-news'}
          );

          const scene=episode.scenes.find(s=>s.soundCue===effect&&s.sfxReason?.length>=12);
          if(item&&input.visualStyle==='reference-news'&&(!scene||!await auditSoundCue(item.file,scene))){
            job.warnings.push(`Freesound ${effect}: relevance review failed; cue omitted`);continue;
          }
          if (item) {
            sounds[effect] = item.file;
            soundCredits.push(item);
          } else {
            job.warnings.push(
              `Freesound CC0 ${effect} missing: effect muted`
            );
          }
        } catch (e) {
          job.warnings.push(
            `Freesound ${effect}: ${e.message}`
          );
        }
      }
    }

    await writeFile(
      join(folder, 'CREDITS.json'),
      JSON.stringify(
        {
          source: job.sources,
          images: credits,
          videos: credits.filter(item => item.mediaType === 'video'),
          soundEffects: soundCredits,

          narrator: input.demo
            ? null
            : {
                provider: input.voiceProvider==='fish'?'Fish Audio':input.voiceProvider==='heygen'?'HeyGen':'Cartesia',
                ...(input.voiceProvider==='fish'?{model:FISH_FREE_MODEL,voiceId:fishVoiceId(input.language)}:{}),
                ...(input.voiceProvider==='heygen'?{model:heygenModel(),voiceId:input.providerKeys[input.language==='hi'?'HEYGEN_VOICE_HI_ID':'HEYGEN_VOICE_EN_ID']||process.env[input.language==='hi'?'HEYGEN_VOICE_HI_ID':'HEYGEN_VOICE_EN_ID']||DEFAULT_HEYGEN_VOICE,processing:heygenPerformance({},input.voiceStyle,input.language)}:{}),
                voiceAccent: input.voiceAccent,
                voiceName:
                  input.voiceProvider==='fish'?'Fish Audio '+(input.language==='en'?'English':'Hindi'):input.voiceProvider==='heygen'?(heygenSpeechMode()==='catalog'?'HeyGen catalog voice':'HeyGen Yash (Turbo Free)'):resolveVoiceProfile(
                    input.voiceAccent
                  ).name,
                profile: 'male',
                style: input.voiceStyle
              }
        },
        null,
        2
      )
    );

    await checkpoint(
      job,
      'Building dynamic paper-cutout scene plan',
      66
    );

    const output = join(
      folder,
      'video.mp4'
    );

    const plan = buildAdvancedPlan(
      episode,
      narration.timing,
      images,
      sounds,
      output,
      narration.voice,
      {
        demo: input.demo,
        visualStyle: input.demo ? 'paper' : input.visualStyle,
        mediaFit: input.mediaFit,
        backgroundPalette:
          input.backgroundPalette,

        fps: input.demo
          ? clamp(
              Number(
                process.env.DEMO_FPS
              ) || 10,
              5,
              30
            )
          : clamp(
              Number(
                process.env.RENDER_FPS
              ) || 24,
              8,
              60
            )
      }
    );

    if (input.visualStyle === 'reference-news' && !input.demo && plan.scenes.some(scene => scene.reference_media?.pointer)) {
      const pointerAssets = join(assets, 'svg-pointers');
      await preparePointerAssets(pointerAssets);
      plan.meta.pointer_assets = pointerAssets;
    }
    if (!input.demo) {
      if(input.visualStyle==='reference-news'){
        plan.meta.size=[1080,1440];plan.meta.output_size=[1080,1920];plan.meta.headline_height=62;plan.meta.template='reference-3x4';
      }
      plan.meta.headline_image = await prepareHeadlineAssets(episode.headlineText, episode.headlineHighlight, join(assets,'headline'),{compact:input.visualStyle==='reference-news'});
      await prepareExplainers(plan,assets);
      if(input.visualStyle==='reference-news')await prepareOverlayTextAssets(plan,join(assets,'shaped-labels'));
    }
    moveCreditsToDescription(plan);
    if(preparedLogo){plan.meta.logo_image=preparedLogo;plan.meta.logo_opacity=.5;}
    if(input.visualStyle==='reference-news'&&input.voiceStyle==='energetic'&&input.voiceAccent==='hi-IN-anuj'&&input.voiceProvider==='cartesia')plan.meta.voice_pitch_semitones=2;
    job.size=plan.meta.output_size||plan.meta.size||[1080,1920];
    await writeFile(
      join(folder, 'plan.json'),
      JSON.stringify(plan, null, 2)
    );

    if (
      process.env.SKIP_CONTACT_SHEET !== '1'
    ) {
      await checkpoint(
        job,
        'Inspecting scene contact sheet',
        68
      );

      try {
        await processTool(
          process.env.PYTHON || 'python3',
          [
            join(
              ROOT,
              'scripts',
              'paper_doc.py'
            ),
            'contact',
            join(folder, 'plan.json'),
            join(folder, 'qa')
          ]
        );

        job.contact = true;

      } catch (e) {
        job.warnings.push(
          `Contact sheet inspection failed: ${e.message}`
        );
      }
    }

    await checkpoint(
      job,
      'Rendering with paper-doc + FFmpeg',
      70
    );

    await processTool(
      process.env.PYTHON || 'python3',
      [
        join(
          ROOT,
          'scripts',
          'paper_doc.py'
        ),
        'render',
        join(folder, 'plan.json')
      ],
      text => {
        const matches = [
          ...text.matchAll(
            /\b(\d{1,3})% \(/g
          )
        ];

        const pct =
          matches.at(-1)?.[1];

        if (pct) {
          job.progress =
            70 +
            Math.floor(
              Number(pct) * .27
            );

          job.stage = `Rendering ${pct}%`;
        }
      }
    );

    try{job.renderPerformance=JSON.parse(await readFile(join(folder,'video.render-metrics.json'),'utf8'));}catch{/* Older renderer output has no metrics. */}
    if (
      (await stat(output)).size < 1000
    ) {
      throw Error(
        'Renderer returned an empty file'
      );
    }

    if(!input.demo&&input.visualStyle==='reference-news'){
      if(['hi','en'].includes(input.language)){
        await checkpoint(job,'Extracting exported voice for final check',98);
        const masteredVoice=join(assets,'exported-narration.wav');
        await processTool('ffmpeg',['-v','error','-y','-i',output,'-vn','-ac','1','-ar','24000',masteredVoice]);
        await checkpoint(job,'Reviewing exported voice with Gemini',98);
        const review=await auditHindiNarration(masteredVoice,episode,{requireNatural:true});
        await writeFile(join(folder,'final-audio-review.json'),JSON.stringify(review,null,2));
      }
      await checkpoint(job,'Checking exported frames in one FFmpeg pass and OpenCV',99);
      const finalReview=await reviewRenderedVideo(plan,episode,{run:processTool,python:process.env.PYTHON||'python3',root:ROOT,assets});
      await writeFile(join(folder,'quality-report.json'),JSON.stringify({
        approved:finalReview.approved,visualVerification:'local-technical-and-metadata',semanticIdentityChecked:false,mediaBudget:strictMedia,editorial:'editorial-review.json',audio:'audio-review.json',
        visuals:images.map((image,index)=>({index,review:image?.visualReview||null,fit:image?.mediaFit,subjectFocus:image?.subjectFocus})),finalReview
      },null,2));
      if(!finalReview.approved)throw new QualityError('Final video quality review did not pass: '+finalReview.issues.join('; ').slice(0,700),finalReview.issues,finalReview.indices);
    }

    // Upload title is generated from the finished episode, independently of
    // the fixed on-video headline, which keeps its existing design.
    job.youtubeTitle = job.preview?.title || episode.title;
    if (!input.demo && !job.preview) {
      try {
        const title = await gemini(`Write ONE concise, engaging YouTube Shorts upload title in ${input.language === 'hi' ? 'natural Hindi (Devanagari, a little English is fine)' : 'English'}. Base it ONLY on the actual finished narration below. Curiosity is welcome, but no invented facts, unsupported numbers or fake danger. At most 90 characters, exactly one final emoji from 😲 🤔 🔍 ⚡, no hashtags. Return JSON {"title":"..."}. Narration: ${JSON.stringify(episode.scenes.map(s=>s.narration))}`);
        if(input.language==='en'&&/[\u0900-\u097f]/u.test(title.title||''))throw Error('Upload title must be English');
        if (typeof title.title === 'string' && title.title.trim()) job.youtubeTitle = normalizeHookTitle(title.title);
      } catch { job.warnings.push('Upload-title generation unavailable; episode title provided'); }
      job.youtubeTitle = normalizeHookTitle(job.youtubeTitle);
    }
    await writeFile(join(folder, 'youtube-title.txt'), job.youtubeTitle + '\n');
    await writeFile(join(folder,'upload-description.txt'),uploadDescription([...credits,...soundCredits],job.sources));
    job.video = true;
    job.duration = plan.meta.duration;
    checkGenerationCancelled();
    job.status = 'complete';

    await checkpoint(
      job,
      'Ready to preview and download',
      100
    );

  } catch (e) {
    console.error(
      `[JOB ${job.id}] Generation failed:`,
      e
    );

    const cancelled=jobControllers.get(job.id)?.signal.aborted;
    job.error = cancelled ? null : e.message || 'Video generation failed';
    job.previewNotice = null;
    job.status = cancelled ? 'cancelled' : 'failed';
    job.video = false;

    try {
      await checkpoint(
        job,
        cancelled ? 'Cancelled' : 'Stopped with error',
        job.progress
      );
    } catch (checkpointError) {
      console.error(
        `[JOB ${job.id}] Failed to save error status:`,
        checkpointError
      );
    }

  } finally {
    jobControllers.delete(job.id);
    if (activeJob?.id === job.id) {
      activeJob = null;
      busy = false;
    }

    if (job.status !== 'running') {
      job.expiresAt = new Date(
        Date.now() + VIDEO_TTL_MS
      ).toISOString();

      try {
        await checkpoint(
          job,
          job.stage,
          job.progress
        );
      } catch (error) {
        console.error(
          '[CLEANUP] Could not save expiry:',
          error.message
        );
      }

      const cleanupTimer = setTimeout(
        () => {
          void expireJob(job.id);
        },
        VIDEO_TTL_MS + 1500
      );

      cleanupTimer.unref();
    }

    console.log(
      `[JOB ${job.id}] Finished: ${job.status}`
    );
  }
}

function sendJSON(res, status, value) {
  res.writeHead(
    status,
    {
      'Content-Type':
        'application/json; charset=utf-8',

      'Cache-Control': 'no-store'
    }
  );

  res.end(
    JSON.stringify(value)
  );
}

async function jsonBody(req) {
  const chunks=[];let size=0;

  for await (const part of req) {
    chunks.push(part);size+=part.length;

    if (size > 1_450_000) {
      throw Error('Request too large');
    }
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Error(
      'Expected JSON request body'
    );
  }
}

async function videoResponse(
  req,
  res,
  id,
  download
) {
  const path = join(
    JOBS,
    id,
    'video.mp4'
  );

  const { size } = await stat(path);
  const range = req.headers.range;

  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': 'video/mp4',

    'Content-Disposition':
      `${download ? 'attachment' : 'inline'}; filename="paper-facts-${id}.mp4"`
  };

  if (!range) {
    res.writeHead(
      200,
      {
        ...headers,
        'Content-Length': size
      }
    );

    createReadStream(path).pipe(res);
    return;
  }

  const m = /^bytes=(\d+)-(\d*)$/.exec(
    range
  );

  if (!m) {
    res.writeHead(
      416,
      {
        'Content-Range':
          `bytes */${size}`
      }
    );

    res.end();
    return;
  }

  const start = Number(m[1]);

  const end = m[2]
    ? Math.min(
        size - 1,
        Number(m[2])
      )
    : size - 1;

  if (
    start >= size ||
    end < start
  ) {
    res.writeHead(
      416,
      {
        'Content-Range':
          `bytes */${size}`
      }
    );

    res.end();
    return;
  }

  res.writeHead(
    206,
    {
      ...headers,

      'Content-Range':
        `bytes ${start}-${end}/${size}`,

      'Content-Length':
        end - start + 1
    }
  );

  createReadStream(
    path,
    {
      start,
      end
    }
  ).pipe(res);
}

async function serveAngular(
  pathname,
  res
) {
  const clean = decodeURIComponent(
    pathname
  );

  if (clean.includes('\0')) {
    return false;
  }

  const candidate = resolve(
    PUBLIC,
    '.' + clean
  );

  if (
    candidate !== PUBLIC &&
    !candidate.startsWith(PUBLIC + sep)
  ) {
    return false;
  }

  let path = candidate;

  try {
    if (
      !(await stat(path)).isFile()
    ) {
      path = join(
        PUBLIC,
        'index.html'
      );
    }
  } catch {
    path = join(
      PUBLIC,
      'index.html'
    );
  }

  try {
    const file = await stat(path);

    if (!file.isFile()) {
      return false;
    }

    const ext = path.slice(
      path.lastIndexOf('.')
    );

    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2'
    }[ext] || 'application/octet-stream';

    res.writeHead(
      200,
      {
        'Content-Type': mime,
        'Content-Length': file.size
      }
    );

    createReadStream(path).pipe(res);

    return true;
  } catch {
    return false;
  }
}

export function makeServer({frontendOrigin=ALLOWED_ORIGIN}={}) {
  return createServer(
    async (req, res) => {
      const origin = req.headers.origin;

      const allowedOrigins = new Set([
        normalizeFrontendOrigin(frontendOrigin),
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        `http://127.0.0.1:${PORT}`,
        `http://localhost:${PORT}`
      ]);

      if (
        origin &&
        !allowedOrigins.has(origin)
      ) {
        console.warn(
          'Rejected Origin:',
          origin
        );

        sendJSON(
          res,
          403,
          {
            error: 'Origin not allowed',
            code: 'ORIGIN_NOT_ALLOWED',
            receivedOrigin: origin,
            configuredFrontendOrigin: normalizeFrontendOrigin(frontendOrigin)
          }
        );

        return;
      }

      if (origin) {
        res.setHeader(
          'Access-Control-Allow-Origin',
          origin
        );

        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type'
        );

        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, OPTIONS'
        );

        res.setHeader(
          'Vary',
          'Origin'
        );
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(
        req.url,
        'http://localhost'
      );

      const jobRoute =
        /^\/api\/jobs\/([a-f\d-]{36})(?:\/(video|download|credits|episode|plan|contact|title|description|cancel|approve))?$/.exec(
          url.pathname
        );

      try {
        // HEALTH CHECK
        if (
          req.method === 'GET' &&
          url.pathname === '/api/health'
        ) {
          sendJSON(
            res,
            200,
            {
              ok: true,
              instanceId,
              resources:{...resources,memoryLimitMiB:Math.round(memoryLimit/1048576)},

              deployment: {
                frontendOrigin: normalizeFrontendOrigin(frontendOrigin),
                revision: /^[a-f0-9]{40}$/i.test(process.env.RENDER_GIT_COMMIT||'')
                  ? process.env.RENDER_GIT_COMMIT : null
              },

              demo:
                process.env.DEMO_MODE === '1',

              providers: {
                gemini:
                  !!(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY_3),

                cartesia:
                  !!process.env.CARTESIA_API_KEY,
                heygen:!!process.env.HEYGEN_API_KEY,
                fish:!!process.env.FISH_API_KEY,

                freesound:
                  !!process.env.FREESOUND_API_KEY,

                images:
                  'Wikimedia Commons'
              },

              busy,

              activeJobId:
                activeJob?.id || null
            }
          );

        } else if(req.method==='POST'&&jobRoute?.[2]==='approve'){
          if(busy){sendJSON(res,409,{error:'Another generation is running. Please wait.'});return;}
          busy=true;let started=false;
          try{
            const id=jobRoute[1];
            let job;
            try{job=jobs.get(id)||JSON.parse(await readFile(join(JOBS,id,'status.json'),'utf8'));}
            catch(error){if(error.code==='ENOENT'){sendJSON(res,404,{error:'Story not found or expired'});return;}throw error;}
            if(!['awaiting_approval','failed'].includes(job.status)||!job.preview||!Number.isFinite(Date.parse(job.expiresAt))||Date.parse(job.expiresAt)<=Date.now()){
              sendJSON(res,409,{error:'Story is no longer awaiting approval. Generate a fresh story.'});return;
            }
            const saved=JSON.parse(await readFile(join(JOBS,id,'approved-story.json'),'utf8'));
            const body=await jsonBody(req);
            let selected=saved;
            if(Array.isArray(saved.options)){
              if(!Number.isInteger(body.optionIndex)||body.optionIndex<0||body.optionIndex>=saved.options.length){sendJSON(res,400,{error:'Choose one of the displayed scripts.'});return;}
              selected={...saved,episode:saved.options[body.optionIndex].episode,optionIndex:body.optionIndex,storySnapshot:saved,retryMedia:job.status==='failed'};
              job.preview=previewEpisode(selected.episode,saved.topic,body.optionIndex);
            }
            const input=validateInput({...saved.input,providerKeys:body.providerKeys||{},previewFirst:false});
            job.status='running';job.expiresAt=null;job.error=null;job.previewNotice=null;job.warnings=[];job.cancelRequested=false;
            job.storyPreparationSeconds||=(timingSummary(job)||job.performance)?.elapsedSeconds||0;
            job._timing=undefined;
            jobs.set(id,job);activeJob=job;
            const controller=new AbortController();jobControllers.set(id,controller);
            await checkpoint(job,'Creating approved story',24);
            started=true;
            void runWithProviders(input.providerKeys,()=>runWithGeminiUsage(job.geminiUsage??={},()=>runJob(job,input,selected)),controller.signal);
            sendJSON(res,202,safeJob(job));
          }finally{if(!started){busy=false;activeJob=null;jobControllers.delete(jobRoute[1]);}}
        } else if(req.method==='POST'&&jobRoute?.[2]==='cancel'){
          const job=jobs.get(jobRoute[1]);
          if(!job){sendJSON(res,404,{error:'Job not found'});return;}
          if(job.status!=='running'){sendJSON(res,200,safeJob(job));return;}
          const controller=jobControllers.get(job.id);
          if(!controller){sendJSON(res,409,{error:'Job is stopping; retry shortly'});return;}
          job.cancelRequested=true;
          job.stage='Cancelling generation';
          controller.abort(Error('Generation cancelled by user'));
          sendJSON(res,202,safeJob(job));
        // GENERATE VIDEO
        } else if (
          req.method === 'POST' &&
          url.pathname === '/api/jobs'
        ) {
          // Reconnect to existing running job.
          if (busy) {
            if (
              activeJob &&
              activeJob.status === 'running'
            ) {
              console.log(
                `[JOB] Reconnecting to ${activeJob.id}`
              );

              sendJSON(
                res,
                202,
                {
                  ...safeJob(activeJob),
                  resumed: true
                }
              );

              return;
            }

            sendJSON(
              res,
              409,
              {
                error:
                  'Previous render is still finishing. Please wait.'
              }
            );

            return;
          }

          const input = validateInput(
            await jsonBody(req)
          );

          const id = randomUUID();

          await mkdir(
            join(JOBS, id),
            {
              recursive: true
            }
          );

          const job = {
            id,
            status: 'running',
            stage: 'Starting',
            progress: 1,
            title: '',
            topic: '',
            error: null,
            warnings: [],
            sources: [],
            video: false,
            demo: input.demo,
            size: [1080,1920]
          };

          jobs.set(id, job);

          activeJob = job;
          busy = true;
          const controller=new AbortController();
          jobControllers.set(id,controller);

          try {
            await checkpoint(
              job,
              'Starting',
              1
            );
          } catch (error) {
            activeJob = null;
            busy = false;
            jobs.delete(id);
            jobControllers.delete(id);
            throw error;
          }

          console.log(
            `[JOB ${id}] Started`
          );

          void runWithProviders(
            input.providerKeys,
            () => runWithGeminiUsage(job.geminiUsage??={},()=>runJob(job, input)),controller.signal
          );

          sendJSON(
            res,
            202,
            safeJob(job)
          );

        // JOB STATUS AND DOWNLOADS
        } else if (
          req.method === 'GET' &&
          jobRoute
        ) {
          const [
            ,
            id,
            action
          ] = jobRoute;

          let job = jobs.get(id);

          if (!job) {
            try {
              job = JSON.parse(
                await readFile(
                  join(
                    JOBS,
                    id,
                    'status.json'
                  ),
                  'utf8'
                )
              );
            } catch {
              sendJSON(
                res,
                404,
                {
                  error: 'Job not found',
                  code: 'JOB_NOT_FOUND',
                  instanceId
                }
              );

              return;
            }
          }

          if (
            job.status === 'running' &&
            activeJob?.id !== id
          ) {
            job.status = 'failed';
            job.stage = 'Render service restarted';
            job.error =
              'Render service restarted before this video finished. Please generate again.';
            job.expiresAt = new Date(
              Date.now() + VIDEO_TTL_MS
            ).toISOString();

            try {
              await writeFile(
                join(JOBS, id, 'status.json'),
                JSON.stringify(safeJob(job), null, 2)
              );
            } catch (error) {
              console.error(
                '[JOB] Could not update interrupted job:',
                error.message
              );
            }
          }

          if (!action) {
            sendJSON(
              res,
              200,
              safeJob(job)
            );

          } else if (action === 'description') {
            if(job.status!=='complete'){sendJSON(res,404,{error:'Description not ready'});return;}
            const description=await readFile(join(JOBS,id,'upload-description.txt'));
            res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="upload-description.txt"'});res.end(description);
          } else if (action === 'title') {
            if (job.status !== 'complete') { sendJSON(res, 404, {error:'Upload title not ready'}); return; }
            const title = await readFile(join(JOBS,id,'youtube-title.txt'));
            res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="youtube-title.txt"'});
            res.end(title);
          } else if (
            action === 'credits'
          ) {
            const credits = await readFile(
              join(
                JOBS,
                id,
                'CREDITS.json'
              )
            );

            res.writeHead(
              200,
              {
                'Content-Type':
                  'application/json',

                'Content-Disposition':
                  'attachment; filename="CREDITS.json"'
              }
            );

            res.end(credits);

          } else if (
            action === 'episode' ||
            action === 'plan'
          ) {
            if (!job.video) {
              sendJSON(
                res,
                404,
                {
                  error:
                    'Storyboard not ready'
                }
              );

              return;
            }

            const json = await readFile(
              join(
                JOBS,
                id,
                `${
                  action === 'episode'
                    ? 'episode'
                    : 'plan'
                }.json`
              )
            );

            res.writeHead(
              200,
              {
                'Content-Type':
                  'application/json',

                'Content-Disposition':
                  `attachment; filename="paper-facts-${action}.json"`
              }
            );

            res.end(json);

          } else if (
            action === 'contact'
          ) {
            if (!job.contact) {
              sendJSON(
                res,
                404,
                {
                  error:
                    'Contact sheet not ready'
                }
              );

              return;
            }

            const path = join(
              JOBS,
              id,
              'qa',
              'video_contact.jpg'
            );

            const file = await stat(path);

            res.writeHead(
              200,
              {
                'Content-Type':
                  'image/jpeg',

                'Content-Length':
                  file.size,

                'Cache-Control':
                  'private, max-age=600'
              }
            );

            createReadStream(path).pipe(res);

          } else if (job.video) {
            await videoResponse(
              req,
              res,
              id,
              action === 'download'
            );

          } else {
            sendJSON(
              res,
              404,
              {
                error:
                  'Video not ready'
              }
            );
          }

        // SERVE ANGULAR
        } else if (
          req.method === 'GET' &&
          !url.pathname.startsWith('/api/') &&
          await serveAngular(
            url.pathname,
            res
          )
        ) {
          // Angular assets served successfully.

        } else {
          sendJSON(
            res,
            404,
            {
              error: 'Not found'
            }
          );
        }

      } catch (e) {
        console.error(
          '[SERVER ERROR]',
          e
        );

        const status =
          /Invalid|missing|too long|Expected|disabled|Topic/.test(
            e.message
          )
            ? 400
            : 500;

        sendJSON(
          res,
          status,
          {
            error: e.message
          }
        );
      }
    }
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  await mkdir(
    JOBS,
    {
      recursive: true
    }
  );

  // Serve health immediately; expired assets are cleaned in the background.
  void cleanExpiredJobs().catch(error=>console.error('[CLEANUP] Startup cleanup failed:',error.message));

  const cleanupInterval = setInterval(
    () => {
      void cleanExpiredJobs();
    },
    60_000
  );

  cleanupInterval.unref();

  makeServer().listen(
    PORT,
    HOST,
    () => {
      console.log(
        `Paper Facts API http://${HOST}:${PORT}`
      );
    }
  );
}
