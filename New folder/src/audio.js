// audio.js — fully synthesized SFX + procedural music (original, no samples)
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = false;
    this.musicOn = false;
    this._nextNote = 0;
    this._step = 0;
    this._noiseBuf = null;
    this._lastRing = 0;
    this.ringArp = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9;
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      // noise buffer
      const len = this.ctx.sampleRate * 1;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { console.warn('audio init failed', e); return false; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  _osc(type, freq, t0, dur, vol, slideTo, dest) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  _noise(t0, dur, vol, freq = 1200, q = 1, slideTo) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  ring() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (t - this._lastRing < 0.045) return; // throttle for ring trains
    this._lastRing = t;
    const base = 988 * Math.pow(1.0595, [0, 4, 7, 12][this.ringArp++ % 4]);
    this._osc('sine', base, t, 0.18, 0.16);
    this._osc('sine', base * 2, t, 0.09, 0.06);
  }

  jump() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    this._osc('square', 300, t, 0.16, 0.09, 640);
    this._noise(t, 0.08, 0.03, 900, 1, 2400);
  }

  spring() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    this._osc('sawtooth', 220, t, 0.3, 0.1, 1100);
    this._osc('sine', 440, t + 0.02, 0.25, 0.08, 1760);
  }

  boost() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    this._osc('sawtooth', 140, t, 0.5, 0.12, 900);
    this._noise(t, 0.4, 0.07, 500, 0.7, 4000);
  }

  hit() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    this._noise(t, 0.3, 0.22, 400, 0.8, 120);
    this._osc('square', 180, t, 0.25, 0.14, 60);
  }

  destroy() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    this._noise(t, 0.25, 0.18, 1800, 0.8, 200);
    this._osc('square', 400, t, 0.2, 0.1, 90);
  }

  checkpoint() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => this._osc('triangle', f, t + i * 0.09, 0.22, 0.12));
  }

  death() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    this._noise(t, 0.5, 0.2, 800, 0.6, 80);
    [440, 349, 262].forEach((f, i) => this._osc('sawtooth', f, t + i * 0.12, 0.3, 0.1, f * 0.7));
  }

  finish() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this._osc('triangle', f, t + i * 0.11, 0.3, 0.12));
  }

  ui() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    this._osc('sine', 740, t, 0.08, 0.08);
  }

  grind() {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    if (t - (this._lastGrind || 0) < 0.09) return;
    this._lastGrind = t;
    this._noise(t, 0.12, 0.05, 2600, 3, 1800);
  }

  // ---- procedural music: 126 BPM, minor pentatonic, 8-step bass + sparse lead ----
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this._nextNote = this.ctx.currentTime + 0.1;
    this._step = 0;
  }
  stopMusic() { this.musicOn = false; }

  updateMusic() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const eighth = 60 / 126 / 2;
    while (this._nextNote < this.ctx.currentTime + 0.15) {
      const t = this._nextNote, s = this._step % 64;
      // kick
      if (s % 8 === 0 || s % 16 === 10) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.18);
      }
      // hat
      if (s % 4 === 2) {
        const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
        const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(f); f.connect(g); g.connect(this.musicGain);
        src.start(t); src.stop(t + 0.06);
      }
      // bass (A minor pentatonic roots)
      const bassLine = [110, 0, 110, 130.8, 0, 110, 98, 110,  110, 0, 110, 146.8, 0, 130.8, 98, 110];
      const bf = bassLine[s % 16];
      if (bf) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = bf / 2;
        f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(180, t + eighth * 0.9);
        g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + eighth * 0.95);
        o.connect(f); f.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + eighth);
      }
      // lead arp every 2nd bar, quiet
      if (s >= 32 && s % 2 === 0) {
        const lead = [440, 523, 659, 587, 523, 659, 880, 784, 659, 523, 440, 392, 440, 523, 587, 659];
        const lf = lead[(s / 2) % 16];
        if (lf) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'square'; o.frequency.value = lf;
          g.gain.setValueAtTime(0.045, t); g.gain.exponentialRampToValueAtTime(0.001, t + eighth * 1.6);
          o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + eighth * 1.7);
        }
      }
      this._nextNote += eighth;
      this._step++;
    }
  }
}
