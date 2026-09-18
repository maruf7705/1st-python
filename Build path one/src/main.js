import * as THREE from 'three';
import { EngineRenderer } from './engine/Renderer.js';
import { InputManager } from './engine/Input.js';
import { PhysicsEngine } from './engine/Physics.js';
import { CharacterBuilder } from './characters/CharacterBuilder.js';
import { CharacterAnimator } from './characters/Animations.js';
import { DayNightCycle } from './world/DayNightCycle.js';
import { TrackManager } from './world/TrackManager.js';
import { CollectiblesManager } from './juice/Collectibles.js';
import { ParticleSystem } from './juice/ParticleSystem.js';
import { PsychologyEngine } from './juice/Psychology.js';
import { AudioSynth } from './juice/AudioSynth.js';
import { HUD } from './ui/HUD.js';
import { Menu } from './ui/Menu.js';
import { ProgressionManager } from './ui/Progression.js';
import { ShopModal } from './ui/ShopModal.js';
import { updateCurvedWorld } from './engine/CurvedWorldShader.js';

class GameApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.state = 'MENU'; // 'MENU', 'PLAYING', 'GAMEOVER'

    // Core Systems
    this.renderer = new EngineRenderer(this.canvas);
    this.input = new InputManager();
    this.physics = new PhysicsEngine();
    this.audio = new AudioSynth();
    this.particles = new ParticleSystem(this.renderer.scene);
    this.psychology = new PsychologyEngine(this.renderer, this.audio);
    this.dayNight = new DayNightCycle(this.renderer.scene, this.renderer);
    this.collectibles = new CollectiblesManager(this.renderer.scene);
    this.track = new TrackManager(this.renderer.scene, this.collectibles);

    // Meta Progression & Shop
    this.progression = new ProgressionManager();
    this.applyProgressionUpgrades();

    this.shop = new ShopModal(this.progression, {
      onSkinChange: (skinId) => {
        this.setMenuCharacter(this.currentCharType);
      },
      onTrailChange: (trailId) => {
        this.updateTrailColor(trailId);
      },
      onAudioPlay: (soundType) => {
        if (soundType === 'upgrade' || soundType === 'reward') this.audio.playDiamond();
        if (soundType === 'unlock') this.audio.playPowerup();
      }
    });

    // UI Systems
    this.hud = new HUD();
    this.menu = new Menu({
      onStart: (charType, mode) => this.startGame(charType, mode),
      onSelectChar: (charType) => this.setMenuCharacter(charType),
      onToggleDayNight: () => this.dayNight.toggleDayNight(),
      onSetMode: (mode) => this.dayNight.setMode(mode),
      onOpenShop: () => this.shop.show()
    });

    // Character State
    this.currentCharType = 'boy';
    this.characterGroup = null;
    this.characterAnimator = null;

    // Currency & Score Tallies
    this.score = 0;
    this.goldCount = 0;
    this.platCount = 0;
    this.diaCount = 0;

    // Timing
    this.lastFrameTime = performance.now();
    this.wallRunSparkTimer = 0;

    // Biome Callback with Transition Flash & Lighting Blend
    this.track.onBiomeChangeCallback = (name) => {
      this.hud.showBiomeBanner(name);
      this.dayNight.setBiome(name);
      this.renderer.triggerFlash(0.8);

      const flashEl = document.getElementById('flash-overlay');
      if (flashEl) {
        flashEl.classList.add('flash');
        setTimeout(() => flashEl.classList.remove('flash'), 200);
      }
    };

    // Setup initial character & runway
    this.updateTrailColor(this.progression.state.equippedTrail);
    this.setMenuCharacter('boy');
    this.track.init();

    // Start 144 FPS Loop
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  applyProgressionUpgrades() {
    this.physics.applySkillUpgrades(this.progression.state.skills);
  }

  updateTrailColor(trailId) {
    const map = {
      cyan: 0x00f0ff,
      violet: 0xd946ef,
      gold: 0xfacc15,
      emerald: 0x10b981
    };
    this.particles.setTrailColor(map[trailId] || 0x00f0ff);
  }

  setMenuCharacter(type) {
    this.currentCharType = type;
    if (this.characterGroup) {
      this.renderer.scene.remove(this.characterGroup);
    }
    const equippedSkin = this.progression.state.equippedSkin || 'default';
    this.characterGroup = CharacterBuilder.createCharacter(type, equippedSkin);
    this.characterAnimator = new CharacterAnimator(this.characterGroup);
    this.renderer.scene.add(this.characterGroup);
    this.characterGroup.position.set(0, 0, 0);
  }

  startGame(charType, mode) {
    this.state = 'PLAYING';
    this.score = 0;
    this.goldCount = 0;
    this.platCount = 0;
    this.diaCount = 0;

    this.applyProgressionUpgrades();
    this.physics.reset();
    this.psychology.reset();
    this.collectibles.clear();
    this.track.init();
    this.dayNight.setMode(mode);
    this.dayNight.setBiome(this.track.currentBiomeName);

    if (this.currentCharType !== charType) {
      this.setMenuCharacter(charType);
    }

    this.hud.show();
    this.hud.showBiomeBanner(this.track.currentBiomeName);
    this.audio.startMusic();
  }

  handleGameOver() {
    this.state = 'GAMEOVER';
    this.audio.stopMusic();
    this.audio.playCrash();
    this.renderer.triggerShake(0.55, 0.5);
    this.renderer.triggerFlash(1.0);
    this.renderer.setSpeedRatio(1.0);

    // Save wallet & missions
    this.progression.addCurrencies(this.goldCount, this.platCount, this.diaCount);
    this.progression.recordStat('DISTANCE', this.physics.distance);
    this.progression.recordStat('COMBO', this.psychology.maxCombo);

    // Particle crash burst
    const pPos = this.characterGroup.position;
    this.particles.emit(pPos.x, pPos.y + 1, pPos.z, 50, 0xff3b30, 7.5);
    this.particles.emitShockwave(pPos.x, pPos.y, pPos.z, 0xff3b30, 30, 8.0);

    this.hud.hide();
    this.menu.showGameOver({
      score: this.score,
      distance: this.physics.distance,
      maxCombo: this.psychology.maxCombo,
      gold: this.goldCount,
      plat: this.platCount,
      dia: this.diaCount
    });
  }

  handleInput() {
    let action;
    while ((action = this.input.consumeAction()) !== null) {
      if (this.state !== 'PLAYING') continue;

      const playerZ = -this.physics.distance;

      if (action === 'LEFT') {
        const res = this.physics.moveLeft();
        if (res === 'WALL_RUN') {
          this.audio.playWallRun();
          this.particles.emitWallRunSparks(this.physics.currentX, this.physics.y, playerZ, -1);
          this.psychology.spawnScorePopup('⚡ WALL RIDE', 'powerup');
          this.progression.recordStat('WALL_RUN', 1);
        } else if (res === 'WALL_KICK') {
          this.audio.playWallKick();
          this.particles.emitShockwave(this.physics.currentX, this.physics.y, playerZ, 0x00f0ff, 20, 6.0);
          this.psychology.spawnScorePopup('⚡ WALL KICK +100', 'score');
        }
      } else if (action === 'RIGHT') {
        const res = this.physics.moveRight();
        if (res === 'WALL_RUN') {
          this.audio.playWallRun();
          this.particles.emitWallRunSparks(this.physics.currentX, this.physics.y, playerZ, 1);
          this.psychology.spawnScorePopup('⚡ WALL RIDE', 'powerup');
          this.progression.recordStat('WALL_RUN', 1);
        } else if (res === 'WALL_KICK') {
          this.audio.playWallKick();
          this.particles.emitShockwave(this.physics.currentX, this.physics.y, playerZ, 0x00f0ff, 20, 6.0);
          this.psychology.spawnScorePopup('⚡ WALL KICK +100', 'score');
        }
      } else if (action === 'JUMP') {
        const jumpRes = this.physics.jump();
        if (jumpRes === 'JUMP') {
          this.audio.playJump();
        } else if (jumpRes === 'AIR_DASH') {
          this.audio.playAirDash();
          this.particles.emitAirDashThrust(this.physics.currentX, this.physics.y, playerZ);
          this.particles.emitShockwave(this.physics.currentX, this.physics.y + 0.8, playerZ, 0x60a5fa, 25, 7.0);
          this.renderer.triggerFlash(0.65);
          this.renderer.triggerShake(0.2, 0.25);
          this.psychology.spawnScorePopup('🚀 SUPERSONIC DASH', 'combo');
          this.progression.recordStat('AIR_DASH', 1);
        } else if (jumpRes === 'WALL_KICK') {
          this.audio.playWallKick();
          this.particles.emitShockwave(this.physics.currentX, this.physics.y, playerZ, 0x00f0ff, 20, 6.0);
          this.psychology.spawnScorePopup('⚡ WALL KICK +100', 'score');
        }
      } else if (action === 'SLIDE') {
        if (this.physics.slide()) {
          this.audio.playSlide();
          const p = this.characterGroup.position;
          this.particles.emitSlideSparks(p.x, 0.1, p.z);
        }
      } else if (action === 'BRAKE') {
        this.physics.activateBrake(5.0);
        this.audio.playPowerup();
        this.psychology.spawnScorePopup('⏱️ CHRONO BRAKE', 'powerup');
      }
    }
  }

  tick(currentTime) {
    requestAnimationFrame(this.tick);

    const rawDelta = (currentTime - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = currentTime;

    // Clamp delta time to prevent spiral of death on tab unfocus
    const deltaTime = Math.min(rawDelta, 0.05);

    // 1. Process Buffered Input
    this.handleInput();

    // 2. State Machine Update
    if (this.state === 'MENU') {
      this.updateMenu(deltaTime);
    } else if (this.state === 'PLAYING') {
      this.updateGameplay(deltaTime);
    } else if (this.state === 'GAMEOVER') {
      this.updateGameOver(deltaTime);
    }

    // 3. Render Scene with advanced Curved World & Post Processing
    updateCurvedWorld(this.renderer.camera.position.z, deltaTime);
    this.renderer.update(deltaTime);
    this.renderer.render(deltaTime);
  }

  updateMenu(deltaTime) {
    if (this.characterGroup) {
      this.characterGroup.rotation.y += deltaTime * 0.9;
      this.characterAnimator.updateIdle(deltaTime);
      this.characterGroup.position.set(-1.1, 0, 0);
    }

    this.renderer.camera.position.set(-0.25, 1.15, 3.8);
    this.renderer.camera.lookAt(-1.1, 0.75, 0);
    this.dayNight.update(deltaTime, 0);
    this.renderer.setSpeedRatio(1.0);
    this.renderer.setRollAngle(0);
  }

  updateGameOver(deltaTime) {
    const playerZ = -this.physics.distance;

    this.dayNight.update(deltaTime, playerZ);
    this.particles.update(deltaTime);

    if (this.characterAnimator) {
      this.characterAnimator.updateCrash(deltaTime);
    }

    const targetCamX = this.physics.currentX * 0.3;
    const targetCamY = 3.6;
    const targetCamZ = playerZ + 7.2;

    this.renderer.camera.position.x += (targetCamX - this.renderer.camera.position.x) * deltaTime * 3;
    this.renderer.camera.position.y += (targetCamY - this.renderer.camera.position.y) * deltaTime * 3;
    this.renderer.camera.position.z += (targetCamZ - this.renderer.camera.position.z) * deltaTime * 3;
    this.renderer.camera.lookAt(this.physics.currentX, 0.4, playerZ - 2.0);
  }

  updateGameplay(deltaTime) {
    // 144Hz Fixed-Step Physics Substepping
    const subStepDt = 1.0 / 144.0;
    let accumulatedTime = deltaTime;

    while (accumulatedTime >= subStepDt) {
      this.physics.update(subStepDt);
      accumulatedTime -= subStepDt;
    }
    if (accumulatedTime > 0) {
      this.physics.update(accumulatedTime);
    }

    // Calculate Speed Ratio
    const speedRatio = this.physics.speed / this.physics.baseSpeed;

    // Update Player Position in World
    const playerZ = -this.physics.distance;
    this.characterGroup.position.set(
      this.physics.currentX,
      this.physics.y,
      playerZ
    );

    // Update Skeletal Character Animation (Wall run, sprint, air dash)
    this.characterAnimator.update(deltaTime, this.physics, speedRatio);

    // Dynamic Camera Banking and Speed Ratio
    this.renderer.setRollAngle(this.physics.bankAngle);
    this.renderer.setSpeedRatio(speedRatio);
    this.audio.setIntensity(speedRatio, this.psychology.combo);

    // Continuous Particle Emission: Speed Trails, Sparks, Wall-run
    this.particles.emitSpeedTrail(this.physics.currentX, this.physics.y, playerZ, speedRatio);
    if (this.physics.isSliding) {
      this.particles.emitSlideSparks(this.physics.currentX, 0.1, playerZ);
    }
    if (this.physics.isWallRunning) {
      this.wallRunSparkTimer += deltaTime;
      if (this.wallRunSparkTimer > 0.05) {
        this.wallRunSparkTimer = 0;
        this.particles.emitWallRunSparks(this.physics.currentX, this.physics.y, playerZ, this.physics.wallRunSide);
      }
    }

    // Ambient World Particles
    this.particles.updateAmbient(deltaTime, playerZ, this.track.currentBiomeName);

    // Update Day/Night, Track & Collectibles
    this.dayNight.update(deltaTime, playerZ);
    this.track.update(playerZ, this.physics.distance, deltaTime, this.audio);

    // Collectibles collection check
    this.collectibles.update(
      deltaTime,
      { x: this.physics.currentX, y: this.physics.y, z: playerZ },
      (item, pos) => this.onItemCollected(item, pos)
    );

    // Particle system physics update
    this.particles.update(deltaTime);

    // Game Psychology & Combos
    this.psychology.update(deltaTime);
    this.progression.recordStat('COMBO', this.psychology.combo);

    // Distance Score Tick (Buffed by Skill Tree)
    this.score += this.physics.speed * deltaTime * 2.0 * this.psychology.getMultiplier() * this.physics.scoreMultiplierBonus;

    // Collision Detection against nearby obstacles
    const nearbyObstacles = this.track.getNearbyObstacles(playerZ);

    for (const obs of nearbyObstacles) {
      const obstacleWorldZ = obs.mesh.parent ? (obs.mesh.parent.position.z + obs.z) : obs.z;
      const dz = Math.abs(playerZ - obstacleWorldZ);

      // Check collision window
      if (dz < 1.8) {
        let isSafe = false;

        // Jump / Air Dash clearance (forgiving height threshold: 0.65m)
        if (obs.requiresJump && this.physics.y > 0.65) {
          isSafe = true;
        }

        // Slide clearance
        if (obs.requiresSlide && this.physics.isSliding) {
          isSafe = true;
        }

        // Wall Run bypass (if high on wall above ground barriers)
        if (this.physics.isWallRunning && this.physics.y > 0.8 && !obs.requiresSlide) {
          isSafe = true;
        }

        // Check exact AABB intersection with 12cm player-favored forgiveness margin
        const forgivingBox = obs.box.clone().expandByScalar(-0.12);
        if (!isSafe && this.physics.checkCollision(forgivingBox)) {
          this.handleGameOver();
          return;
        }
      }

      // Near-Miss check
      if (dz < 2.5 && this.physics.checkNearMiss(obs.box)) {
        this.renderer.triggerFlash(0.35);
        this.psychology.triggerNearMiss((bonus) => {
          this.score += bonus * this.physics.scoreMultiplierBonus;
        }, { x: this.physics.currentX, y: 1.2, z: playerZ });
      }
    }

    // Dynamic Camera Follow & Visceral Arcade Framing
    const targetCamX = this.physics.currentX * 0.38;
    const targetCamY = 3.15 + (this.physics.y * 0.35) - (this.physics.isSliding ? 0.65 : 0);
    const targetCamZ = playerZ + 5.8;

    this.renderer.camera.position.x += (targetCamX - this.renderer.camera.position.x) * deltaTime * 10;
    this.renderer.camera.position.y += (targetCamY - this.renderer.camera.position.y) * deltaTime * 10;
    this.renderer.camera.position.z = targetCamZ;

    // Look at player with forward lead over the curved horizon
    this.renderer.camera.lookAt(
      this.physics.currentX * 0.22,
      1.15 + this.physics.y * 0.2,
      playerZ - 14
    );

    // Speed-dependent & Air Dash FOV expansion
    const dashFovBoost = this.physics.isAirDashing ? 8.0 : 0;
    this.renderer.targetCameraFov = 65 + (speedRatio - 1.0) * 14 + dashFovBoost;

    // Update HUD
    this.hud.update(
      this.renderer.fps,
      this.physics.distance,
      this.physics.speed,
      this.score,
      this.goldCount,
      this.platCount,
      this.diaCount,
      this.collectibles.magnetDuration,
      this.physics.brakeDuration
    );
  }

  onItemCollected(item, pos) {
    const scoreMult = this.psychology.getMultiplier() * this.physics.scoreMultiplierBonus;

    if (item.type === 'GOLD') {
      this.goldCount++;
      this.score += item.value * 10 * scoreMult;
      this.particles.emit(pos.x, pos.y, pos.z, 18, 0xffc400, 4.5);
      this.psychology.onCoinCollected('GOLD', item.value, pos);
    } else if (item.type === 'PLATINUM') {
      this.platCount++;
      this.score += item.value * 10 * scoreMult;
      this.particles.emit(pos.x, pos.y, pos.z, 22, 0x67e8f9, 5.0);
      this.psychology.onCoinCollected('PLATINUM', item.value, pos);
    } else if (item.type === 'DIAMOND') {
      this.diaCount++;
      this.score += item.value * 10 * scoreMult;
      this.particles.emit(pos.x, pos.y, pos.z, 28, 0xe056fd, 5.8);
      this.audio.playDiamond();
      this.psychology.onCoinCollected('DIAMOND', item.value, pos);
    } else if (item.type === 'RING') {
      const duration = 7.0 * this.physics.magnetDurationMultiplier;
      this.collectibles.activateMagnet(duration);
      this.audio.playPowerup();
      this.particles.emit(pos.x, pos.y, pos.z, 26, 0xffe600, 4.8);
      this.particles.emitShockwave(pos.x, pos.y, pos.z, 0xffe600, 24, 6.0);
      this.psychology.spawnScorePopup('🧲 MAGNET SHIELD', 'powerup', pos);
    } else if (item.type === 'BRAKE') {
      this.physics.activateBrake(5.0);
      this.audio.playPowerup();
      this.particles.emit(pos.x, pos.y, pos.z, 26, 0xff9f0a, 4.8);
      this.particles.emitShockwave(pos.x, pos.y, pos.z, 0xff9f0a, 24, 6.0);
      this.psychology.spawnScorePopup('⏱️ CHRONO BRAKE', 'powerup', pos);
    }
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GameApp();
});
