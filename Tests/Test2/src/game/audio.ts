export type SfxName =
  | "hit"
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

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, freq: number, q = 1, sweepTo?: number, type: BiquadFilterType = "lowpass") {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name: SfxName, p = 0) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const gap = name === "hit" ? 22 : name === "kill" ? 30 : name === "orb" ? 35 : 15;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    switch (name) {
      case "hit":
        this.tone(320 + Math.min(p, 30) * 22, 0.07, "square", 0.09, 200 + Math.min(p, 30) * 12);
        break;
      case "kill":
        this.tone(520 + Math.min(p, 30) * 25, 0.12, "triangle", 0.16, 900 + Math.min(p, 30) * 30);
        this.hiss(0.1, 0.12, 4000, 1, 800, "bandpass");
        break;
      case "boom":
        this.hiss(0.5, 0.5, 1800, 1, 90);
        this.tone(130, 0.4, "sawtooth", 0.25, 38);
        break;
      case "paddle":
        this.tone(190, 0.09, "sine", 0.22, 120);
        break;
      case "perfect":
        this.tone(660, 0.12, "triangle", 0.2);
        this.tone(990, 0.2, "triangle", 0.2, undefined, 0.06);
        this.tone(1320, 0.25, "sine", 0.12, undefined, 0.12);
        break;
      case "launch":
        this.tone(240 + p * 14, 0.06, "sine", 0.06, 520 + p * 14);
        break;
      case "lost":
        this.tone(300, 0.25, "sawtooth", 0.06, 70);
        break;
      case "breach":
        this.hiss(0.6, 0.55, 900, 1, 60);
        this.tone(110, 0.55, "sawtooth", 0.3, 30);
        break;
      case "levelup":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.18, undefined, i * 0.07));
        break;
      case "orb":
        this.tone(900 + Math.min(p, 20) * 40, 0.08, "sine", 0.1, 1400 + Math.min(p, 20) * 40);
        break;
      case "bolt":
        this.hiss(0.12, 0.2, 5000, 2, 1500, "highpass");
        this.tone(1400, 0.08, "sawtooth", 0.05, 300);
        break;
      case "ice":
        this.tone(1800, 0.1, "sine", 0.07, 2600);
        break;
      case "select":
        this.tone(700, 0.08, "square", 0.08, 900);
        break;
      case "fuse":
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, "sawtooth", 0.08, undefined, i * 0.06));
        this.hiss(0.5, 0.2, 800, 1, 5000, "bandpass");
        break;
      case "heal":
        this.tone(660, 0.15, "sine", 0.2);
        this.tone(880, 0.25, "sine", 0.2, undefined, 0.1);
        break;
      case "gameover":
        [440, 370, 311, 220].forEach((f, i) => this.tone(f, 0.4, "sawtooth", 0.14, f * 0.8, i * 0.18));
        break;
      case "net":
        this.tone(500, 0.18, "triangle", 0.18, 1200);
        break;
    }
  }
}
