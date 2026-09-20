import * as THREE from "three";
import { damp } from "../core/math";

// ───────────────────────── Particles ─────────────────────────
const MAX_PARTICLES = 420;
const SPIN_AXIS = new THREE.Vector3(0.36, 0.8, 0.48).normalize();

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private size = new Float32Array(MAX_PARTICLES);
  private grav = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  private alive = 0;

  constructor() {
    const geo = new THREE.IcosahedronGeometry(0.16, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.col.setHex(0xffffff));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  emit(
    origin: THREE.Vector3,
    baseVel: THREE.Vector3,
    color: number,
    count: number,
    spread: number,
    life: number,
    size: number,
    gravity = 1
  ): void {
    this.col.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.pos[i * 3] = origin.x;
      this.pos[i * 3 + 1] = origin.y;
      this.pos[i * 3 + 2] = origin.z;
      this.vel[i * 3] = baseVel.x + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = baseVel.y + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 2] = baseVel.z + (Math.random() - 0.5) * spread;
      this.life[i] = life * (0.7 + Math.random() * 0.6);
      this.maxLife[i] = this.life[i];
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity;
      this.mesh.setColorAt(i, this.col);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alive = MAX_PARTICLES;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let any = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      any++;
      this.vel[i * 3 + 1] -= 22 * this.grav[i] * dt;
      this.vel[i * 3] *= 1 - 1.5 * dt;
      this.vel[i * 3 + 2] *= 1 - 1.5 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      const s = this.size[i] * (0.3 + 0.7 * k);
      this.p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.q.setFromAxisAngle(SPIN_AXIS, this.life[i] * 5 + i);
      this.sc.set(s, s, s);
      this.m.compose(this.p, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = any;
  }
}

// ───────────────────────── Trail ribbon ─────────────────────────
const TRAIL_N = 40;

export class Trail {
  readonly mesh: THREE.Mesh;
  private history: THREE.Vector3[] = [];
  private rights: THREE.Vector3[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private intensity = 0;
  private color = new THREE.Color(0x3cc8ff);

  constructor() {
    this.positions = new Float32Array(TRAIL_N * 2 * 3);
    this.colors = new Float32Array(TRAIL_N * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < TRAIL_N; i++) {
      this.history.push(new THREE.Vector3());
      this.rights.push(new THREE.Vector3(1, 0, 0));
    }
  }

  reset(pos: THREE.Vector3): void {
    for (const h of this.history) h.copy(pos);
    this.intensity = 0;
  }

  update(dt: number, pos: THREE.Vector3, right: THREE.Vector3, active: boolean, boosting: boolean): void {
    this.intensity = damp(this.intensity, active ? 1 : 0, 6, dt);
    this.color.setHex(boosting ? 0xffa030 : 0x3cc8ff);
    this.history[0].copy(pos);
    this.rights[0].copy(right);
    const follow = 1 - Math.exp(-28 * dt);
    for (let i = 1; i < TRAIL_N; i++) {
      this.history[i].lerp(this.history[i - 1], follow);
      this.rights[i].lerp(this.rights[i - 1], follow);
    }
    const width = 0.45 * this.intensity;
    for (let i = 0; i < TRAIL_N; i++) {
      const k = 1 - i / (TRAIL_N - 1);
      const w = width * (0.4 + 0.6 * k);
      const h = this.history[i];
      const r = this.rights[i];
      const o = i * 6;
      this.positions[o] = h.x - r.x * w;
      this.positions[o + 1] = h.y - r.y * w;
      this.positions[o + 2] = h.z - r.z * w;
      this.positions[o + 3] = h.x + r.x * w;
      this.positions[o + 4] = h.y + r.y * w;
      this.positions[o + 5] = h.z + r.z * w;
      const c = k * k * this.intensity;
      this.colors[o] = this.color.r * c;
      this.colors[o + 1] = this.color.g * c;
      this.colors[o + 2] = this.color.b * c;
      this.colors[o + 3] = this.color.r * c;
      this.colors[o + 4] = this.color.g * c;
      this.colors[o + 5] = this.color.b * c;
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.mesh.visible = this.intensity > 0.02;
  }
}

// ───────────────────────── Screen overlay (speed lines + vignette) ─────────────────────────
const OVERLAY_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const OVERLAY_FRAG = /* glsl */ `
uniform float uIntensity; uniform float uTime; uniform float uAspect; uniform vec3 uColor;
uniform float uDamage; uniform float uVignette; uniform float uFade;
varying vec2 vUv;
float hash(float n) { return fract(sin(n * 91.345) * 47453.23); }
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  const float S = 70.0;
  float sector = floor((a + 3.14159) / 6.28318 * S);
  float n = hash(sector);
  float fa = fract((a + 3.14159) / 6.28318 * S);
  float thin = smoothstep(0.0, 0.35, fa) * smoothstep(1.0, 0.65, fa);
  float move = fract(uTime * (2.5 + n * 3.0) + n * 17.0);
  float dashPos = 0.3 + move * 0.9;
  float dash = smoothstep(0.22, 0.0, abs(r - dashPos));
  float streak = step(1.0 - uIntensity * 0.55, n) * thin * dash * smoothstep(0.25, 0.75, r);
  float vig = smoothstep(0.42, 1.05, r);
  vec3 col = uColor * streak * 1.5 + vec3(1.0, 0.12, 0.05) * vig * uDamage + vec3(0.0);
  float alpha = clamp(streak * uIntensity + vig * uDamage * 0.85 + vig * uVignette, 0.0, 1.0);
  col = mix(col, vec3(0.0), uFade);
  alpha = max(alpha, uFade);
  gl_FragColor = vec4(col, alpha);
}`;

export class ScreenOverlay {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: OVERLAY_VERT,
      fragmentShader: OVERLAY_FRAG,
      uniforms: {
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uColor: { value: new THREE.Color(0xffffff) },
        uDamage: { value: 0 },
        uVignette: { value: 0.25 },
        uFade: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  set(intensity: number, time: number, aspect: number, boosting: boolean, damage: number, fade: number): void {
    const u = this.material.uniforms;
    u.uIntensity.value = intensity;
    u.uTime.value = time;
    u.uAspect.value = aspect;
    (u.uColor.value as THREE.Color).setHex(boosting ? 0xffc070 : 0xd8f4ff);
    u.uDamage.value = damage;
    u.uFade.value = fade;
    u.uVignette.value = 0.22 + intensity * 0.2;
  }
}
