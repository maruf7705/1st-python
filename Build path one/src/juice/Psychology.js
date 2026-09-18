import * as THREE from 'three';

export class PsychologyEngine {
  constructor(rendererEngine, audioSynth) {
    this.rendererEngine = rendererEngine;
    this.audioSynth = audioSynth;

    // Combo streak system
    this.combo = 1;
    this.maxCombo = 1;
    this.comboTimer = 0;
    this.comboDecayTime = 3.2; // seconds to keep combo alive

    // Near miss cooldown
    this.lastNearMissTime = 0;

    // DOM Elements for feedback
    this.nearMissEl = document.getElementById('near-miss-banner');
    this.flashEl = document.getElementById('flash-overlay');
    this.vignetteEl = document.getElementById('speed-vignette');
    this.comboPill = document.getElementById('combo-container');
    this.comboText = document.getElementById('combo-text');
    this.comboBar = document.getElementById('combo-bar');
    this.floatingScoresContainer = document.getElementById('floating-scores');
    this.celebrationEl = document.getElementById('combo-celebration');
    this.celebrationIcon = document.getElementById('celebration-icon');
    this.celebrationTitle = document.getElementById('celebration-title');

    // Milestones tracked so far in current streak
    this.celebratedMilestones = new Set();
  }

  reset() {
    this.combo = 1;
    this.maxCombo = 1;
    this.comboTimer = 0;
    this.celebratedMilestones.clear();
    this.updateComboUI();
    if (this.vignetteEl) this.vignetteEl.classList.remove('active');
    if (this.floatingScoresContainer) this.floatingScoresContainer.innerHTML = '';
  }

  onCoinCollected(coinType = 'GOLD', value = 1, worldPos = null) {
    this.comboTimer = this.comboDecayTime;
    this.combo++;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    // Audio pitch feedback with dynamic scale
    if (this.audioSynth) {
      this.audioSynth.playCoin(this.combo);
      this.audioSynth.setIntensity(this.audioSynth.speedRatio, this.combo);
    }

    // Visual bump on Apple dynamic island combo pill
    if (this.comboPill) {
      this.comboPill.classList.remove('bump');
      void this.comboPill.offsetWidth; // trigger reflow
      this.comboPill.classList.add('bump');
    }

    // Spawn floating score popup
    const points = value * 10 * this.getMultiplier();
    let typeClass = 'gold';
    if (coinType === 'PLATINUM') typeClass = 'plat';
    else if (coinType === 'DIAMOND') typeClass = 'dia';

    this.spawnScorePopup(`+${points}`, typeClass, worldPos);

    // Speed vignette activated on high streak
    if (this.combo >= 6 && this.vignetteEl) {
      this.vignetteEl.classList.add('active');
    }

    // Check combo milestone celebrations
    this.checkMilestones();
    this.updateComboUI();
  }

  checkMilestones() {
    const milestones = [
      { count: 5, icon: '⚡', title: 'Speed Surge x5!' },
      { count: 10, icon: '🔥', title: 'Overdrive x10!' },
      { count: 15, icon: '💎', title: 'Hyper Drive x15!' },
      { count: 20, icon: '👑', title: 'Godlike Flow x20!' }
    ];

    for (const m of milestones) {
      if (this.combo >= m.count && !this.celebratedMilestones.has(m.count)) {
        this.celebratedMilestones.add(m.count);
        this.triggerMilestoneCelebration(m.icon, m.title);
        break;
      }
    }
  }

  triggerMilestoneCelebration(icon, title) {
    if (!this.celebrationEl) return;

    if (this.celebrationIcon) this.celebrationIcon.innerText = icon;
    if (this.celebrationTitle) this.celebrationTitle.innerText = title;

    this.celebrationEl.classList.remove('hidden');
    this.celebrationEl.classList.remove('celebrate');
    void this.celebrationEl.offsetWidth; // reflow
    this.celebrationEl.classList.add('celebrate');

    // Camera shake celebration kick
    this.rendererEngine.triggerShake(0.18, 0.25);

    // Screen golden tint flash
    if (this.flashEl) {
      this.flashEl.classList.add('flash');
      setTimeout(() => {
        this.flashEl.classList.remove('flash');
      }, 140);
    }

    setTimeout(() => {
      if (this.celebrationEl) this.celebrationEl.classList.add('hidden');
    }, 1200);
  }

  spawnScorePopup(text, typeClass = 'gold', worldPos = null) {
    if (!this.floatingScoresContainer) return;

    const el = document.createElement('div');
    el.className = `floating-score-popup ${typeClass}`;
    el.innerText = text;

    let x = window.innerWidth * 0.5 + (Math.random() - 0.5) * 120;
    let y = window.innerHeight * 0.48 + (Math.random() - 0.5) * 60;

    // Project world position to 2D screen coordinate if available
    if (worldPos && this.rendererEngine && this.rendererEngine.camera) {
      const p = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
      p.project(this.rendererEngine.camera);
      if (p.z < 1) { // in front of camera
        x = (p.x * 0.5 + 0.5) * window.innerWidth;
        y = (-(p.y * 0.5) + 0.5) * window.innerHeight;
      }
    }

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    this.floatingScoresContainer.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 850);
  }

  triggerNearMiss(bonusScoreCallback, worldPos = null) {
    const now = performance.now();
    if (now - this.lastNearMissTime < 650) return; // Debounce
    this.lastNearMissTime = now;

    // 1. Audio whoosh
    if (this.audioSynth) {
      this.audioSynth.playNearMiss();
    }

    // 2. Camera Kick Shake
    this.rendererEngine.triggerShake(0.22, 0.28);

    // 3. Screen Flash
    if (this.flashEl) {
      this.flashEl.classList.add('flash');
      setTimeout(() => {
        this.flashEl.classList.remove('flash');
      }, 120);
    }

    // 4. Near Miss Banner
    if (this.nearMissEl) {
      this.nearMissEl.classList.remove('hidden');
      setTimeout(() => {
        this.nearMissEl.classList.add('hidden');
      }, 700);
    }

    // 5. Floating Popup
    this.spawnScorePopup('+50 CLOSE CALL', 'near-miss', worldPos);

    if (bonusScoreCallback) {
      bonusScoreCallback(50);
    }
  }

  update(deltaTime) {
    if (this.comboTimer > 0) {
      this.comboTimer -= deltaTime;
      const pct = Math.max(0, (this.comboTimer / this.comboDecayTime) * 100);
      if (this.comboBar) {
        this.comboBar.style.width = `${pct}%`;
      }

      if (this.comboTimer <= 0) {
        this.combo = 1;
        this.celebratedMilestones.clear();
        this.updateComboUI();
        if (this.vignetteEl) this.vignetteEl.classList.remove('active');
        if (this.audioSynth) {
          this.audioSynth.setIntensity(this.audioSynth.speedRatio, 1);
        }
      }
    }
  }

  updateComboUI() {
    if (this.comboText) {
      this.comboText.innerText = `x${this.combo}`;
    }
  }

  getMultiplier() {
    if (this.combo >= 20) return 5;
    if (this.combo >= 15) return 4;
    if (this.combo >= 10) return 3;
    if (this.combo >= 5) return 2;
    return 1;
  }
}
