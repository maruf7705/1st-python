// camera.js — speed-predictive follow camera with FOV kick and banking
import * as THREE from '../lib/three.module.js';
import { CFG, clamp, damp, lerp } from './utils.js';

export class GameCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(62, aspect, 0.3, 2600);
    this.pos = new THREE.Vector3(0, 8, -14);
    this.look = new THREE.Vector3();
    this.smoothFwd = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.fovT = 62;
    this.roll = 0;
    this.shake = 0;
  }

  resize(aspect) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }

  kick(amount) { this.shake = Math.max(this.shake, amount); }

  update(dt, player, track, frozen = false) {
    const speed01 = clamp(Math.abs(player.displaySpeed) / (CFG.MAX_BOOST * 3.1), 0, 1);
    const boosting = player.boostT > 0;

    // desired forward: blend velocity direction with track tangent
    const fr = track.frameAt(player.s, track._tmp);
    let fwd;
    if (player.state === 'air' && player.vel.lengthSq() > 25) {
      fwd = player.vel.clone().normalize();
    } else {
      fwd = fr.T.clone().multiplyScalar(Math.sign(player.vs) || 1);
    }
    // avoid snapping when velocity flips (bounce) — smooth heavily
    this.smoothFwd.lerp(fwd, 1 - Math.exp(-5.5 * dt)).normalize();

    // predicted target: position + velocity lookahead
    const velPredict = player.state === 'air' ? player.vel : fr.T.clone().multiplyScalar(player.vs);
    const lookAhead = clamp(velPredict.length() * 0.38, 4, 15);
    const target = player.pos.clone().addScaledVector(velPredict.clone().normalize(), lookAhead * 0.55);

    // camera position: behind + above, along smoothed forward
    const dist = 8.6 + speed01 * 2.4 + (boosting ? 1.2 : 0);
    const height = 4.1;
    const desired = player.pos.clone()
      .addScaledVector(this.smoothFwd, -dist)
      .addScaledVector(fr.N, height * 0.55)
      .addScaledVector(new THREE.Vector3(0, 1, 0), height * 0.45);

    if (frozen) {
      this.pos.copy(desired);
      this.look.copy(target);
    } else {
      this.pos.lerp(desired, 1 - Math.exp(-7 * dt));
      this.look.lerp(target, 1 - Math.exp(-10 * dt));
    }

    // up vector: blend world up with track normal (loops ride-through)
    const upBlend = player.state === 'ground' || player.state === 'rail' ? 0.62 : 0.2;
    const upT = new THREE.Vector3(0, 1, 0).lerp(fr.N, upBlend).normalize();
    this.up.lerp(upT, 1 - Math.exp(-4.5 * dt)).normalize();

    // banking roll from lateral velocity
    const latV = player.state === 'ground' ? player.vl : player.vel.dot(fr.B);
    const rollT = clamp(-latV * 0.006, -0.14, 0.14);
    this.roll = damp(this.roll, rollT, 4, dt);

    // shake decay
    this.shake = Math.max(0, this.shake - dt * 2.2);

    this.cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      this.cam.position.x += (Math.random() - 0.5) * this.shake;
      this.cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.cam.up.copy(this.up);
    this.cam.lookAt(this.look);
    this.cam.rotateZ(this.roll);

    // FOV kick
    this.fovT = 62 + speed01 * 14 + (boosting ? 6 : 0);
    if (Math.abs(this.cam.fov - this.fovT) > 0.05) {
      this.cam.fov = damp(this.cam.fov, this.fovT, 5, dt);
      this.cam.updateProjectionMatrix();
    }
  }

  snapBehind(player, track) {
    this.update(1, player, track, true);
  }
}
