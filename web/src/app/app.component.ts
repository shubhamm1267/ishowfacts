import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';

interface Job {
  id: string; status: 'running' | 'failed' | 'complete'; stage: string; progress: number;
  title: string; topic: string; category?: string; error?: string; warnings: string[]; demo?: boolean;
  youtubeTitle?: string; uploadTitleUrl?: string; uploadDescriptionUrl?: string;
  size?: [number,number];
  videoUrl: string | null; downloadUrl: string | null; duration?: number; expiresAt?: string;
  storyboardUrl: string | null; animationPlanUrl: string | null; contactUrl: string | null;
  sources: { name: string; url: string }[];
}
interface Health {
  ok: boolean; demo: boolean; busy: boolean; activeJobId?: string | null;
  providers: { gemini: boolean; cartesia: boolean; heygen?:boolean; fish?:boolean; freesound: boolean; images: string };
}

@Component({
  selector: 'app-root', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <div class="grain"></div>
    <div class="layout">
      <header class="topbar">
        <div class="logo"><span class="logo-mark">P<span class="dot">.</span></span><div><strong>PAPER FACTS</strong><small>CINEMATIC DYNAMIC STUDIO / V8</small></div></div>
        <span class="top-pill"><i></i> {{ health?.ok ? 'LOCAL ENGINE ONLINE' : 'ENGINE DISCONNECTED' }}</span>
      </header>

      <section class="hero">
        <div><span class="eyebrow">THE AUTOMATIC DOCUMENTARY WORKSHOP</span>
          <h1>Interesting facts.<br><em>Beautifully</em> told.</h1>
          <p>From a curious thought to a cinematic paper-cutout Short — research, narration, illustration, sound, and final render in one flow.</p>
        </div>
        <div class="hero-decoration"><div class="paper paper-back"></div><div class="paper paper-front"><span>FILE / 001</span><b>THE WORLD<br>IS WEIRD.</b><div class="art">✳</div><span>100% CURIOUS</span></div></div>
      </section>


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
          Gemini and your selected voice provider are required.
          Freesound is optional.
        </p>

        <label>GEMINI API KEY (REQUIRED)</label>
        <input
          type="password"
          [(ngModel)]="settings.GEMINI_API_KEY"
          autocomplete="off"
          placeholder="Gemini API key">

        <label>GEMINI BACKUP KEY 2 (OPTIONAL)</label>
        <input type="password" [(ngModel)]="settings.GEMINI_API_KEY_2" autocomplete="off" placeholder="Used if primary fails">
        <label>GEMINI BACKUP KEY 3 (OPTIONAL)</label>
        <input type="password" [(ngModel)]="settings.GEMINI_API_KEY_3" autocomplete="off" placeholder="Used if key 2 also fails">
        <label>FISH AUDIO API KEY</label>
        <input type="password" [(ngModel)]="settings.FISH_API_KEY" autocomplete="off" placeholder="Fish Audio API key">
        <label>FISH AUDIO VOICE ID (OPTIONAL)</label>
        <input [(ngModel)]="settings.FISH_VOICE_ID" placeholder="Server default Hindi voice">
        <label>HEYGEN API KEY (ALTERNATIVE PROVIDER)</label>
        <input type="password" [(ngModel)]="settings.HEYGEN_API_KEY" autocomplete="off" placeholder="HeyGen API key">
        <label>HEYGEN HINDI VOICE ID (OPTIONAL)</label>
        <input [(ngModel)]="settings.HEYGEN_VOICE_HI_ID" placeholder="Default: Yash">
        <label>HEYGEN HINDI PITCH (SEMITONES, OPTIONAL)</label>
        <input type="number" min="-3" max="3" step="0.1" [ngModel]="settings.HEYGEN_PITCH_SEMITONES" (ngModelChange)="settings.HEYGEN_PITCH_SEMITONES = $event == null ? '' : '' + $event" placeholder="Server default">
        <label>HEYGEN HINDI SPEED (OPTIONAL)</label>
        <input type="number" min="0.95" max="1.2" step="0.01" [ngModel]="settings.HEYGEN_TEMPO" (ngModelChange)="settings.HEYGEN_TEMPO = $event == null ? '' : '' + $event" placeholder="Server default">
        <p class="config">Energetic Hindi only. Pitch −3 to +3; speed 0.95–1.20. Leave blank for the tested server preset. Pitch changes preserve vocal formants.</p>
        <label>CARTESIA API KEY (ALTERNATIVE PROVIDER)</label>
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
      <main class="workspace" *ngIf="!showSettings">
        <section class="panel controls">
          <div class="panel-heading"><span class="mini-label">01 / CREATE</span><h2>New fact film</h2><p>Leave the topic blank to rotate consumer, money, history, technology and other fact categories. Recent topics are avoided.</p></div>
          <label for="visualStyle">VIDEO STYLE</label><select id="visualStyle" [(ngModel)]="visualStyle"><option value="reference-news">Clean full-view media + SVG pointers</option><option value="paper">Original paper layout</option></select>
          <label for="mediaFit">MEDIA FRAMING</label><select id="mediaFit" [(ngModel)]="mediaFit"><option value="cover">Full view · crop wide edges</option><option value="contain">Entire image · plain black space</option></select>
          <label for="channelLogo">CHANNEL LOGO <span>OPTIONAL</span></label>
          <input id="channelLogo" type="file" accept="image/png,image/jpeg,image/webp" (change)="selectLogo($event)" [disabled]="working || logoLoading">
          <p class="config">Logo stays at the upper left below the yellow line, at 50% opacity, like the reference.</p>
          <div *ngIf="logoDataUrl" class="logo-preview"><img [src]="logoDataUrl" alt="Your channel logo preview" width="54" height="54" style="object-fit:contain"><button type="button" class="secondary" (click)="removeLogo()" [disabled]="working">REMOVE LOGO</button></div>
          <label for="mediaMode">VISUAL MEDIA</label><select id="mediaMode" [(ngModel)]="mediaMode"><option value="mixed">Video first · photo fallback</option><option *ngIf="visualStyle === 'paper'" value="photos">Photos only</option></select>
          <p class="config" *ngIf="visualStyle === 'reference-news'">{{ mediaPlanLabel }} · clean cuts timed to narration.</p>
          <label for="voiceProvider">VOICE PROVIDER</label><select id="voiceProvider" [(ngModel)]="voiceProvider"><option value="fish">Fish Audio</option><option value="heygen">HeyGen · Yash</option><option value="cartesia">Cartesia</option></select>
          <label for="factMode">FACT SELECTION</label><select id="factMode" [(ngModel)]="factMode" (ngModelChange)="onFactModeChange()"><option value="topic">1 fact story · one topic</option><option value="random">3 facts · three different topics</option></select>
          <p class="config" *ngIf="factMode === 'random'">Three surprising topics, each researched separately. Desi hooks, quick reveals and light humor.</p>
          <label *ngIf="factMode === 'topic'" for="topic">YOUR TOPIC <span>OPTIONAL</span></label>
          <textarea *ngIf="factMode === 'topic'" id="topic" name="topic" [(ngModel)]="topic" rows="3" maxlength="140" placeholder="e.g. How do octopuses camouflage?\nOr leave blank for a surprise..."></textarea>
          <div class="selection-row">
            <div><label for="voiceAccent">NARRATION LANGUAGE / VOICE</label><select id="voiceAccent" [(ngModel)]="voiceAccent"><option value="hi-IN-anuj">{{voiceProvider === 'fish' ? 'Hindi - Fish Audio' : voiceProvider === 'heygen' ? 'Hindi · Yash' : 'Hindi · Anuj (expressive)'}}</option><option *ngIf="voiceProvider === 'cartesia'" value="hi-IN-ayush">Hindi · Ayush (bright)</option><option *ngIf="voiceProvider === 'cartesia'" value="hi-IN-rakesh">Hindi · Rakesh (narrator)</option><option *ngIf="voiceProvider === 'cartesia'" value="hi-IN">Hindi · Sagar (original)</option><option value="en-US">{{voiceProvider === 'fish' ? 'English - Fish Audio' : voiceProvider === 'heygen' ? 'English · HeyGen presenter' : 'English · US (Daniel)'}}</option><option *ngIf="voiceProvider === 'cartesia'" value="en-GB">English · UK (Archie)</option></select></div>
            <div><label for="seconds">LENGTH TARGET</label><select id="seconds" [(ngModel)]="seconds"><option [ngValue]="20">20 sec</option><option [ngValue]="25">25 sec</option><option [ngValue]="30">30 sec</option><option [ngValue]="35">35 sec</option><option [ngValue]="40">40 sec</option><option [ngValue]="50">50 sec</option><option [ngValue]="90">90 sec · 3 complete facts</option><option [ngValue]="100">100 sec · 3 complete facts</option></select></div>
          </div>
          <div class="selection-row"><div><label for="delivery">VOICE DELIVERY</label><select id="delivery" [(ngModel)]="voiceStyle"><option value="energetic">Energetic facts · fast hook</option><option value="balanced">Balanced documentary</option></select></div><div class="voice-note">{{voiceProvider === 'fish' ? 'Consistent Fish Audio narrator with native speed control.' : voiceProvider === 'heygen' ? 'Energetic delivery via HeyGen Turbo Free. No paid speech fallback.' : 'Expressive Cartesia narration in the selected voice.'}}</div></div>
          <div class="selection-row"><div><label for="backgroundPalette">VIDEO BACKGROUND COLOR</label><select id="backgroundPalette" [(ngModel)]="backgroundPalette"><option value="random">Random · story-based (current)</option><option value="white">White · clean paper</option><option value="black">Black · cinematic dark</option></select></div><div class="voice-note">Background color applies throughout the entire Short. Animations automatically adjust their contrast and text colors.</div></div>
          <div class="selection-row"><div><label for="humor">COMEDY / EDGE LEVEL</label><select id="humor" [(ngModel)]="humorIntensity"><option value="clean">Clean · family friendly</option><option value="cheeky">Cheeky · clever humor</option><option value="edgy">Edgy · occasional mild slang</option></select></div><div class="voice-note">Hindi voice = Hindi narration, titles, captions and diagrams. English voice = everything in English. Top headline stays fixed.</div></div>
          <div class="stack"><span>WHAT'S INSIDE</span><div><span class="chip">✦ Gemini Lite</span><span class="chip">◉ Cartesia</span><span class="chip">♫ Freesound CC0</span><span class="chip">▣ Commons</span><span class="chip">✂ Original JSON Cutout Engine</span></div></div>
          <button class="primary" (click)="generate(false)" [disabled]="working || logoLoading || !allConfigured()"><span>{{ working ? 'GENERATION IN PROGRESS' : '✦  GENERATE VIDEO' }}</span><span>↗</span></button>
          <button *ngIf="health?.demo" class="secondary" (click)="generate(true)" [disabled]="working">TRY OFFLINE RENDER DEMO (no AI/voice)</button>
          <p *ngIf="!allConfigured()" class="config">Enter Gemini and the selected voice provider's key in API Settings, or configure them on the backend.</p>
          <p *ngIf="error" class="error">{{ error }}</p>
        </section>

        <section class="panel preview">
          <div class="panel-heading result-heading"><div><span class="mini-label">02 / OUTPUT</span><h2>Your documentary</h2></div><span class="status" [class.complete]="job?.status === 'complete'">{{ job?.status === 'complete' ? 'RENDER READY' : job?.status === 'running' ? 'GENERATING' : 'AWAITING FILM' }}</span></div>
          <div class="screen" [class.has-video]="job?.status === 'complete'" [style.aspect-ratio]="previewAspectRatio">
            <video *ngIf="job?.status === 'complete' && job?.videoUrl" [src]="job!.videoUrl!" controls playsinline preload="metadata"></video>
            <div class="empty" *ngIf="job?.status !== 'complete'"><span class="frame-top">FIG. 01 <span>{{ visualStyle === 'reference-news' ? '9:16 / SAFE FRAME' : '9:16 / PAPER CUT' }}</span></span><div class="empty-symbol">✳</div><b>{{ job?.status === 'running' ? 'WORK IN\nPROGRESS' : 'YOUR FILM\nBEGINS HERE' }}</b><p>{{ job?.stage || 'Ready when you are.' }}</p><span class="frame-bottom">A WORLD OF FACTS · ONE CLICK</span></div>
          </div>
          <div *ngIf="job?.status === 'running'" class="progress-area"><div class="progress-title"><strong>{{ job?.stage }}</strong><span>{{ job?.progress }}%</span></div><div class="progress-track"><div [style.width.%]="job?.progress || 0"></div></div><small>Videos render locally; realistic processing times depend on machine and voice quota.</small></div>
          <div *ngIf="job?.status === 'complete'" class="finished"><h3>{{ job?.title }}</h3><p *ngIf="job?.category">Category: {{ job?.category }}</p><p>Topic: {{ job?.topic }} · {{ job?.duration | number:'1.0-0' }}s · Vertical MP4</p><div class="actions"><a class="download" [href]="job!.downloadUrl!">↓ DOWNLOAD MP4</a><a [href]="'/api/jobs/' + job!.id + '/credits'" download>ASSET CREDITS</a><a *ngIf="job?.uploadDescriptionUrl" [href]="job!.uploadDescriptionUrl!" download>UPLOAD DESCRIPTION</a><a [href]="job!.storyboardUrl!" download>GEMINI STORYBOARD JSON</a><a [href]="job!.animationPlanUrl!" download>ANIMATION PLAN JSON</a></div><p *ngFor="let source of job!.sources">Fact source: <a [href]="source.url" target="_blank" rel="noopener noreferrer">{{ source.name }}</a></p><p *ngIf="job?.demo" class="config">Offline demo only — illustrative art, no Gemini, Cartesia or Freesound calls.</p><div class="contact-preview" *ngIf="job?.contactUrl"><h4>SCENE-BY-SCENE PREVIEW</h4><a [href]="job!.contactUrl!" target="_blank" rel="noopener noreferrer"><img [src]="job!.contactUrl!" alt="Full scene contact sheet from original renderer" loading="lazy"></a></div></div>
          <div *ngIf="job?.status === 'complete' && job?.youtubeTitle" class="finished"><label>YOUTUBE UPLOAD TITLE</label><p>{{ job!.youtubeTitle }}</p><button class="secondary" (click)="copyUploadTitle()">{{ titleCopied ? 'COPIED' : 'COPY TITLE' }}</button><a *ngIf="job?.uploadTitleUrl" [href]="job!.uploadTitleUrl!" download>DOWNLOAD TITLE TXT</a></div>
          <p *ngIf="job?.status === 'complete'" class="config">Auto-deletes 30 minutes after generation. Download your video before then.<span *ngIf="job?.expiresAt"> Available until {{ job!.expiresAt | date:'shortTime' }}.</span></p>
          <div *ngIf="job?.warnings?.length" class="warnings"><strong>Asset notes</strong><p *ngFor="let w of job!.warnings">{{ w }}</p></div>
        </section>
      </main>
      <footer><span>Stock: <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Pexels</a> ? <a href="https://coverr.co" target="_blank" rel="noopener noreferrer">Coverr</a></span><span>{{ visualStyle === 'reference-news' ? '1080 × 1440 · 3:4 REFERENCE' : '1080 × 1920 · PAPER-DOC' }} · CC ATTRIBUTIONS SAVED</span></footer>
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  private pollTimer?: ReturnType<typeof setInterval>;
  private polling = false;
  private disconnectCount = 0;

  health: Health | null = null;
  job: Job | null = null;

  topic = '';
  factMode = 'topic';
  voiceAccent = 'hi-IN-anuj';
  voiceProvider = 'fish';
  voiceStyle = 'energetic';
  humorIntensity = 'edgy';
  backgroundPalette = 'random';
  mediaMode = 'mixed';
  visualStyle = 'reference-news';
  mediaFit = 'cover';
  titleCopied = false;
  logoDataUrl = '';
  logoLoading = false;
  seconds = 30;

  onFactModeChange(): void {
    this.seconds = this.factMode === 'random' ? 90 : 30;
  }

  get mediaPlanLabel(): string {
    const extra=Math.min(2,Math.max(0,Math.ceil((this.seconds-30)/10)));
    const shots=this.seconds>50?Math.min(20,Math.ceil(this.seconds/5)):5+2*extra;
    return `${shots} shots · video clips first, images only if footage is unavailable`;
  }

  error = '';
  working = false;
  showSettings = false;

  settings: Record<string, string> = {
    FISH_API_KEY: '',
    FISH_VOICE_ID: '',
    HEYGEN_API_KEY: '',
    HEYGEN_VOICE_HI_ID: '',
    HEYGEN_PITCH_SEMITONES: '',
    HEYGEN_TEMPO: '',
    GEMINI_API_KEY: '',
    GEMINI_API_KEY_2: '',
    GEMINI_API_KEY_3: '',
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
      this.settings['GEMINI_API_KEY_2'] || this.settings['GEMINI_API_KEY_3'] ||
      this.health?.providers.gemini;

    const cartesia =
      this.settings['CARTESIA_API_KEY'] ||
      this.health?.providers.cartesia;

    const voice=this.voiceProvider==='fish'?(this.settings['FISH_API_KEY']||this.health?.providers.fish):this.voiceProvider==='heygen'?(this.settings['HEYGEN_API_KEY']||this.health?.providers.heygen):cartesia;
    return !!(gemini && voice);
  }

  generate(demo: boolean): void {
    if (this.working || this.logoLoading) {
      return;
    }

    if (!demo && !this.allConfigured()) {
      this.showSettings = true;
      this.error = 'Please configure Gemini and the selected voice provider.';
      return;
    }

    this.error = '';
    this.job = null;
    this.titleCopied = false;
    this.working = true;
    this.disconnectCount = 0;

    this.stopPolling();

    this.http.post<Job>(
      '/api/jobs',
      {
        topic: this.topic,
        factMode: this.factMode,
        voiceAccent: this.voiceAccent,
        voiceProvider: this.voiceProvider,
        voiceStyle: this.voiceStyle,
        humorIntensity: this.humorIntensity,
        backgroundPalette: this.backgroundPalette,
        mediaMode: this.visualStyle==='reference-news'?'mixed':this.mediaMode,
        visualStyle: this.visualStyle,
        mediaFit: this.mediaFit,
        logoDataUrl: this.logoDataUrl,
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

  async copyUploadTitle(): Promise<void> {
    try { await navigator.clipboard.writeText(this.job?.youtubeTitle || ''); this.titleCopied = true; }
    catch { this.error = 'Copy unavailable. Select the title text or download the TXT file.'; }
  }

  async selectLogo(event: Event): Promise<void> {
    const input=event.target as HTMLInputElement,file=input.files?.[0];
    if(!file)return;
    this.logoLoading=true;this.error='';
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4_000_000)throw new Error('Choose a PNG, JPEG or WebP logo smaller than 4 MB.');
      const bitmap=await createImageBitmap(file);
      try{
        if(bitmap.width<8||bitmap.height<8||bitmap.width*bitmap.height>4_000_000)throw new Error('Logo must be at least 8 pixels and at most 4 megapixels.');
        const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const context=canvas.getContext('2d');if(!context)throw new Error('Could not prepare logo.');
        context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const value=canvas.toDataURL('image/png');if(value.length>1_400_000)throw new Error('Logo is too large. Choose a simpler image.');
        this.logoDataUrl=value;
      }finally{bitmap.close();}
    }catch(error){this.error=error instanceof Error?error.message:'Could not read logo image.';}
    finally{this.logoLoading=false;input.value='';}
  }

  removeLogo(): void {this.logoDataUrl='';}
  get previewAspectRatio(): string {return this.job?.size?.join(' / ') || '9 / 16';}

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
