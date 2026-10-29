/**
 * Sound: optional background music + tiny synthesized effects (no files).
 *
 *  • Nothing is created or played before the viewer's first touch / click / key —
 *    the AudioContext is born inside that gesture, so autoplay rules are respected
 *    and the console stays clean.
 *  • Effects (chimes, the glassy hover "tink") are quiet and on by default after that
 *    first gesture; `birthdayConfig.sound` can turn them off or down.
 *  • Music is always opt-in via the button, and only fetched when asked for.
 */

import { birthdayConfig } from '../config/birthday';

type Listener = (on: boolean) => void;

const PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17];

class SoundSystem {
  private effects: boolean;
  private musicOn = false;
  private unlocked = false;
  /** The audio device failed (unplugged, busy…) — stay silent rather than retry. */
  private broken = false;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  /** 0 = the song at its own volume, 1 = silent (a quiet moment of the story lowers it) */
  private duckLevel = 0;
  private fadeId = 0;
  private listeners = new Set<Listener>();
  private hovering = new Set<string>();
  private lastHoverAt = new Map<string, number>();
  private lastAnyHover = 0;
  musicAvailable: boolean | null = null;

  constructor(
    private musicSrc: string,
    private volume: number,
    private effectsVolume: number,
    effects: boolean,
  ) {
    this.effects = effects;
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlocked = true;
        this.ensureContext();
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      };
      window.addEventListener('pointerdown', unlock, true);
      window.addEventListener('keydown', unlock, true);
    }
  }

  /** What the sound button shows: music when there is a song, otherwise the effects. */
  get on(): boolean {
    return this.musicAvailable === false ? this.effects : this.musicOn;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Checks (once) whether the configured music file actually exists. */
  async probeMusic(): Promise<boolean> {
    if (this.musicAvailable !== null) return this.musicAvailable;
    try {
      const res = await fetch(this.musicSrc, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      this.musicAvailable = res.ok && /audio|octet-stream/.test(type);
    } catch {
      this.musicAvailable = false;
    }
    this.emit();
    return this.musicAvailable;
  }

  async toggle(): Promise<void> {
    this.unlocked = true;
    this.ensureContext();
    if (await this.probeMusic()) {
      this.musicOn = !this.musicOn;
      if (this.musicOn) {
        this.effects = true;
        if (!this.music) {
          this.music = new Audio(this.musicSrc);
          this.music.loop = true;
          this.music.volume = 0;
          this.music.preload = 'auto';
        }
        this.music.play().then(() => this.fade(this.music!, this.volume * (1 - this.duckLevel), 1200)).catch(() => {});
      } else if (this.music) {
        const m = this.music;
        this.fade(m, 0, 500, () => m.pause());
      }
    } else {
      this.effects = !this.effects;
      if (this.effects) this.chime(4, 0.05);
    }
    this.emit();
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.on));
  }

  /** Lower the music under a quiet moment (0 = full, 1 = silent), or bring it back. */
  duck(amount: number, ms = 1800): void {
    this.duckLevel = Math.min(1, Math.max(0, amount));
    if (this.music && this.musicOn) this.fade(this.music, this.volume * (1 - this.duckLevel), ms);
  }

  private fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
    const from = el.volume;
    const start = performance.now();
    // a newer fade takes over (no two fades fighting over the volume)
    const id = ++this.fadeId;
    const step = (now: number) => {
      if (id !== this.fadeId) return;
      const t = Math.min(1, (now - start) / ms);
      el.volume = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  private ensureContext(): AudioContext | null {
    if (!this.unlocked || this.broken) return null;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.ctx.addEventListener?.('error', () => {
        this.broken = true;
      });
      // a gentle master bus: soft compression keeps stacked chimes from ever getting loud
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 4;
      this.out = this.ctx.createGain();
      this.out.gain.value = this.effectsVolume;
      this.out.connect(comp).connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private ready(): AudioContext | null {
    if (!this.effects || !this.unlocked) return null;
    const ctx = this.ensureContext();
    return ctx && ctx.state !== 'closed' ? ctx : null;
  }

  /** A bell-like tone made of a few sine partials with an exponential decay. */
  private bell(freq: number, gain: number, decay: number, partials: readonly (readonly [number, number])[], delay = 0) {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    try {
      const now = ctx.currentTime + delay;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(gain, now + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      env.connect(this.out);
      for (const [mult, g] of partials) {
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        og.gain.value = g;
        osc.connect(og).connect(env);
        osc.start(now);
        osc.stop(now + decay + 0.05);
      }
    } catch {
      /* audio is decoration — never let it break anything */
    }
  }

  /** A soft glassy bell. `pitch` 0..n walks up a pentatonic scale. */
  chime(pitch = 0, gain = 0.07): void {
    const freq = 659.25 * Math.pow(2, PENTATONIC[pitch % PENTATONIC.length] / 12); // from E5
    this.bell(freq, gain, 2.2, [
      [1, 1],
      [2.01, 0.25],
      [3.02, 0.08],
    ]);
  }

  /** A short rising arpeggio for big moments. */
  flourish(): void {
    [0, 2, 4, 5].forEach((p, i) => setTimeout(() => this.chime(p, 0.05), i * 110));
  }

  /**
   * The sound of scattered light gathering: a soft rising breath of air, a shower of
   * tiny glassy bells that grows denser as the points fly together, and a warm chord
   * blooming the moment the heart is whole. `seconds` matches the visual.
   */
  gather(seconds = 3.2): void {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    try {
      const now = ctx.currentTime;
      // air: filtered noise whose band sweeps upward
      const len = Math.ceil(ctx.sampleRate * (seconds + 0.8));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.4;
      band.frequency.setValueAtTime(380, now);
      band.frequency.exponentialRampToValueAtTime(3600, now + seconds);
      const air = ctx.createGain();
      air.gain.setValueAtTime(0.0001, now);
      air.gain.exponentialRampToValueAtTime(0.05, now + seconds * 0.7);
      air.gain.exponentialRampToValueAtTime(0.0001, now + seconds + 0.7);
      noise.connect(band).connect(air).connect(this.out);
      noise.start(now);
      noise.stop(now + seconds + 0.8);
    } catch {
      /* decoration only */
    }
    // sparkles: sparse at first, denser as the light converges
    const n = 30;
    for (let i = 0; i < n; i++) {
      const at = Math.pow(i / n, 0.7) * seconds * 0.92 + Math.random() * 0.06;
      const pitch = 7 + ((Math.random() * 8) | 0);
      const freq = 659.25 * Math.pow(2, PENTATONIC[pitch % PENTATONIC.length] / 12 + Math.floor(pitch / PENTATONIC.length));
      this.bell(freq, 0.01 + Math.random() * 0.014, 0.7 + Math.random() * 0.5, [[1, 1], [2.76, 0.2]], at);
    }
    // the heart is whole
    [0, 2, 4, 7].forEach((p, i) => {
      const freq = 329.63 * Math.pow(2, PENTATONIC[p % PENTATONIC.length] / 12 + Math.floor(p / PENTATONIC.length));
      this.bell(freq, 0.035, 3.2, [[1, 1], [2.01, 0.2], [3.02, 0.06]], seconds + i * 0.05);
    });
  }

  /**
   * A puppy's single happy "woof": a buzzy voice that jumps up and falls away, shaped
   * by a mouth-like band, with a little breath of air on top.
   */
  bark(): void {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    try {
      const now = ctx.currentTime;
      const voice = ctx.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(430, now);
      voice.frequency.exponentialRampToValueAtTime(690, now + 0.035);
      voice.frequency.exponentialRampToValueAtTime(300, now + 0.2);
      const mouth = ctx.createBiquadFilter();
      mouth.type = 'bandpass';
      mouth.Q.value = 2.2;
      mouth.frequency.setValueAtTime(900, now);
      mouth.frequency.exponentialRampToValueAtTime(1400, now + 0.04);
      mouth.frequency.exponentialRampToValueAtTime(700, now + 0.2);
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 2600;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.32, now + 0.012);
      env.gain.exponentialRampToValueAtTime(0.12, now + 0.09);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      voice.connect(mouth).connect(soft).connect(env).connect(this.out);
      voice.start(now);
      voice.stop(now + 0.26);
      // breath
      const len = Math.ceil(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1800;
      band.Q.value = 1.2;
      const air = ctx.createGain();
      air.gain.setValueAtTime(0.0001, now);
      air.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      air.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      noise.connect(band).connect(air).connect(this.out);
      noise.start(now);
      noise.stop(now + 0.12);
    } catch {
      /* decoration only */
    }
  }

  /** A soft breath, as when blowing out birthday candles: a short swell of filtered air. */
  blow(): void {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    try {
      const now = ctx.currentTime;
      const len = Math.ceil(ctx.sampleRate * 0.6);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const band = ctx.createBiquadFilter();
      band.type = 'lowpass';
      band.frequency.setValueAtTime(700, now);
      band.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
      band.frequency.exponentialRampToValueAtTime(400, now + 0.5);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.09, now + 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      noise.connect(band).connect(env).connect(this.out);
      noise.start(now);
      noise.stop(now + 0.6);
    } catch {
      /* decoration only */
    }
  }

  /** The deep, muffled "thump" under a heartbeat. */
  thump(strength = 1): void {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    try {
      [0, 0.34].forEach((at, i) => {
        const now = ctx.currentTime + at;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(92, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
        const peak = 0.16 * strength * (i ? 0.55 : 1);
        env.gain.setValueAtTime(0.0001, now);
        env.gain.exponentialRampToValueAtTime(peak, now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
        osc.connect(env).connect(this.out!);
        osc.start(now);
        osc.stop(now + 0.35);
      });
    } catch {
      /* ignore */
    }
  }

  /**
   * A tiny glass "tink" when a pointer first rests on an object. Plays once per
   * hover session per object, never more than every ~0.7 s for the same object,
   * and never stacks when the pointer skims across several at once.
   */
  hover(key: string): void {
    if (this.hovering.has(key)) return;
    this.hovering.add(key);
    const now = performance.now();
    if (now - (this.lastHoverAt.get(key) ?? -1e9) < 700 || now - this.lastAnyHover < 120) return;
    this.lastHoverAt.set(key, now);
    this.lastAnyHover = now;
    const pitch = [7, 8, 9, 10, 11][Math.abs(hash(key)) % 5];
    const freq = 659.25 * Math.pow(2, PENTATONIC[pitch % PENTATONIC.length] / 12 + 1);
    this.bell(freq, 0.018, 0.9, [
      [1, 1],
      [2.76, 0.18],
    ]);
  }

  hoverEnd(key: string): void {
    this.hovering.delete(key);
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const cfg = birthdayConfig;
export const sound = new SoundSystem(cfg.music.src, cfg.music.volume, cfg.sound.volume, cfg.sound.effects);
