import * as THREE from "three";
import { Track, Frame } from "./Track";
import { CHUNK_LEN } from "./Level";
import { THEMES } from "./themes";
import type { TrackBuilder } from "./TrackBuilder";

// Generates chunked ribbon geometry for the road, rails and end caps.
// One material for the whole track; per-vertex tint + per-vertex emissive so
// environments blend seamlessly without extra draw calls.

function makeRoadTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 256;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  // base with noise
  ctx.fillStyle = "#9a9ca4";
  ctx.fillRect(0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  let seed = 1234;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // subtle lane tint
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(W * 0.12, 0, W * 0.76, H);
  // edge stripes
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, W * 0.05, H);
  ctx.fillRect(W * 0.95, 0, W * 0.05, H);
  ctx.fillStyle = "#3a3d46";
  ctx.fillRect(W * 0.05, 0, W * 0.02, H);
  ctx.fillRect(W * 0.93, 0, W * 0.02, H);
  // centre dashes
  ctx.fillStyle = "#e8e8ea";
  ctx.fillRect(W * 0.49, 0, W * 0.02, H * 0.45);
  // chevrons
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.moveTo(W * 0.2, H * 0.55);
  ctx.lineTo(W * 0.5, H * 0.75);
  ctx.lineTo(W * 0.8, H * 0.55);
  ctx.lineTo(W * 0.8, H * 0.62);
  ctx.lineTo(W * 0.5, H * 0.82);
  ctx.lineTo(W * 0.2, H * 0.62);
  ctx.closePath();
  ctx.fill();

  const ecv = document.createElement("canvas");
  ecv.width = W;
  ecv.height = H;
  const ectx = ecv.getContext("2d")!;
  ectx.fillStyle = "#000000";
  ectx.fillRect(0, 0, W, H);
  ectx.fillStyle = "#ffffff";
  ectx.fillRect(0, 0, W * 0.05, H);
  ectx.fillRect(W * 0.95, 0, W * 0.05, H);
  ectx.fillStyle = "#555555";
  ectx.fillRect(W * 0.49, 0, W * 0.02, H * 0.45);

  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const emissive = new THREE.CanvasTexture(ecv);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = THREE.ClampToEdgeWrapping;
  emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

export function createTrackMaterial(maxAnisotropy: number): THREE.MeshStandardMaterial {
  const { map, emissive } = makeRoadTextures();
  map.anisotropy = Math.min(8, maxAnisotropy);
  emissive.anisotropy = Math.min(4, maxAnisotropy);
  const mat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.6,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.08,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aEmissive;\nvarying vec3 vEmissive;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEmissive = aEmissive;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEmissive;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vEmissive;");
  };
  mat.customProgramCacheKey = () => "track-vertex-emissive";
  return mat;
}

class GeoBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  emissives: number[] = [];
  indices: number[] = [];

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, col: THREE.Color, em: THREE.Color, emScale: number): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.uvs.push(u, v);
    this.colors.push(col.r, col.g, col.b);
    this.emissives.push(em.r * emScale, em.g * emScale, em.b * emScale);
    return this.positions.length / 3 - 1;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute("aEmissive", new THREE.Float32BufferAttribute(this.emissives, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const THICK = 1.3;
const RAIL_R = 0.17;
const isRoadLike = (t: string): boolean => t === "road" || t === "loop";
const roadLikePrev = isRoadLike;

export interface TrackMeshes {
  group: THREE.Group;
  chunks: THREE.Mesh[];
  chunkCenters: THREE.Vector3[];
}

export function buildTrackMeshes(
  track: Track,
  loops: TrackBuilder["loops"],
  material: THREE.MeshStandardMaterial,
  quality: "low" | "medium" | "high"
): TrackMeshes {
  const group = new THREE.Group();
  const chunks: THREE.Mesh[] = [];
  const chunkCenters: THREE.Vector3[] = [];
  const stride = quality === "low" ? 4 : 2; // samples per ring (0.25 m each)
  const frame = new Frame();
  const frameNext = new Frame();
  const tint = new THREE.Color();
  const tintSide = new THREE.Color();
  const glow = new THREE.Color();
  const black = new THREE.Color(0, 0, 0);
  const tmpN = new THREE.Vector3();
  const pL = new THREE.Vector3();
  const pR = new THREE.Vector3();
  const pLb = new THREE.Vector3();
  const pRb = new THREE.Vector3();
  const negN = new THREE.Vector3();
  const negR = new THREE.Vector3();

  const railMat = new THREE.MeshStandardMaterial({
    color: 0xd8dde6,
    roughness: 0.3,
    metalness: 0.75,
    emissive: new THREE.Color(0x223344),
    emissiveIntensity: 0.4,
  });

  const nChunks = Math.ceil(track.length / CHUNK_LEN);
  for (let c = 0; c < nChunks; c++) {
    const gb = new GeoBuilder();
    const rb = new GeoBuilder();
    const k0 = Math.floor((c * CHUNK_LEN) / track.ds);
    const k1 = Math.min(track.count - 1, Math.floor(((c + 1) * CHUNK_LEN) / track.ds));
    let prevRing: number[] | null = null; // [tL, tR, rB, lB, rT, bR, bL, lT]
    let prevRail: number[][] | null = null;
    let prevType: string | null = null;
    let prevRails: number[] = [];
    const center = new THREE.Vector3();
    let centerCount = 0;
    // whether the sample just before this chunk was road-like (no cap needed at chunk seams)
    const chunkStartCap = c === 0 || !isRoadLike(track.sectionAt(Math.max(0, (k0 - stride) * track.ds)).type);

    for (let k = k0; k <= k1; k += stride) {
      const s = Math.min(k * track.ds, track.length - 0.01);
      track.frameAt(s, frame);
      const sec = track.sectionAt(s);
      const env = track.envAt(s);
      const ta = THEMES[env.a];
      const tb = THEMES[env.b];
      tint.copy(ta.roadTint).lerp(tb.roadTint, env.t);
      glow.copy(ta.edgeGlow).lerp(tb.edgeGlow, env.t);
      tintSide.copy(tint).multiplyScalar(0.42);
      center.add(frame.pos);
      centerCount++;
      const v = s / 8;
      const roadLike = isRoadLike(sec.type);

      // handle type transitions -> caps
      if (prevType !== null && isRoadLike(prevType) !== roadLike) {
        if (!roadLike && prevRing) {
          // cap facing forward at previous ring (road ends here)
          const a = prevRing;
          const capN = frame.tangent.clone();
          const i0 = gb.vertex(new THREE.Vector3().fromArray(gb.positions, a[0] * 3), capN, 0.3, 0, tintSide, black, 0);
          const i1 = gb.vertex(new THREE.Vector3().fromArray(gb.positions, a[1] * 3), capN, 0.3, 0.5, tintSide, black, 0);
          const i2 = gb.vertex(new THREE.Vector3().fromArray(gb.positions, a[2] * 3), capN, 0.35, 0.5, tintSide, black, 0);
          const i3 = gb.vertex(new THREE.Vector3().fromArray(gb.positions, a[3] * 3), capN, 0.35, 0, tintSide, black, 0);
          gb.quad(i0, i1, i2, i3);
        }
        prevRing = null;
        prevRail = null;
      } else if (prevType !== null && prevType !== sec.type) {
        prevRail = null;
      }
      const needBackCap = prevType === null ? chunkStartCap : !roadLikePrev(prevType);

      if (roadLike) {
        const hw = sec.width * 0.5;
        pL.copy(frame.pos).addScaledVector(frame.right, -hw);
        pR.copy(frame.pos).addScaledVector(frame.right, hw);
        pLb.copy(pL).addScaledVector(frame.normal, -THICK);
        pRb.copy(pR).addScaledVector(frame.normal, -THICK);
        negN.copy(frame.normal).negate();
        negR.copy(frame.right).negate();
        const em = 1.0;
        // top
        const tL = gb.vertex(pL, frame.normal, 0, v, tint, glow, em);
        const tR = gb.vertex(pR, frame.normal, 1, v, tint, glow, em);
        // right side
        const rT = gb.vertex(pR, frame.right, 0.3, v, tintSide, black, 0);
        const rB = gb.vertex(pRb, frame.right, 0.36, v, tintSide, black, 0);
        // bottom
        const bR = gb.vertex(pRb, negN, 0.3, v, tintSide, black, 0);
        const bL = gb.vertex(pLb, negN, 0.4, v, tintSide, black, 0);
        // left side
        const lB = gb.vertex(pLb, negR, 0.3, v, tintSide, black, 0);
        const lT = gb.vertex(pL, negR, 0.36, v, tintSide, black, 0);
        const ring = [tL, tR, rB, lB, rT, bR, bL, lT];
        if (prevRing) {
          const p = prevRing;
          // winding verified against frame (T=+Z, N=+Y, R=-X): CCW seen from the face normal
          gb.quad(p[0], p[1], tR, tL); // top (normal +N)
          gb.quad(p[4], p[2], rB, rT); // right side (normal +R)
          gb.quad(p[5], p[6], bL, bR); // bottom (normal -N)
          gb.quad(p[3], p[7], lT, lB); // left side (normal -R)
        } else if (needBackCap) {
          // cap facing backward at this ring (road starts here)
          tmpN.copy(frame.tangent).negate();
          const i0 = gb.vertex(pL, tmpN, 0.3, 0, tintSide, black, 0);
          const i1 = gb.vertex(pLb, tmpN, 0.35, 0, tintSide, black, 0);
          const i2 = gb.vertex(pRb, tmpN, 0.35, 0.5, tintSide, black, 0);
          const i3 = gb.vertex(pR, tmpN, 0.3, 0.5, tintSide, black, 0);
          gb.quad(i0, i1, i2, i3);
        }
        prevRing = ring;
        prevRail = null;
      } else if (sec.type === "rail") {
        const rails: number[][] = [];
        for (let ri = 0; ri < sec.rails.length; ri++) {
          const off = sec.rails[ri];
          const idx: number[] = [];
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2;
            tmpN.copy(frame.right).multiplyScalar(Math.cos(ang)).addScaledVector(frame.normal, Math.sin(ang));
            pL.copy(frame.pos).addScaledVector(frame.right, off).addScaledVector(frame.normal, -RAIL_R).addScaledVector(tmpN, RAIL_R);
            idx.push(rb.vertex(pL, tmpN, a / 6, v, tint, black, 0));
          }
          rails.push(idx);
        }
        if (prevRail && prevRails.length === rails.length) {
          for (let ri = 0; ri < rails.length; ri++) {
            const p = prevRail[ri];
            const q = rails[ri];
            for (let a = 0; a < 6; a++) {
              const a2 = (a + 1) % 6;
              rb.quad(p[a], q[a], q[a2], p[a2]);
            }
          }
        }
        // sleepers every ~6m
        if (Math.floor(s / 6) !== Math.floor((s - track.ds * stride) / 6) && sec.rails.length > 1) {
          const minX = Math.min(...sec.rails) - 0.5;
          const maxX = Math.max(...sec.rails) + 0.5;
          track.frameAt(Math.min(track.length - 0.02, s + 0.5), frameNext);
          pL.copy(frame.pos).addScaledVector(frame.right, minX).addScaledVector(frame.normal, -0.45);
          pR.copy(frame.pos).addScaledVector(frame.right, maxX).addScaledVector(frame.normal, -0.45);
          pLb.copy(frameNext.pos).addScaledVector(frameNext.right, minX).addScaledVector(frameNext.normal, -0.45);
          pRb.copy(frameNext.pos).addScaledVector(frameNext.right, maxX).addScaledVector(frameNext.normal, -0.45);
          const i0 = rb.vertex(pL, frame.normal, 0, 0, tintSide, black, 0);
          const i1 = rb.vertex(pR, frame.normal, 1, 0, tintSide, black, 0);
          const i2 = rb.vertex(pRb, frame.normal, 1, 1, tintSide, black, 0);
          const i3 = rb.vertex(pLb, frame.normal, 0, 1, tintSide, black, 0);
          rb.quad(i0, i1, i2, i3);
          rb.quad(i3, i2, i1, i0);
        }
        prevRail = rails;
        prevRails = sec.rails;
        prevRing = null;
      } else {
        prevRing = null;
        prevRail = null;
      }
      prevType = sec.type;
    }

    const geo = gb.build();
    const cc = centerCount > 0 ? center.multiplyScalar(1 / centerCount) : new THREE.Vector3();
    chunkCenters.push(cc);
    if (geo) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.castShadow = quality !== "low";
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      chunks.push(mesh);
    } else {
      const placeholder = new THREE.Mesh(new THREE.BufferGeometry(), material);
      placeholder.visible = false;
      chunks.push(placeholder);
    }
    const rgeo = rb.build();
    if (rgeo) {
      const rm = new THREE.Mesh(rgeo, railMat);
      rm.castShadow = false;
      rm.receiveShadow = true;
      rm.matrixAutoUpdate = false;
      group.add(rm);
    }
  }

  // loop support rings
  const supportMat = new THREE.MeshStandardMaterial({ color: 0x66717f, roughness: 0.5, metalness: 0.6 });
  for (const lp of loops) {
    const geo = new THREE.TorusGeometry(lp.radius + 1.1, 0.55, 8, 56);
    const basis = new THREE.Matrix4().makeBasis(lp.forward, new THREE.Vector3(0, 1, 0), lp.right);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const offsets = [-6.6, lp.shift + 6.6];
    for (const off of offsets) {
      const m = new THREE.Mesh(geo, supportMat);
      m.quaternion.copy(q);
      m.position.copy(lp.center).addScaledVector(lp.right, off - lp.shift * 0.5);
      m.castShadow = quality !== "low";
      group.add(m);
      // struts
      for (let i = 0; i < 3; i++) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, lp.radius * 1.9, 8), supportMat);
        strut.position.copy(m.position);
        strut.quaternion.copy(q);
        strut.rotateZ((i - 1) * 0.8);
        strut.castShadow = false;
        group.add(strut);
      }
    }
  }

  return { group, chunks, chunkCenters };
}
