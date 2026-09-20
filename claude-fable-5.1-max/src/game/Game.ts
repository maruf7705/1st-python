import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildLevel, LevelData, Entity } from "./world/Level";
import { Frame } from "./world/Track";
import { buildTrackMeshes, createTrackMaterial, TrackMeshes } from "./world/TrackMesh";
import { Environment } from "./world/Environment";
import { THEMES } from "./world/themes";
import { EntityManager } from "./entities/Entities";
import { Player, PHYS, PlayerEvents } from "./Player";
import { ChaseCamera } from "./render/Camera";
import { PlayerMesh } from "./render/PlayerMesh";
import { Particles, Trail, ScreenOverlay } from "./render/Effects";
import { Input } from "./core/Input";
import { AudioSys } from "./audio/Audio";
import { store, GameState, Quality, Results } from "./core/store";
import { clamp, damp } from "./core/math";

const MAX_STEPS = 8;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly level: LevelData;
  readonly entities: EntityManager;
  readonly player: Player;
  readonly cam: ChaseCamera;
  readonly env: Environment;
  readonly input = new Input();
  readonly audio = new AudioSys();
  private trackMeshes: TrackMeshes;
  private playerMesh = new PlayerMesh();
  private particles = new Particles();
  private trail = new Trail();
  private overlay = new ScreenOverlay();
  private state: GameState = "title";
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private time = 0;
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private prevS = 0;
  private renderPos = new THREE.Vector3();
  private renderQuat = new THREE.Quaternion();
  private damageFlash = 0;
  private fade = 1;
  private fadeTarget = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private hudTimer = 0;
  private resultsTimer = 0;
  private frame = new Frame();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private right = new THREE.Vector3();
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private jumpEdgePending = false;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly quality: Quality
  ) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== "low",
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer = renderer;
    const prCap = quality === "high" ? 2 : quality === "medium" ? 1.5 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = quality !== "low";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;

    // image based lighting for nicer metals/plastics
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    // world
    this.level = buildLevel();
    const track = this.level.track;
    const trackMat = createTrackMaterial(renderer.capabilities.getMaxAnisotropy());
    this.trackMeshes = buildTrackMeshes(track, this.level.loops, trackMat, quality);
    this.scene.add(this.trackMeshes.group);
    this.env = new Environment(this.scene, track, quality);
    this.entities = new EntityManager(this.scene, this.level, quality);
    this.player = new Player(track, this.entities, this.makeEvents());
    this.cam = new ChaseCamera(1, track);
    this.scene.add(this.playerMesh.root, this.playerMesh.blob, this.particles.mesh, this.trail.mesh);

    store.set({ state: "title", quality, totalCheckpoints: this.level.checkpointCount, envName: THEMES[0].name });
    this.input.attach();
    this.handleResize();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.prevPos.copy(this.player.visualPos);
    this.prevQuat.copy(this.player.visualQuat);
    this.prevS = this.player.s;
    this.trail.reset(this.player.visualPos);
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────────── public controls (used by UI) ─────────────
  startGame(): void {
    this.audio.init();
    this.audio.menu();
    // drop focus from UI buttons so Space/Enter never re-trigger them mid-run
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.input.clearEdges();
    this.jumpEdgePending = false;
    this.entities.resetAll();
    this.player.resetAll();
    this.setState("playing");
    this.cam.snap();
    this.trail.reset(this.player.visualPos);
    this.prevPos.copy(this.player.visualPos);
    this.prevQuat.copy(this.player.visualQuat);
    this.prevS = this.player.s;
    this.fade = 1;
    this.fadeTarget = 0;
    this.resultsTimer = 0;
    store.set({ rings: 0, score: 0, lives: this.player.lives, time: 0, results: null, checkpointIndex: 0, progress: 0 });
    store.message("GO!", "good");
  }

  togglePause(): void {
    if (this.state === "playing") {
      this.setState("paused");
      this.audio.suspend();
    } else if (this.state === "paused") {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.input.clearEdges();
      this.setState("playing");
      this.audio.resume();
      this.lastT = performance.now();
      this.acc = 0;
    }
  }

  quitToTitle(): void {
    this.setState("title");
    this.audio.resume();
    this.player.resetAll();
    this.entities.resetAll();
    this.cam.snap();
  }

  restart(): void {
    this.audio.resume();
    this.startGame();
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver?.disconnect();
    this.entities.dispose();
    this.renderer.dispose();
  }

  // ───────────── internals ─────────────
  private setState(s: GameState): void {
    this.state = s;
    store.set({ state: s });
  }

  private handleResize = (): void => {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / h);
  };

  private onVisibility = (): void => {
    if (document.hidden && this.state === "playing") this.togglePause();
  };

  private makeEvents(): PlayerEvents {
    const p = (): THREE.Vector3 => this.player.visualPos;
    return {
      onRing: (e: Entity) => {
        this.entities.worldPos(e, this.tmp);
        this.particles.emit(this.tmp, this.tmp2.set(0, 2, 0), 0xffd24a, 6, 5, 0.45, 0.7, 0.4);
        this.audio.ring();
      },
      onDashRing: () => {
        this.particles.emit(p(), this.tmp2.set(0, 0, 0), 0x35f0ff, 16, 9, 0.5, 0.9, 0.1);
        this.audio.dashRing();
        this.cam.addFovKick(6);
      },
      onEnemyKilled: (e: Entity, chain: number) => {
        this.entities.worldPos(e, this.tmp);
        this.particles.emit(this.tmp, this.tmp2.set(0, 4, 0), e.kind === "spiky" ? 0xff4a2a : 0x8a94a8, 14, 9, 0.6, 0.9, 1);
        this.particles.emit(this.tmp, this.tmp2.set(0, 3, 0), 0xffe680, 6, 6, 0.5, 0.6, 0.6);
        this.audio.enemy(chain);
        this.cam.addShake(0.15);
        if (chain > 1) store.message(`CHAIN x${chain}  +${100 * chain}`, "good");
      },
      onCrate: (e: Entity) => {
        this.entities.worldPos(e, this.tmp);
        this.particles.emit(this.tmp, this.tmp2.set(0, 5, 0), 0xd9822b, 16, 10, 0.8, 1.0, 1);
        this.audio.crate();
        this.cam.addShake(0.2);
      },
      onDamage: (lost: number) => {
        this.particles.emit(p(), this.tmp2.set(0, 9, 0), 0xffd24a, Math.min(24, 6 + lost), 12, 1.1, 1.2, 1);
        this.audio.hit();
        this.cam.addShake(0.7);
        this.damageFlash = 1;
        store.message(lost > 0 ? `-${lost} RINGS` : "OUCH", "bad");
      },
      onDeath: () => {
        this.audio.death();
        this.cam.addShake(1);
        this.damageFlash = 1;
        this.setState("dead");
        this.fadeTarget = 1;
      },
      onCheckpoint: (e: Entity) => {
        this.audio.checkpoint();
        this.entities.worldPos(e, this.tmp);
        this.particles.emit(this.tmp.add(this.tmp2.set(0, 6, 0)), this.tmp2.set(0, 2, 0), 0x5dff9a, 20, 14, 0.9, 1.0, 0.5);
        store.set({ checkpointIndex: e.order });
        store.message(`CHECKPOINT ${e.order}/${this.level.checkpointCount}`, "good");
      },
      onGoal: () => {
        this.audio.goal();
        store.message("GOAL!", "good");
        this.resultsTimer = 2.6;
      },
      onBoostPad: () => {
        this.audio.boostPad();
        this.cam.addFovKick(10);
        this.particles.emit(p(), this.tmp2.set(0, 1, 0), 0xffa030, 10, 6, 0.4, 0.7, 0.2);
      },
      onSpring: (e: Entity) => {
        this.audio.spring();
        this.entities.worldPos(e, this.tmp);
        this.particles.emit(this.tmp, this.tmp2.set(0, 6, 0), 0xffc21a, 10, 6, 0.5, 0.6, 1);
      },
      onJump: () => {
        this.audio.jump();
      },
      onLand: (impact: number) => {
        if (impact > 5) {
          this.audio.land(impact);
          this.particles.emit(p(), this.tmp2.set(0, 1.5, 0), 0xd8d8d8, Math.min(12, Math.floor(impact / 3)), 5, 0.35, 0.6, 0.5);
        }
        if (impact > 16) this.cam.addShake(0.2);
      },
      onHoming: () => {
        this.audio.homing();
      },
      onBoostStart: () => {
        this.cam.addFovKick(6);
      },
      onBoostEnd: () => undefined,
      onGrindStart: () => {
        this.particles.emit(p(), this.tmp2.set(0, 2, 0), 0xffb060, 8, 5, 0.3, 0.4, 0.6);
      },
    };
  }

  private loop = (t: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;

    this.input.poll();
    if (this.input.gamepadConnected !== store.getSnapshot().gamepad) store.set({ gamepad: this.input.gamepadConnected });
    this.handleGlobalInput();

    if (this.state === "playing" || this.state === "dead") {
      this.acc += dt;
      let steps = 0;
      const jumpEdge = this.input.consume("jumpPressed");
      if (jumpEdge) this.jumpEdgePending = true;
      while (this.acc >= PHYS.STEP && steps < MAX_STEPS) {
        this.prevPos.copy(this.player.visualPos);
        this.prevQuat.copy(this.player.visualQuat);
        this.prevS = this.player.s;
        const jp = this.jumpEdgePending;
        this.jumpEdgePending = false;
        this.player.step(PHYS.STEP, this.input.state, jp);
        this.entities.stepDynamics(PHYS.STEP, this.player.s);
        this.acc -= PHYS.STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.afterPhysics(dt);
    } else {
      this.input.clearEdges();
    }

    const alpha = this.state === "playing" || this.state === "dead" ? clamp(this.acc / PHYS.STEP, 0, 1) : 1;
    this.render(dt, alpha);
  };

  private handleGlobalInput(): void {
    if (this.input.consume("pausePressed")) {
      if (this.state === "playing" || this.state === "paused") this.togglePause();
    }
    if (this.input.consume("restartPressed")) {
      if (this.state === "playing" || this.state === "paused" || this.state === "gameover" || this.state === "results") this.restart();
    }
    if (this.input.consume("confirmPressed")) {
      if (this.state === "title") this.startGame();
      else if (this.state === "gameover" || this.state === "results") this.restart();
    }
  }

  private afterPhysics(dt: number): void {
    const pl = this.player;
    if (this.state === "dead") {
      if (pl.deathTimer > 1.5) {
        if (pl.lives > 0) {
          this.entities.resetAfterDeath();
          pl.respawn();
          this.cam.snap();
          this.trail.reset(pl.visualPos);
          this.prevPos.copy(pl.visualPos);
          this.prevQuat.copy(pl.visualQuat);
          this.prevS = pl.s;
          this.fadeTarget = 0;
          this.setState("playing");
          store.set({ lives: pl.lives, rings: pl.rings });
        } else {
          this.setState("gameover");
          this.fadeTarget = 0.6;
        }
      }
    } else if (pl.finished) {
      this.resultsTimer -= dt;
      if (this.resultsTimer <= 0) {
        const results = this.computeResults();
        store.set({ results });
        this.setState("results");
      }
    }
  }

  private computeResults(): Results {
    const pl = this.player;
    const timeBonus = Math.max(0, Math.round((170 - pl.time) * 120));
    const ringBonus = pl.rings * 40;
    const total = pl.score + timeBonus + ringBonus;
    const rank = total >= 22000 ? "S" : total >= 16000 ? "A" : total >= 11000 ? "B" : total >= 6000 ? "C" : "D";
    return { score: total, time: pl.time, rings: pl.rings, enemies: pl.enemiesKilled, rank, maxSpeed: pl.maxSpeed };
  }

  private render(dt: number, alpha: number): void {
    const pl = this.player;
    this.time += dt;
    const active = this.state === "playing" || this.state === "dead" || this.state === "results";

    // interpolated player transform
    this.renderPos.copy(this.prevPos).lerp(pl.visualPos, alpha);
    this.renderQuat.copy(this.prevQuat).slerp(pl.visualQuat, alpha);
    const sInterp = this.prevS + (pl.s - this.prevS) * alpha;

    this.playerMesh.root.position.copy(this.renderPos);
    this.playerMesh.root.quaternion.copy(this.renderQuat);
    this.playerMesh.update({
      dt,
      speed: pl.speed,
      grounded: pl.grounded,
      grinding: pl.grinding,
      curl: pl.curl,
      runPhase: pl.runPhase,
      lean: pl.lean,
      boosting: pl.boosting,
      padBoost: pl.padBoost > 0,
      invuln: pl.invuln,
      dead: pl.dead,
      steer: this.input.state.steer,
    });
    // blob shadow on the track surface under the player (uses the game's own frame, never the physics cache)
    const track = this.level.track;
    const secHere = track.sectionAt(sInterp);
    track.worldPos(sInterp, clamp(pl.x, -secHere.width / 2, secHere.width / 2), 0.02, this.frame, this.tmp);
    this.playerMesh.blob.visible = pl.grounded || (pl.h > -0.5 && pl.h < 16 && secHere.type !== "gap");
    this.playerMesh.updateBlob(this.tmp, this.renderQuat, Math.max(0, pl.h));

    // camera
    if (this.state === "title") {
      const a = this.time * 0.22;
      const c = this.cam.camera;
      c.position.set(this.renderPos.x + Math.cos(a) * 9, this.renderPos.y + 3 + Math.sin(a * 0.7) * 0.8, this.renderPos.z + Math.sin(a) * 9);
      c.up.set(0, 1, 0);
      c.lookAt(this.renderPos.x, this.renderPos.y + 1.2, this.renderPos.z);
      if (Math.abs(c.fov - 60) > 0.01) {
        c.fov = 60;
        c.updateProjectionMatrix();
      }
    } else if (this.state !== "paused") {
      this.cam.update(dt, this.renderPos, sInterp, pl.x, pl.speed, pl.boosting || pl.padBoost > 0, !pl.grounded, pl.dead);
    }
    const camera = this.cam.camera;

    // world updates
    this.env.update(this.renderPos, sInterp, camera, this.time);
    this.entities.updateVisuals(sInterp, this.time);
    const viewDist = this.env.blended.fogFar + 120;
    this.entities.cull(sInterp, viewDist);
    for (let i = 0; i < this.trackMeshes.chunks.length; i++) {
      const c = this.trackMeshes.chunks[i];
      if (!c.geometry.boundingSphere) continue;
      c.visible = this.trackMeshes.chunkCenters[i].distanceTo(this.renderPos) < viewDist + 140;
    }

    // effects
    this.right.set(1, 0, 0).applyQuaternion(this.renderQuat);
    const speedN = clamp(Math.abs(pl.speed) / PHYS.ABS_MAX, 0, 1);
    const boosting = pl.boosting || pl.padBoost > 0;
    if (this.state !== "paused") {
      this.particles.update(dt);
      const trailOn = active && !pl.dead && (boosting || Math.abs(pl.speed) > 46);
      this.tmp.copy(this.renderPos).addScaledVector(this.tmp2.set(0, 1, 0).applyQuaternion(this.renderQuat), 0.9);
      this.trail.update(dt, this.tmp, this.right, trailOn, boosting);
      if (active && !pl.dead) {
        if (boosting && Math.random() < 0.6) {
          this.tmp2.set(0, 0, -1).applyQuaternion(this.renderQuat).multiplyScalar(6 + speedN * 8);
          this.particles.emit(this.tmp, this.tmp2, 0xffa030, 1, 4, 0.35, 0.5, 0.1);
        }
        if (pl.grinding && Math.random() < 0.7) {
          this.tmp2.set(0, 3, -2).applyQuaternion(this.renderQuat);
          this.particles.emit(this.renderPos, this.tmp2, 0xffc060, 1, 6, 0.25, 0.35, 1);
        }
      }
    }
    this.damageFlash = damp(this.damageFlash, 0, 3.5, dt);
    this.fade = damp(this.fade, this.fadeTarget, this.fadeTarget > this.fade ? 3 : 4, dt);
    const lines = active ? clamp((speedN - 0.42) * 2.2, 0, 1) + (boosting ? 0.35 : 0) : 0;
    this.overlay.set(clamp(lines, 0, 1), this.time, camera.aspect, boosting, this.damageFlash, this.state === "title" ? 0 : this.fade);

    // audio loops
    this.audio.setLoops(active && !pl.dead && this.state !== "results" ? speedN : 0, boosting && active, pl.grinding && active);

    // HUD
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    store.pushFrame({
      speed: Math.max(0, pl.speed),
      boost: pl.boostGauge,
      boosting,
      damage: this.damageFlash,
      fps: this.fps,
      airborne: !pl.grounded,
      grinding: pl.grinding,
    });
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      const e = track.envAt(pl.s);
      const envName = THEMES[e.t > 0.5 ? e.b : e.a].name;
      store.set({
        rings: pl.rings,
        score: pl.score,
        lives: pl.lives,
        time: Math.floor(pl.time * 10) / 10,
        envName,
        progress: clamp(pl.s / this.level.goalS, 0, 1),
      });
    }

    // draw
    this.renderer.clear();
    this.renderer.render(this.scene, camera);
    this.renderer.render(this.overlay.scene, this.overlay.camera);
  }
}
