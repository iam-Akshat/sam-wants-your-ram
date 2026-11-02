// RAM RUN - fully procedural WebAudio engine. No samples, no network, no deps.

export type Sfx = 'collect'|'gold'|'jump'|'land'|'slide'|'lane'|'hit'|'powerup'|'shield'|'shieldbreak'|'overclock'|'magnet'|'ddr'|'cool'|'closecall'|'ui'|'uiback'|'buy'|'error'|'door'|'stagecomplete'|'gameover'|'catch'|'letter'|'drone'|'cart'|'smash'|'taunt'|'whoosh'|'win'|'countdown'|'go';
export type MusicMode = 'menu'|'run'|'win'|'off';

type Wave = OscillatorType;
type LeadKind = 'bell' | 'saw' | 'square' | 'tri';

interface ZoneDef {
  pc: number;                          // tonic pitch class
  bpm: number;
  swing: number;                       // fraction of a 16th delaying odd steps
  prog: readonly (readonly [number, number])[]; // [root offset semitones, 1=minor 0=major] per bar
  arp: readonly number[];              // 16 chord-tone indices
  bass: readonly number[];             // 16: 0 none,1 root,2 octave,3 fifth,4 b7
  lead: LeadKind;
  arpPrio: number;                     // priority of odd 16ths (lower = appears earlier as intensity rises)
  padSweep: boolean;
}

const ZONES: readonly ZoneDef[] = [
  // 0 Cold Aisle: icy minor, bell lead
  { pc: 9, bpm: 124, swing: 0, prog: [[0, 1], [8, 0], [10, 0], [0, 1]],
    arp: [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 2, 1, 3, 5, 2],
    bass: [1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 3, 0], lead: 'bell', arpPrio: 0.6, padSweep: false },
  // 1 Hot Aisle: driving, detuned saws
  { pc: 4, bpm: 136, swing: 0, prog: [[0, 1], [1, 0], [0, 1], [10, 0]],
    arp: [0, 3, 2, 3, 0, 3, 4, 3, 0, 3, 2, 3, 5, 3, 4, 3],
    bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 2, 1, 0], lead: 'saw', arpPrio: 0.5, padSweep: false },
  // 2 GPU Hall: 16th arps, techno
  { pc: 2, bpm: 140, swing: 0, prog: [[0, 1], [0, 1], [5, 1], [7, 0]],
    arp: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3],
    bass: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0], lead: 'square', arpPrio: 0.15, padSweep: false },
  // 3 Cooling Towers: airy, watery, swing
  { pc: 5, bpm: 120, swing: 0.2, prog: [[0, 0], [2, 0], [4, 1], [7, 0]],
    arp: [0, 2, 1, 4, 0, 2, 1, 5, 2, 4, 1, 4, 0, 3, 1, 2],
    bass: [1, 0, 0, 0, 0, 0, 3, 0, 2, 0, 0, 0, 0, 0, 3, 0], lead: 'tri', arpPrio: 0.45, padSweep: true },
  // 4 Rooftop Exit: major, triumphant
  { pc: 0, bpm: 132, swing: 0, prog: [[0, 0], [7, 0], [9, 1], [5, 0]],
    arp: [0, 1, 2, 4, 2, 1, 2, 4, 0, 1, 2, 5, 4, 2, 1, 2],
    bass: [1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 3, 0], lead: 'square', arpPrio: 0.4, padSweep: false },
];

// Win fanfare melody, 4 bars x 16 steps (midi, 0 = rest), over C F G C
const WIN_MELODY: readonly number[] = [
  72, 0, 0, 72, 0, 0, 72, 0, 76, 0, 79, 0, 84, 0, 0, 0,
  77, 0, 0, 77, 0, 0, 77, 0, 81, 0, 84, 0, 81, 0, 77, 0,
  79, 0, 0, 79, 0, 0, 79, 0, 83, 0, 86, 0, 83, 0, 79, 0,
  84, 0, 84, 0, 79, 0, 76, 0, 79, 0, 84, 0, 88, 0, 0, 0,
];
const WIN_PROG: readonly (readonly [number, number])[] = [[0, 0], [5, 0], [7, 0], [0, 0]];
const WIN_BASS: readonly number[] = [1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 3, 0];

const PENT = [0, 2, 4, 7, 9]; // major pentatonic
const MAX_VOICES = 24;
const LOOKAHEAD = 0.15;

function at<T>(a: readonly T[], i: number): T { return a[i] as T; }
function mtof(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : (v === v ? v : 0); }

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private musicIn!: GainNode;       // mode fade
  private musicFilter!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private threatGain!: GainNode;
  private threatSaw1!: OscillatorNode;
  private threatSaw2!: OscillatorNode;
  private threatNoiseF!: BiquadFilterNode;
  private threatSawF!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;

  private vMaster = 0.8; private vMusic = 0.7; private vSfx = 0.9; private muted = false;
  private paused = false;
  private threatT = 0; private threatApplied = -1;
  private voiceEnd = new Float64Array(MAX_VOICES);
  private endT = 0;

  // music state
  private timer: ReturnType<typeof setInterval> | null = null;
  private curMode: MusicMode = 'off';
  private curZone = 0;
  private pendMode: MusicMode = 'off';
  private pendZone = 0;
  private inten = 0;
  private intenTarget = 0;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private lastFilter = -1;

  init(): void {
    try {
      if (!this.ctx) {
        const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        this.build(ctx);
        this.ctx = ctx;
      }
      const c = this.ctx;
      if (c && c.state === 'suspended') { c.resume().catch(() => { /* ignore */ }); }
    } catch {
      /* audio unavailable; game continues silently */
    }
  }

  private build(ctx: AudioContext): void {
    // noise buffer (2s, shared)
    const len = ctx.sampleRate * 2;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // master chain with limiter-ish compressor
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -8; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.003; lim.release.value = 0.1;
    this.master = ctx.createGain();
    this.master.connect(lim); lim.connect(ctx.destination);

    // music bus: musicIn -> filter -> comp -> musicGain -> master
    this.musicIn = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 6000; this.musicFilter.Q.value = 0.5;
    const mc = ctx.createDynamicsCompressor();
    mc.threshold.value = -18; mc.knee.value = 12; mc.ratio.value = 3; mc.attack.value = 0.01; mc.release.value = 0.2;
    this.musicGain = ctx.createGain();
    this.musicIn.connect(this.musicFilter); this.musicFilter.connect(mc); mc.connect(this.musicGain);
    this.musicGain.connect(this.master);

    // sfx bus
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.sfxGain);

    // threat: filtered noise + detuned saw drone
    this.threatGain = ctx.createGain();
    this.threatGain.gain.value = 0;
    this.threatGain.connect(this.master);
    const ns = ctx.createBufferSource();
    ns.buffer = nb; ns.loop = true;
    this.threatNoiseF = ctx.createBiquadFilter();
    this.threatNoiseF.type = 'bandpass'; this.threatNoiseF.frequency.value = 250; this.threatNoiseF.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.9;
    ns.connect(this.threatNoiseF); this.threatNoiseF.connect(ng); ng.connect(this.threatGain);
    this.threatSaw1 = ctx.createOscillator(); this.threatSaw2 = ctx.createOscillator();
    this.threatSaw1.type = 'sawtooth'; this.threatSaw2.type = 'sawtooth';
    this.threatSaw1.frequency.value = 50; this.threatSaw2.frequency.value = 50.8;
    this.threatSawF = ctx.createBiquadFilter();
    this.threatSawF.type = 'lowpass'; this.threatSawF.frequency.value = 220; this.threatSawF.Q.value = 3;
    const sg = ctx.createGain(); sg.gain.value = 0.35;
    this.threatSaw1.connect(this.threatSawF); this.threatSaw2.connect(this.threatSawF);
    this.threatSawF.connect(sg); sg.connect(this.threatGain);
    ns.start(); this.threatSaw1.start(); this.threatSaw2.start();

    this.ctx = ctx; // set early so applyVolumes works
    this.applyVolumes();
    this.musicIn.gain.value = this.curMode === 'off' && this.pendMode === 'off' ? 0 : 1;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 25);
  }

  setVolumes(master: number, music: number, sfx: number, muted: boolean): void {
    this.vMaster = clamp01(master); this.vMusic = clamp01(music); this.vSfx = clamp01(sfx); this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const c = this.ctx;
    if (!c) return;
    try {
      const t = c.currentTime;
      const set = (p: AudioParam, v: number): void => { p.cancelScheduledValues(t); p.setValueAtTime(v, t); };
      set(this.master.gain, this.muted ? 0 : this.vMaster);
      set(this.musicGain.gain, this.vMusic * 0.7);
      set(this.sfxGain.gain, this.vSfx);
    } catch { /* ignore */ }
  }

  setThreat(t: number): void {
    this.threatT = clamp01(t);
    this.applyThreat();
  }

  private applyThreat(): void {
    const c = this.ctx;
    if (!c) return;
    const t = this.paused ? 0 : this.threatT;
    if (Math.abs(t - this.threatApplied) < 0.004) return;
    this.threatApplied = t;
    try {
      const now = c.currentTime;
      this.threatGain.gain.setTargetAtTime(t * t * 0.32, now, 0.12);
      this.threatSaw1.frequency.setTargetAtTime(48 + t * 60, now, 0.2);
      this.threatSaw2.frequency.setTargetAtTime(48.8 + t * 62, now, 0.2);
      this.threatSawF.frequency.setTargetAtTime(160 + t * 420, now, 0.2);
      this.threatNoiseF.frequency.setTargetAtTime(200 + t * 700, now, 0.2);
    } catch { /* ignore */ }
  }

  /** hard mute (freeze/hang): suspend the whole audio context so music and SFX stop immediately */
  hold(on: boolean): void { try { const c = this.ctx; if (!c) return; if (on) void c.suspend(); else if (c.state === 'suspended') void c.resume(); } catch { /* ignore */ } }
  setPaused(p: boolean): void {
    this.paused = p;
    this.threatApplied = -1;
    this.applyThreat();
    this.lastFilter = -1;
    this.updateFilter();
  }

  setMusic(mode: MusicMode, zone: number, intensity: number): void {
    this.intenTarget = clamp01(intensity);
    const z = Math.max(0, Math.min(4, Math.floor(zone) || 0));
    this.pendMode = mode; this.pendZone = z;
    const c = this.ctx;
    if (!c) return;
    if (mode === 'off') {
      if (this.curMode !== 'off') {
        this.curMode = 'off';
        try { this.musicIn.gain.setTargetAtTime(0, c.currentTime, 0.12); } catch { /* ignore */ }
      }
    } else if (this.curMode === 'off') {
      // start immediately
      this.curMode = mode; this.curZone = z;
      this.step = 0; this.bar = 0;
      this.nextTime = c.currentTime + 0.06;
      this.inten = this.intenTarget;
      try { this.musicIn.gain.cancelScheduledValues(c.currentTime); this.musicIn.gain.setTargetAtTime(1, c.currentTime, 0.03); } catch { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------- sequencer

  private updateFilter(): void {
    const c = this.ctx;
    if (!c) return;
    let f: number;
    if (this.paused) f = 450;
    else if (this.curMode === 'menu') f = 2200 + this.inten * 1500;
    else if (this.curMode === 'win') f = 12000;
    else f = 1400 + this.inten * 9000;
    if (Math.abs(f - this.lastFilter) < 8) return;
    this.lastFilter = f;
    try { this.musicFilter.frequency.setTargetAtTime(f, c.currentTime, 0.1); } catch { /* ignore */ }
  }

  private tick(): void {
    const c = this.ctx;
    if (!c) return;
    this.inten += (this.intenTarget - this.inten) * 0.08;
    this.updateFilter();
    if (this.curMode === 'off') return;
    const now = c.currentTime;
    if (this.nextTime < now - 0.25) { this.nextTime = now + 0.05; } // tab was throttled: resync
    let guard = 0;
    while (this.nextTime < now + LOOKAHEAD && guard++ < 16) {
      if (this.step === 0) {
        if (this.pendMode !== 'off') { this.curMode = this.pendMode; this.curZone = this.pendZone; }
      }
      this.scheduleStep(this.step, this.nextTime);
      const stepDur = this.stepDur();
      this.step++;
      if (this.step >= 16) { this.step = 0; this.bar++; }
      this.nextTime += stepDur;
    }
  }

  private stepDur(): number {
    const z = at(ZONES, this.curZone);
    let bpm = z.bpm;
    if (this.curMode === 'menu') bpm = bpm * 0.9;
    else if (this.curMode === 'win') bpm = 140;
    else bpm += this.inten * 12;
    return 60 / bpm / 4;
  }

  private scheduleStep(step: number, base: number): void {
    const z = at(ZONES, this.curZone);
    const mode = this.curMode;
    const win = mode === 'win';
    const menu = mode === 'menu';
    const inten = win ? 0.85 : menu ? 0.1 : this.inten;
    const sd = this.stepDur();
    const t = base + ((step & 1) ? z.swing * sd : 0);
    const prog = win ? WIN_PROG : z.prog;
    const chord = at(prog, this.bar & 3);
    const minor = chord[1] === 1;
    const bassMidi = 36 + z.pc + chord[0];
    const dest = this.musicIn;
    const bassPat = win ? WIN_BASS : z.bass;

    // pad on bar start
    if (step === 0) this.pad(t, sd * 16, bassMidi + 24, minor, inten, z.padSweep && !win, win);

    // drums
    if (menu) {
      if (step === 0 || step === 8) this.kick(t, 0.5, dest);
      if (step % 4 === 2) this.hat(t, 0.05, false, dest);
    } else {
      const kickOn = step === 0 || step === 8 || ((step === 4 || step === 12) && (win || inten > 0.25)) ||
        (step === 10 && inten > 0.7) || (step === 14 && inten > 0.85);
      if (kickOn) this.kick(t, 0.85, dest);
      if (step === 4 || step === 12) this.snare(t, 0.5, dest);
      else if (step === 15 && inten > 0.6) this.snare(t, 0.2, dest);
      if (win || inten > 0.15) {
        if (step % 4 === 2) this.hat(t, 0.1, win || (inten > 0.6 && step === 14), dest);
        else if ((win || inten > 0.5) && (step & 1)) this.hat(t, 0.045, false, dest);
      }
    }

    // bass
    const bp = at(bassPat, step);
    if (bp !== 0 && (!menu || step === 0 || step === 8)) {
      let m = bassMidi;
      if (bp === 2) m += 12; else if (bp === 3) m += 7; else if (bp === 4) m += 10;
      const f = mtof(m);
      const bt: Wave = z.lead === 'saw' ? 'sawtooth' : 'square';
      this.tone(bt, f, f, t, sd * 1.7, menu ? 0.12 : 0.2, dest, 0.004);
      this.tone('sine', f * 0.5, f * 0.5, t, sd * 1.7, 0.22, dest, 0.006);
    }

    // lead
    if (win) {
      const n = at(WIN_MELODY, ((this.bar & 3) << 4) | step);
      if (n > 0) {
        const f = mtof(n);
        this.tone('square', f, f, t, sd * 2.4, 0.12, dest, 0.005);
        this.tone('sawtooth', f, f, t, sd * 2.4, 0.07, dest, 0.005, 7);
      }
      return;
    }
    const prio = (step & 3) === 0 ? 0 : (step & 1) ? z.arpPrio : 0.25;
    const thresh = menu ? 0.0 : prio * 0.7;
    const gate = menu ? ((step & 3) === 0) : inten >= thresh && (inten > 0.05 || (step & 3) === 0);
    if (gate && (menu || inten > 0.05 || step % 4 === 0)) {
      const idx = at(z.arp, step);
      const octs = Math.floor(idx / 3);
      const iv = minor ? [0, 3, 7] : [0, 4, 7];
      const semis = (iv[idx % 3] ?? 0) + 12 * octs;
      const m = bassMidi + 24 + semis + (z.lead === 'bell' ? 12 : 0);
      const f = mtof(m);
      const v = (menu ? 0.07 : 0.08 + 0.07 * inten);
      const dur = sd * (z.lead === 'bell' ? 3 : 1.6);
      switch (z.lead) {
        case 'bell':
          this.tone('sine', f, f, t, dur * 1.5, v * 1.3, dest, 0.003);
          this.tone('sine', f * 2.76, f * 2.76, t, dur * 0.6, v * 0.5, dest, 0.002);
          break;
        case 'saw':
          this.tone('sawtooth', f, f, t, dur, v * 0.8, dest, 0.004, -9);
          this.tone('sawtooth', f, f, t, dur, v * 0.8, dest, 0.004, 9);
          break;
        case 'square':
          this.tone('square', f, f, t, dur, v, dest, 0.003);
          break;
        default:
          this.tone('triangle', f, f, t, dur * 1.3, v * 1.4, dest, 0.01);
          this.tone('sine', f * 2, f * 2, t + sd * 0.5, dur, v * 0.4, dest, 0.01);
          break;
      }
    }
  }

  private pad(t: number, dur: number, m: number, minor: boolean, inten: number, sweep: boolean, bright: boolean): void {
    const c = this.ctx;
    if (!c) return;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = sweep ? 4 : 0.8;
    const cut = 700 + inten * 1600;
    if (sweep) {
      filt.frequency.setValueAtTime(cut * 0.4, t);
      filt.frequency.linearRampToValueAtTime(cut * 1.6, t + dur * 0.5);
      filt.frequency.linearRampToValueAtTime(cut * 0.5, t + dur);
    } else {
      filt.frequency.setValueAtTime(bright ? 3000 : cut, t);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + Math.min(0.4, dur * 0.3));
    g.gain.setValueAtTime(0.07, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    filt.connect(g); g.connect(this.musicIn);
    const iv = minor ? [0, 3, 7] : [0, 4, 7];
    for (let i = 0; i < 3; i++) {
      const f = mtof(m + (iv[i] ?? 0));
      for (let k = 0; k < 2; k++) {
        const o = c.createOscillator();
        o.type = sweep ? 'triangle' : 'sawtooth';
        o.frequency.value = f;
        o.detune.value = k === 0 ? -8 : 8;
        o.connect(filt);
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }

  private kick(t: number, v: number, d: AudioNode): void {
    this.tone('sine', 160, 42, t, 0.2, v, d, 0.002);
    this.noise(t, 0.015, v * 0.15, 'highpass', 3000, 3000, 0.7, d, 0.001);
  }
  private snare(t: number, v: number, d: AudioNode): void {
    this.noise(t, 0.15, v * 0.45, 'highpass', 1800, 1800, 0.7, d, 0.002);
    this.tone('triangle', 220, 120, t, 0.09, v * 0.4, d, 0.002);
  }
  private hat(t: number, v: number, open: boolean, d: AudioNode): void {
    this.noise(t, open ? 0.14 : 0.04, v, 'highpass', 7500, 7500, 0.7, d, 0.001);
  }

  // ---------------------------------------------------------------- primitives

  private tone(type: Wave, f0: number, f1: number, t: number, dur: number, vol: number, d: AudioNode, attack = 0.005, detune = 0): void {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (detune !== 0) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(d);
    o.start(t); o.stop(t + dur + 0.03);
    const e = t + dur + 0.03;
    if (e > this.endT) this.endT = e;
  }

  private noise(t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q: number, d: AudioNode, attack = 0.005): void {
    const c = this.ctx;
    if (!c) return;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(d);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
    const e = t + dur + 0.03;
    if (e > this.endT) this.endT = e;
  }

  // ---------------------------------------------------------------- sfx

  sfx(name: Sfx, param?: number): void {
    const c = this.ctx;
    if (!c) return;
    try {
      const now = c.currentTime;
      let slot = -1;
      for (let i = 0; i < MAX_VOICES; i++) {
        if ((this.voiceEnd[i] ?? 0) <= now) { slot = i; break; }
      }
      if (slot < 0) return; // voice cap: drop
      this.endT = 0;
      this.play(name, param, now + 0.005);
      this.voiceEnd[slot] = Math.max(this.endT, now + 0.05);
    } catch { /* ignore */ }
  }

  private play(name: Sfx, param: number | undefined, t: number): void {
    const d = this.sfxBus;
    const p = param === undefined ? 1 : clamp01(param);
    switch (name) {
      case 'collect': {
        const n = Math.max(0, Math.floor(param ?? 0)) % 11;
        const semis = (PENT[n % 5] ?? 0) + 12 * Math.floor(n / 5);
        const f = 523.25 * Math.pow(2, semis / 12);
        this.tone('square', f, f * 1.02, t, 0.1, 0.2, d, 0.002);
        this.tone('sine', f * 2, f * 2, t, 0.14, 0.14, d, 0.002);
        break;
      }
      case 'gold': {
        const notes = [1046.5, 1318.5, 1568, 2093, 2637];
        for (let i = 0; i < notes.length; i++) {
          const f = notes[i] ?? 1000;
          this.tone('triangle', f, f, t + i * 0.05, 0.22, 0.18, d, 0.003);
          this.tone('sine', f * 2, f * 2, t + i * 0.05, 0.15, 0.06, d, 0.003);
        }
        this.noise(t, 0.35, 0.05, 'highpass', 8000, 8000, 0.7, d, 0.01);
        break;
      }
      case 'jump':
        this.tone('square', 280, 640, t, 0.16, 0.16, d, 0.004);
        this.tone('triangle', 140, 320, t, 0.14, 0.12, d, 0.004);
        break;
      case 'land':
        this.tone('sine', 150, 55, t, 0.14, 0.4 * (0.4 + 0.6 * p), d, 0.002);
        this.noise(t, 0.08, 0.2 * p, 'lowpass', 1500, 400, 0.7, d, 0.002);
        break;
      case 'slide':
        this.noise(t, 0.32, 0.28, 'bandpass', 2200, 500, 1.5, d, 0.03);
        break;
      case 'lane':
        this.noise(t, 0.11, 0.18, 'bandpass', 900, 2200, 1.2, d, 0.01);
        this.tone('triangle', 500, 750, t, 0.08, 0.1, d, 0.003);
        break;
      case 'hit':
        this.noise(t, 0.4, 0.5, 'lowpass', 3500, 250, 0.8, d, 0.002);
        this.tone('sawtooth', 220, 38, t, 0.35, 0.4, d, 0.002);
        this.tone('square', 90, 30, t, 0.3, 0.3, d, 0.002);
        this.noise(t, 0.08, 0.3, 'highpass', 4000, 4000, 0.7, d, 0.001);
        break;
      case 'powerup': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < 4; i++) {
          const f = notes[i] ?? 500;
          this.tone('square', f, f, t + i * 0.06, 0.14, 0.15, d, 0.003);
        }
        this.tone('sine', 400, 1600, t, 0.3, 0.1, d, 0.01);
        break;
      }
      case 'shield':
        this.tone('sine', 400, 900, t, 0.4, 0.2, d, 0.03);
        this.tone('triangle', 1200, 1210, t + 0.05, 0.4, 0.07, d, 0.05);
        this.noise(t, 0.35, 0.05, 'bandpass', 3000, 6000, 3, d, 0.05);
        break;
      case 'shieldbreak':
        this.noise(t, 0.3, 0.3, 'highpass', 5000, 9000, 0.7, d, 0.002);
        this.tone('triangle', 1400, 180, t, 0.35, 0.25, d, 0.002);
        this.tone('square', 900, 120, t, 0.2, 0.1, d, 0.002);
        break;
      case 'overclock':
        this.tone('sawtooth', 90, 1100, t, 0.6, 0.18, d, 0.02);
        this.tone('square', 180, 1800, t, 0.55, 0.08, d, 0.02);
        this.tone('sine', 60, 400, t, 0.5, 0.3, d, 0.01);
        this.noise(t, 0.6, 0.12, 'bandpass', 500, 5000, 1.5, d, 0.05);
        break;
      case 'magnet':
        this.tone('sine', 300, 700, t, 0.4, 0.2, d, 0.02);
        this.tone('sine', 306, 712, t, 0.4, 0.2, d, 0.02);
        this.tone('triangle', 150, 350, t + 0.05, 0.3, 0.1, d, 0.02);
        break;
      case 'ddr':
        this.tone('triangle', 660, 660, t, 0.08, 0.2, d, 0.002);
        this.tone('triangle', 880, 880, t + 0.07, 0.12, 0.2, d, 0.002);
        break;
      case 'cool':
        this.tone('sine', 1568, 1568, t, 0.5, 0.18, d, 0.002);
        this.tone('sine', 2349, 2349, t, 0.4, 0.1, d, 0.002);
        this.tone('sine', 4320, 4320, t, 0.25, 0.04, d, 0.002);
        break;
      case 'closecall':
        this.noise(t, 0.28, 0.3, 'bandpass', 500, 3000, 2, d, 0.08);
        this.tone('triangle', 1200, 1800, t + 0.1, 0.12, 0.12, d, 0.003);
        break;
      case 'ui':
        this.tone('square', 880, 880, t, 0.05, 0.12, d, 0.002);
        this.tone('square', 1320, 1320, t + 0.045, 0.07, 0.12, d, 0.002);
        break;
      case 'uiback':
        this.tone('square', 660, 660, t, 0.05, 0.12, d, 0.002);
        this.tone('square', 440, 440, t + 0.045, 0.08, 0.12, d, 0.002);
        break;
      case 'buy':
        this.tone('square', 987.77, 987.77, t, 0.07, 0.16, d, 0.002);
        this.tone('square', 1318.5, 1318.5, t + 0.07, 0.3, 0.16, d, 0.002);
        this.tone('sine', 2637, 2637, t + 0.07, 0.25, 0.06, d, 0.002);
        break;
      case 'error':
        this.tone('sawtooth', 150, 140, t, 0.12, 0.2, d, 0.003);
        this.tone('sawtooth', 140, 120, t + 0.14, 0.18, 0.2, d, 0.003);
        this.tone('square', 75, 70, t, 0.3, 0.12, d, 0.003);
        break;
      case 'door':
        this.tone('sine', 95, 38, t, 0.4, 0.55, d, 0.003);
        this.noise(t, 0.18, 0.4, 'lowpass', 600, 200, 0.8, d, 0.002);
        this.tone('sawtooth', 120, 240, t + 0.05, 0.25, 0.08, d, 0.03);
        this.tone('sawtooth', 240, 90, t + 0.3, 0.3, 0.08, d, 0.03);
        this.noise(t + 0.55, 0.12, 0.25, 'lowpass', 500, 150, 0.8, d, 0.002);
        break;
      case 'stagecomplete': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < 4; i++) {
          const f = notes[i] ?? 500;
          this.tone('square', f, f, t + i * 0.1, 0.2, 0.14, d, 0.003);
          this.tone('triangle', f * 0.5, f * 0.5, t + i * 0.1, 0.2, 0.12, d, 0.003);
        }
        const ch = [1046.5, 1318.5, 1568];
        for (let i = 0; i < 3; i++) {
          const f = ch[i] ?? 1000;
          this.tone('square', f, f, t + 0.45, 0.6, 0.1, d, 0.005);
          this.tone('sine', f, f, t + 0.45, 0.6, 0.1, d, 0.005);
        }
        break;
      }
      case 'gameover': {
        const notes = [329.63, 293.66, 261.63, 196];
        for (let i = 0; i < 4; i++) {
          const f = notes[i] ?? 200;
          this.tone('sawtooth', f, f * 0.97, t + i * 0.22, i === 3 ? 0.9 : 0.25, 0.14, d, 0.01);
          this.tone('square', f * 0.5, f * 0.48, t + i * 0.22, i === 3 ? 0.9 : 0.25, 0.1, d, 0.01);
        }
        break;
      }
      case 'catch': {
        this.noise(t, 0.6, 0.45, 'bandpass', 300, 1800, 1.5, d, 0.15);
        this.noise(t + 0.3, 0.35, 0.25, 'bandpass', 1800, 200, 1.5, d, 0.02);
        const notes = [392, 370, 330, 294];
        for (let i = 0; i < 4; i++) {
          const f = notes[i] ?? 300;
          this.tone('triangle', f, f * 0.98, t + 0.5 + i * 0.16, 0.25, 0.16, d, 0.01);
        }
        break;
      }
      case 'letter':
        this.tone('triangle', 740, 740, t, 0.07, 0.2, d, 0.002);
        this.tone('triangle', 988, 988, t + 0.06, 0.14, 0.2, d, 0.002);
        break;
      case 'drone':
        this.tone('sawtooth', 160, 260, t, 0.45, 0.1, d, 0.05, -12);
        this.tone('sawtooth', 164, 266, t, 0.45, 0.1, d, 0.05, 12);
        this.noise(t, 0.4, 0.1, 'bandpass', 1200, 2400, 3, d, 0.05);
        break;
      case 'cart':
        for (let i = 0; i < 6; i++) {
          this.noise(t + i * 0.05, 0.04, 0.22, 'bandpass', 1000 + (i % 2) * 700, 1200, 4, d, 0.002);
        }
        this.tone('square', 80, 70, t, 0.35, 0.1, d, 0.02);
        break;
      case 'smash':
        this.noise(t, 0.45, 0.5, 'lowpass', 5000, 300, 0.8, d, 0.002);
        this.tone('square', 200, 45, t, 0.3, 0.3, d, 0.002);
        this.noise(t, 0.25, 0.25, 'highpass', 6000, 6000, 0.7, d, 0.002);
        for (let i = 0; i < 4; i++) {
          this.tone('triangle', 2000 + i * 650, 1500 + i * 400, t + 0.04 + i * 0.045, 0.1, 0.08, d, 0.002);
        }
        break;
      case 'taunt':
        this.tone('square', 520, 520, t, 0.1, 0.14, d, 0.003);
        this.tone('square', 440, 390, t + 0.11, 0.1, 0.14, d, 0.003);
        this.tone('square', 520, 600, t + 0.22, 0.18, 0.14, d, 0.003);
        break;
      case 'whoosh':
        this.noise(t, 0.45, 0.3, 'bandpass', 400, 3000, 1.2, d, 0.18);
        this.noise(t + 0.2, 0.3, 0.15, 'bandpass', 3000, 800, 1.2, d, 0.02);
        break;
      case 'win': {
        const n1 = [523.25, 523.25, 523.25, 783.99, 659.25, 783.99, 1046.5];
        const tm = [0, 0.14, 0.28, 0.42, 0.7, 0.84, 1.0];
        for (let i = 0; i < n1.length; i++) {
          const f = n1[i] ?? 500;
          const dur = i === 6 ? 1.0 : 0.2;
          this.tone('square', f, f, t + (tm[i] ?? 0), dur, 0.14, d, 0.004);
          this.tone('sawtooth', f, f, t + (tm[i] ?? 0), dur, 0.07, d, 0.004, 7);
        }
        const ch = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < 4; i++) {
          const f = ch[i] ?? 500;
          this.tone('triangle', f, f, t + 1.0, 1.2, 0.12, d, 0.01);
        }
        this.tone('sine', 65.4, 65.4, t + 1.0, 1.2, 0.3, d, 0.01);
        break;
      }
      case 'countdown':
        this.tone('square', 660, 660, t, 0.14, 0.2, d, 0.003);
        this.tone('sine', 330, 330, t, 0.14, 0.2, d, 0.003);
        break;
      case 'go':
        this.tone('square', 1320, 1320, t, 0.45, 0.18, d, 0.003);
        this.tone('square', 880, 880, t, 0.45, 0.12, d, 0.003);
        this.tone('sine', 440, 440, t, 0.45, 0.2, d, 0.003);
        break;
    }
  }
}

export const audio = new AudioEngine();
