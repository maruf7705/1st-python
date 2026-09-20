import * as THREE from "three";
import { Track, Frame, Section } from "./world/Track";
import { Entity } from "./world/Level";
import { EntityManager } from "./entities/Entities";
import { InputState } from "./core/Input";
import { clamp, damp } from "./core/math";

export const PHYS = {
  STEP: 1 / 240,
  G: 32,
  CRUISE: 27, // auto-run target speed (m/s)
  RUN_MAX: 46, // holding forward
  BOOST_SPEED: 70,
  ABS_MAX: 95,
  AUTO_ACCEL: 11,
  ACCEL: 17,
  BRAKE: 48,
  BOOST_ACCEL: 60,
  JUMP_V: 16.5,
  SPRING_V: 31,
  STEER_BASE: 8.5,
  AIR_ACCEL: 26,
  HOMING_SPEED: 62,
  LOOP_MIN: 16,
  RAIL_TOL: 1.6, // rails are spaced <= 3.2 m apart so coverage is gapless

  FALL_DEATH: -9,
  PLAYER_HEIGHT: 1.8,
  ROLL_HEIGHT: 1.0,
};

export interface PlayerEvents {
  onRing(e: Entity): void;
  onDashRing(e: Entity): void;
  onEnemyKilled(e: Entity, chain: number): void;
  onCrate(e: Entity): void;
  onDamage(ringsLost: number): void;
  onDeath(reason: "fall" | "hit"): void;
  onCheckpoint(e: Entity): void;
  onGoal(): void;
  onBoostPad(e: Entity): void;
  onSpring(e: Entity): void;
  onJump(): void;
  onLand(impact: number): void;
  onHoming(): void;
  onBoostStart(): void;
  onBoostEnd(): void;
  onGrindStart(): void;
}

export interface Checkpoint {
  s: number;
  rings: number;
  score: number;
  index: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _basis = new THREE.Matrix4();

export class Player {
  // track-space state
  s = 2;
  prevS = 2;
  x = 0;
  h = 0;
  speed = 0;
  vx = 0;
  grounded = true;
  grinding = false;
  rolling = false;
  boosting = false;
  homing: Entity | null = null;
  homingTimer = 0;
  canHoming = false;
  jumpCutDone = true;
  isSpringJump = false;
  // world-space (airborne)
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  // frame cache
  readonly frame = new Frame();
  section!: Section;
  // meta
  rings = 0;
  boostGauge = 0.35;
  score = 0;
  lives = 3;
  enemiesKilled = 0;
  maxSpeed = 0;
  airChain = 0;
  invuln = 0;
  padBoost = 0;
  hurt = 0;
  jumpBuffer = 0;
  coyote = 0;
  dead = false;
  deathTimer = 0;
  finished = false;
  time = 0;
  checkpoint: Checkpoint;
  // visuals
  readonly visualPos = new THREE.Vector3();
  readonly visualQuat = new THREE.Quaternion();
  curl = 0;
  runPhase = 0;
  lean = 0;
  pitch = 0;
  private wasBoosting = false;
  private landedFrames = 0;

  constructor(private track: Track, private entities: EntityManager, private ev: PlayerEvents) {
    this.checkpoint = { s: 2, rings: 0, score: 0, index: 0 };
    this.track.frameAt(this.s, this.frame);
    this.section = this.track.sectionAt(this.s);
    this.updateVisualTransform();
  }

  get attacking(): boolean {
    return this.boosting || this.rolling || this.homing !== null || this.padBoost > 0;
  }

  get height(): number {
    return this.rolling || (!this.grounded && this.curl > 0.5) ? PHYS.ROLL_HEIGHT : PHYS.PLAYER_HEIGHT;
  }

  respawn(): void {
    const cp = this.checkpoint;
    this.s = cp.s;
    this.prevS = cp.s;
    this.x = 0;
    this.h = 0;
    this.speed = 0;
    this.vx = 0;
    this.grounded = true;
    this.grinding = false;
    this.rolling = false;
    this.boosting = false;
    this.homing = null;
    this.rings = cp.rings;
    this.score = cp.score;
    this.boostGauge = Math.max(this.boostGauge, 0.3);
    this.invuln = 2.2;
    this.padBoost = 0;
    this.hurt = 0;
    this.dead = false;
    this.deathTimer = 0;
    this.airChain = 0;
    this.track.frameAt(this.s, this.frame);
    this.section = this.track.sectionAt(this.s);
    this.updateVisualTransform();
  }

  resetAll(): void {
    this.checkpoint = { s: 2, rings: 0, score: 0, index: 0 };
    this.rings = 0;
    this.score = 0;
    this.lives = 3;
    this.enemiesKilled = 0;
    this.maxSpeed = 0;
    this.time = 0;
    this.finished = false;
    this.boostGauge = 0.35;
    this.respawn();
  }

  private die(reason: "fall" | "hit"): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0;
    this.lives--;
    this.boosting = false;
    this.homing = null;
    this.rolling = false;
    if (this.grounded) {
      // classic death hop: pop up and fall through the world
      this.track.worldPos(this.s, this.x, this.h, this.frame, this.pos);
      this.vel.copy(this.frame.tangent).multiplyScalar(-4).addScaledVector(this.frame.normal, 12);
      this.grounded = false;
    } else if (reason === "hit") {
      this.vel.set(0, 10, 0);
    }
    this.ev.onDeath(reason);
  }

  private takeDamage(): void {
    if (this.invuln > 0 || this.dead) return;
    if (this.rings <= 0) {
      this.die("hit");
      return;
    }
    const lost = this.rings;
    this.rings = 0;
    this.invuln = 1.7;
    this.hurt = 0.5;
    this.speed *= 0.3;
    this.boostGauge = Math.max(0, this.boostGauge - 0.25);
    this.homing = null;
    this.airChain = 0;
    this.ev.onDamage(lost);
    // small knock-back hop when standing on a normal surface
    if (this.grounded && this.frame.normal.y > 0.4) {
      this.detach(0.25);
      this.vel.addScaledVector(this.frame.normal, 8);
      this.isSpringJump = true;
      this.jumpCutDone = true;
    }
  }

  /** Leave the surface with the current track-space velocity (scaled). */
  private detach(speedScale = 1): void {
    this.track.worldPos(this.s, this.x, this.h, this.frame, this.pos);
    this.vel.copy(this.frame.tangent).multiplyScalar(this.speed * speedScale).addScaledVector(this.frame.right, this.vx);
    this.grounded = false;
    this.grinding = false;
    this.rolling = false;
    this.coyote = 0;
  }

  private jump(): void {
    this.detach(1);
    const jv = PHYS.JUMP_V + clamp(this.speed, 0, 60) * 0.045;
    this.vel.addScaledVector(this.frame.normal, jv);
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.canHoming = true;
    this.jumpCutDone = false;
    this.isSpringJump = false;
    this.airChain = 0;
    this.ev.onJump();
  }

  private land(): void {
    const f = this.frame;
    const impact = -this.vel.dot(f.normal);
    this.grounded = true;
    this.h = 0;
    this.speed = this.vel.dot(f.tangent);
    this.vx = this.vel.dot(f.right) * 0.45;
    this.homing = null;
    this.airChain = 0;
    this.landedFrames = 0;
    this.ev.onLand(Math.max(0, impact));
  }

  private nearestRail(sec: Section, x: number): number | null {
    let best: number | null = null;
    let bestD = PHYS.RAIL_TOL;
    for (const r of sec.rails) {
      const d = Math.abs(r - x);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private hasSurfaceAt(sec: Section, x: number): boolean {
    if (sec.type === "road" || sec.type === "loop") return true;
    if (sec.type === "rail") return this.nearestRail(sec, x) !== null;
    return false;
  }

  step(dt: number, input: InputState, jumpPressed: boolean): void {
    if (this.finished) {
      // victory glide: keep rolling forward slowly
      this.speed = damp(this.speed, 12, 2, dt);
      this.s = this.track.clampS(this.s + this.speed * dt);
      this.track.frameAt(this.s, this.frame);
      this.runPhase += this.speed * dt * 0.9;
      this.updateVisualTransform();
      return;
    }
    if (this.dead) {
      this.deathTimer += dt;
      if (!this.grounded) {
        this.vel.y -= PHYS.G * dt;
        this.pos.addScaledVector(this.vel, dt);
      }
      this.updateVisualTransform();
      return;
    }
    this.time += dt;
    const track = this.track;
    this.prevS = this.s;

    // timers
    if (this.invuln > 0) this.invuln -= dt;
    if (this.padBoost > 0) this.padBoost -= dt;
    if (this.hurt > 0) this.hurt -= dt;
    if (jumpPressed) this.jumpBuffer = 0.13;
    else if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.grounded) this.coyote = 0.1;
    else if (this.coyote > 0) this.coyote -= dt;

    // boost
    const wantBoost = input.boostHeld && this.boostGauge > 0.001;
    this.boosting = wantBoost;
    if (this.boosting) this.boostGauge = Math.max(0, this.boostGauge - dt / 3.4);
    if (this.boosting !== this.wasBoosting) {
      if (this.boosting) this.ev.onBoostStart();
      else this.ev.onBoostEnd();
      this.wasBoosting = this.boosting;
    }

    if (this.grounded) this.stepGrounded(dt, input);
    else this.stepAirborne(dt, input);

    // section bookkeeping
    this.section = track.sectionAt(this.s);

    // entity interactions (swept over [prevS, s])
    this.collide();

    // stats
    if (this.speed > this.maxSpeed) this.maxSpeed = this.speed;
    // visual params
    const curlTarget = this.rolling || (!this.grounded && this.homing === null && !this.isSpringJump) ? 1 : 0;
    this.curl = damp(this.curl, curlTarget, 14, dt);
    this.runPhase += Math.abs(this.speed) * dt * 0.9;
    this.lean = damp(this.lean, this.grounded ? -this.vx * 0.06 - input.steer * 0.12 : -input.steer * 0.2, 10, dt);
    this.landedFrames++;
    this.updateVisualTransform();
  }

  private stepGrounded(dt: number, input: InputState): void {
    const track = this.track;
    const f = this.frame;
    track.frameAt(this.s, f);
    const sec = track.sectionAt(this.s);
    const inLoop = sec.type === "loop";

    this.rolling = input.rollHeld && !this.grinding && Math.abs(this.speed) > 3;

    // slope gravity
    const slope = -PHYS.G * f.tangent.y;
    this.speed += slope * (this.rolling ? 1.12 : 1) * dt;

    // drive
    if (this.boosting) {
      if (this.speed < PHYS.BOOST_SPEED) this.speed += PHYS.BOOST_ACCEL * dt;
    } else if (input.brake > 0) {
      this.speed -= PHYS.BRAKE * input.brake * dt;
      if (this.speed < 0 && f.tangent.y <= 0.05) this.speed = 0;
    } else if (this.rolling) {
      this.speed -= Math.sign(this.speed) * 1.2 * dt;
    } else {
      let a = 0;
      if (this.speed < PHYS.CRUISE) a = PHYS.AUTO_ACCEL;
      if (input.accel > 0 && this.speed < PHYS.RUN_MAX) a = Math.max(a, PHYS.ACCEL * input.accel);
      if (this.grinding) a *= 0.6;
      this.speed += a * dt;
    }
    // drag above the natural cap
    const cap = this.boosting || this.padBoost > 0 ? PHYS.ABS_MAX : this.grinding ? PHYS.RUN_MAX + 10 : PHYS.RUN_MAX;
    if (this.speed > cap) this.speed -= (this.speed - cap) * (this.rolling ? 0.3 : 0.8) * dt;
    // loop assist: past the first quarter the track is "magnetic"
    if (inLoop && f.normal.y < 0.3 && this.speed < PHYS.LOOP_MIN) this.speed = PHYS.LOOP_MIN;
    this.speed = clamp(this.speed, -35, PHYS.ABS_MAX);

    // lateral
    const hw = sec.width * 0.5 - 0.5;
    if (this.grinding) {
      const rail = this.nearestRail(sec, this.x);
      if (rail !== null) this.x = damp(this.x, rail, 22, dt);
      this.vx = 0;
    } else {
      const steerSpeed = (PHYS.STEER_BASE + Math.abs(this.speed) * 0.12) * (this.rolling ? 0.5 : 1);
      this.vx = damp(this.vx, input.steer * steerSpeed, 16, dt);
      this.x += this.vx * dt;
      if (this.x > hw) {
        this.x = hw;
        this.vx = Math.min(0, this.vx) * -0.2;
      } else if (this.x < -hw) {
        this.x = -hw;
        this.vx = Math.max(0, this.vx) * -0.2;
      }
    }

    // crest launch: fast over a convex crest -> leave the ground
    if (!inLoop && f.curvatureN < 0 && this.speed > 22) {
      const need = PHYS.G * 1.25;
      if (this.speed * this.speed * -f.curvatureN > need) {
        this.detach(1);
        this.canHoming = true;
        this.jumpCutDone = true;
        this.isSpringJump = true;
        return;
      }
    }

    // jump (buffered)
    if (this.jumpBuffer > 0 && !inLoop && f.normal.y > 0.35) {
      this.jump();
      return;
    }

    // advance
    this.s += this.speed * dt;
    if (this.s < 0.5) {
      this.s = 0.5;
      this.speed = Math.max(0, this.speed);
    }
    if (this.s >= track.length - 1) this.s = track.length - 1;
    track.frameAt(this.s, f);
    const nsec = track.sectionAt(this.s);
    if (nsec.type === "gap") {
      this.detach(1);
      this.isSpringJump = true;
      this.jumpCutDone = true;
      this.canHoming = true;
      return;
    }
    if (nsec.type === "rail") {
      const rail = this.nearestRail(nsec, this.x);
      if (rail === null) {
        this.detach(1);
        this.isSpringJump = true;
        this.jumpCutDone = true;
        this.canHoming = true;
        return;
      }
      if (!this.grinding) {
        this.grinding = true;
        this.rolling = false;
        this.ev.onGrindStart();
      }
    } else {
      this.grinding = false;
    }
    this.h = 0;
  }

  private stepAirborne(dt: number, input: InputState): void {
    const track = this.track;
    const f = this.frame;

    // variable jump height: releasing early cuts the arc
    if (!this.jumpCutDone && !input.jumpHeld) {
      const up = this.vel.dot(f.normal);
      if (up > 0) this.vel.addScaledVector(f.normal, -up * 0.45);
      this.jumpCutDone = true;
    }
    if (input.jumpHeld === false && !this.jumpCutDone) this.jumpCutDone = true;

    // homing attack / air dash on second press
    if (this.jumpBuffer > 0 && this.canHoming && this.homing === null) {
      this.jumpBuffer = 0;
      this.canHoming = false;
      const target = this.findHomingTarget();
      if (target) {
        this.homing = target;
        this.homingTimer = 0.7;
        this.curl = 1;
      } else {
        this.vel.addScaledVector(f.tangent, 7);
        this.vel.y = Math.max(this.vel.y, 3);
      }
      this.ev.onHoming();
    }

    if (this.homing) {
      const t = this.homing;
      this.homingTimer -= dt;
      if (!t.alive || this.homingTimer <= 0) {
        this.homing = null;
      } else {
        this.entities.worldPos(t, _v);
        _v2.copy(_v).sub(this.pos);
        const dist = _v2.length();
        if (dist < 1.4) {
          this.killEnemy(t);
          this.homing = null;
          this.canHoming = true;
          track.frameAt(this.s, f);
          this.vel.copy(f.tangent).multiplyScalar(Math.max(this.speed, 24)).addScaledVector(f.normal, 13);
          this.isSpringJump = true;
        } else {
          _v2.multiplyScalar(1 / dist);
          this.vel.copy(_v2).multiplyScalar(PHYS.HOMING_SPEED);
          this.pos.addScaledVector(this.vel, dt);
        }
      }
    }
    if (!this.homing) {
      // gravity (slightly heavier on the way down for a punchy arc)
      const falling = this.vel.dot(f.normal) < 0;
      this.vel.y -= PHYS.G * (falling ? 1.18 : 1) * dt;
      // air steering relative to the track frame
      const lat = this.vel.dot(f.right);
      const target = input.steer * (PHYS.STEER_BASE + Math.abs(this.speed) * 0.1);
      const dl = clamp(target - lat, -PHYS.AIR_ACCEL * dt, PHYS.AIR_ACCEL * dt);
      this.vel.addScaledVector(f.right, dl);
      // mild forward air control
      if (input.accel > 0 && this.speed < PHYS.RUN_MAX) this.vel.addScaledVector(f.tangent, PHYS.ACCEL * 0.35 * dt);
      if (input.brake > 0) this.vel.addScaledVector(f.tangent, -PHYS.BRAKE * 0.25 * dt);
      if (this.boosting && this.speed < PHYS.BOOST_SPEED) this.vel.addScaledVector(f.tangent, PHYS.BOOST_ACCEL * 0.6 * dt);
      this.pos.addScaledVector(this.vel, dt);
    }

    // re-project onto the track
    const fwd = Math.max(2, this.speed * dt) + 6;
    this.s = track.project(this.pos, this.s, 5, fwd);
    track.frameAt(this.s, f);
    _v.copy(this.pos).sub(f.pos);
    this.x = _v.dot(f.right);
    this.h = _v.dot(f.normal);
    this.speed = this.vel.dot(f.tangent);
    this.vx = this.vel.dot(f.right);
    const sec = track.sectionAt(this.s);
    // invisible walls
    const hw = sec.width * 0.5 - 0.3;
    if (this.x > hw || this.x < -hw) {
      const nx = clamp(this.x, -hw, hw);
      this.pos.addScaledVector(f.right, nx - this.x);
      this.x = nx;
      const lat = this.vel.dot(f.right);
      this.vel.addScaledVector(f.right, -lat);
      this.vx = 0;
    }

    // landing
    if (this.h <= 0) {
      const surface = this.hasSurfaceAt(sec, this.x);
      if (surface && this.vel.dot(f.normal) <= 2) {
        if (this.h < -2.5 && sec.type !== "loop") {
          // arrived from well below the surface (missed a ledge): treat as fall
          if (this.h < PHYS.FALL_DEATH) this.die("fall");
          return;
        }
        this.h = 0;
        this.pos.copy(f.pos).addScaledVector(f.right, this.x);
        this.land();
        if (sec.type === "rail") {
          this.grinding = true;
          const rail = this.nearestRail(sec, this.x);
          if (rail !== null) this.x = rail;
          this.ev.onGrindStart();
        } else {
          this.grinding = false;
          if (input.rollHeld) this.speed += 2.5;
        }
        return;
      }
      if (this.h < PHYS.FALL_DEATH) {
        this.die("fall");
      }
    }
  }

  private findHomingTarget(): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    this.entities.forEachInRange(this.s - 12, this.s + 34, (e) => {
      if (!e.alive) return;
      if (e.kind !== "drone" && e.kind !== "crawler") return;
      const ds = e.s - this.s;
      if (ds < -1.5 || ds > 24) return;
      const dx = e.x - this.x;
      const dh = e.h - this.h;
      if (Math.abs(dx) > 5.5 || Math.abs(dh) > 8) return;
      const d = ds * ds + dx * dx * 1.5 + dh * dh;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  private killEnemy(e: Entity): void {
    if (!e.alive) return;
    this.entities.kill(e);
    this.airChain = this.grounded ? 1 : this.airChain + 1;
    this.enemiesKilled++;
    this.score += 100 * this.airChain;
    this.boostGauge = Math.min(1, this.boostGauge + 0.08);
    this.ev.onEnemyKilled(e, this.airChain);
  }

  private collide(): void {
    const lo = Math.min(this.prevS, this.s);
    const hi = Math.max(this.prevS, this.s);
    const centerH = this.h + this.height * 0.5;
    const rolling = this.rolling || (!this.grounded && this.curl > 0.5);
    this.entities.forEachInRange(lo - 14, hi + 14, (e) => {
      if (!e.alive) return;
      const ds = e.s - this.s;
      const crossed = e.s > lo - 0.01 && e.s <= hi + 0.01;
      switch (e.kind) {
        case "ring": {
          if (Math.abs(ds) < 1.5 && Math.abs(e.x - this.x) < 1.6 && Math.abs(e.h - centerH) < 1.7) {
            this.entities.kill(e);
            this.rings++;
            this.score += 10;
            this.boostGauge = Math.min(1, this.boostGauge + 0.03);
            this.ev.onRing(e);
          }
          break;
        }
        case "dashring": {
          if (Math.abs(ds) < 2 && Math.abs(e.x - this.x) < 2 && Math.abs(e.h - centerH) < 2.2) {
            this.entities.kill(e);
            this.score += 30;
            this.boostGauge = Math.min(1, this.boostGauge + 0.1);
            if (this.grounded) this.detach(1);
            this.track.frameAt(this.s, this.frame);
            this.vel.copy(this.frame.tangent).multiplyScalar(Math.max(this.speed, 52)).addScaledVector(this.frame.normal, 7);
            this.isSpringJump = true;
            this.canHoming = true;
            this.jumpCutDone = true;
            this.ev.onDashRing(e);
          }
          break;
        }
        case "drone":
        case "crawler":
        case "spiky": {
          if (Math.abs(ds) < 1.5 && Math.abs(e.x - this.x) < 1.5 && Math.abs(e.h - centerH) < 1.6) {
            const stomp = !this.grounded && this.h > e.h + 0.15 && this.vel.dot(this.frame.normal) < 1;
            const canKill = e.kind === "spiky" ? this.boosting || this.rolling || this.padBoost > 0 : this.attacking || stomp;
            if (canKill) {
              this.killEnemy(e);
              if (stomp && !this.boosting) {
                // bounce
                this.vel.copy(this.frame.tangent).multiplyScalar(Math.max(this.speed, 10)).addScaledVector(this.frame.normal, 14);
                this.isSpringJump = true;
                this.jumpCutDone = false;
                this.canHoming = true;
              }
            } else {
              this.takeDamage();
            }
          }
          break;
        }
        case "spikes": {
          if (Math.abs(ds) < 1.15 && Math.abs(e.x - this.x) < 1.15 && this.h < 0.8) {
            if (!this.boosting && !(this.padBoost > 0)) this.takeDamage();
          }
          break;
        }
        case "crate": {
          if (Math.abs(ds) < 1.1 && Math.abs(e.x - this.x) < 1.1 && this.h < 1.6) {
            this.entities.kill(e);
            this.score += 25;
            this.boostGauge = Math.min(1, this.boostGauge + 0.04);
            this.ev.onCrate(e);
            if (!this.attacking) this.takeDamage();
          }
          break;
        }
        case "barrier": {
          if (!crossed) break;
          let hit = false;
          if (e.barrierType === 0) hit = Math.abs(this.x - e.x) > 1.65 && this.h < 3.1;
          else if (e.barrierType === 1) hit = this.h < 1.2;
          else hit = this.h < 1.85 && this.h + (rolling ? PHYS.ROLL_HEIGHT : PHYS.PLAYER_HEIGHT) > 1.35;
          if (hit) {
            if (this.boosting || this.padBoost > 0) {
              // smash through; barrier stays but no damage
              this.speed *= 0.85;
            } else {
              this.speed *= 0.25;
              if (!this.grounded) this.vel.multiplyScalar(0.3);
              this.takeDamage();
            }
          }
          break;
        }
        case "boost": {
          if (Math.abs(ds) < 2.3 && Math.abs(e.x - this.x) < 1.9 && this.h < 1.2 && this.grounded) {
            this.speed = Math.min(PHYS.ABS_MAX, Math.max(this.speed, 60) + 8);
            this.padBoost = 1.1;
            this.boostGauge = Math.min(1, this.boostGauge + 0.06);
            this.ev.onBoostPad(e);
          }
          break;
        }
        case "spring": {
          if (Math.abs(ds) < 1.4 && Math.abs(e.x - this.x) < 1.4 && this.h < 1.5 && e.anim <= 0) {
            e.anim = 0.35;
            if (this.grounded) this.detach(0.9);
            this.track.frameAt(this.s, this.frame);
            const upDir = this.frame.normal.y > 0.5 ? _v.set(0, 1, 0) : _v.copy(this.frame.normal);
            const forward = this.vel.dot(this.frame.tangent);
            this.vel.copy(this.frame.tangent).multiplyScalar(Math.max(forward, 26));
            this.vel.addScaledVector(upDir, PHYS.SPRING_V);
            this.isSpringJump = true;
            this.jumpCutDone = true;
            this.canHoming = true;
            this.grounded = false;
            this.ev.onSpring(e);
          }
          break;
        }
        case "checkpoint": {
          if (crossed) {
            this.entities.kill(e);
            this.checkpoint = { s: e.s + 1, rings: this.rings, score: this.score + 200, index: e.order };
            this.score += 200;
            this.ev.onCheckpoint(e);
          }
          break;
        }
        case "goal": {
          if (crossed && !this.finished) {
            this.finished = true;
            this.boosting = false;
            if (!this.grounded) {
              this.grounded = true;
              this.h = 0;
            }
            this.ev.onGoal();
          }
          break;
        }
      }
    });
  }

  /** World transform used by the renderer (interpolated by the game loop). */
  private updateVisualTransform(): void {
    const f = this.frame;
    if (this.grounded || this.dead) {
      if (this.grounded && !this.dead) this.track.worldPos(this.s, this.x, this.h, f, this.visualPos);
      else this.visualPos.copy(this.pos);
    } else {
      this.visualPos.copy(this.pos);
    }
    // orientation: right / normal / tangent
    _basis.makeBasis(f.right, f.normal, f.tangent);
    this.visualQuat.setFromRotationMatrix(_basis);
  }
}
