export type SfxName =
  | "hit"
  | "wall"
  | "kill"
  | "boom"
  | "paddle"
  | "perfect"
  | "launch"
  | "lost"
  | "breach"
  | "levelup"
  | "orb"
  | "bolt"
  | "ice"
  | "select"
  | "fuse"
  | "heal"
  | "gameover"
  | "net";

// Frequency, duration, gain, material, ending frequency, delay.
type Note = readonly [number, number, number, "sine" | "triangle", number?, number?];
type Paper = readonly [duration: number, gain: number, frequency: number];
type Cue = { notes: readonly Note[]; paper?: Paper; pitched?: boolean; gap?: number };
type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] };

const MASTER_VOLUME = 0.48;
const AUDIO_FLOOR = 0.0001;
const MAX_VOICES = 32;

// Dry wood taps and short paper brushes share the visual reference's quiet palette.
const CUES: Record<SfxName, Cue> = {
  wall: { notes: [[390, 0.045, 0.065, "sine", 240]], gap: 35 },
  hit: {
    notes: [[610, 0.06, 0.15, "triangle", 340]],
    paper: [0.035, 0.11, 3100], pitched: true, gap: 22,
  },
  kill: {
    notes: [[310, 0.075, 0.24, "triangle", 160], [640, 0.045, 0.09, "sine"]],
    paper: [0.055, 0.16, 2100], pitched: true, gap: 30,
  },
  boom: {
    notes: [[115, 0.19, 0.35, "triangle", 35]],
    paper: [0.16, 0.34, 680], gap: 65,
  },
  paddle: {
    notes: [[225, 0.085, 0.22, "sine", 120]],
    paper: [0.035, 0.07, 1100],
  },
  perfect: {
    notes: [[440, 0.09, 0.17, "triangle"], [660, 0.13, 0.14, "sine", 660, 0.045], [880, 0.16, 0.09, "sine", 880, 0.09]],
    paper: [0.035, 0.06, 1800], gap: 110,
  },
  launch: {
    notes: [[280, 0.09, 0.14, "triangle", 470]],
    paper: [0.065, 0.08, 1800], gap: 25,
  },
  lost: {
    notes: [[170, 0.24, 0.19, "triangle", 55]],
    paper: [0.12, 0.12, 450], gap: 70,
  },
  breach: {
    notes: [[170, 0.32, 0.3, "triangle", 38]],
    paper: [0.15, 0.2, 450], gap: 180,
  },
  levelup: {
    notes: [[330, 0.13, 0.16, "triangle"], [440, 0.14, 0.15, "sine", 440, 0.07], [660, 0.22, 0.15, "sine", 660, 0.14]],
    gap: 160,
  },
  orb: {
    notes: [[780, 0.065, 0.08, "sine", 940]], pitched: true, gap: 35,
  },
  bolt: {
    notes: [[580, 0.045, 0.12, "triangle", 280], [420, 0.04, 0.065, "sine", 240, 0.03]],
    paper: [0.055, 0.14, 2300], gap: 45,
  },
  ice: {
    notes: [[1174, 0.09, 0.065, "sine", 1046], [1568, 0.06, 0.035, "sine", 1397, 0.025]],
    paper: [0.045, 0.05, 3400], gap: 55,
  },
  select: { notes: [[410, 0.035, 0.065, "sine", 270]], gap: 50 },
  fuse: {
    notes: [[330, 0.13, 0.14, "triangle"], [440, 0.14, 0.13, "triangle", 440, 0.06], [660, 0.18, 0.12, "sine", 660, 0.12], [880, 0.22, 0.09, "sine", 880, 0.18]],
    paper: [0.13, 0.12, 1500], gap: 200,
  },
  heal: {
    notes: [[440, 0.14, 0.14, "sine"], [660, 0.22, 0.14, "sine", 660, 0.09]],
    gap: 120,
  },
  gameover: {
    notes: [[294, 0.15, 0.15, "triangle"], [247, 0.15, 0.14, "triangle", 247, 0.13], [196, 0.22, 0.13, "sine", 180, 0.26], [147, 0.28, 0.12, "triangle", 90, 0.42]],
    paper: [0.16, 0.12, 520], gap: 600,
  },
  net: {
    notes: [[330, 0.11, 0.15, "sine", 470]],
    paper: [0.065, 0.1, 850], gap: 70,
  },
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private waking: AudioContext | null = null;
  private voices = new Set<Voice>();
  private last = new Map<SfxName, number>();
  muted = false;

  // Called by the game's user gestures, never from play or a background timer.
  init() {
    if (this.ctx?.state === "closed") this.destroy();
    if (!this.ctx) {
      let context: AudioContext | null = null;
      let master: GainNode | null = null;
      let compressor: DynamicsCompressorNode | null = null;
      try {
        const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
        const Audio = scope.AudioContext || scope.webkitAudioContext;
        if (!Audio) return;
        context = new Audio({ latencyHint: "interactive" });
        master = context.createGain();
        master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.ratio.value = 8;
        compressor.knee.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.1;
        master.connect(compressor);
        compressor.connect(context.destination);

        const noise = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * 0.25)), context.sampleRate);
        const samples = noise.getChannelData(0);
        let seed = 0x51deef;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = (seed / 4294967296 * 2 - 1) * 0.6;
        }
        this.ctx = context;
        this.master = master;
        this.compressor = compressor;
        this.noise = noise;
      } catch {
        this.disconnect([master, compressor]);
        if (context) this.close(context);
        return;
      }
    }

    const context = this.ctx;
    this.rampMaster();
    if (context.state !== "running" && this.waking !== context) {
      this.waking = context;
      try {
        void context.resume().then(() => {
          if (this.ctx === context) this.rampMaster();
        }, () => {}).finally(() => {
          if (this.waking === context) this.waking = null;
        });
      } catch {
        this.waking = null;
      }
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.rampMaster();
  }

  private rampMaster() {
    if (!this.ctx || !this.master || this.ctx.state === "closed") return;
    const gain = this.master.gain;
    const now = this.ctx.currentTime;
    try {
      if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
      else {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
      }
      gain.linearRampToValueAtTime(this.muted ? 0 : MASTER_VOLUME, now + 0.025);
    } catch {
      // Audio can disappear while a tab is being suspended or closed.
    }
  }

  private disconnect(nodes: (AudioNode | null)[]) {
    for (const node of nodes) {
      try { node?.disconnect(); } catch { /* Already disconnected. */ }
    }
  }

  private release(voice: Voice, stop = false) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    if (stop) {
      try { voice.source.stop(); } catch { /* Already stopped. */ }
    }
    this.disconnect(voice.nodes);
  }

  private schedule(source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, end: number) {
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    try {
      source.start(start);
      source.stop(end);
    } catch {
      this.release(voice, true);
    }
  }

  private tone(note: Note, pitch: number) {
    if (!this.ctx || !this.master || this.ctx.state !== "running" || this.voices.size >= MAX_VOICES) return;
    let oscillator: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    try {
      const [frequency, duration, volume, type, end = frequency, delay = 0] = note;
      const t = this.ctx.currentTime + delay;
      oscillator = this.ctx.createOscillator();
      gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * pitch, t);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end * pitch), t + duration);
      gain.gain.setValueAtTime(AUDIO_FLOOR, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(AUDIO_FLOOR, t + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      this.schedule(oscillator, [oscillator, gain], t, t + duration + 0.02);
    } catch {
      this.disconnect([oscillator, gain]);
    }
  }

  private paper(paper: Paper) {
    if (!this.ctx || !this.master || !this.noise || this.ctx.state !== "running" || this.voices.size >= MAX_VOICES) return;
    let source: AudioBufferSourceNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let gain: GainNode | null = null;
    try {
      const [duration, volume, frequency] = paper;
      const t = this.ctx.currentTime;
      source = this.ctx.createBufferSource();
      source.buffer = this.noise;
      filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 0.7;
      gain = this.ctx.createGain();
      gain.gain.setValueAtTime(AUDIO_FLOOR, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(AUDIO_FLOOR, t + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      this.schedule(source, [source, filter, gain], t, t + duration);
    } catch {
      this.disconnect([source, filter, gain]);
    }
  }

  play(name: SfxName, p = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    const cue = CUES[name];
    const now = this.ctx.currentTime;
    const previous = this.last.get(name);
    if (previous !== undefined && (now - previous) * 1000 < (cue.gap ?? 15)) return;
    this.last.set(name, now);
    const pitch = cue.pitched ? 1 + Math.min(20, Math.max(0, Number.isFinite(p) ? p : 0)) * 0.05 : 1;
    for (const note of cue.notes) this.tone(note, pitch);
    if (cue.paper) this.paper(cue.paper);
  }

  private close(context: AudioContext) {
    try {
      if (context.state !== "closed") void context.close().catch(() => {});
    } catch { /* Closing is also safe when audio is unavailable. */ }
  }

  destroy() {
    for (const voice of this.voices) this.release(voice, true);
    this.disconnect([this.master, this.compressor]);
    if (this.ctx) this.close(this.ctx);
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.noise = null;
    this.waking = null;
    this.last.clear();
  }
}

