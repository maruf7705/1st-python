import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Entity, LevelData, CHUNK_LEN } from "../world/Level";
import { Frame } from "../world/Track";

// Render kinds are a superset of entity kinds: some entities need several
// instances (wall = 2 pieces), checkpoints swap between an off/on mesh.
type RenderKind =
  | "ring"
  | "dashring"
  | "drone"
  | "crawler"
  | "spiky"
  | "spikes"
  | "crate"
  | "wall"
  | "beam"
  | "boost"
  | "spring"
  | "checkpoint"
  | "checkpointOn"
  | "goal";

const DYNAMIC: RenderKind[] = ["drone", "crawler", "spiky", "spring"];
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function colorize(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

const BOOST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const BOOST_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  float chev = abs(vUv.x - 0.5) * 0.9;
  float v = fract(vUv.y * 3.0 - uTime * 2.2 + chev);
  float band = smoothstep(0.0, 0.1, v) * smoothstep(0.5, 0.36, v);
  vec3 col = mix(vec3(1.0, 0.42, 0.05), vec3(1.0, 0.95, 0.55), band);
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  float alpha = (0.3 + band * 0.7) * edge;
  gl_FragColor = vec4(col * (0.9 + band * 1.6), alpha);
}`;

function buildGeometries(): Record<RenderKind, THREE.BufferGeometry> {
  const ring = new THREE.TorusGeometry(0.85, 0.15, 8, 22);
  const dashring = new THREE.TorusGeometry(1.7, 0.16, 8, 28);

  const droneBody = colorize(new THREE.SphereGeometry(0.62, 16, 12), 0x2b2f3a);
  const droneRing = colorize(new THREE.TorusGeometry(0.9, 0.09, 6, 24).rotateX(Math.PI / 2), 0xff3b3b);
  const droneEye = colorize(new THREE.SphereGeometry(0.2, 8, 8).translate(0, 0.05, 0.55), 0xffe680);
  const drone = mergeGeometries([droneBody, droneRing, droneEye], false)!;

  const crawlerBody = colorize(new THREE.SphereGeometry(0.75, 14, 10).scale(1, 0.62, 1.15), 0x7a3fd6);
  const crawlerVisor = colorize(new THREE.BoxGeometry(0.9, 0.22, 0.3).translate(0, 0.1, 0.7), 0x36f0ff);
  const crawlerFeet: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const f = colorize(new THREE.BoxGeometry(0.3, 0.3, 0.5), 0x2a1a44);
    f.translate(i % 2 === 0 ? -0.55 : 0.55, -0.35, i < 2 ? 0.35 : -0.35);
    crawlerFeet.push(f);
  }
  const crawler = mergeGeometries([crawlerBody, crawlerVisor, ...crawlerFeet], false)!;

  const spikyCore = colorize(new THREE.IcosahedronGeometry(0.75, 1), 0x33363f);
  const spikyParts: THREE.BufferGeometry[] = [spikyCore];
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0.7, 0.7, 0],
    [-0.7, 0.7, 0],
    [0, 0.7, 0.7],
    [0, 0.7, -0.7],
  ];
  for (const d of dirs) {
    // Icosahedron is non-indexed; merged parts must match, so de-index the cones.
    const cone = colorize(new THREE.ConeGeometry(0.2, 0.9, 6).toNonIndexed(), 0xff4a2a);
    cone.translate(0, 0.95, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]).normalize());
    cone.applyQuaternion(q);
    spikyParts.push(cone);
  }
  const spiky = mergeGeometries(spikyParts, false)!;

  const base = new THREE.BoxGeometry(1.9, 0.14, 1.9).translate(0, 0.07, 0);
  const spikeParts: THREE.BufferGeometry[] = [base];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(0.34, 1.15, 8);
    c.translate(i % 2 === 0 ? -0.45 : 0.45, 0.7, i < 2 ? 0.45 : -0.45);
    spikeParts.push(c);
  }
  const spikes = mergeGeometries(spikeParts, false)!;

  const crate = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const wall = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const beam = new THREE.BoxGeometry(1, 0.4, 0.4);
  const boost = new THREE.PlaneGeometry(3.2, 4.4).rotateX(-Math.PI / 2).translate(0, 0.04, 0);

  const springBase = colorize(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 14).translate(0, 0.25, 0), 0xffc21a);
  const springTop = colorize(new THREE.CylinderGeometry(0.8, 0.8, 0.16, 14).translate(0, 0.58, 0), 0xe22a2a);
  const spring = mergeGeometries([springBase, springTop], false)!;

  const makeArch = (w: number, h: number, thick: number, color: number, topColor: number): THREE.BufferGeometry => {
    const l = colorize(new THREE.CylinderGeometry(thick, thick * 1.3, h, 10).translate(-w / 2, h / 2, 0), color);
    const r = colorize(new THREE.CylinderGeometry(thick, thick * 1.3, h, 10).translate(w / 2, h / 2, 0), color);
    const t = colorize(new THREE.BoxGeometry(w + thick * 2, thick * 2, thick * 2).translate(0, h, 0), topColor);
    return mergeGeometries([l, r, t], false)!;
  };
  const checkpoint = makeArch(10.6, 6.5, 0.32, 0x4a5a7a, 0x8fb8ff);
  const checkpointOn = makeArch(10.6, 6.5, 0.32, 0x4a7a5a, 0x5dff9a);
  const goal = makeArch(11.4, 9, 0.5, 0xffc94a, 0xfff1b0);

  return { ring, dashring, drone, crawler, spiky, spikes, crate, wall, beam, boost, spring, checkpoint, checkpointOn, goal };
}

export class EntityManager {
  readonly list: Entity[];
  readonly timeUniform = { value: 0 };
  private meshes: Map<RenderKind, THREE.InstancedMesh>[] = [];
  private dirty: Set<THREE.InstancedMesh> = new Set();
  private geos: Record<RenderKind, THREE.BufferGeometry>;
  private mats: Record<RenderKind, THREE.Material>;
  private group = new THREE.Group();
  private frame = new Frame();
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private qYaw = new THREE.Quaternion();
  private sc = new THREE.Vector3();
  private basis = new THREE.Matrix4();
  private nChunks: number;
  private checkpointSlots = new Map<number, number>(); // entity id -> slot in checkpointOn mesh

  constructor(scene: THREE.Scene, private level: LevelData, quality: "low" | "medium" | "high") {
    this.list = level.entities;
    this.geos = buildGeometries();
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffc12a,
      emissive: new THREE.Color(0xff9a00),
      emissiveIntensity: 0.55,
      metalness: 0.75,
      roughness: 0.25,
    });
    gold.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
          float rA = uTime * 4.0 + float(gl_InstanceID) * 0.9;
          float rC = cos(rA); float rS = sin(rA);
          objectNormal.xz = mat2(rC, -rS, rS, rC) * objectNormal.xz;`
        )
        .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.xz = mat2(rC, -rS, rS, rC) * transformed.xz;");
    };
    gold.customProgramCacheKey = () => "spinning-ring";
    const vc = (emissive: number, ei: number, rough = 0.5, metal = 0.2): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ vertexColors: true, emissive: new THREE.Color(emissive), emissiveIntensity: ei, roughness: rough, metalness: metal });
    const boostMat = new THREE.ShaderMaterial({
      vertexShader: BOOST_VERT,
      fragmentShader: BOOST_FRAG,
      uniforms: { uTime: this.timeUniform },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mats = {
      ring: gold,
      dashring: new THREE.MeshStandardMaterial({ color: 0x35f0ff, emissive: new THREE.Color(0x22c8ff), emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.3 }),
      drone: vc(0xff2020, 0.45, 0.4, 0.5),
      crawler: vc(0x3a1a80, 0.35, 0.5, 0.2),
      spiky: vc(0x000000, 0, 0.5, 0.4),
      spikes: new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 0.85, roughness: 0.25 }),
      crate: new THREE.MeshStandardMaterial({ color: 0xd9822b, emissive: new THREE.Color(0x3a1a05), emissiveIntensity: 0.5, roughness: 0.7 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x2c313d, emissive: new THREE.Color(0xffb400), emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.5 }),
      beam: new THREE.MeshStandardMaterial({ color: 0x2c313d, emissive: new THREE.Color(0xff3b3b), emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.5 }),
      boost: boostMat,
      spring: vc(0x000000, 0, 0.45, 0.35),
      checkpoint: vc(0x2244aa, 0.4, 0.4, 0.5),
      checkpointOn: vc(0x22cc66, 0.9, 0.4, 0.5),
      goal: vc(0xffaa00, 0.6, 0.35, 0.7),
    };

    this.nChunks = Math.ceil(level.track.length / CHUNK_LEN) + 1;
    // count slots per chunk/kind
    const counts: Map<RenderKind, number>[] = [];
    for (let c = 0; c < this.nChunks; c++) counts.push(new Map());
    const slotOf = (e: Entity): { kind: RenderKind; n: number } => {
      switch (e.kind) {
        case "barrier":
          return e.barrierType === 0 ? { kind: "wall", n: 2 } : { kind: "beam", n: 1 };
        default:
          return { kind: e.kind as RenderKind, n: 1 };
      }
    };
    for (const e of this.list) {
      const { kind, n } = slotOf(e);
      const cm = counts[e.chunk];
      e.slot = cm.get(kind) ?? 0;
      cm.set(kind, e.slot + n);
      if (e.kind === "checkpoint") {
        const on = cm.get("checkpointOn") ?? 0;
        this.checkpointSlots.set(e.id, on);
        cm.set("checkpointOn", on + 1);
      }
    }
    for (let c = 0; c < this.nChunks; c++) {
      const map = new Map<RenderKind, THREE.InstancedMesh>();
      counts[c].forEach((n, kind) => {
        const im = new THREE.InstancedMesh(this.geos[kind], this.mats[kind], n);
        im.castShadow = quality !== "low" && kind !== "boost" && kind !== "ring" && kind !== "dashring";
        im.receiveShadow = kind !== "boost";
        if (DYNAMIC.includes(kind)) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (kind === "boost") im.renderOrder = 2;
        map.set(kind, im);
        this.group.add(im);
      });
      this.meshes.push(map);
    }
    scene.add(this.group);
    this.rebuildAll();
  }

  private mesh(chunk: number, kind: RenderKind): THREE.InstancedMesh | undefined {
    return this.meshes[chunk]?.get(kind);
  }

  private setInstance(im: THREE.InstancedMesh, slot: number, s: number, x: number, h: number, scale: THREE.Vector3, yaw = 0): void {
    const track = this.level.track;
    track.frameAt(s, this.frame);
    const f = this.frame;
    this.p.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.normal, h);
    this.basis.makeBasis(f.right, f.normal, f.tangent);
    this.q.setFromRotationMatrix(this.basis);
    if (yaw !== 0) this.q.multiply(this.qYaw.setFromAxisAngle(Y_AXIS, yaw));
    this.m.compose(this.p, this.q, scale);
    im.setMatrixAt(slot, this.m);
    this.dirty.add(im);
  }

  private hideInstance(im: THREE.InstancedMesh, slot: number): void {
    this.m.makeScale(0, 0, 0);
    im.setMatrixAt(slot, this.m);
    this.dirty.add(im);
  }

  private writeEntity(e: Entity): void {
    const sec = this.level.track.sectionAt(e.s);
    switch (e.kind) {
      case "ring":
      case "dashring":
      case "drone":
      case "crawler":
      case "spiky":
      case "spikes":
      case "crate": {
        const im = this.mesh(e.chunk, e.kind);
        if (!im) return;
        if (!e.alive) return this.hideInstance(im, e.slot);
        let bob = 0;
        if (e.kind === "drone") bob = Math.sin(e.phase * 1.7) * 0.25;
        this.setInstance(im, e.slot, e.s, e.x, e.h + bob, this.sc.set(1, 1, 1), e.yaw);
        return;
      }
      case "barrier": {
        const hw = sec.width * 0.5;
        if (e.barrierType === 0) {
          const im = this.mesh(e.chunk, "wall");
          if (!im) return;
          const gapHalf = 1.7;
          const leftLen = e.x - gapHalf + hw; // from -hw to gapX - gapHalf
          const rightLen = hw - (e.x + gapHalf);
          if (leftLen > 0.2) this.setInstance(im, e.slot, e.s, -hw + leftLen / 2, 0, this.sc.set(leftLen, 3.2, 0.7));
          else this.hideInstance(im, e.slot);
          if (rightLen > 0.2) this.setInstance(im, e.slot + 1, e.s, hw - rightLen / 2, 0, this.sc.set(rightLen, 3.2, 0.7));
          else this.hideInstance(im, e.slot + 1);
        } else {
          const im = this.mesh(e.chunk, "beam");
          if (!im) return;
          const h = e.barrierType === 1 ? 1.0 : 1.6;
          this.setInstance(im, e.slot, e.s, 0, h, this.sc.set(sec.width, 1, 1));
        }
        return;
      }
      case "boost": {
        const im = this.mesh(e.chunk, "boost");
        if (im) this.setInstance(im, e.slot, e.s, e.x, 0, this.sc.set(1, 1, 1));
        return;
      }
      case "spring": {
        const im = this.mesh(e.chunk, "spring");
        if (!im) return;
        const squash = e.anim > 0 ? 1 - Math.sin(Math.min(1, e.anim / 0.25) * Math.PI) * 0.45 : 1;
        this.setInstance(im, e.slot, e.s, e.x, 0, this.sc.set(1 + (1 - squash) * 0.4, squash, 1 + (1 - squash) * 0.4));
        return;
      }
      case "checkpoint": {
        const off = this.mesh(e.chunk, "checkpoint");
        const on = this.mesh(e.chunk, "checkpointOn");
        const onSlot = this.checkpointSlots.get(e.id) ?? 0;
        if (off) {
          if (e.alive) this.setInstance(off, e.slot, e.s, 0, 0, this.sc.set(1, 1, 1));
          else this.hideInstance(off, e.slot);
        }
        if (on) {
          if (!e.alive) this.setInstance(on, onSlot, e.s, 0, 0, this.sc.set(1, 1, 1));
          else this.hideInstance(on, onSlot);
        }
        return;
      }
      case "goal": {
        const im = this.mesh(e.chunk, "goal");
        if (im) this.setInstance(im, e.slot, e.s, 0, 0, this.sc.set(1, 1, 1));
        return;
      }
    }
  }

  private flush(): void {
    this.dirty.forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    });
    this.dirty.clear();
  }

  rebuildAll(): void {
    for (const e of this.list) this.writeEntity(e);
    this.flush();
  }

  /** Restore every entity (level restart). */
  resetAll(): void {
    for (const e of this.list) {
      e.alive = true;
      e.s = e.s0;
      e.x = e.x0;
      e.anim = 0;
    }
    this.rebuildAll();
  }

  /** Restore only things that should respawn after death (enemies, crates), keep rings & checkpoints. */
  resetAfterDeath(): void {
    for (const e of this.list) {
      if (e.kind === "drone" || e.kind === "crawler" || e.kind === "spiky" || e.kind === "crate") {
        e.alive = true;
        e.s = e.s0;
        e.x = e.x0;
      }
    }
    this.rebuildAll();
  }

  /** Mark an entity dead (collected / destroyed / activated) and refresh its visual. */
  kill(e: Entity): void {
    if (!e.alive) return;
    e.alive = false;
    this.writeEntity(e);
  }

  /** Lower bound index of the first entity with s >= value. */
  lowerBound(value: number): number {
    let lo = 0;
    let hi = this.list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.list[mid].s0 < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Iterate entities whose home position s0 lies within [sMin, sMax]. */
  forEachInRange(sMin: number, sMax: number, cb: (e: Entity) => void): void {
    for (let i = this.lowerBound(sMin); i < this.list.length; i++) {
      const e = this.list[i];
      if (e.s0 > sMax) break;
      cb(e);
    }
  }

  /** Advance enemy patrols and animations near the player (called from fixed step). */
  stepDynamics(dt: number, playerS: number): void {
    this.forEachInRange(playerS - 120, playerS + 260, (e) => {
      if (e.kind === "drone" || e.kind === "spiky") {
        e.phase += dt * e.speed * 2.2;
        if (e.range > 0) e.x = e.x0 + Math.sin(e.phase) * e.range;
      } else if (e.kind === "crawler") {
        e.phase += dt * e.speed;
        e.s = e.s0 + Math.sin(e.phase) * e.range;
        e.yaw = Math.cos(e.phase) >= 0 ? 0 : Math.PI;
      } else if (e.kind === "spring" && e.anim > 0) {
        e.anim -= dt;
        if (e.anim < 0) e.anim = 0;
      }
    });
  }

  /** Per-render-frame visual refresh of dynamic entities near the player. */
  updateVisuals(playerS: number, time: number): void {
    this.timeUniform.value = time;
    this.forEachInRange(playerS - 120, playerS + 260, (e) => {
      if (!e.alive) return;
      if (e.kind === "drone" || e.kind === "spiky" || e.kind === "crawler" || (e.kind === "spring" && e.anim > 0)) this.writeEntity(e);
    });
    this.flush();
  }

  /** Cull chunks that are far away from the player (saves draw calls & shadow passes). */
  cull(playerS: number, viewDistance: number): void {
    const cur = Math.floor(playerS / CHUNK_LEN);
    const reach = Math.ceil(viewDistance / CHUNK_LEN);
    for (let c = 0; c < this.meshes.length; c++) {
      const visible = c >= cur - 1 && c <= cur + reach;
      this.meshes[c].forEach((im) => {
        im.visible = visible;
      });
    }
  }

  worldPos(e: Entity, out: THREE.Vector3): THREE.Vector3 {
    return this.level.track.worldPos(e.s, e.x, e.h, this.frame, out);
  }

  dispose(): void {
    Object.values(this.geos).forEach((g) => g.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}
