/**
 * AeroPulse Meta Progression Engine
 * Handles persistent wallet, skin unlocks, skill tree upgrades, and daily missions.
 */
export class ProgressionManager {
  constructor() {
    this.storageKey = 'aeropulse_progression_v1';
    this.state = this.loadState();
  }

  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load progression:', e);
    }

    return {
      wallet: { gold: 120, plat: 15, dia: 5 }, // generous starting gift
      equippedSkin: 'default',
      unlockedSkins: ['default'],
      equippedTrail: 'cyan',
      unlockedTrails: ['cyan'],
      skills: {
        magnetTier: 0,
        brakeTier: 0,
        scoreTier: 0,
        dashTier: 0
      },
      missions: [
        { id: 'combo5', title: 'Streak Master', desc: 'Reach Streak x5 in a single run', goal: 5, current: 0, reward: { type: 'gold', amount: 150 }, claimed: false },
        { id: 'dist500', title: 'Distance Runner', desc: 'Run 500m in one session', goal: 500, current: 0, reward: { type: 'dia', amount: 10 }, claimed: false },
        { id: 'wallrun3', title: 'Wall Rider', desc: 'Perform 3 Wall Runs', goal: 3, current: 0, reward: { type: 'gold', amount: 200 }, claimed: false },
        { id: 'airdash5', title: 'Acrobat', desc: 'Perform 5 Supersonic Air Dashes', goal: 5, current: 0, reward: { type: 'plat', amount: 25 }, claimed: false }
      ]
    };
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to save progression:', e);
    }
  }

  addCurrencies(gold = 0, plat = 0, dia = 0) {
    this.state.wallet.gold += gold;
    this.state.wallet.plat += plat;
    this.state.wallet.dia += dia;
    this.saveState();
  }

  canAfford(cost) {
    if (cost.gold && this.state.wallet.gold < cost.gold) return false;
    if (cost.plat && this.state.wallet.plat < cost.plat) return false;
    if (cost.dia && this.state.wallet.dia < cost.dia) return false;
    return true;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    if (cost.gold) this.state.wallet.gold -= cost.gold;
    if (cost.plat) this.state.wallet.plat -= cost.plat;
    if (cost.dia) this.state.wallet.dia -= cost.dia;
    this.saveState();
    return true;
  }

  upgradeSkill(skillName) {
    const currentTier = this.state.skills[skillName] || 0;
    if (currentTier >= 5) return false;

    // Cost formula: Gold + Diamonds scaling per tier
    const cost = {
      gold: (currentTier + 1) * 150,
      plat: (currentTier + 1) * 10,
      dia: currentTier >= 2 ? (currentTier - 1) * 3 : 0
    };

    if (this.spend(cost)) {
      this.state.skills[skillName] = currentTier + 1;
      this.saveState();
      return true;
    }
    return false;
  }

  unlockSkin(skinId, cost) {
    if (this.state.unlockedSkins.includes(skinId)) return true;
    if (this.spend(cost)) {
      this.state.unlockedSkins.push(skinId);
      this.state.equippedSkin = skinId;
      this.saveState();
      return true;
    }
    return false;
  }

  equipSkin(skinId) {
    if (this.state.unlockedSkins.includes(skinId)) {
      this.state.equippedSkin = skinId;
      this.saveState();
      return true;
    }
    return false;
  }

  unlockTrail(trailId, cost) {
    if (this.state.unlockedTrails.includes(trailId)) return true;
    if (this.spend(cost)) {
      this.state.unlockedTrails.push(trailId);
      this.state.equippedTrail = trailId;
      this.saveState();
      return true;
    }
    return false;
  }

  equipTrail(trailId) {
    if (this.state.unlockedTrails.includes(trailId)) {
      this.state.equippedTrail = trailId;
      this.saveState();
      return true;
    }
    return false;
  }

  // Update mission stats
  recordStat(type, val) {
    let updated = false;
    this.state.missions.forEach(m => {
      if (m.claimed) return;

      if (type === 'COMBO' && m.id === 'combo5') {
        if (val > m.current) {
          m.current = Math.min(m.goal, val);
          updated = true;
        }
      } else if (type === 'DISTANCE' && m.id === 'dist500') {
        if (val > m.current) {
          m.current = Math.min(m.goal, Math.floor(val));
          updated = true;
        }
      } else if (type === 'WALL_RUN' && m.id === 'wallrun3') {
        m.current = Math.min(m.goal, m.current + (val || 1));
        updated = true;
      } else if (type === 'AIR_DASH' && m.id === 'airdash5') {
        m.current = Math.min(m.goal, m.current + (val || 1));
        updated = true;
      }
    });

    if (updated) {
      this.saveState();
    }
  }

  claimMission(id) {
    const m = this.state.missions.find(m => m.id === id);
    if (!m || m.claimed || m.current < m.goal) return false;

    m.claimed = true;
    if (m.reward.type === 'gold') this.state.wallet.gold += m.reward.amount;
    if (m.reward.type === 'plat') this.state.wallet.plat += m.reward.amount;
    if (m.reward.type === 'dia') this.state.wallet.dia += m.reward.amount;

    this.saveState();
    return m.reward;
  }
}
