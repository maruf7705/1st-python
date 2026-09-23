// entities.js — rings, enemies, obstacles, pads, checkpoints, goal, particle pool
import * as THREE from '../lib/three.module.js';
import { CFG, clamp, lerp, ZONES } from './utils.js';
import { Frame } from './track.js';

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export class Particles {
  constructor(scene, max = 800) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.55, map: glowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true, toneMapped: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._tmpC = new THREE.Color();
  }

  spawn(p, color, n = 10, speed = 8, life = 0.7, spread = 1, up = 0) {
    this._tmpC.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.head; this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = (Math.random() - 0.5) * speed * spread;
      this.vel[i * 3 + 1] = (Math.random() - 0.3) * speed * spread + up;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed * spread;
      const j = 0.75 + Math.random() * 0.5;
      this.col[i * 3] = this._tmpC.r * j; this.col[i * 3 + 1] = this._tmpC.g * j; this.col[i * 3 + 2] = this._tmpC.b * j;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -99999; // park dead particles out of view
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 18 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 3] *= (0.985); this.col[i * 3 + 1] *= (0.985); this.col[i * 3 + 2] *= (0.985);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

export class Entities {
  constructor(track, scene, particles) {
    this.track = track; this.scene = scene; this.particles = particles;
    this.rings = null; this.ringData = [];
    this.pads = []; this.springs = []; this.spikes = []; this.crushers = [];
    this.enemies = []; this.checkpoints = []; this.goal = null;
    this.t = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.ringsCollected = 0;
  }

  build(manifest) {
    this._buildRings(manifest.rings);
    this._buildPads(manifest.pads);
    this._buildSprings(manifest.springs);
    this._buildSpikes(manifest.spikes);
    this._buildCrushers(manifest.crushers);
    this._buildEnemies(manifest.enemies);
    this._buildCheckpoints(manifest.checkpoints, manifest.goalS);
    return this;
  }

  _frameBasis(s, lat, h, out) {
    const fr = this.track.frameAt(s, this._fr || (this._fr = new Frame()));
    return { fr, world: out.copy(fr.P).addScaledVector(fr.B, lat).addScaledVector(fr.N, h) };
  }

  _orient(mesh, s) {
    const fr = this.track.frameAt(s, this._fr2 || (this._fr2 = new Frame()));
    this._m4.makeBasis(fr.B, fr.N, fr.T);
    mesh.quaternion.setFromRotationMatrix(this._m4);
    return fr;
  }

  // ---------------- rings ----------------
  _buildRings(list) {
    const cap = Math.min(list.length, 620);
    const geo = new THREE.TorusGeometry(0.55, 0.15, 10, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffc832, emissive: 0xffa000, emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.7,
    });
    this.rings = new THREE.InstancedMesh(geo, mat, cap);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.scene.add(this.rings);
    this.ringData = [];
    for (let i = 0; i < cap; i++) {
      const r = list[i];
      const p = this.track.surfacePoint(r.s, r.lat, r.h);
      this.ringData.push({ home: p.clone(), pos: p.clone(), collected: false, respawn: 0, s: r.s, spin: Math.random() * 6.28, mag: false });
      this.rings.setMatrixAt(i, this._m4.makeTranslation(p.x, p.y, p.z));
    }
  }

  _collectRing(i, game, player) {
    const d = this.ringData[i];
    d.collected = true; d.respawn = 5.5; d.mag = false;
    player.addRings(1);
    this.ringsCollected++;
    game.onRing(d.pos);
    this.particles.spawn(d.pos, 0xffd54a, 6, 6, 0.4, 0.7);
  }

  _updateRings(dt, player, game) {
    const t = this.t;
    const near = 260;
    for (let i = 0; i < this.ringData.length; i++) {
      const d = this.ringData[i];
      if (d.collected) {
        d.respawn -= dt;
        if (d.respawn <= 0 && !d.rail) { d.collected = false; d.pos.copy(d.home); }
      }
      const ds = Math.abs(d.s - player.s);
      if (ds > near && !d.collected) continue; // leave matrix as-is
      if (!d.collected) {
        // magnet
        const distSq = d.pos.distanceToSquared(player.pos);
        if (distSq < 30 && !player.dead) d.mag = true;
        if (d.mag) {
          d.pos.lerp(player.pos, clamp(dt * 14, 0, 1));
          if (distSq < 2.6) { this._collectRing(i, game, player); }
        } else if (distSq < 2.2 && !player.dead) {
          this._collectRing(i, game, player);
        }
      }
      // compose matrix
      d.spin += dt * 4;
      if (d.collected) {
        this._m4.makeScale(0, 0, 0);
      } else {
        this._q.setFromAxisAngle(this._UP || (this._UP = new THREE.Vector3(0, 1, 0)), d.spin);
        this._m4.compose(d.pos, this._q, this._ONE || (this._ONE = new THREE.Vector3(1, 1, 1)));
      }
      this.rings.setMatrixAt(i, this._m4);
    }
    this.rings.instanceMatrix.needsUpdate = true;
  }

  // ---------------- pads / springs / spikes / crushers ----------------
  _buildPads(list) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#06222c'; cx.fillRect(0, 0, 128, 64);
    cx.fillStyle = '#00e5ff';
    for (let c = 0; c < 3; c++) {
      const x = 12 + c * 40;
      cx.beginPath();
      cx.moveTo(x, 8); cx.lineTo(x + 22, 32); cx.lineTo(x, 56); cx.lineTo(x + 12, 56);
      cx.lineTo(x + 34, 32); cx.lineTo(x + 12, 8); cx.closePath(); cx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    for (const p of list) {
      const { fr, world } = this._frameBasis(p.s, p.lat, 0.1, new THREE.Vector3());
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(p.w * 2, p.l),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false })
      );
      mesh.position.copy(world);
      this._orient(mesh, p.s);
      mesh.rotateX(-Math.PI / 2);
      this.scene.add(mesh);
      const glow = new THREE.PointLight(0x00e5ff, 0, 10);
      glow.position.copy(world).addScaledVector(fr.N, 0.8);
      this.scene.add(glow);
      this.pads.push({ ...p, mesh, glow, cool: 0, fr });
    }
  }

  _buildSprings(list) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff5577, emissive: 0xff2244, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.3,
    });
    for (const sp of list) {
      const { fr, world } = this._frameBasis(sp.s, sp.lat, 0.25, new THREE.Vector3());
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.35, 20), mat);
      g.add(base);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.3, 20),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff8899, emissiveIntensity: 1.4, roughness: 0.2 }));
      top.position.y = 0.3; g.add(top);
      g.position.copy(world);
      this._orient(g, sp.s);
      this.scene.add(g);
      this.springs.push({ ...sp, g, top, anim: 0, fr });
    }
  }

  _buildSpikes(list) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x882a2a, roughness: 0.6, metalness: 0.5 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.8 });
    for (const sp of list) {
      const { fr, world } = this._frameBasis(sp.s, sp.lat, 0.15, new THREE.Vector3());
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(sp.w * 2, 0.3, sp.l), mat);
      g.add(base);
      const n = Math.round(sp.w * 2 / 0.8);
      for (let i = 0; i < n; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 6), tipMat);
        cone.position.set(-sp.w + 0.4 + i * 0.8, 0.6, (Math.random() - 0.5) * (sp.l - 1));
        g.add(cone);
      }
      g.position.copy(world);
      this._orient(g, sp.s);
      this.scene.add(g);
      this.spikes.push({ ...sp, g, fr });
    }
  }

  _buildCrushers(list) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.4, metalness: 0.8 });
    const warnMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 1.2, roughness: 0.4 });
    for (const c of list) {
      const { fr, world } = this._frameBasis(c.s, c.lat, 0, new THREE.Vector3());
      const g = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 16, 1.6), bodyMat);
      pillar.position.y = 9; g.add(pillar);
      const head = new THREE.Group();
      const headBox = new THREE.Mesh(new THREE.BoxGeometry(c.w * 2, 2.2, 2.4), bodyMat);
      head.add(headBox);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(c.w * 2 + 0.1, 0.4, 2.5), warnMat);
      strip.position.y = 0.8; head.add(strip);
      head.position.y = 0;
      g.add(head);
      g.position.copy(world);
      this._orient(g, c.s);
      this.scene.add(g);
      this.crushers.push({ ...c, g, head, fr, yFrac: 0 });
    }
  }

  // ---------------- enemies ----------------
  _buildEnemies(list) {
    for (const e of list) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.35, metalness: 0.85, emissive: 0xff3030, emissiveIntensity: 0.25 })
      );
      g.add(body);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.12, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 1.2, roughness: 0.3 })
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffcc00, toneMapped: false })
      );
      eye.position.z = 0.85;
      g.add(eye);
      this.scene.add(g);
      this.enemies.push({ ...e, g, alive: true, deathT: 0 });
    }
  }

  // ---------------- checkpoints & goal ----------------
  _buildCheckpoints(list, goalS) {
    const pilMat = new THREE.MeshStandardMaterial({ color: 0xdde6f0, roughness: 0.3, metalness: 0.6 });
    for (const cp of list) {
      const { fr, world } = this._frameBasis(cp.s, 0, 0, new THREE.Vector3());
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.9), pilMat);
        pil.position.set(side * (CFG.ROAD_HW + 1.2), 4.5, 0);
        g.add(pil);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry((CFG.ROAD_HW + 1.7) * 2, 1.1, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x33ffaa, emissive: 0x22cc88, emissiveIntensity: 1.1, roughness: 0.3 }));
      bar.position.y = 9.2; g.add(bar);
      const light = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      light.position.y = 4.5; light.visible = false; g.add(light);
      g.position.copy(world);
      this._orient(g, cp.s);
      this.scene.add(g);
      this.checkpoints.push({ ...cp, g, light, passed: false, lightT: 0 });
    }
    // goal portal
    {
      const { fr, world } = this._frameBasis(goalS, 0, 3.4, new THREE.Vector3());
      const g = new THREE.Group();
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(4.2, 0.55, 14, 40),
        new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0xffaa00, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.6 })
      );
      g.add(torus);
      const inner = new THREE.Mesh(
        new THREE.CircleGeometry(3.9, 36),
        new THREE.MeshBasicMaterial({ color: 0x66eeff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
      );
      g.add(inner);
      g.position.copy(world);
      this._orient(g, goalS);
      this.scene.add(g);
      const glow = new THREE.PointLight(0xffcc44, 1.4, 40);
      glow.position.copy(world); this.scene.add(glow);
      this.goal = { g, torus, inner, s: goalS, done: false, fr };
    }
  }

  // ---------------- update ----------------
  update(dt, player, game) {
    this.t += dt;
    this._updateRings(dt, player, game);
    const HW = CFG.ROAD_HW;

    // pads
    for (const p of this.pads) {
      p.cool = Math.max(0, p.cool - dt);
      p.glow.intensity = p.cool > 0 ? 0 : 2.2 + Math.sin(this.t * 8) * 0.8;
      if (p.cool <= 0 && player.state !== 'air'
        && Math.abs(player.s - p.s) < p.l / 2 && Math.abs(player.lat - p.lat) < p.w + 0.4) {
        player.boostPad(); p.cool = 1.2;
      }
    }

    // springs
    for (const sp of this.springs) {
      sp.anim = Math.max(0, sp.anim - dt * 3);
      sp.top.position.y = 0.3 + sp.anim * 0.5;
      if (Math.abs(player.s - sp.s) < 1.6 && Math.abs(player.lat - sp.lat) < 1.9 && player.state !== 'air') {
        player.spring(); sp.anim = 1;
        this.particles.spawn(sp.g.position, 0xff5577, 16, 10, 0.5, 0.8, 6);
      }
    }

    // spikes
    for (const sp of this.spikes) {
      if (Math.abs(player.s - sp.s) < sp.l / 2 + 0.4 && Math.abs(player.lat - sp.lat) < sp.w && player.state === 'ground') {
        game.hurtPlayer(sp.g.position);
      }
    }

    // crushers
    for (const c of this.crushers) {
      const cyc = (this.t * 0.55 + c.phase) % 1;
      let yf;
      if (cyc < 0.1) yf = cyc / 0.1;            // slam down
      else if (cyc < 0.38) yf = 1;              // hold down
      else if (cyc < 0.55) yf = 1 - (cyc - 0.38) / 0.17; // rise
      else yf = 0;                              // wait up
      c.yFrac = yf;
      c.head.position.y = lerp(7.5, 1.1, yf);
      if (yf > 0.45 && Math.abs(player.s - c.s) < 1.8 && Math.abs(player.lat - c.lat) < c.w && player.state !== 'air') {
        game.hurtPlayer(c.head.getWorldPosition(this._v));
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (!e.alive) {
        e.deathT -= dt;
        e.g.visible = false;
        continue;
      }
      if (Math.abs(e.s - player.s) > 320) { e.g.visible = false; continue; }
      e.g.visible = true;
      const lat = e.lat + Math.sin(this.t * e.latFreq * 2 + e.phase) * e.latAmp;
      const h = 1.35 + Math.sin(this.t * 2.2 + e.phase) * 0.35 * e.bob;
      const { fr, world } = this._frameBasis(e.s, lat, h, new THREE.Vector3());
      e.g.position.copy(world);
      e.g.lookAt(player.pos);
      const d = e.g.position.distanceTo(player.pos);
      if (d < 1.9 && !player.dead) {
        if (player.attacking) {
          e.alive = false;
          game.onEnemyKill(e.g.position);
          this.particles.spawn(e.g.position, 0xff6644, 26, 14, 0.8, 1, 4);
          if (player.state === 'air') {
            player.vel.y = Math.max(player.vel.y, 17);
            player.vel.multiplyScalar(1.02);
          } else {
            player.vs = Math.max(player.vs, 30);
          }
        } else {
          game.hurtPlayer(e.g.position);
        }
      }
    }

    // checkpoints
    for (const cp of this.checkpoints) {
      cp.lightT = Math.max(0, cp.lightT - dt);
      cp.light.visible = cp.lightT > 0;
      if (cp.light.visible) cp.light.material.opacity = 0.25 + cp.lightT * 0.4;
      if (!cp.passed && player.s >= cp.s && player.s - player._prevS < 30) {
        cp.passed = true; cp.lightT = 1.2;
        game.onCheckpoint(cp.s);
        this.particles.spawn(cp.g.position.clone().add(new THREE.Vector3(0, 3, 0)), 0x66ffcc, 20, 9, 0.9, 1.4, 4);
      }
    }

    // goal
    if (this.goal && !this.goal.done) {
      this.goal.torus.rotation.z += dt * 1.2;
      this.goal.inner.material.opacity = 0.3 + Math.sin(this.t * 3) * 0.12;
      if (player.s >= this.goal.s) {
        this.goal.done = true;
        game.finish();
      }
    }

    player._prevS = player.s;
  }

  reset(manifest) {
    this.ringsCollected = 0;
    for (const d of this.ringData) { d.collected = false; d.mag = false; d.pos.copy(d.home); }
    for (const cp of this.checkpoints) { cp.passed = false; cp.lightT = 0; cp.light.visible = false; }
    for (const e of this.enemies) { e.alive = true; e.g.visible = true; }
    if (this.goal) this.goal.done = false;
  }
}
