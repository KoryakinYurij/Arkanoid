/**
 * Paper-and-wood percussion synthesised in the browser.
 *
 * Every sound is built from short oscillator tones plus a band-passed noise
 * burst — no samples, nothing to load, and the whole palette stays dry and
 * tactile the way a print studio would sound.
 */

export type SfxName =
  | "hit"
  | "kill"
  | "armor"
  | "boom"
  | "paddle"
  | "wall"
  | "launch"
  | "lost"
  | "heal"
  | "levelup"
  | "orb"
  | "perfect"
  | "ice"
  | "bolt"
  | "select"
  | "fuse"
  | "gameover"
  | "net";

type Tone = [hz: number, dur: number, vol: number, wave: OscillatorType, end?: number, delay?: number];
type Noise = [dur: number, vol: number, freq: number, q?: number, sweepTo?: number];

interface SoundDef {
  tones: Tone[];
  noise?: Noise;
  /** Rises slightly with the combo counter, the way a good run builds. */
  pitch?: boolean;
}

const SFX: Record<SfxName, SoundDef> = {
  hit: {
    pitch: true,
    tones: [[310, 0.075, 0.2, "triangle", 160]],
    noise: [0.05, 0.14, 2100],
  },
  kill: {
    pitch: true,
    tones: [[290, 0.09, 0.22, "triangle", 120], [620, 0.05, 0.08, "sine", 620]],
    noise: [0.07, 0.18, 2400],
  },
  armor: {
    pitch: true,
    tones: [[610, 0.06, 0.15, "triangle", 340]],
    noise: [0.035, 0.11, 3100],
  },
  boom: {
    tones: [[115, 0.19, 0.35, "triangle", 35]],
    noise: [0.16, 0.34, 680],
  },
  paddle: {
    tones: [[225, 0.085, 0.22, "sine", 120]],
    noise: [0.035, 0.07, 1100],
  },
  wall: {
    tones: [[410, 0.035, 0.07, "sine", 270]],
  },
  launch: {
    tones: [[280, 0.09, 0.2, "triangle", 470]],
    noise: [0.065, 0.12, 1800],
  },
  lost: {
    tones: [[170, 0.32, 0.3, "triangle", 38]],
    noise: [0.15, 0.2, 450],
  },
  heal: {
    tones: [[520, 0.14, 0.18, "sine", 780], [780, 0.2, 0.16, "sine", 1040, 0.08]],
  },
  levelup: {
    tones: [
      [330, 0.13, 0.16, "triangle", 330],
      [440, 0.14, 0.15, "sine", 440, 0.07],
      [660, 0.22, 0.15, "sine", 660, 0.14],
    ],
  },
  orb: {
    tones: [[1180, 0.07, 0.1, "sine", 1620]],
  },
  perfect: {
    tones: [[1320, 0.1, 0.14, "sine", 1320], [1980, 0.16, 0.09, "sine", 1980, 0.05]],
  },
  ice: {
    tones: [[2400, 0.1, 0.06, "sine", 3200]],
  },
  bolt: {
    tones: [[1400, 0.08, 0.05, "sawtooth", 300]],
    noise: [0.12, 0.18, 5000, 2, 1500],
  },
  select: {
    tones: [[700, 0.07, 0.08, "square", 900]],
  },
  fuse: {
    tones: [
      [392, 0.28, 0.09, "sawtooth", 392],
      [523, 0.28, 0.08, "sawtooth", 523, 0.06],
      [659, 0.3, 0.08, "sawtooth", 659, 0.12],
      [1047, 0.34, 0.08, "sine", 1047, 0.18],
    ],
    noise: [0.5, 0.18, 800, 1, 5000],
  },
  gameover: {
    tones: [
      [440, 0.34, 0.13, "sawtooth", 392],
      [370, 0.34, 0.13, "sawtooth", 330],
      [311, 0.4, 0.13, "sawtooth", 262],
      [220, 0.5, 0.13, "sawtooth", 165, 0.16],
    ],
  },
  net: {
    tones: [[500, 0.16, 0.16, "triangle", 1200]],
  },
};

const MAX_VOICES = 32;
const MASTER = 0.48;
const PITCH_STEP = 0.05;
const PITCH_CAP = 20;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private last: Partial<Record<SfxName, number>> = {};
  muted = false;
  failed = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        this.failed = true;
        return;
      }
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 8;
      limiter.knee.value = 8;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.1;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let s = 101;
      for (let i = 0; i < len; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        d[i] = (s / 4294967296) * 2 - 1;
      }
      void this.ctx.resume();
    } catch {
      this.ctx = null;
      this.failed = true;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.015);
    }
  }

  private tone(hz: number, dur: number, vol: number, wave: OscillatorType, end = hz, delay = 0) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted || this.voices >= MAX_VOICES) return;
    this.voices++;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(Math.max(20, hz), t);
    if (end !== hz) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      this.voices--;
    };
  }

  private paperNoise(dur: number, vol: number, freq: number, q = 0.7, sweepTo?: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise || this.muted || this.voices >= MAX_VOICES) return;
    this.voices++;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    g.gain.setValueAtTime(Math.max(0.001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
      this.voices--;
    };
  }

  play(name: SfxName, combo = 0) {
    if (this.muted || this.failed) return;
    const def = SFX[name];
    if (!def) return;
    const now = performance.now();
    const gap = name === "hit" ? 22 : name === "kill" ? 30 : name === "orb" ? 35 : 15;
    const last = this.last[name];
    if (last !== undefined && now - last < gap) return;
    this.last[name] = now;

    const pitch = def.pitch ? 1 + Math.min(combo, PITCH_CAP) * PITCH_STEP : 1;
    for (const [hz, dur, vol, wave, end, delay] of def.tones) {
      this.tone(hz * pitch, dur, vol, wave, (end ?? hz) * pitch, delay ?? 0);
    }
    if (def.noise) {
      const [dur, vol, freq, q, sweepTo] = def.noise;
      this.paperNoise(dur, vol, freq, q, sweepTo);
    }
  }
}
