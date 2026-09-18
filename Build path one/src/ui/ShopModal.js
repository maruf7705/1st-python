/**
 * Shop & Metagame UI Modal
 * Apple HIG Frosted Glass Sheet with tabs:
 * - ⚡ SKILLS (Upgrades)
 * - 🎽 SKINS (Suits)
 * - ✨ TRAILS (Speed VFX)
 * - 🎯 MISSIONS (Daily Challenges)
 */
export class ShopModal {
  constructor(progression, callbacks = {}) {
    this.progression = progression;
    this.callbacks = callbacks; // { onSkinChange, onTrailChange, onAudioPlay }
    this.activeTab = 'skills';

    this.container = document.getElementById('shop-modal');
    this.initDOM();
  }

  initDOM() {
    if (!this.container) return;
    this.render();
  }

  show() {
    if (!this.container) return;
    this.render();
    this.container.classList.remove('hidden');
  }

  hide() {
    if (!this.container) return;
    this.container.classList.add('hidden');
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  render() {
    if (!this.container) return;

    const state = this.progression.state;
    const { wallet, skills, unlockedSkins, equippedSkin, unlockedTrails, equippedTrail, missions } = state;

    this.container.innerHTML = `
      <div class="apple-modal-sheet shop-sheet">
        <div class="shop-header">
          <div class="shop-title-wrap">
            <span class="apple-eyebrow">AEROPULSE ARMORY</span>
            <h2>Upgrades & Customization</h2>
          </div>
          <button id="btn-close-shop" class="apple-close-btn" title="Close">✕</button>
        </div>

        <!-- Wallet Balance Strip -->
        <div class="shop-wallet-bar">
          <div class="wallet-tag"><span class="dot-icon gold-dot"></span> <strong id="shop-wallet-gold">${wallet.gold}</strong> Gold</div>
          <div class="wallet-tag"><span class="dot-icon plat-dot"></span> <strong id="shop-wallet-plat">${wallet.plat}</strong> Plat</div>
          <div class="wallet-tag"><span class="dot-icon dia-dot"></span> <strong id="shop-wallet-dia">${wallet.dia}</strong> Diamond</div>
        </div>

        <!-- Segmented Tab Navigation -->
        <div class="shop-tabs">
          <button class="shop-tab-btn ${this.activeTab === 'skills' ? 'active' : ''}" data-tab="skills">⚡ Skills</button>
          <button class="shop-tab-btn ${this.activeTab === 'skins' ? 'active' : ''}" data-tab="skins">🎽 Suits</button>
          <button class="shop-tab-btn ${this.activeTab === 'trails' ? 'active' : ''}" data-tab="trails">✨ Trails</button>
          <button class="shop-tab-btn ${this.activeTab === 'missions' ? 'active' : ''}" data-tab="missions">🎯 Missions</button>
        </div>

        <!-- Tab Body Content -->
        <div class="shop-body">
          ${this.renderTabContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderTabContent() {
    if (this.activeTab === 'skills') return this.renderSkillsTab();
    if (this.activeTab === 'skins') return this.renderSkinsTab();
    if (this.activeTab === 'trails') return this.renderTrailsTab();
    if (this.activeTab === 'missions') return this.renderMissionsTab();
    return '';
  }

  renderSkillsTab() {
    const { skills } = this.progression.state;

    const skillDefs = [
      { id: 'magnetTier', name: 'Flux Magnetism', desc: '+35% Magnet duration & pull radius per tier', icon: '🧲', tier: skills.magnetTier || 0 },
      { id: 'brakeTier', name: 'Chrono Dilator', desc: '+30% Brake slow-mo duration & efficiency', icon: '⏱️', tier: skills.brakeTier || 0 },
      { id: 'dashTier', name: 'Supersonic Thruster', desc: '+30% Air-Dash velocity & kinetic burst power', icon: '🚀', tier: skills.dashTier || 0 },
      { id: 'scoreTier', name: 'Score Matrix', desc: '+25% permanent score multiplier bonus', icon: '💎', tier: skills.scoreTier || 0 }
    ];

    return `
      <div class="skills-grid">
        ${skillDefs.map(s => {
          const isMax = s.tier >= 5;
          const cost = {
            gold: (s.tier + 1) * 150,
            plat: (s.tier + 1) * 10,
            dia: s.tier >= 2 ? (s.tier - 1) * 3 : 0
          };
          const canBuy = !isMax && this.progression.canAfford(cost);

          return `
            <div class="shop-item-card skill-card">
              <div class="skill-info">
                <span class="skill-icon">${s.icon}</span>
                <div class="skill-texts">
                  <h4>${s.name}</h4>
                  <p>${s.desc}</p>
                </div>
              </div>
              <div class="skill-progress-bar">
                ${[1, 2, 3, 4, 5].map(t => `<span class="tier-pip ${t <= s.tier ? 'filled' : ''}"></span>`).join('')}
              </div>
              <div class="skill-action-row">
                <span class="skill-tier-label">${isMax ? 'MAX TIER' : `Tier ${s.tier} / 5`}</span>
                ${isMax ? '<span class="status-pill maxed">Mastered</span>' : `
                  <button class="apple-buy-btn ${canBuy ? '' : 'disabled'}" data-upgrade="${s.id}">
                    Upgrade (${cost.gold} 🪙 ${cost.dia > 0 ? `+ ${cost.dia} 💎` : ''})
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderSkinsTab() {
    const { unlockedSkins, equippedSkin } = this.progression.state;

    const skins = [
      { id: 'default', name: 'Aero Vanguard', desc: 'Standard issue aerodynamic combat shell', icon: '🏃‍♂️', cost: { gold: 0 } },
      { id: 'cyber_stealth', name: 'Cyber Stealth', desc: 'Matte dark carbon chassis with neon cyan pulses', icon: '🥷', cost: { gold: 350, plat: 20 } },
      { id: 'hyper_gold', name: 'Hyper Aureus', desc: 'Polished 24K gold nano-plating with golden gleam', icon: '👑', cost: { gold: 800, dia: 15 } },
      { id: 'solar_flare', name: 'Solar Flare', desc: 'Molten plasma armor with radiating thermic sparks', icon: '🔥', cost: { gold: 1200, dia: 25 } }
    ];

    return `
      <div class="skins-grid">
        ${skins.map(sk => {
          const isUnlocked = unlockedSkins.includes(sk.id);
          const isEquipped = equippedSkin === sk.id;
          const canBuy = this.progression.canAfford(sk.cost);

          return `
            <div class="shop-item-card skin-card ${isEquipped ? 'equipped' : ''}">
              <div class="skin-icon-box">${sk.icon}</div>
              <h4>${sk.name}</h4>
              <p>${sk.desc}</p>
              <div class="card-footer-action">
                ${isEquipped ? '<span class="status-pill active">Equipped</span>' :
                  isUnlocked ? `<button class="apple-equip-btn" data-equip-skin="${sk.id}">Equip</button>` :
                  `<button class="apple-buy-btn ${canBuy ? '' : 'disabled'}" data-buy-skin="${sk.id}">
                    Unlock (${sk.cost.gold} 🪙 ${sk.cost.dia ? `+ ${sk.cost.dia} 💎` : ''})
                  </button>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderTrailsTab() {
    const { unlockedTrails, equippedTrail } = this.progression.state;

    const trails = [
      { id: 'cyan', name: 'Cyan Pulse', hex: '#00f0ff', colorHexVal: 0x00f0ff, cost: { gold: 0 } },
      { id: 'violet', name: 'Hyper Violet', hex: '#d946ef', colorHexVal: 0xd946ef, cost: { gold: 250 } },
      { id: 'gold', name: 'Solar Ember', hex: '#facc15', colorHexVal: 0xfacc15, cost: { gold: 500, plat: 25 } },
      { id: 'emerald', name: 'Matrix Emerald', hex: '#10b981', colorHexVal: 0x10b981, cost: { gold: 750, dia: 12 } }
    ];

    return `
      <div class="trails-grid">
        ${trails.map(tr => {
          const isUnlocked = unlockedTrails.includes(tr.id);
          const isEquipped = equippedTrail === tr.id;
          const canBuy = this.progression.canAfford(tr.cost);

          return `
            <div class="shop-item-card trail-card ${isEquipped ? 'equipped' : ''}">
              <div class="trail-color-preview" style="background: radial-gradient(circle, ${tr.hex} 0%, transparent 70%); border: 2px solid ${tr.hex}">
                <span class="trail-glow-dot" style="background: ${tr.hex}"></span>
              </div>
              <h4>${tr.name}</h4>
              <div class="card-footer-action">
                ${isEquipped ? '<span class="status-pill active">Equipped</span>' :
                  isUnlocked ? `<button class="apple-equip-btn" data-equip-trail="${tr.id}">Equip</button>` :
                  `<button class="apple-buy-btn ${canBuy ? '' : 'disabled'}" data-buy-trail="${tr.id}">
                    Unlock (${tr.cost.gold} 🪙)
                  </button>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderMissionsTab() {
    const { missions } = this.progression.state;

    return `
      <div class="missions-list">
        ${missions.map(m => {
          const isDone = m.current >= m.goal;
          const percent = Math.min(100, Math.floor((m.current / m.goal) * 100));

          return `
            <div class="shop-item-card mission-card ${m.claimed ? 'claimed' : ''}">
              <div class="mission-info">
                <h4>${m.title}</h4>
                <p>${m.desc}</p>
                <div class="mission-progress-bar">
                  <div class="mission-fill" style="width: ${percent}%"></div>
                </div>
                <span class="mission-progress-text">${m.current} / ${m.goal} (${percent}%)</span>
              </div>
              <div class="mission-reward-action">
                <span class="reward-tag">+${m.reward.amount} ${m.reward.type.toUpperCase()}</span>
                ${m.claimed ? '<span class="status-pill claimed">Claimed</span>' :
                  isDone ? `<button class="apple-claim-btn" data-claim="${m.id}">CLAIM</button>` :
                  `<span class="status-pill pending">In Progress</span>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  bindEvents() {
    // Close button
    const closeBtn = document.getElementById('btn-close-shop');
    if (closeBtn) closeBtn.onclick = () => this.hide();

    // Tab buttons
    this.container.querySelectorAll('.shop-tab-btn').forEach(btn => {
      btn.onclick = () => this.switchTab(btn.dataset.tab);
    });

    // Skill upgrades
    this.container.querySelectorAll('[data-upgrade]').forEach(btn => {
      btn.onclick = () => {
        const skillId = btn.dataset.upgrade;
        if (this.progression.upgradeSkill(skillId)) {
          if (this.callbacks.onAudioPlay) this.callbacks.onAudioPlay('upgrade');
          this.render();
        }
      };
    });

    // Skins buy & equip
    this.container.querySelectorAll('[data-buy-skin]').forEach(btn => {
      btn.onclick = () => {
        const skinId = btn.dataset.buySkin;
        const costs = {
          cyber_stealth: { gold: 350, plat: 20 },
          hyper_gold: { gold: 800, dia: 15 },
          solar_flare: { gold: 1200, dia: 25 }
        };
        if (this.progression.unlockSkin(skinId, costs[skinId] || { gold: 100 })) {
          if (this.callbacks.onAudioPlay) this.callbacks.onAudioPlay('unlock');
          if (this.callbacks.onSkinChange) this.callbacks.onSkinChange(skinId);
          this.render();
        }
      };
    });

    this.container.querySelectorAll('[data-equip-skin]').forEach(btn => {
      btn.onclick = () => {
        const skinId = btn.dataset.equipSkin;
        if (this.progression.equipSkin(skinId)) {
          if (this.callbacks.onAudioPlay) this.callbacks.onAudioPlay('equip');
          if (this.callbacks.onSkinChange) this.callbacks.onSkinChange(skinId);
          this.render();
        }
      };
    });

    // Trails buy & equip
    this.container.querySelectorAll('[data-buy-trail]').forEach(btn => {
      btn.onclick = () => {
        const trailId = btn.dataset.buyTrail;
        const costs = {
          violet: { gold: 250 },
          gold: { gold: 500, plat: 25 },
          emerald: { gold: 750, dia: 12 }
        };
        if (this.progression.unlockTrail(trailId, costs[trailId] || { gold: 200 })) {
          if (this.callbacks.onAudioPlay) this.callbacks.onAudioPlay('unlock');
          if (this.callbacks.onTrailChange) this.callbacks.onTrailChange(trailId);
          this.render();
        }
      };
    });

    this.container.querySelectorAll('[data-equip-trail]').forEach(btn => {
      btn.onclick = () => {
        const trailId = btn.dataset.equipTrail;
        if (this.progression.equipTrail(trailId)) {
          if (this.callbacks.onAudioPlay) this.callbacks.onAudioPlay('equip');
          if (this.callbacks.onTrailChange) this.callbacks.onTrailChange(trailId);
          this.render();
        }
      };
    });

    // Mission claims
    this.container.querySelectorAll('[data-claim]').forEach(btn => {
      btn.onclick = () => {
        const mId = btn.dataset.claim;
        const reward = this.progression.claimMission(mId);
        if (reward) {
          if (this.callbacks.onAudioPlay) this.callbacks.onAudioPlay('reward');
          this.render();
        }
      };
    });
  }
}
