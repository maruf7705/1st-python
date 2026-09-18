// High-End Procedural Web Audio Engine for AeroPulse 144
// Designed by Hermes Studio (15-year veteran audio architecture)
export class AudioSynth {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.masterGain = null;
    this.compressor = null;

    // Music Engine State
    this.musicTimer = null;
    this.currentStep = 0;
    this.tempo = 136; // 136 BPM arcade runner pulse
    this.stepDuration = (60 / this.tempo) / 4; // 16th note in seconds (~110ms)
    this.nextNoteTime = 0;
    this.isPlayingMusic = false;

    // Dynamic Intensity (0.0 to 1.0)
    this.intensity = 0.0;
    this.speedRatio = 1.0;
    this.comboLevel = 1;

    // Melodic & Harmonic progressions in A Minor
    // Bass note frequencies
    this.bassNotes = [
      55, 55, 110, 55,    // A1, A1, A2, A1
      65.41, 65.41, 130.81, 65.41, // C2
      73.42, 73.42, 146.83, 73.42, // D2
      49, 49, 98, 49       // G1
    ];

    // Synth Melody Lead (A minor pentatonic/cyber scale)
    this.melodyPattern = [
      440, 0, 523.25, 0,  659.25, 0, 587.33, 523.25,
      440, 0, 392.00, 0,  440, 523.25, 659.25, 0,
      880, 0, 783.99, 0,  659.25, 0, 587.33, 0,
      523.25, 587.33, 659.25, 783.99, 880, 0, 0, 0
    ];

    this.initAudioContext();
  }

  initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();

    // Master Compressor for punchy, cohesive sound
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

    // Master Volume Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setIntensity(speedRatio = 1.0, combo = 1) {
    this.speedRatio = speedRatio;
    this.comboLevel = combo;
    // Intensity scales from 0 to 1 based on speed and combo
    const speedPart = Math.min(1.0, (speedRatio - 1.0) / 0.8);
    const comboPart = Math.min(1.0, combo / 12);
    this.intensity = Math.max(0, Math.min(1.0, speedPart * 0.5 + comboPart * 0.5));
  }

  startMusic() {
    this.resume();
    if (this.isPlayingMusic || !this.ctx) return;
    this.isPlayingMusic = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    // Scheduler tick using high-precision web audio lookahead
    const scheduleAheadTime = 0.1;
    const lookaheadMs = 25;

    const scheduler = () => {
      if (!this.isPlayingMusic) return;

      while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
        this.scheduleStep(this.currentStep, this.nextNoteTime);
        this.nextNoteTime += this.stepDuration;
        this.currentStep = (this.currentStep + 1) % 32;
      }
      this.musicTimer = setTimeout(scheduler, lookaheadMs);
    };

    scheduler();
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  scheduleStep(step, time) {
    if (this.isMuted || !this.ctx) return;

    // 1. Kick Drum (Every beat: steps 0, 4, 8, 12, 16, 20, 24, 28)
    if (step % 4 === 0) {
      this.playKick(time);
    }

    // 2. Snare / Clack on beats 2 and 4 (steps 4, 12, 20, 28) if speed > 1.1 or combo >= 2
    if ((step === 4 || step === 12 || step === 20 || step === 28) && (this.speedRatio > 1.05 || this.comboLevel >= 2)) {
      this.playSnare(time);
    }

    // 3. Hi-Hat (16th notes) - opens up as intensity builds
    if (this.speedRatio > 1.1 || this.comboLevel >= 3) {
      const isAccent = (step % 2 === 0);
      this.playHiHat(time, isAccent);
    }

    // 4. Bass Line (Rolling 16th groove)
    const bassFreq = this.bassNotes[step % this.bassNotes.length];
    if (bassFreq > 0) {
      this.playBassNote(bassFreq, time, step % 2 === 0);
    }

    // 5. Synth Lead Melody (Enters at higher speeds or combo >= 4)
    if (this.comboLevel >= 4 || this.speedRatio > 1.25) {
      const melFreq = this.melodyPattern[step % this.melodyPattern.length];
      if (melFreq > 0) {
        this.playMelodyNote(melFreq, time);
      }
    }
  }

  // --- Drum Synthesizers ---

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Frequency pitch envelope: punchy snap down to sub-bass
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.08);

    gain.gain.setValueAtTime(0.26, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.22);
  }

  playSnare(time) {
    // Noise component
    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(900, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
  }

  playHiHat(time, isAccent = false) {
    const bufferSize = this.ctx.sampleRate * (isAccent ? 0.045 : 0.025);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    const volume = isAccent ? 0.07 : 0.035;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + (isAccent ? 0.045 : 0.025));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
  }

  // --- Melodic Synthesizers ---

  playBassNote(freq, time, isAccent = false) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    // Resonant lowpass filter sweep
    const cutoff = isAccent ? 650 + (this.intensity * 800) : 380 + (this.intensity * 400);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + 0.12);
    filter.Q.setValueAtTime(3.5, time);

    const vol = isAccent ? 0.09 : 0.06;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  playMelodyNote(freq, time) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.004, time); // Subtle detune for shimmer

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, time);
    filter.Q.setValueAtTime(2.0, time);

    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.17);
    osc2.stop(time + 0.17);
  }

  // --- Sound Effects (SFX) ---

  // Pentatonic Coin Chimes with Harmonized Dual-Tone Overtones
  playCoin(combo = 1) {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];
    const pitch = scale[(combo - 1) % scale.length];

    // Primary bell tone
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.35, this.ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.16, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.18);

    // Harmonic sparkle octave
    const harm = this.ctx.createOscillator();
    const harmGain = this.ctx.createGain();
    harm.type = 'triangle';
    harm.frequency.setValueAtTime(pitch * 2, this.ctx.currentTime);
    harmGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    harmGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);

    harm.connect(harmGain);
    harmGain.connect(this.masterGain);
    harm.start();
    harm.stop(this.ctx.currentTime + 0.14);
  }

  // Diamond pickup: Sparkling crystalline arpeggio
  playDiamond() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const notes = [1046.50, 1318.51, 1567.98, 2093.00, 2637.02];
    notes.forEach((f, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.14, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.22);
      }, i * 35);
    });
  }

  // Power-up activation (Magnet Ring / Chrono Brake)
  playPowerup() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    // Ascending cyber surge
    const freqs = [440, 554.37, 659.25, 880, 1108.73];
    freqs.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.18);
      }, idx * 45);
    });
  }

  // Jump: Dynamic rising swoosh
  playJump() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(520, this.ctx.currentTime + 0.16);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  // Slide: High-tech friction sweep
  playSlide() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const bufferSize = this.ctx.sampleRate * 0.24;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(260, this.ctx.currentTime + 0.24);
    filter.Q.value = 3.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.24);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // Thunder: Crisp electric snap followed by deep rolling sub-bass
  playThunder() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    // 1. Electric Snap
    const snap = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snap.type = 'sawtooth';
    snap.frequency.setValueAtTime(1100, this.ctx.currentTime);
    snap.frequency.exponentialRampToValueAtTime(70, this.ctx.currentTime + 0.25);

    snapGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    snapGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);

    snap.connect(snapGain);
    snapGain.connect(this.masterGain);
    snap.start();
    snap.stop(this.ctx.currentTime + 0.28);

    // 2. Sub Rumble
    const rumble = this.ctx.createOscillator();
    const rumbleGain = this.ctx.createGain();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(115, this.ctx.currentTime);
    rumble.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.7);

    rumbleGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.75);

    rumble.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);
    rumble.start();
    rumble.stop(this.ctx.currentTime + 0.75);
  }

  // Near Miss: High-speed sonic pulse
  playNearMiss() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(240, this.ctx.currentTime + 0.26);

    gain.gain.setValueAtTime(0.28, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  // Air Dash: Supersonic whoosh & bass sweep
  playAirDash() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, this.ctx.currentTime + 0.28);

    gain.gain.setValueAtTime(0.38, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  // Wall Run: Electric high-frequency friction hum
  playWallRun() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(460, this.ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  // Wall Kick: High energy spring impulse
  playWallKick() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(680, this.ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.22);
  }

  // Crash / Impact: Cinematic heavy thud
  playCrash() {
    if (this.isMuted || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(25, this.ctx.currentTime + 0.45);

    gain.gain.setValueAtTime(0.45, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }
}
