import * as THREE from "three";
import { clamp, damp } from "../core/math";
import { PHYS } from "../Player";

// An original stylised sprinter-bot assembled from primitives with fully
// procedural animation (run cycle, lean, curl-into-ball spin, jet flames).

export interface PlayerAnimParams {
  dt: number;
  speed: number;
  grounded: boolean;
  grinding: boolean;
  curl: number;
  runPhase: number;
  lean: number;
  boosting: boolean;
  padBoost: boolean;
  invuln: number;
  dead: boolean;
  steer: number;
}

export class PlayerMesh {
  readonly root = new THREE.Group();
  readonly blob: THREE.Mesh;
  private body = new THREE.Group();
  private humanoid = new THREE.Group();
  private ball = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private visorMat: THREE.MeshStandardMaterial;
  private blink = 0;
  private bodyPitch = 0;
  private bodyRoll = 0;
  private flameScale = 0;

  constructor() {
    const blue = new THREE.MeshStandardMaterial({ color: 0x2457ff, metalness: 0.55, roughness: 0.32 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.2, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, metalness: 0.6, roughness: 0.4 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff7a1a, metalness: 0.4, roughness: 0.4, emissive: new THREE.Color(0x903800), emissiveIntensity: 0.3 });
    this.visorMat = new THREE.MeshStandardMaterial({ color: 0x35f0ff, emissive: new THREE.Color(0x22d8ff), emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.2 });

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
      const me = new THREE.Mesh(g, m);
      me.castShadow = true;
      me.receiveShadow = false;
      return me;
    };

    // torso
    const torso = mesh(new THREE.CapsuleGeometry(0.3, 0.32, 6, 14), blue);
    torso.position.y = 1.02;
    const chest = mesh(new THREE.BoxGeometry(0.34, 0.22, 0.12), this.visorMat);
    chest.position.set(0, 1.08, 0.27);
    const belt = mesh(new THREE.TorusGeometry(0.31, 0.05, 6, 18).rotateX(Math.PI / 2), orange);
    belt.position.y = 0.82;
    // head
    const head = mesh(new THREE.SphereGeometry(0.3, 20, 14), white);
    head.position.y = 1.58;
    const visor = mesh(new THREE.BoxGeometry(0.42, 0.15, 0.22), this.visorMat);
    visor.position.set(0, 1.6, 0.2);
    const finL = mesh(new THREE.ConeGeometry(0.09, 0.5, 6), orange);
    finL.position.set(-0.18, 1.7, -0.22);
    finL.rotation.x = -2.1;
    const finR = finL.clone();
    finR.position.x = 0.18;
    const finC = mesh(new THREE.ConeGeometry(0.1, 0.62, 6), orange);
    finC.position.set(0, 1.78, -0.26);
    finC.rotation.x = -1.9;

    // arms
    const armGeo = new THREE.CapsuleGeometry(0.085, 0.36, 4, 10);
    for (const [grp, sx] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      grp.position.set(sx * 0.42, 1.25, 0);
      const upper = mesh(armGeo, white);
      upper.position.y = -0.24;
      const hand = mesh(new THREE.SphereGeometry(0.11, 10, 8), blue);
      hand.position.y = -0.5;
      grp.add(upper, hand);
    }
    // legs
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.42, 4, 10);
    for (const [grp, sx] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      grp.position.set(sx * 0.17, 0.72, 0);
      const leg = mesh(legGeo, dark);
      leg.position.y = -0.3;
      const boot = mesh(new THREE.BoxGeometry(0.22, 0.16, 0.4), orange);
      boot.position.set(0, -0.62, 0.06);
      const sole = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.36), this.visorMat);
      sole.position.set(0, -0.71, 0.06);
      grp.add(leg, boot, sole);
    }
    // jet pack
    const pack = mesh(new THREE.BoxGeometry(0.34, 0.3, 0.16), dark);
    pack.position.set(0, 1.08, -0.3);
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const sx of [-0.09, 0.09]) {
      const nozzle = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 8), orange);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(sx, 1.02, -0.42);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 8).rotateX(-Math.PI / 2), this.flameMat);
      flame.position.set(sx, 1.02, -0.5);
      flame.scale.set(1, 1, 0.01);
      this.flames.push(flame);
      this.humanoid.add(nozzle, flame);
    }
    this.humanoid.add(torso, chest, belt, head, visor, finL, finR, finC, this.armL, this.armR, this.legL, this.legR, pack);

    // ball form
    const ballCore = mesh(new THREE.SphereGeometry(0.56, 20, 14), blue);
    const band1 = mesh(new THREE.TorusGeometry(0.57, 0.05, 6, 24).rotateY(Math.PI / 2), orange);
    const band2 = mesh(new THREE.TorusGeometry(0.57, 0.05, 6, 24).rotateY(Math.PI / 2 + 0.9), white);
    const band3 = mesh(new THREE.TorusGeometry(0.57, 0.05, 6, 24).rotateY(Math.PI / 2 - 0.9), white);
    this.ball.add(ballCore, band1, band2, band3);
    this.ball.position.y = 0.62;
    this.ball.visible = false;

    this.body.add(this.humanoid, this.ball);
    this.root.add(this.body);

    // blob shadow
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const ctx = cv.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    this.blob.renderOrder = 1;
  }

  update(p: PlayerAnimParams): void {
    const dt = p.dt;
    const speedN = clamp(Math.abs(p.speed) / PHYS.ABS_MAX, 0, 1);
    const curled = p.curl > 0.55;
    this.humanoid.visible = !curled;
    this.ball.visible = curled;

    // blink while invulnerable
    if (p.invuln > 0 && !p.dead) {
      this.blink += dt;
      this.body.visible = Math.floor(this.blink * 14) % 2 === 0;
    } else {
      this.body.visible = true;
      this.blink = 0;
    }

    if (curled) {
      this.ball.rotation.x += Math.max(6, Math.abs(p.speed) * 1.6) * dt;
      this.body.position.y = 0;
      this.body.rotation.set(0, 0, 0);
    } else {
      const run = p.grounded && !p.grinding ? clamp(Math.abs(p.speed) / 12, 0, 1) : 0;
      const swing = Math.sin(p.runPhase) * (0.75 + speedN * 0.45) * run;
      const armSwing = -swing * 0.9;
      if (p.grinding) {
        // surf stance
        this.legL.rotation.set(0.15, 0, 0.55);
        this.legR.rotation.set(-0.15, 0, -0.55);
        this.armL.rotation.set(0, 0, 1.9);
        this.armR.rotation.set(0, 0, -1.9);
      } else if (!p.grounded) {
        // spring / launched pose
        this.legL.rotation.set(0.5, 0, 0.25);
        this.legR.rotation.set(-0.35, 0, -0.25);
        this.armL.rotation.set(-2.4, 0, 0.6);
        this.armR.rotation.set(-2.4, 0, -0.6);
      } else {
        this.legL.rotation.set(swing, 0, 0);
        this.legR.rotation.set(-swing, 0, 0);
        this.armL.rotation.set(armSwing, 0, 0.15);
        this.armR.rotation.set(-armSwing, 0, -0.15);
      }
      const bob = run * Math.abs(Math.sin(p.runPhase)) * 0.07;
      this.body.position.y = bob;
      const pitchTarget = p.grounded ? (p.grinding ? 0.15 : 0.12 + speedN * 0.55 + (p.boosting ? 0.15 : 0)) : 0.25;
      this.bodyPitch = damp(this.bodyPitch, pitchTarget, 8, dt);
      this.bodyRoll = damp(this.bodyRoll, p.lean * 2.2, 8, dt);
      this.body.rotation.set(this.bodyPitch, 0, this.bodyRoll);
    }

    // flames
    const flameTarget = p.boosting || p.padBoost ? 1 : speedN > 0.45 ? (speedN - 0.45) * 0.8 : 0;
    this.flameScale = damp(this.flameScale, flameTarget, 10, dt);
    const flick = 0.85 + Math.random() * 0.3;
    for (const f of this.flames) f.scale.set(1, 1, Math.max(0.01, this.flameScale * flick * 1.4));
    this.flameMat.opacity = 0.9 * Math.min(1, this.flameScale * 1.5);
    this.visorMat.emissiveIntensity = p.boosting ? 3 : 1.4;
  }

  updateBlob(surfacePos: THREE.Vector3, quat: THREE.Quaternion, h: number): void {
    this.blob.position.copy(surfacePos);
    this.blob.quaternion.copy(quat);
    const k = clamp(1 - h / 14, 0.15, 1);
    this.blob.scale.set(k, 1, k);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = k;
  }
}
