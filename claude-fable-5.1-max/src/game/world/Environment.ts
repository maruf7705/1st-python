import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Track, Frame } from "./Track";
import { THEMES, BlendedTheme } from "./themes";
import { createRng } from "../core/math";
import type { Quality } from "../core/store";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform vec3 uSunColor; uniform vec3 uSunDir; uniform float uStars; uniform float uTime;
varying vec3 vDir;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col;
  if (y > 0.0) col = mix(uHorizon, uTop, pow(y, 0.6));
  else col = mix(uHorizon, uBottom, pow(min(1.0, -y * 3.0), 0.7));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 1200.0) * 4.0 + pow(sd, 16.0) * 0.45 + pow(sd, 3.0) * 0.12);
  if (uStars > 0.001 && y > 0.02) {
    vec2 sp = d.xz / (y + 0.15) * 90.0;
    vec2 cell = floor(sp);
    float h = hash21(cell);
    vec2 f = fract(sp) - 0.5 - (vec2(hash21(cell + 7.1), hash21(cell + 3.7)) - 0.5) * 0.6;
    float dist = length(f);
    float star = smoothstep(0.08, 0.0, dist) * step(0.93, h);
    float tw = 0.65 + 0.35 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
    col += vec3(star) * tw * uStars * smoothstep(0.0, 0.3, y);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function colorize(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function makeGridTexture(): THREE.CanvasTexture {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((S / 4) * i, 0);
    ctx.lineTo((S / 4) * i, S);
    ctx.moveTo(0, (S / 4) * i);
    ctx.lineTo(S, (S / 4) * i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(200, 200);
  return tex;
}

function makeWindowTexture(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 128;
  const H = 256;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#1a1730";
  ctx.fillRect(0, 0, W, H);
  const ecv = document.createElement("canvas");
  ecv.width = W;
  ecv.height = H;
  const ectx = ecv.getContext("2d")!;
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, W, H);
  const rng = createRng(77);
  const palette = ["#ffe9a8", "#7fe7ff", "#ff7bd9", "#c9ffb0"];
  for (let y = 6; y < H - 6; y += 12) {
    for (let x = 6; x < W - 6; x += 12) {
      const lit = rng() < 0.55;
      const c = palette[Math.floor(rng() * palette.length)];
      ctx.fillStyle = lit ? c : "#2a2745";
      ctx.fillRect(x, y, 7, 8);
      if (lit) {
        ectx.fillStyle = c;
        ectx.globalAlpha = 0.5 + rng() * 0.5;
        ectx.fillRect(x, y, 7, 8);
      }
    }
  }
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const emissive = new THREE.CanvasTexture(ecv);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

function makeCloudTexture(): THREE.CanvasTexture {
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.45, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Layer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  parallax: number;
  fade: number;
  index: number;
}

export class Environment {
  readonly blended = new BlendedTheme();
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  private ground: THREE.Mesh;
  private groundMat: THREE.MeshStandardMaterial;
  private layers: Layer[] = [];
  private clouds: THREE.Sprite[] = [];
  private cloudBase: { angle: number; radius: number; y: number; scale: number }[] = [];
  private fog: THREE.Fog;
  private groundY: number;
  private propGroup = new THREE.Group();

  constructor(scene: THREE.Scene, private track: Track, quality: Quality) {
    this.groundY = track.minY - 9;
    // sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.fog = new THREE.Fog(0xffffff, 100, 600);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = quality !== "low";
    const size = quality === "high" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const cam = this.sun.shadow.camera;
    cam.left = -48;
    cam.right = 48;
    cam.top = 48;
    cam.bottom = -48;
    cam.near = 1;
    cam.far = 320;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // ground
    const grid = makeGridTexture();
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.1,
      emissiveMap: grid,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.6,
    });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = this.groundY;
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    // parallax skyline layers
    // parallax factors are small enough that the player can never reach a layer
    // wall over the ~3 km course (max offset = factor * displacement).
    const layerDefs = [
      { radius: 460, height: 90, parallax: 0.06, fade: 0.25, seed: 11 },
      { radius: 680, height: 150, parallax: 0.03, fade: 0.5, seed: 23 },
      { radius: 900, height: 230, parallax: 0.014, fade: 0.72, seed: 37 },
    ];
    layerDefs.forEach((def, li) => {
      const segs = 128;
      const pos: number[] = [];
      const idx: number[] = [];
      const rng = createRng(def.seed);
      const phases = [rng() * 6, rng() * 6, rng() * 6, rng() * 6];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const h =
          def.height *
          (0.35 +
            0.25 * Math.sin(a * 3 + phases[0]) +
            0.2 * Math.sin(a * 7 + phases[1]) +
            0.12 * Math.sin(a * 13 + phases[2]) +
            0.08 * Math.sin(a * 23 + phases[3]));
        const x = Math.cos(a) * def.radius;
        const z = Math.sin(a) * def.radius;
        pos.push(x, this.groundY - 30, z, x, this.groundY + Math.max(8, h), z);
        if (i < segs) {
          const b = i * 2;
          idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = -5 + li;
      scene.add(mesh);
      this.layers.push({ mesh, mat, parallax: def.parallax, fade: def.fade, index: li });
    });

    // clouds
    const cloudTex = makeCloudTexture();
    const rng = createRng(5);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
      const sp = new THREE.Sprite(mat);
      const base = { angle: rng() * Math.PI * 2, radius: 350 + rng() * 500, y: 140 + rng() * 160, scale: 160 + rng() * 220 };
      sp.scale.set(base.scale, base.scale * 0.45, 1);
      this.clouds.push(sp);
      this.cloudBase.push(base);
      scene.add(sp);
    }

    scene.add(this.propGroup);
    this.buildProps(quality);
  }

  private buildProps(quality: Quality): void {
    const track = this.track;
    const rng = createRng(2024);
    const frame = new Frame();
    const densityScale = quality === "low" ? 0.55 : 1;

    // candidate positions per env
    const candidates: { env: number; pos: THREE.Vector3; side: number; yaw: number }[][] = [[], [], []];
    const spacing = 14;
    for (let s = 10; s < track.length - 10; s += spacing) {
      track.frameAt(s, frame);
      const sec = track.sectionAt(s);
      for (const side of [-1, 1]) {
        if (rng() > 0.8 * densityScale) continue;
        const lateral = side * (17 + rng() * 55);
        const p = new THREE.Vector3(frame.pos.x + frame.right.x * lateral, this.groundY, frame.pos.z + frame.right.z * lateral);
        // reject positions too close to any part of the track (XZ)
        let ok = true;
        const k0 = Math.max(0, Math.floor((s - 450) / track.ds));
        const k1 = Math.min(track.count - 1, Math.floor((s + 450) / track.ds));
        for (let k = k0; k <= k1 && ok; k += 6) {
          const dx = track.pos[k * 3] - p.x;
          const dz = track.pos[k * 3 + 2] - p.z;
          if (dx * dx + dz * dz < 13 * 13) ok = false;
        }
        if (!ok) continue;
        candidates[sec.env].push({ env: sec.env, pos: p, side, yaw: rng() * Math.PI * 2 });
      }
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const addInstanced = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      items: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }[],
      shadows: boolean
    ): void => {
      if (items.length === 0) return;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw);
        m.compose(it.pos, q, it.scale);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = shadows;
      im.receiveShadow = false;
      im.computeBoundingSphere();
      this.propGroup.add(im);
    };

    // ── Coast: palms + rocks
    {
      const trunk = new THREE.CylinderGeometry(0.25, 0.5, 9, 7);
      trunk.translate(0, 4.5, 0);
      colorize(trunk, new THREE.Color(0x8a6a48));
      const leaves: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.ConeGeometry(0.7, 5, 5);
        leaf.translate(0, -2.2, 0);
        leaf.rotateX(Math.PI * 0.62);
        leaf.rotateY((i / 6) * Math.PI * 2);
        leaf.translate(0, 9.2, 0);
        colorize(leaf, new THREE.Color(0x2fae5a));
        leaves.push(leaf);
      }
      const palm = mergeGeometries([trunk, ...leaves], false)!;
      const rock = new THREE.DodecahedronGeometry(2.5, 0);
      colorize(rock, new THREE.Color(0x6f7f8a));
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
      const palms: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }[] = [];
      const rocks: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }[] = [];
      for (const c of candidates[0]) {
        const s = 0.8 + rng() * 0.7;
        if (rng() < 0.75) palms.push({ pos: c.pos, yaw: c.yaw, scale: sc.set(s, s * (0.9 + rng() * 0.5), s).clone() });
        else rocks.push({ pos: c.pos.clone().setY(this.groundY - 0.5), yaw: c.yaw, scale: sc.set(s * 1.4, s, s * 1.2).clone() });
      }
      addInstanced(palm, mat, palms, true);
      addInstanced(rock, mat, rocks, true);
    }

    // ── City: buildings + pylons
    {
      const { map, emissive } = makeWindowTexture();
      const box = new THREE.BoxGeometry(1, 1, 1);
      box.translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({
        map,
        emissiveMap: emissive,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 1.4,
        roughness: 0.6,
        metalness: 0.3,
        color: 0x9aa0c0,
      });
      const buildings: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }[] = [];
      const pylons: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }[] = [];
      for (const c of candidates[1]) {
        if (rng() < 0.8) {
          const w = 9 + rng() * 14;
          const h = 22 + rng() * 75;
          buildings.push({ pos: c.pos, yaw: Math.round(c.yaw / (Math.PI / 2)) * (Math.PI / 2), scale: sc.set(w, h, 9 + rng() * 14).clone() });
        } else {
          pylons.push({ pos: c.pos, yaw: c.yaw, scale: sc.set(1.2, 40 + rng() * 30, 1.2).clone() });
        }
      }
      addInstanced(box, mat, buildings, quality === "high");
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0x120a2a, emissive: new THREE.Color(0x27f0ff), emissiveIntensity: 1.5, roughness: 0.4 });
      addInstanced(box, pylonMat, pylons, false);
    }

    // ── Canyon: spires + mesas
    {
      const spire = new THREE.ConeGeometry(1, 1, 7);
      spire.translate(0, 0.5, 0);
      colorize(spire, new THREE.Color(0xb35a3a));
      const mesa = new THREE.CylinderGeometry(0.75, 1, 1, 9);
      mesa.translate(0, 0.5, 0);
      colorize(mesa, new THREE.Color(0xa0482f));
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
      const spires: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }[] = [];
      const mesas: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }[] = [];
      for (const c of candidates[2]) {
        if (rng() < 0.6) {
          const r = 4 + rng() * 6;
          spires.push({ pos: c.pos, yaw: c.yaw, scale: sc.set(r, 18 + rng() * 40, r).clone() });
        } else {
          const r = 10 + rng() * 16;
          mesas.push({ pos: c.pos, yaw: c.yaw, scale: sc.set(r, 8 + rng() * 18, r * (0.7 + rng() * 0.5)).clone() });
        }
      }
      addInstanced(spire, mat, spires, quality === "high");
      addInstanced(mesa, mat, mesas, quality === "high");
    }
  }

  update(playerPos: THREE.Vector3, s: number, camera: THREE.PerspectiveCamera, time: number): void {
    const e = this.track.envAt(s);
    this.blended.blend(THEMES[e.a], THEMES[e.b], e.t);
    const b = this.blended;

    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).copy(b.skyTop);
    (u.uHorizon.value as THREE.Color).copy(b.skyHorizon);
    (u.uBottom.value as THREE.Color).copy(b.skyBottom);
    (u.uSunColor.value as THREE.Color).copy(b.sunColor);
    (u.uSunDir.value as THREE.Vector3).copy(b.sunDir);
    u.uStars.value = b.stars;
    u.uTime.value = time;
    this.sky.position.copy(camera.position);

    this.fog.color.copy(b.fogColor);
    this.fog.near = b.fogNear;
    this.fog.far = b.fogFar;

    this.hemi.color.copy(b.hemiSky);
    this.hemi.groundColor.copy(b.hemiGround);
    this.hemi.intensity = b.hemiIntensity;
    this.sun.color.copy(b.sunColor);
    this.sun.intensity = b.sunIntensity;
    this.sun.position.copy(playerPos).addScaledVector(b.sunDir, 140);
    this.sun.target.position.copy(playerPos);
    this.sun.target.updateMatrixWorld();

    // ground follows player, snapped to texture tile size to avoid swimming
    const tile = 5000 / 200;
    this.ground.position.x = Math.round(playerPos.x / tile) * tile;
    this.ground.position.z = Math.round(playerPos.z / tile) * tile;
    this.groundMat.color.copy(b.groundColor);
    this.groundMat.emissive.copy(b.groundGrid).multiplyScalar(0.5);
    this.groundMat.roughness = THEMES[e.a].props === "coast" ? 0.25 : 0.7;

    for (const l of this.layers) {
      l.mesh.position.set(playerPos.x * (1 - l.parallax), 0, playerPos.z * (1 - l.parallax));
      l.mat.color.copy(b.mountains[l.index]).lerp(b.skyHorizon, l.fade);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.cloudBase[i];
      const sp = this.clouds[i];
      const a = c.angle + time * 0.004;
      sp.position.set(playerPos.x * 0.96 + Math.cos(a) * c.radius, c.y, playerPos.z * 0.96 + Math.sin(a) * c.radius);
      const mat = sp.material as THREE.SpriteMaterial;
      mat.color.copy(b.cloudColor);
      mat.opacity = b.cloudOpacity;
    }
  }

  get themeName(): string {
    return THEMES[this.track.envAt(0).a].name;
  }
}
