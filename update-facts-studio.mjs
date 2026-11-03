import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const changes = new Map();

async function load(name) {
  if (changes.has(name)) {
    return changes.get(name);
  }

  return readFile(join(ROOT, name), 'utf8');
}

function replaceOne(source, before, after, label) {
  const index = source.indexOf(before);

  if (index === -1) {
    throw new Error(
      'Could not find ' + label +
      '. Check that you are using the uploaded v9 project.'
    );
  }

  return (
    source.slice(0, index) +
    after +
    source.slice(index + before.length)
  );
}

function replaceRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error('Could not find ' + label);
  }

  return source.replace(pattern, replacement);
}

async function update(name, transform) {
  let source = await load(name);
  source = transform(source);
  changes.set(name, source);
}

async function main() {
  console.log('Updating Paper Facts Studio v9...');

  // =====================================================
  // 1. PROVIDER KEYS FOR EACH RENDER
  // =====================================================

  await update('studio/lib/core.mjs', source => {
    source = replaceOne(
      source,
      "import { writeFile, readFile } from 'node:fs/promises';",
      "import { writeFile, readFile } from 'node:fs/promises';\n" +
      "import { AsyncLocalStorage } from 'node:async_hooks';",
      'core imports'
    );

    source = replaceOne(
      source,
      "import { normalizeDirective } from './director.mjs';",
      `import { normalizeDirective } from './director.mjs';

const providerScope = new AsyncLocalStorage();

export function runWithProviders(keys, operation) {
  return providerScope.run(keys || {}, operation);
}

function providerValue(name) {
  const supplied = providerScope.getStore()?.[name];

  if (typeof supplied === 'string' && supplied.trim()) {
    return supplied.trim();
  }

  return process.env[name] || '';
}`,
      'provider context'
    );

    const providerPattern =
      /process\.env\.(GEMINI_API_KEY|GEMINI_MODEL|CARTESIA_API_KEY|CARTESIA_MODEL|CARTESIA_VERSION|FREESOUND_API_KEY)\b/g;

    source = source.replace(
      providerPattern,
      (_, name) => "providerValue('" + name + "')"
    );

    return source;
  });

  // =====================================================
  // 2. BACKEND: KEYS, CLEANUP, RETRIES
  // =====================================================

  await update('studio/server.mjs', source => {
    source = replaceOne(
      source,
      '  copyFile\n} from \'node:fs/promises\';',
      '  copyFile,\n  rm\n} from \'node:fs/promises\';',
      'server filesystem import'
    );

    source = replaceOne(
      source,
      "  resolveVoiceProfile\n} from './lib/core.mjs';",
      "  resolveVoiceProfile,\n  runWithProviders\n} from './lib/core.mjs';",
      'server provider import'
    );

    // Ten-minute retention.
    source = replaceOne(
      source,
      'const jobs = new Map();',
      `const jobs = new Map();

const VIDEO_TTL_MS = 10 * 60 * 1000;

async function expireJob(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return;
  }

  const folder = join(JOBS, id);
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
}`,
      'job retention setup'
    );

    // Include expiry information in API responses.
    source = replaceOne(
      source,
      '    video: !!video,',
      `    video: !!video,
    expiresAt: job.expiresAt || null,`,
      'safe job expiry'
    );

    // Accept keys supplied by the Settings page.
    source = replaceOne(
      source,
      '  const demo = data.demo === true;',
      `  const demo = data.demo === true;

  const rawKeys = data.providerKeys || {};

  if (
    typeof rawKeys !== 'object' ||
    Array.isArray(rawKeys)
  ) {
    throw Error('Invalid provider settings');
  }

  const providerKeys = {};

  const allowedKeys = [
    'GEMINI_API_KEY',
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
  }`,
      'input provider keys'
    );

    // Freesound is optional.
    source = replaceOne(
      source,
      `  if (
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
  }`,
      `  if (
    !demo &&
    (
      !(providerKeys.GEMINI_API_KEY || process.env.GEMINI_API_KEY) ||
      !(providerKeys.CARTESIA_API_KEY || process.env.CARTESIA_API_KEY)
    )
  ) {
    throw Error(
      'Gemini and Cartesia keys are required. Open API Settings.'
    );
  }`,
      'required API validation'
    );

    source = replaceOne(
      source,
      `    demo
  };
}

// Executes Python`,
      `    demo,
    providerKeys
  };
}

// Executes Python`,
      'provider keys in validated input'
    );

    // Do not show six warnings for the same scene.
    source = replaceRegex(
      source,
      /job\.warnings\.push\(\s*`Scene \$\{i \+ 1\}: photo candidate \$\{attempt \+ 1\} not verified as '\$\{episode\.scenes\[i\]\.subjectEntity\}'; retrying`\s*\);/,
      '// Candidate rejected; silently try the next image.',
      'repeated image warning'
    );

    // Skip Freesound if no key was supplied.
    source = replaceOne(
      source,
      '    if (!input.demo) {\n      for (\n        const effect of requiredSounds(episode)',
      `    if (
      !input.demo &&
      (
        input.providerKeys.FREESOUND_API_KEY ||
        process.env.FREESOUND_API_KEY
      )
    ) {
      for (
        const effect of requiredSounds(episode)`,
      'optional Freesound'
    );

    // Run provider calls inside the current job's key context.
    source = replaceOne(
      source,
      `          void runJob(
            job,
            input
          );`,
      `          void runWithProviders(
            input.providerKeys,
            () => runJob(job, input)
          );`,
      'job provider context'
    );

    // Save expiry when render finishes or fails.
    source = replaceOne(
      source,
      `    console.log(
      \`[JOB \${job.id}] Finished: \${job.status}\`
    );
  }
}

function sendJSON`,
      `    if (job.status !== 'running') {
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
      \`[JOB \${job.id}] Finished: \${job.status}\`
    );
  }
}

function sendJSON`,
      'job completion cleanup'
    );

    // If Render restarted, old running jobs cannot continue.
    source = replaceOne(
      source,
      `          if (!action) {
            sendJSON(`,
      `          if (
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
            sendJSON(`,
      'interrupted render detection'
    );

    // Periodically remove expired jobs, including after restarts.
    source = replaceOne(
      source,
      `  makeServer().listen(
    PORT,`,
      `  await cleanExpiredJobs();

  const cleanupInterval = setInterval(
    () => {
      void cleanExpiredJobs();
    },
    60_000
  );

  cleanupInterval.unref();

  makeServer().listen(
    PORT,`,
      'startup cleanup'
    );

    return source;
  });

  // =====================================================
  // 3. FRONTEND: COMPLETE SETTINGS + RETRY LOGIC
  // =====================================================

  await update('web/src/app/app.component.ts', source => {
    source = replaceOne(
      source,
      "import { HttpClient } from '@angular/common/http';",
      "import { HttpClient } from '@angular/common/http';\n" +
      "import { timeout } from 'rxjs';",
      'Angular timeout import'
    );

    source = replaceOne(
      source,
      '  videoUrl: string | null; downloadUrl: string | null; duration?: number;',
      '  videoUrl: string | null; downloadUrl: string | null; duration?: number; expiresAt?: string;',
      'job expiry type'
    );

    source = replaceOne(
      source,
      '  ok: boolean; demo: boolean; busy: boolean;',
      '  ok: boolean; demo: boolean; busy: boolean; activeJobId?: string | null;',
      'health job ID type'
    );

    const settingsMarkup = `
      <div class="settings-nav">
        <button
          class="secondary"
          (click)="showSettings = !showSettings">
          {{ showSettings ? '← BACK TO STUDIO' : '⚙ API SETTINGS' }}
        </button>
      </div>

      <section
        *ngIf="showSettings"
        class="panel settings-panel">

        <h2>API Settings</h2>

        <p>
          Keys are saved only in this browser's localStorage.
          Gemini and Cartesia are required.
          Freesound is optional.
        </p>

        <label>GEMINI API KEY (REQUIRED)</label>
        <input
          type="password"
          [(ngModel)]="settings.GEMINI_API_KEY"
          autocomplete="off"
          placeholder="Gemini API key">

        <label>CARTESIA API KEY (REQUIRED)</label>
        <input
          type="password"
          [(ngModel)]="settings.CARTESIA_API_KEY"
          autocomplete="off"
          placeholder="Cartesia API key">

        <label>FREESOUND API KEY (OPTIONAL)</label>
        <input
          type="password"
          [(ngModel)]="settings.FREESOUND_API_KEY"
          autocomplete="off"
          placeholder="Optional Freesound key">

        <label>GEMINI MODEL (OPTIONAL)</label>
        <input
          [(ngModel)]="settings.GEMINI_MODEL"
          placeholder="Leave blank for server default">

        <label>CARTESIA MODEL (OPTIONAL)</label>
        <input
          [(ngModel)]="settings.CARTESIA_MODEL"
          placeholder="Leave blank for server default">

        <label>CARTESIA VERSION (OPTIONAL)</label>
        <input
          [(ngModel)]="settings.CARTESIA_VERSION"
          placeholder="Leave blank for server default">

        <button
          class="primary"
          (click)="saveSettings()">
          SAVE SETTINGS
        </button>

        <button
          class="secondary"
          (click)="clearSettings()">
          CLEAR SAVED KEYS
        </button>

        <p class="config">
          Do not save API keys on shared computers.
          Browser localStorage is not encrypted.
        </p>
      </section>
`;

    source = replaceOne(
      source,
      '      <main class="workspace">',
      settingsMarkup +
      '      <main class="workspace" *ngIf="!showSettings">',
      'settings page markup'
    );

    source = replaceOne(
      source,
      '<p *ngIf="health && !allConfigured()" class="config">Add Gemini, Cartesia and Freesound keys to <code>studio/.env</code> to enable live generation.</p>',
      '<p *ngIf="!allConfigured()" class="config">Enter Gemini and Cartesia keys in API Settings, or configure them on the backend.</p>',
      'frontend key instructions'
    );

    const classStart = source.indexOf(
      'export class AppComponent implements OnInit, OnDestroy {'
    );

    if (classStart === -1) {
      throw new Error('Could not find Angular AppComponent class');
    }

    // Replace the whole class, preserving the original template.
    const newClass = String.raw`
export class AppComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  private pollTimer?: ReturnType<typeof setInterval>;
  private polling = false;
  private disconnectCount = 0;

  health: Health | null = null;
  job: Job | null = null;

  topic = '';
  voiceAccent = 'hi-IN-ayush';
  voiceStyle = 'energetic';
  humorIntensity = 'cheeky';
  backgroundPalette = 'random';
  seconds = 25;

  error = '';
  working = false;
  showSettings = false;

  settings: Record<string, string> = {
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    CARTESIA_API_KEY: '',
    CARTESIA_MODEL: '',
    CARTESIA_VERSION: '',
    FREESOUND_API_KEY: ''
  };

  ngOnInit(): void {
    this.loadSettings();

    this.http.get<Health>('/api/health').subscribe({
      next: health => {
        this.health = health;

        if (health.activeJobId) {
          this.working = true;
          this.startPolling(health.activeJobId);
        }
      },
      error: () => {
        this.error =
          'Backend connection unavailable. Check Render deployment.';
      }
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private loadSettings(): void {
    try {
      const saved = JSON.parse(
        localStorage.getItem('paperdoc_api_settings') || '{}'
      );

      for (const key of Object.keys(this.settings)) {
        if (typeof saved[key] === 'string') {
          this.settings[key] = saved[key];
        }
      }
    } catch {
      // Ignore invalid browser storage.
    }
  }

  saveSettings(): void {
    try {
      localStorage.setItem(
        'paperdoc_api_settings',
        JSON.stringify(this.settings)
      );

      this.showSettings = false;
      this.error = '';
    } catch {
      this.error = 'Could not save settings in this browser.';
    }
  }

  clearSettings(): void {
    localStorage.removeItem('paperdoc_api_settings');

    for (const key of Object.keys(this.settings)) {
      this.settings[key] = '';
    }
  }

  allConfigured(): boolean {
    const gemini =
      this.settings['GEMINI_API_KEY'] ||
      this.health?.providers.gemini;

    const cartesia =
      this.settings['CARTESIA_API_KEY'] ||
      this.health?.providers.cartesia;

    return !!(gemini && cartesia);
  }

  generate(demo: boolean): void {
    if (this.working) {
      return;
    }

    if (!demo && !this.allConfigured()) {
      this.showSettings = true;
      this.error = 'Please configure Gemini and Cartesia.';
      return;
    }

    this.error = '';
    this.job = null;
    this.working = true;
    this.disconnectCount = 0;

    this.stopPolling();

    this.http.post<Job>(
      '/api/jobs',
      {
        topic: this.topic,
        voiceAccent: this.voiceAccent,
        voiceStyle: this.voiceStyle,
        humorIntensity: this.humorIntensity,
        backgroundPalette: this.backgroundPalette,
        seconds: this.seconds,
        demo,
        providerKeys: { ...this.settings }
      }
    ).pipe(
      timeout(20000)
    ).subscribe({
      next: job => {
        this.job = job;
        this.startPolling(job.id);
      },

      error: error => {
        this.working = false;

        this.error =
          error.error?.error ||
          'Could not start the render. Please retry.';
      }
    });
  }

  private startPolling(id: string): void {
    this.stopPolling();

    this.working = true;
    this.disconnectCount = 0;

    this.pollTimer = setInterval(
      () => this.refresh(id),
      1500
    );

    this.refresh(id);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private refresh(id: string): void {
    if (this.polling) {
      return;
    }

    this.polling = true;

    this.http.get<Job>(
      '/api/jobs/' + id
    ).pipe(
      timeout(12000)
    ).subscribe({
      next: job => {
        this.polling = false;
        this.disconnectCount = 0;

        this.job = job;
        this.error = '';

        if (job.status === 'running') {
          return;
        }

        this.working = false;
        this.stopPolling();

        if (job.status === 'failed') {
          this.error =
            job.error || 'Video generation failed.';
        }
      },

      error: response => {
        this.polling = false;

        if (response.status === 404) {
          this.working = false;
          this.stopPolling();

          this.error =
            'Job not found. It may have expired or the service restarted.';

          return;
        }

        this.disconnectCount++;

        if (this.disconnectCount >= 120) {
          this.working = false;
          this.stopPolling();

          this.error =
            'Render service has been unavailable for too long. Check Render logs.';

          return;
        }

        this.error =
          'Render connection interrupted. Automatically reconnecting...';
      }
    });
  }
}
`;

    return source.slice(0, classStart) + newClass.trimStart();
  });

  // =====================================================
  // 4. RENDERING MEMORY OPTIMIZATION
  // =====================================================

  await update('scripts/paper_doc.py', source => {
    source = replaceOne(
      source,
      'SS = 2',
      `SS = max(1, min(2, int(os.getenv("PAPERDOC_SS", "2"))))`,
      'Python supersampling'
    );

    source = replaceOne(
      source,
      '"-preset", "medium", "-crf", "17"',
      `"-preset", os.getenv("PAPERDOC_PRESET", "medium"),
                                "-crf", os.getenv("PAPERDOC_CRF", "17")`,
      'Python FFmpeg preset'
    );

    return source;
  });

  // =====================================================
  // 5. SAVE ALL CHANGES
  // =====================================================

  console.log('All replacement patterns found.');

  for (const [name, content] of changes) {
    await writeFile(
      join(ROOT, name),
      content,
      'utf8'
    );

    console.log('Updated:', name);
  }

  console.log('');
  console.log('Update completed.');
  console.log('Next: check syntax and build Angular.');
}

main().catch(error => {
  console.error('');
  console.error('UPDATE FAILED:', error.message);
  process.exitCode = 1;
});