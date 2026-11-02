import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface Job {
  id: string; status: 'running' | 'failed' | 'complete'; stage: string; progress: number;
  title: string; topic: string; error?: string; warnings: string[]; demo?: boolean;
  videoUrl: string | null; downloadUrl: string | null; duration?: number;
  storyboardUrl: string | null; animationPlanUrl: string | null; contactUrl: string | null;
  sources: { name: string; url: string }[];
}
interface Health {
  ok: boolean; demo: boolean; busy: boolean;
  providers: { gemini: boolean; cartesia: boolean; freesound: boolean; images: string };
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

      <main class="workspace">
        <section class="panel controls">
          <div class="panel-heading"><span class="mini-label">01 / CREATE</span><h2>New fact film</h2><p>Leave the topic blank. Gemini Lite will find something fascinating.</p></div>
          <label for="topic">YOUR TOPIC <span>OPTIONAL</span></label>
          <textarea id="topic" name="topic" [(ngModel)]="topic" rows="3" maxlength="140" placeholder="e.g. How do octopuses camouflage?\nOr leave blank for a surprise..."></textarea>
          <div class="selection-row">
            <div><label for="voiceAccent">MALE NARRATOR / ACCENT</label><select id="voiceAccent" [(ngModel)]="voiceAccent"><option value="hi-IN-anuj">Hindi · Anuj (expressive)</option><option value="hi-IN-ayush">Hindi · Ayush (bright)</option><option value="hi-IN-rakesh">Hindi · Rakesh (narrator)</option><option value="hi-IN">Hindi · Sagar (original)</option><option value="en-US">English · US (Daniel)</option><option value="en-GB">English · UK (Archie)</option></select></div>
            <div><label for="seconds">LENGTH TARGET</label><select id="seconds" [(ngModel)]="seconds"><option [ngValue]="20">20 sec</option><option [ngValue]="25">25 sec</option><option [ngValue]="35">35 sec</option><option [ngValue]="45">45 sec</option></select></div>
          </div>
          <div class="selection-row"><div><label for="delivery">VOICE DELIVERY</label><select id="delivery" [(ngModel)]="voiceStyle"><option value="energetic">Energetic facts · fast hook</option><option value="balanced">Balanced documentary</option></select></div><div class="voice-note">Gemini directs hook, suspense and reveal. Cartesia uses native male voices and expressive pacing.</div></div>
          <div class="selection-row"><div><label for="backgroundPalette">VIDEO BACKGROUND COLOR</label><select id="backgroundPalette" [(ngModel)]="backgroundPalette"><option value="random">Random · story-based (current)</option><option value="white">White · clean paper</option><option value="black">Black · cinematic dark</option></select></div><div class="voice-note">Background color applies throughout the entire Short. Animations automatically adjust their contrast and text colors.</div></div>
          <div class="selection-row"><div><label for="humor">COMEDY / EDGE LEVEL</label><select id="humor" [(ngModel)]="humorIntensity"><option value="clean">Clean · family friendly</option><option value="cheeky">Cheeky · clever humor</option><option value="edgy">Edgy · occasional mild slang</option></select></div><div class="voice-note">Hindi voice = Hindi narration, titles, captions and diagrams. English voice = everything in English. Top headline stays fixed.</div></div>
          <div class="stack"><span>WHAT'S INSIDE</span><div><span class="chip">✦ Gemini Lite</span><span class="chip">◉ Cartesia</span><span class="chip">♫ Freesound CC0</span><span class="chip">▣ Commons</span><span class="chip">✂ Original JSON Cutout Engine</span></div></div>
          <button class="primary" (click)="generate(false)" [disabled]="working || !allConfigured()"><span>{{ working ? 'GENERATION IN PROGRESS' : '✦  GENERATE VIDEO' }}</span><span>↗</span></button>
          <button *ngIf="health?.demo" class="secondary" (click)="generate(true)" [disabled]="working">TRY OFFLINE RENDER DEMO (no AI/voice)</button>
          <p *ngIf="health && !allConfigured()" class="config">Add Gemini, Cartesia and Freesound keys to <code>studio/.env</code> to enable live generation.</p>
          <p *ngIf="error" class="error">{{ error }}</p>
        </section>

        <section class="panel preview">
          <div class="panel-heading result-heading"><div><span class="mini-label">02 / OUTPUT</span><h2>Your documentary</h2></div><span class="status" [class.complete]="job?.status === 'complete'">{{ job?.status === 'complete' ? 'RENDER READY' : job?.status === 'running' ? 'GENERATING' : 'AWAITING FILM' }}</span></div>
          <div class="screen" [class.has-video]="job?.status === 'complete'">
            <video *ngIf="job?.status === 'complete' && job?.videoUrl" [src]="job!.videoUrl!" controls playsinline preload="metadata"></video>
            <div class="empty" *ngIf="job?.status !== 'complete'"><span class="frame-top">FIG. 01 <span>9:16 / PAPER CUT</span></span><div class="empty-symbol">✳</div><b>{{ job?.status === 'running' ? 'WORK IN\nPROGRESS' : 'YOUR FILM\nBEGINS HERE' }}</b><p>{{ job?.stage || 'Ready when you are.' }}</p><span class="frame-bottom">A WORLD OF FACTS · ONE CLICK</span></div>
          </div>
          <div *ngIf="job?.status === 'running'" class="progress-area"><div class="progress-title"><strong>{{ job?.stage }}</strong><span>{{ job?.progress }}%</span></div><div class="progress-track"><div [style.width.%]="job?.progress || 0"></div></div><small>Videos render locally; realistic processing times depend on machine and voice quota.</small></div>
          <div *ngIf="job?.status === 'complete'" class="finished"><h3>{{ job?.title }}</h3><p>Topic: {{ job?.topic }} · {{ job?.duration | number:'1.0-0' }}s · Vertical MP4</p><div class="actions"><a class="download" [href]="job!.downloadUrl!">↓ DOWNLOAD MP4</a><a [href]="'/api/jobs/' + job!.id + '/credits'" download>ASSET CREDITS</a><a [href]="job!.storyboardUrl!" download>GEMINI STORYBOARD JSON</a><a [href]="job!.animationPlanUrl!" download>ANIMATION PLAN JSON</a></div><p *ngFor="let source of job!.sources">Fact source: <a [href]="source.url" target="_blank" rel="noopener noreferrer">{{ source.name }}</a></p><p *ngIf="job?.demo" class="config">Offline demo only — illustrative art, no Gemini, Cartesia or Freesound calls.</p><div class="contact-preview" *ngIf="job?.contactUrl"><h4>SCENE-BY-SCENE PREVIEW</h4><a [href]="job!.contactUrl!" target="_blank" rel="noopener noreferrer"><img [src]="job!.contactUrl!" alt="Full scene contact sheet from original renderer" loading="lazy"></a></div></div>
          <div *ngIf="job?.warnings?.length" class="warnings"><strong>Asset notes</strong><p *ngFor="let w of job!.warnings">{{ w }}</p></div>
        </section>
      </main>
      <footer><span>MADE FOR CURIOUS MINDS.</span><span>1080 × 1920 · PAPER-DOC RENDER ENGINE · CC ATTRIBUTIONS SAVED</span></footer>
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private pollTimer?: ReturnType<typeof setInterval>;
  health: Health | null = null;
  topic = ''; voiceAccent = 'hi-IN-ayush'; voiceStyle = 'energetic'; humorIntensity = 'cheeky'; backgroundPalette = 'random'; seconds = 25;
  job: Job | null = null; error = ''; working = false;

  ngOnInit() { this.http.get<Health>('/api/health').subscribe({ next: h => this.health = h,
    error: () => this.error = 'Cannot connect to local API. Start studio backend first.' }); }
  ngOnDestroy() { if (this.pollTimer) clearInterval(this.pollTimer); }
  allConfigured() { return !!(this.health?.providers.gemini && this.health.providers.cartesia && this.health.providers.freesound); }
  generate(demo: boolean) {
    if (this.working) return;
    this.error = ''; this.job = null; this.working = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.http.post<Job>('/api/jobs', { topic: this.topic, voiceAccent: this.voiceAccent, voiceStyle: this.voiceStyle,
      humorIntensity: this.humorIntensity,
      backgroundPalette: this.backgroundPalette,
      seconds: this.seconds, demo }).subscribe({
      next: job => { this.job = job; this.pollTimer = setInterval(() => this.refresh(job.id), 1100); this.refresh(job.id); },
      error: e => { this.working = false; this.error = e.error?.error || 'Could not start the render'; },
    });
  }
  private refresh(id: string) {
    this.http.get<Job>(`/api/jobs/${id}`).subscribe({ next: job => {
      this.job = job;
      if (job.status !== 'running') {
        this.working = false;
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (job.status === 'failed') this.error = job.error || 'Render failed';
      }
    }, error: () => { this.working = false; this.error = 'Lost connection with render service'; if (this.pollTimer) clearInterval(this.pollTimer); } });
  }
}
