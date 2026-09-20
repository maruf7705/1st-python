import * as THREE from "three";
import { Track, Frame } from "../world/Track";
import { clamp, damp } from "../core/math";
import { PHYS } from "../Player";

// Third person chase camera that anticipates where the track goes: it blends
// the local tangent with the tangent a speed-dependent distance ahead, follows
// the track normal (so loops and banked turns read correctly) and widens the
// FOV with speed. All smoothing is exponential (frame-rate independent).

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private fwd = new THREE.Vector3(0, 0, 1);
  private up = new THREE.Vector3(0, 1, 0);
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private ahead = new Frame();
  private frame = new Frame();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private fov = 74;
  private lateral = 0;
  private shake = 0;
  private shakeT = 0;
  private fovKick = 0;
  private initialized = false;

  constructor(aspect: number, private track: Track) {
    this.camera = new THREE.PerspectiveCamera(74, aspect, 0.3, 1600);
  }

  snap(): void {
    this.initialized = false;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  addFovKick(amount: number): void {
    this.fovKick = Math.min(14, this.fovKick + amount);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    s: number,
    x: number,
    speed: number,
    boosting: boolean,
    airborne: boolean,
    dead: boolean
  ): void {
    const track = this.track;
    track.frameAt(s, this.frame);
    const speedN = clamp(Math.abs(speed) / PHYS.ABS_MAX, 0, 1);
    const lookAheadDist = clamp(6 + Math.abs(speed) * 0.45, 6, 42);
    track.frameAt(s + lookAheadDist, this.ahead);

    // desired forward: blend current tangent and the one ahead (prediction)
    this.tmp.copy(this.frame.tangent).lerp(this.ahead.tangent, 0.55).normalize();
    const desiredUp = this.tmp2.copy(this.frame.normal).lerp(this.ahead.normal, 0.3).normalize();

    const rate = 5 + speedN * 6;
    if (!this.initialized) {
      this.fwd.copy(this.tmp);
      this.up.copy(desiredUp);
    } else {
      this.fwd.lerp(this.tmp, 1 - Math.exp(-rate * dt)).normalize();
      this.up.lerp(desiredUp, 1 - Math.exp(-9 * dt)).normalize();
    }
    // re-orthogonalise up against forward
    this.up.addScaledVector(this.fwd, -this.up.dot(this.fwd)).normalize();

    const dist = 6.8 + speedN * 4.4 + (airborne ? 0.8 : 0);
    const height = 2.4 + speedN * 0.9 + (airborne ? 0.6 : 0);
    // partial lateral follow so the player drifts across the screen when steering
    this.lateral = damp(this.lateral, x * 0.35, 8, dt);
    const right = this.tmp2.crossVectors(this.fwd, this.up).normalize();

    this.target
      .copy(playerPos)
      .addScaledVector(this.fwd, -dist)
      .addScaledVector(this.up, height)
      .addScaledVector(right, this.lateral);
    if (dead) this.target.addScaledVector(this.up, 2);

    if (!this.initialized) {
      this.pos.copy(this.target);
      this.initialized = true;
    } else {
      const posRate = 9 + speedN * 8;
      this.pos.lerp(this.target, 1 - Math.exp(-posRate * dt));
    }

    // look target ahead of the player
    this.lookAt
      .copy(playerPos)
      .addScaledVector(this.fwd, 5 + speedN * 14)
      .addScaledVector(this.up, 1.1)
      .addScaledVector(right, this.lateral * 0.4);

    // shake
    if (this.shake > 0.001) {
      this.shakeT += dt * 60;
      const a = this.shake * 0.25;
      this.pos.addScaledVector(right, Math.sin(this.shakeT * 1.3) * a).addScaledVector(this.up, Math.cos(this.shakeT * 1.7) * a);
      this.shake = damp(this.shake, 0, 6, dt);
    }
    if (this.fovKick > 0.01) this.fovKick = damp(this.fovKick, 0, 4, dt);

    const targetFov = 72 + speedN * 24 + (boosting ? 6 : 0) + this.fovKick;
    this.fov = damp(this.fov, targetFov, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.pos);
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.lookAt);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
