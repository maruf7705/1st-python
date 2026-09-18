export class HUD {
  constructor() {
    this.hudRoot = document.getElementById('hud');
    this.fpsCounter = document.getElementById('fps-counter');
    this.distanceEl = document.getElementById('hud-distance');
    this.speedEl = document.getElementById('hud-speed');
    this.scoreEl = document.getElementById('hud-score');

    this.countGold = document.getElementById('count-gold');
    this.countPlat = document.getElementById('count-plat');
    this.countDia = document.getElementById('count-dia');

    this.magnetTimer = document.getElementById('magnet-timer');
    this.magnetFill = document.getElementById('magnet-fill');
    this.brakeTimer = document.getElementById('brake-timer');
    this.brakeFill = document.getElementById('brake-fill');

    this.biomeBanner = document.getElementById('biome-banner');
    this.biomeName = document.getElementById('biome-name');
  }

  show() {
    this.hudRoot.classList.remove('hidden');
  }

  hide() {
    this.hudRoot.classList.add('hidden');
  }

  update(fps, distance, speed, score, gold, plat, dia, magnetRemaining, brakeRemaining) {
    if (this.fpsCounter) {
      this.fpsCounter.innerText = `${fps} FPS`;
    }

    if (this.distanceEl) {
      this.distanceEl.innerHTML = `${Math.floor(distance)} <small>m</small>`;
    }

    if (this.speedEl) {
      this.speedEl.innerHTML = `${Math.floor(speed * 1.8)} <small>km/h</small>`;
    }

    if (this.scoreEl) {
      this.scoreEl.innerText = String(Math.floor(score)).padStart(6, '0');
    }

    if (this.countGold) this.countGold.innerText = gold;
    if (this.countPlat) this.countPlat.innerText = plat;
    if (this.countDia) this.countDia.innerText = dia;

    // Magnet power-up bar
    if (magnetRemaining > 0) {
      this.magnetTimer.classList.remove('hidden');
      this.magnetFill.style.width = `${(magnetRemaining / 7.0) * 100}%`;
    } else {
      this.magnetTimer.classList.add('hidden');
    }

    // Brake power-up bar
    if (brakeRemaining > 0) {
      this.brakeTimer.classList.remove('hidden');
      this.brakeFill.style.width = `${(brakeRemaining / 5.0) * 100}%`;
    } else {
      this.brakeTimer.classList.add('hidden');
    }
  }

  showBiomeBanner(name) {
    if (!this.biomeBanner || !this.biomeName) return;
    this.biomeName.innerText = name;
    this.biomeBanner.classList.remove('hidden');

    // Reset animation
    this.biomeBanner.style.animation = 'none';
    void this.biomeBanner.offsetWidth;
    this.biomeBanner.style.animation = 'applePillFade 3.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';
  }
}
