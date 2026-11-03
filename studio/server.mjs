
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
  copyFile
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';

import {
  chooseTopic,
  wikipediaSource,
  writeEpisode,
  commonsImage,
  openverseImage,
  freesound,
  cartesiaVoice,
  demoEpisode,
  clamp,
  inspectImage,
  auditCutout,
  mediaSearchQueries,
  resolveVoiceProfile
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

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4300);

const ALLOWED_ORIGIN =
  process.env.FRONTEND_ORIGIN || 'http://localhost:4200';

// Only one video is generated at a time.
let busy = false;
let activeJob = null;

const jobs = new Map();

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
    status,
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
  job.stage = stage;
  job.progress = progress;

  await writeFile(
    join(JOBS, job.id, 'status.json'),
    JSON.stringify(safeJob(job), null, 2)
  );
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
    (data.language === 'en' ? 'en-US' : 'hi-IN-ayush')
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
    : 'cheeky';

  const backgroundPalette = [
    'white',
    'black',
    'random'
  ].includes(data.backgroundPalette)
    ? data.backgroundPalette
    : 'random';

  const seconds = clamp(
    Number(data.seconds) || 25,
    15,
    50
  );

  const demo = data.demo === true;

  if (demo && process.env.DEMO_MODE !== '1') {
    throw Error('Demo mode disabled');
  }

  if (
    !demo &&
    (
      !process.env.GEMINI_API_KEY ||
      !process.env.CARTESIA_API_KEY ||
      !process.env.FREESOUND_API_KEY
    )
  ) {
    throw Error(
      'Set GEMINI_API_KEY, CARTESIA_API_KEY and FREESOUND_API_KEY in studio/.env'
    );
  }

  return {
    topic,
    language,
    seconds,
    voiceAccent: voice.key,
    voiceStyle,
    humorIntensity,
    backgroundPalette,
    demo
  };
}

// Executes Python and FFmpeg with a configurable timeout.
function processTool(command, args, onText) {
  return new Promise((resolveJob, rejectJob) => {
    const configuredMinutes = Number(
      process.env.RENDER_PROCESS_TIMEOUT_MINUTES || 45
    );

    const timeoutMinutes = Number.isFinite(
      configuredMinutes
    )
      ? Math.max(1, Math.min(180, configuredMinutes))
      : 45;

    const timeoutMs = timeoutMinutes * 60 * 1000;

    let log = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });

    let timer;

    const finish = (error, result) => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);

      if (error) {
        rejectJob(error);
      } else {
        resolveJob(result);
      }
    };

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

        if (typeof onText === 'function') {
          onText(chunk);
        }
      });
    }

    child.on('error', error => {
      finish(error);
    });

    child.on('close', code => {
      if (timedOut) {
        finish(
          Error(
            `${command} timed out after ${timeoutMinutes} minutes`
          )
        );
        return;
      }

      if (code === 0) {
        finish(null, log);
        return;
      }

      finish(
        Error(
          `${command} exited ${code}: ${log.slice(-900)}`
        )
      );
    });
  });
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

async function makeVoice(
  episode,
  voiceAccent,
  voiceStyle,
  folder
) {
  const files = [];
  const timing = [];

  let t = 0;

  for (let i = 0; i < episode.scenes.length; i++) {
    const path = join(
      folder,
      `voice_${String(i).padStart(2, '0')}.wav`
    );

    const raw = join(
      folder,
      `voice_${String(i).padStart(2, '0')}_raw.wav`
    );

    await cartesiaVoice(
      episode.scenes[i].narration,
      voiceAccent,
      raw,
      episode.scenes[i],
      voiceStyle
    );

    await processTool(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        raw,

        '-af',
        'silenceremove=start_periods=1:start_duration=0:start_threshold=-42dB:stop_periods=-1:stop_duration=0.31:stop_threshold=-42dB,apad=pad_dur=0.05',

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

    files.push(path);

    timing.push({
      start: t,
      duration: seconds
    });

    t += seconds;
  }

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
    voiceAccent.startsWith('hi-IN') &&
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

  filters.push(
    'acompressor=threshold=0.11:ratio=2.8:attack=5:release=90:makeup=1.6',
    'loudnorm=I=-16:LRA=9:TP=-1.5',
    'alimiter=limit=0.96'
  );

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

    if (process.env.GEMINI_CUTOUT_QA !== '0') {
      try {
        const check = await auditCutout(
          img,
          dest,
          guidance?.subject || 'main subject'
        );

        if (
          !check.usable &&
          check.confidence >= .7
        ) {
          if (
            /edge|halo|outline|fring|border/i.test(
              check.reason || ''
            ) &&
            !/missing|cut.off|erased|lost (?:a |the )?(?:tail|leg|fin|wing)/i.test(
              check.reason || ''
            )
          ) {
            const tightened = dest.replace(
              /\.png$/,
              '_tight.png'
            );

            const secondArgs = [
              join(DIR, 'prepare_cutout.py'),
              img,
              tightened
            ];

            const oldSpec = dest.replace(
              /\.png$/,
              '.anchors.json'
            );

            if (guidance?.anchors) {
              secondArgs.push(oldSpec);
            }

            secondArgs.push('--edge-trim=2');

            try {
              await processTool(
                process.env.PYTHON || 'python3',
                secondArgs
              );

              const review = await auditCutout(
                img,
                tightened,
                guidance?.subject || 'main subject'
              );

              if (
                review.usable ||
                review.confidence < .7
              ) {
                const good = JSON.parse(
                  await readFile(
                    tightened.replace(
                      /\.png$/,
                      '.bbox.json'
                    ),
                    'utf8'
                  )
                );

                await copyFile(
                  tightened,
                  dest
                );

                await copyFile(
                  tightened.replace(
                    /\.png$/,
                    '.bbox.json'
                  ),
                  dest.replace(
                    /\.png$/,
                    '.bbox.json'
                  )
                );

                return good;
              }
            } catch {
              // Preserve original rejection.
            }
          }

          return {
            rejected:
              check.reason || 'incomplete cutout'
          };
        }
      } catch {
        // Continue using segmentation mask QA.
      }
    }

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

async function runJob(job, input) {
  const folder = join(JOBS, job.id);
  const assets = join(folder, 'assets');

  try {
    await mkdir(assets, {
      recursive: true
    });

    await checkpoint(
      job,
      'Selecting and researching topic',
      5
    );

    const topic = input.demo
      ? 'Octopus'
      : (
          input.topic ||
          await chooseTopic()
        );

    job.topic = topic;

    const source = input.demo
      ? {
          title: 'Offline demonstration',
          url: null
        }
      : await wikipediaSource(topic);

    await checkpoint(
      job,
      'Writing sourced facts storyboard with Gemini Lite',
      15
    );

    const episode = input.demo
      ? demoEpisode()
      : await writeEpisode(
          topic,
          source,
          input.language,
          input.seconds,
          input.humorIntensity
        );

    job.title = episode.title;

    job.sources = source.url
      ? [
          {
            name: source.title,
            url: source.url
          }
        ]
      : [];

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
      'Preparing Cartesia narrator audio',
      25
    );

    const demoLength = clamp(
      Number(
        process.env.DEMO_SCENE_SECONDS
      ) || 1.8,
      .7,
      4
    );

    const narration = input.demo
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
          assets
        );

    await checkpoint(
      job,
      'Finding freely reusable Commons imagery',
      43
    );

    const images = [];
    const credits = [];
    const usedImages = new Set();

    for (
      let i = 0;
      i < episode.scenes.length;
      i++
    ) {
      const dest = join(
        assets,
        `image_${i}.jpg`
      );

      try {
        if (
          episode.scenes[i].visual === 'illustration' ||
          (
            episode.scenes[i].visual === 'diagram' &&
            episode.scenes[i].diagram?.nodes?.length >= 2
          )
        ) {
          images.push(null);
          continue;
        }

        if (input.demo) {
          if (i === 0) {
            await makeDemoArt(dest);
          }

          images.push({
            path: join(
              assets,
              'image_0.jpg'
            ),
            cutout: false
          });

        } else {
          let selected = null;

          const needsCutout =
            episode.scenes[i].visual === 'cutout';

          const queries = mediaSearchQueries(
            episode.scenes[i],
            source,
            topic
          );

          const attempts = Math.max(
            1,
            Math.min(
              8,
              Number(
                process.env.IMAGE_CANDIDATES || 6
              )
            )
          );

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

            try {
              media = await commonsImage(
                search,
                dest,
                usedImages
              );
            } catch {
              // Try Openverse.
            }

            if (!media) {
              try {
                media = await openverseImage(
                  search,
                  dest,
                  usedImages
                );
              } catch {
                // Try another candidate.
              }
            }

            if (!media) {
              continue;
            }

            usedImages.add(
              media.openverseId || media.title
            );

            let guidance = null;

            if (
              process.env.GEMINI_IMAGE_QA !== '0'
            ) {
              try {
                guidance = await inspectImage(
                  dest,
                  episode.scenes[i].subjectEntity ||
                    episode.scenes[i].visualQuery,
                  episode.scenes[i].narration,
                  episode.scenes[i].effects,
                  {
                    visualRole:
                      episode.scenes[i].visualRole,
                    topic
                  }
                );

                if (
                  !guidance.matches ||
                  guidance.confidence < .65
                ) {
                  job.warnings.push(
                    `Scene ${i + 1}: photo candidate ${attempt + 1} not verified as '${episode.scenes[i].subjectEntity}'; retrying`
                  );

                  continue;
                }
              } catch (e) {
                job.warnings.push(
                  `Scene ${i + 1}: image inspection unavailable: ${e.message}`
                );

                if (
                  process.env.STRICT_IMAGE_QA !== '0'
                ) {
                  continue;
                }
              }
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
                bbox
              },
              guidance
            };

            break;
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

            images.push(selected.image);

          } else {
            // Missing photo is not a fatal error.
            images.push(null);

            job.warnings.push(
              `No usable CC0/CC BY image for scene ${i + 1}; graphic fallback used`
            );
          }
        }
      } catch (e) {
        // Continue with graphic fallback.
        images.push(null);

        job.warnings.push(
          `Scene ${i + 1} imagery unavailable: ${e.message}`
        );
      }
    }

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

    if (!input.demo) {
      for (
        const effect of requiredSounds(episode)
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
            intent
          );

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
          soundEffects: soundCredits,

          narrator: input.demo
            ? null
            : {
                provider: 'Cartesia',
                voiceAccent: input.voiceAccent,
                voiceName:
                  resolveVoiceProfile(
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
              ) || 30,
              8,
              60
            )
      }
    );

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

    if (
      (await stat(output)).size < 1000
    ) {
      throw Error(
        'Renderer returned an empty file'
      );
    }

    job.video = true;
    job.duration = plan.meta.duration;
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

    job.error =
      e.message || 'Video generation failed';

    job.status = 'failed';

    try {
      await checkpoint(
        job,
        'Stopped with error',
        job.progress
      );
    } catch (checkpointError) {
      console.error(
        `[JOB ${job.id}] Failed to save error status:`,
        checkpointError
      );
    }

  } finally {
    if (activeJob?.id === job.id) {
      activeJob = null;
      busy = false;
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
  let body = '';

  for await (const part of req) {
    body += part;

    if (body.length > 16_000) {
      throw Error('Request too large');
    }
  }

  try {
    return JSON.parse(body);
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

export function makeServer() {
  return createServer(
    async (req, res) => {
      const origin = req.headers.origin;

      const allowedOrigins = new Set([
        ALLOWED_ORIGIN,
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
            error: 'Origin not allowed'
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
        /^\/api\/jobs\/([a-f\d-]{36})(?:\/(video|download|credits|episode|plan|contact))?$/.exec(
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

              demo:
                process.env.DEMO_MODE === '1',

              providers: {
                gemini:
                  !!process.env.GEMINI_API_KEY,

                cartesia:
                  !!process.env.CARTESIA_API_KEY,

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
            demo: input.demo
          };

          jobs.set(id, job);

          activeJob = job;
          busy = true;

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
            throw error;
          }

          console.log(
            `[JOB ${id}] Started`
          );

          void runJob(
            job,
            input
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
                  error: 'Job not found'
                }
              );

              return;
            }
          }

          if (!action) {
            sendJSON(
              res,
              200,
              safeJob(job)
            );

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
