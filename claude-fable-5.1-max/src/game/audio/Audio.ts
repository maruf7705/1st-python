// Fully procedural sound effects via WebAudio (no external assets).

export class AudioSys {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private grindGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  private boostOsc: OscillatorNode | null = null;
  private ringToggle = 0;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // wind loop
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "lowpass";
    this.windFilter.frequency.value = 300;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // grind loop (bandpassed noise)
    const grind = ctx.createBufferSource();
    grind.buffer = buf;
    grind.loop = true;
    const gf = ctx.createBiquadFilter();
    gf.type = "bandpass";
    gf.frequency.value = 2200;
    gf.Q.value = 2.5;
    this.grindGain = ctx.createGain();
    this.grindGain.gain.value = 0;
    grind.connect(gf).connect(this.grindGain).connect(this.master);
    grind.start();

    // boost drone
    this.boostOsc = ctx.createOscillator();
    this.boostOsc.type = "sawtooth";
    this.boostOsc.frequency.value = 80;
    const bf = ctx.createBiquadFilter();
    bf.type = "lowpass";
    bf.frequency.value = 600;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    this.boostOsc.connect(bf).connect(this.boostGain).connect(this.master);
    this.boostOsc.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, pan = 0, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = g;
    if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    osc.connect(g);
    node.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = "bandpass"): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  ring(): void {
    this.ringToggle ^= 1;
    const pan = this.ringToggle ? 0.5 : -0.5;
    this.tone(1318, 0.09, "sine", 0.18, undefined, pan);
    this.tone(1975, 0.16, "sine", 0.14, undefined, pan, 0.05);
  }
  jump(): void {
    this.tone(320, 0.16, "square", 0.08, 760);
  }
  homing(): void {
    this.tone(600, 0.12, "sawtooth", 0.07, 1400);
    this.noise(0.12, 0.08, 1800, 1.5);
  }
  enemy(chain: number): void {
    this.noise(0.18, 0.2, 900, 0.8);
    this.tone(220 + chain * 60, 0.18, "triangle", 0.15, 90 + chain * 30);
    this.tone(880 + chain * 120, 0.12, "sine", 0.08, undefined, 0, 0.03);
  }
  crate(): void {
    this.noise(0.22, 0.25, 500, 0.7, "lowpass");
    this.tone(160, 0.14, "square", 0.06, 60);
  }
  hit(): void {
    this.tone(380, 0.35, "sawtooth", 0.18, 70);
    this.noise(0.3, 0.2, 700, 0.6);
    for (let i = 0; i < 5; i++) this.tone(1200 + Math.random() * 600, 0.08, "sine", 0.05, undefined, (Math.random() - 0.5) * 1.5, i * 0.03);
  }
  death(): void {
    this.tone(500, 0.6, "sawtooth", 0.16, 60);
    this.tone(250, 0.6, "square", 0.08, 40);
  }
  checkpoint(): void {
    const notes = [659, 830, 987, 1318];
    notes.forEach((n, i) => this.tone(n, 0.18, "triangle", 0.12, undefined, 0, i * 0.07));
  }
  boostPad(): void {
    this.tone(200, 0.35, "sawtooth", 0.14, 900);
    this.noise(0.35, 0.15, 1200, 0.8);
  }
  spring(): void {
    this.tone(180, 0.25, "square", 0.1, 1100);
    this.tone(360, 0.25, "sine", 0.08, 1500);
  }
  dashRing(): void {
    this.tone(700, 0.2, "triangle", 0.12, 1800);
    this.noise(0.2, 0.12, 2500, 1.2);
  }
  land(impact: number): void {
    const v = Math.min(0.25, 0.04 + impact * 0.008);
    this.noise(0.12, v, 250, 0.7, "lowpass");
  }
  goal(): void {
    const notes = [523, 659, 783, 1046, 1318];
    notes.forEach((n, i) => {
      this.tone(n, 0.35, "triangle", 0.14, undefined, 0, i * 0.11);
      this.tone(n * 0.5, 0.35, "sine", 0.08, undefined, 0, i * 0.11);
    });
  }
  menu(): void {
    this.tone(880, 0.08, "sine", 0.08, 1100);
  }

  /** Continuous layers; call every frame. */
  setLoops(speedN: number, boosting: boolean, grinding: boolean): void {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.grindGain || !this.boostGain || !this.boostOsc) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(Math.pow(speedN, 1.5) * 0.35, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(200 + speedN * 1400, t, 0.1);
    this.grindGain.gain.setTargetAtTime(grinding ? 0.12 + speedN * 0.1 : 0, t, 0.05);
    this.boostGain.gain.setTargetAtTime(boosting ? 0.12 : 0, t, 0.08);
    this.boostOsc.frequency.setTargetAtTime(70 + speedN * 90, t, 0.1);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }
  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }
}
