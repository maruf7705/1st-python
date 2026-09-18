export class Menu {
  constructor(callbacks) {
    this.callbacks = callbacks; // { onStart, onSelectChar, onToggleDayNight, onSetMode }
    this.selectedChar = 'boy';
    this.selectedMode = 'day';

    // DOM Elements
    this.menuScreen = document.getElementById('menu-screen');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.btnStart = document.getElementById('btn-start');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnOpenShop = document.getElementById('btn-open-shop');
    this.btnGameOverShop = document.getElementById('btn-gameover-shop');
    this.btnToggleDayNight = document.getElementById('btn-toggle-daynight');
    this.daynightIcon = document.getElementById('daynight-icon');

    // Cards
    this.cardLeo = document.getElementById('card-leo');
    this.cardNova = document.getElementById('card-nova');

    // Option pills
    this.optDay = document.getElementById('opt-day');
    this.optNight = document.getElementById('opt-night');
    this.optCycle = document.getElementById('opt-cycle');

    // Game Over Results
    this.resScore = document.getElementById('res-score');
    this.resBest = document.getElementById('res-best');
    this.resDistance = document.getElementById('res-distance');
    this.resCombo = document.getElementById('res-combo');
    this.resGold = document.getElementById('res-gold');
    this.resPlat = document.getElementById('res-plat');
    this.resDia = document.getElementById('res-dia');

    this.bestScore = parseInt(localStorage.getItem('aeropulse_high_score') || '0', 10);

    this.initListeners();
  }

  initListeners() {
    // Character selection
    this.cardLeo.addEventListener('click', () => this.selectCharacter('boy'));
    this.cardNova.addEventListener('click', () => this.selectCharacter('girl'));

    // Mode options
    this.optDay.addEventListener('click', () => this.selectMode('day'));
    this.optNight.addEventListener('click', () => this.selectMode('night'));
    this.optCycle.addEventListener('click', () => this.selectMode('cycle'));

    // Shop buttons
    if (this.btnOpenShop) {
      this.btnOpenShop.addEventListener('click', () => {
        if (this.callbacks.onOpenShop) this.callbacks.onOpenShop();
      });
    }
    if (this.btnGameOverShop) {
      this.btnGameOverShop.addEventListener('click', () => {
        if (this.callbacks.onOpenShop) this.callbacks.onOpenShop();
      });
    }

    // Buttons
    this.btnStart.addEventListener('click', () => {
      this.menuScreen.classList.add('hidden');
      if (this.callbacks.onStart) {
        this.callbacks.onStart(this.selectedChar, this.selectedMode);
      }
    });

    this.btnRestart.addEventListener('click', () => {
      this.restartGame();
    });

    // Spacebar or Enter to immediately restart on Game Over
    window.addEventListener('keydown', (e) => {
      if (!this.gameOverScreen.classList.contains('hidden')) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.restartGame();
        }
      }
    });

    // In-game Day/Night toggle button
    this.btnToggleDayNight.addEventListener('click', () => {
      if (this.callbacks.onToggleDayNight) {
        const mode = this.callbacks.onToggleDayNight();
        this.updateDayNightIcon(mode);
      }
    });
  }

  restartGame() {
    this.gameOverScreen.classList.add('hidden');
    if (this.callbacks.onStart) {
      this.callbacks.onStart(this.selectedChar, this.selectedMode);
    }
  }

  selectCharacter(charType) {
    this.selectedChar = charType;
    const heroName = document.getElementById('hero-display-name');
    const heroSub = document.getElementById('hero-display-sub');

    if (charType === 'boy') {
      this.cardLeo.classList.add('active');
      this.cardNova.classList.remove('active');
      if (heroName) heroName.innerText = 'Leo';
      if (heroSub) heroSub.innerText = 'Kinetic Striker with Custom Tuned 144Hz Rig';
    } else {
      this.cardNova.classList.add('active');
      this.cardLeo.classList.remove('active');
      if (heroName) heroName.innerText = 'Nova';
      if (heroSub) heroSub.innerText = 'Acrobatic Magnetizer with Aerodynamic Frame';
    }

    if (this.callbacks.onSelectChar) {
      this.callbacks.onSelectChar(charType);
    }
  }

  selectMode(mode) {
    this.selectedMode = mode;
    [this.optDay, this.optNight, this.optCycle].forEach(el => {
      if (el) el.classList.remove('active');
    });
    if (mode === 'day' && this.optDay) this.optDay.classList.add('active');
    if (mode === 'night' && this.optNight) this.optNight.classList.add('active');
    if (mode === 'cycle' && this.optCycle) this.optCycle.classList.add('active');

    if (this.callbacks.onSetMode) {
      this.callbacks.onSetMode(mode);
    }
  }

  updateDayNightIcon(mode) {
    if (this.daynightIcon) {
      this.daynightIcon.innerText = (mode === 'night') ? '🌙' : '☀️';
    }
  }

  showGameOver(stats) {
    if (stats.score > this.bestScore) {
      this.bestScore = Math.floor(stats.score);
      localStorage.setItem('aeropulse_high_score', this.bestScore.toString());
    }

    if (this.resScore) this.resScore.innerText = String(Math.floor(stats.score)).padStart(6, '0');
    if (this.resBest) this.resBest.innerText = String(this.bestScore).padStart(6, '0');
    if (this.resDistance) this.resDistance.innerText = `${Math.floor(stats.distance)} m`;
    if (this.resCombo) this.resCombo.innerText = `x${stats.maxCombo}`;
    if (this.resGold) this.resGold.innerText = stats.gold;
    if (this.resPlat) this.resPlat.innerText = stats.plat;
    if (this.resDia) this.resDia.innerText = stats.dia;

    this.gameOverScreen.classList.remove('hidden');
  }
}
