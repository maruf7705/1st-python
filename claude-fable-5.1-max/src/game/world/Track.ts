import * as THREE from "three";

// The track is a single arc-length parametrised spline with a smooth moving
// frame (tangent / normal / right) at every sample. All gameplay happens in
// track space (s = distance along, x = lateral, h = height above surface),
// which keeps physics unconditionally stable at any speed: there is no way
// to tunnel through a loop or a slope because the surface *is* the coordinate
// system.

export type SectionType = "road" | "gap" | "rail" | "loop";

export interface ControlPoint {
  pos: THREE.Vector3;
  bank: number; // radians, rotation of the normal about the tangent
  freeUp: boolean; // don't constrain to world-up (loop interiors)
  up?: THREE.Vector3; // explicit desired normal (loops: towards the loop axis)
}

export interface SectionDef {
  type: SectionType;
  width: number;
  env: number;
  rails: number[]; // lateral offsets of rails (rail sections only)
  endIndex: number; // index of the last control point belonging to this section
  label?: string;
}

export interface Section {
  type: SectionType;
  width: number;
  env: number;
  rails: number[];
  s0: number;
  s1: number;
  index: number;
  label?: string;
}

export class Frame {
  pos = new THREE.Vector3();
  tangent = new THREE.Vector3();
  normal = new THREE.Vector3();
  right = new THREE.Vector3();
  /** curvature vector magnitude (1/m), positive; sign relative to normal in curvatureN */
  curvatureN = 0;
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function rotateAboutAxis(v: THREE.Vector3, k: THREE.Vector3, angle: number): void {
  // Rodrigues for v perpendicular-ish to k (general form kept for safety)
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  _c.crossVectors(k, v);
  const kd = k.dot(v);
  v.multiplyScalar(cos).addScaledVector(_c, sin).addScaledVector(k, kd * (1 - cos));
}

export class Track {
  readonly ds = 0.25;
  readonly count: number;
  readonly length: number;
  readonly pos: Float32Array;
  readonly tan: Float32Array;
  readonly nor: Float32Array;
  readonly curv: Float32Array; // signed curvature along normal (positive = curving towards normal / concave)
  readonly sectionIndex: Uint16Array;
  readonly sections: Section[];
  readonly controlS: number[];
  readonly envTransitions: { s: number; from: number; to: number }[] = [];
  readonly minY: number;
  readonly maxY: number;
  private lastSectionLookup = 0;

  constructor(points: ControlPoint[], sectionDefs: SectionDef[]) {
    const n = points.length;
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => p.pos),
      false,
      "centripetal",
      0.5
    );

    // 1) dense sampling in curve parameter space
    const per = 24;
    const denseN = (n - 1) * per;
    const dense = new Float32Array((denseN + 1) * 3);
    const denseS = new Float64Array(denseN + 1);
    const tmp = new THREE.Vector3();
    let acc = 0;
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let i = 0; i <= denseN; i++) {
      curve.getPoint(i / denseN, tmp);
      if (i > 0) acc += Math.hypot(tmp.x - px, tmp.y - py, tmp.z - pz);
      denseS[i] = acc;
      dense[i * 3] = tmp.x;
      dense[i * 3 + 1] = tmp.y;
      dense[i * 3 + 2] = tmp.z;
      px = tmp.x;
      py = tmp.y;
      pz = tmp.z;
    }
    this.length = acc;
    this.controlS = [];
    for (let i = 0; i < n; i++) this.controlS.push(denseS[Math.min(denseN, i * per)]);

    // 2) uniform resample by arc length
    const count = Math.floor(this.length / this.ds) + 1;
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.tan = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    this.curv = new Float32Array(count);
    let j = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < count; k++) {
      const s = Math.min(k * this.ds, this.length);
      while (j < denseN - 1 && denseS[j + 1] < s) j++;
      const s0 = denseS[j];
      const s1 = denseS[j + 1];
      const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
      const x = dense[j * 3] + (dense[(j + 1) * 3] - dense[j * 3]) * t;
      const y = dense[j * 3 + 1] + (dense[(j + 1) * 3 + 1] - dense[j * 3 + 1]) * t;
      const z = dense[j * 3 + 2] + (dense[(j + 1) * 3 + 2] - dense[j * 3 + 2]) * t;
      this.pos[k * 3] = x;
      this.pos[k * 3 + 1] = y;
      this.pos[k * 3 + 2] = z;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    this.minY = minY;
    this.maxY = maxY;

    // 3) tangents by central differences
    for (let k = 0; k < count; k++) {
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(count - 1, k + 1);
      let tx = this.pos[k1 * 3] - this.pos[k0 * 3];
      let ty = this.pos[k1 * 3 + 1] - this.pos[k0 * 3 + 1];
      let tz = this.pos[k1 * 3 + 2] - this.pos[k0 * 3 + 2];
      const l = Math.hypot(tx, ty, tz) || 1;
      tx /= l;
      ty /= l;
      tz /= l;
      this.tan[k * 3] = tx;
      this.tan[k * 3 + 1] = ty;
      this.tan[k * 3 + 2] = tz;
    }

    // 4) rotation minimising frames (double reflection)
    const r = new THREE.Vector3();
    const t0 = new THREE.Vector3(this.tan[0], this.tan[1], this.tan[2]);
    r.copy(UP).addScaledVector(t0, -UP.dot(t0));
    if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
    r.normalize();
    this.nor[0] = r.x;
    this.nor[1] = r.y;
    this.nor[2] = r.z;
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const rL = new THREE.Vector3();
    const tL = new THREE.Vector3();
    const ti = new THREE.Vector3();
    const tn = new THREE.Vector3();
    for (let k = 0; k < count - 1; k++) {
      ti.set(this.tan[k * 3], this.tan[k * 3 + 1], this.tan[k * 3 + 2]);
      tn.set(this.tan[(k + 1) * 3], this.tan[(k + 1) * 3 + 1], this.tan[(k + 1) * 3 + 2]);
      v1.set(
        this.pos[(k + 1) * 3] - this.pos[k * 3],
        this.pos[(k + 1) * 3 + 1] - this.pos[k * 3 + 1],
        this.pos[(k + 1) * 3 + 2] - this.pos[k * 3 + 2]
      );
      const c1 = v1.lengthSq();
      if (c1 < 1e-12) {
        this.nor[(k + 1) * 3] = r.x;
        this.nor[(k + 1) * 3 + 1] = r.y;
        this.nor[(k + 1) * 3 + 2] = r.z;
        continue;
      }
      rL.copy(r).addScaledVector(v1, (-2 / c1) * v1.dot(r));
      tL.copy(ti).addScaledVector(v1, (-2 / c1) * v1.dot(ti));
      v2.copy(tn).sub(tL);
      const c2 = v2.lengthSq();
      if (c2 > 1e-12) r.copy(rL).addScaledVector(v2, (-2 / c2) * v2.dot(rL));
      else r.copy(rL);
      // re-orthogonalise against drift
      r.addScaledVector(tn, -r.dot(tn)).normalize();
      this.nor[(k + 1) * 3] = r.x;
      this.nor[(k + 1) * 3 + 1] = r.y;
      this.nor[(k + 1) * 3 + 2] = r.z;
    }

    // 5) twist correction so that constrained control points match world-up + bank
    const constraints: { k: number; theta: number }[] = [];
    let prevTheta = 0;
    const nrm = new THREE.Vector3();
    const tg = new THREE.Vector3();
    const desired = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const hint = points[i].up;
      if (points[i].freeUp && !hint) continue;
      const k = Math.min(count - 1, Math.round(this.controlS[i] / this.ds));
      tg.set(this.tan[k * 3], this.tan[k * 3 + 1], this.tan[k * 3 + 2]);
      if (hint) desired.copy(hint).addScaledVector(tg, -hint.dot(tg));
      else desired.copy(UP).addScaledVector(tg, -UP.dot(tg));
      if (desired.lengthSq() < 1e-4) continue;
      desired.normalize();
      if (!hint && points[i].bank !== 0) rotateAboutAxis(desired, tg, points[i].bank);
      nrm.set(this.nor[k * 3], this.nor[k * 3 + 1], this.nor[k * 3 + 2]);
      _a.crossVectors(nrm, desired);
      let theta = Math.atan2(_a.dot(tg), nrm.dot(desired));
      // unwrap relative to previous constraint
      theta += Math.PI * 2 * Math.round((prevTheta - theta) / (Math.PI * 2));
      prevTheta = theta;
      constraints.push({ k, theta });
    }
    if (constraints.length > 0) {
      let ci = 0;
      for (let k = 0; k < count; k++) {
        while (ci < constraints.length - 1 && constraints[ci + 1].k <= k) ci++;
        let twist: number;
        if (k <= constraints[0].k) twist = constraints[0].theta;
        else if (ci >= constraints.length - 1) twist = constraints[constraints.length - 1].theta;
        else {
          const c0 = constraints[ci];
          const c1 = constraints[ci + 1];
          const f = (k - c0.k) / Math.max(1, c1.k - c0.k);
          twist = c0.theta + (c1.theta - c0.theta) * f;
        }
        if (twist !== 0) {
          nrm.set(this.nor[k * 3], this.nor[k * 3 + 1], this.nor[k * 3 + 2]);
          tg.set(this.tan[k * 3], this.tan[k * 3 + 1], this.tan[k * 3 + 2]);
          rotateAboutAxis(nrm, tg, twist);
          nrm.normalize();
          this.nor[k * 3] = nrm.x;
          this.nor[k * 3 + 1] = nrm.y;
          this.nor[k * 3 + 2] = nrm.z;
        }
      }
    }

    // 6) signed curvature along the normal (used for crest launches)
    for (let k = 0; k < count; k++) {
      const k0 = Math.max(0, k - 4);
      const k1 = Math.min(count - 1, k + 4);
      const dsK = (k1 - k0) * this.ds || 1;
      const dx = (this.tan[k1 * 3] - this.tan[k0 * 3]) / dsK;
      const dy = (this.tan[k1 * 3 + 1] - this.tan[k0 * 3 + 1]) / dsK;
      const dz = (this.tan[k1 * 3 + 2] - this.tan[k0 * 3 + 2]) / dsK;
      this.curv[k] = dx * this.nor[k * 3] + dy * this.nor[k * 3 + 1] + dz * this.nor[k * 3 + 2];
    }

    // 7) sections
    this.sections = [];
    let prevEnd = 0;
    sectionDefs.forEach((d, idx) => {
      const s0 = this.controlS[prevEnd];
      const s1 = idx === sectionDefs.length - 1 ? this.length : this.controlS[d.endIndex];
      this.sections.push({ type: d.type, width: d.width, env: d.env, rails: d.rails, s0, s1, index: idx, label: d.label });
      prevEnd = d.endIndex;
    });
    this.sectionIndex = new Uint16Array(count);
    let si = 0;
    for (let k = 0; k < count; k++) {
      const s = k * this.ds;
      while (si < this.sections.length - 1 && s >= this.sections[si].s1) si++;
      this.sectionIndex[k] = si;
    }
    for (let i = 1; i < this.sections.length; i++) {
      if (this.sections[i].env !== this.sections[i - 1].env) {
        this.envTransitions.push({ s: this.sections[i].s0, from: this.sections[i - 1].env, to: this.sections[i].env });
      }
    }
  }

  clampS(s: number): number {
    return s < 0 ? 0 : s > this.length - 0.01 ? this.length - 0.01 : s;
  }

  sectionAt(s: number): Section {
    const k = Math.min(this.count - 1, Math.max(0, Math.floor(s / this.ds)));
    const idx = this.sectionIndex[k];
    this.lastSectionLookup = idx;
    return this.sections[idx];
  }

  get lastSection(): Section {
    return this.sections[this.lastSectionLookup];
  }

  /** Environment blend at s: returns [envA, envB, t]. Blends over +-blend metres around transitions. */
  envAt(s: number, blend = 40): { a: number; b: number; t: number } {
    const sec = this.sectionAt(s);
    let a = sec.env;
    let b = sec.env;
    let t = 0;
    for (const tr of this.envTransitions) {
      const d = s - tr.s;
      if (Math.abs(d) < blend) {
        a = tr.from;
        b = tr.to;
        const u = (d + blend) / (2 * blend);
        t = u * u * (3 - 2 * u);
        break;
      }
    }
    return { a, b, t };
  }

  /** Interpolated frame at arc length s (O(1)). */
  frameAt(s: number, out: Frame): Frame {
    const sc = this.clampS(s);
    const f = sc / this.ds;
    const k0 = Math.min(this.count - 2, Math.floor(f));
    const k1 = k0 + 1;
    const u = f - k0;
    const p = this.pos;
    const t = this.tan;
    const nn = this.nor;
    out.pos.set(
      p[k0 * 3] + (p[k1 * 3] - p[k0 * 3]) * u,
      p[k0 * 3 + 1] + (p[k1 * 3 + 1] - p[k0 * 3 + 1]) * u,
      p[k0 * 3 + 2] + (p[k1 * 3 + 2] - p[k0 * 3 + 2]) * u
    );
    out.tangent
      .set(
        t[k0 * 3] + (t[k1 * 3] - t[k0 * 3]) * u,
        t[k0 * 3 + 1] + (t[k1 * 3 + 1] - t[k0 * 3 + 1]) * u,
        t[k0 * 3 + 2] + (t[k1 * 3 + 2] - t[k0 * 3 + 2]) * u
      )
      .normalize();
    out.normal
      .set(
        nn[k0 * 3] + (nn[k1 * 3] - nn[k0 * 3]) * u,
        nn[k0 * 3 + 1] + (nn[k1 * 3 + 1] - nn[k0 * 3 + 1]) * u,
        nn[k0 * 3 + 2] + (nn[k1 * 3 + 2] - nn[k0 * 3 + 2]) * u
      )
      .normalize();
    out.right.crossVectors(out.tangent, out.normal).normalize();
    out.curvatureN = this.curv[k0] + (this.curv[k1] - this.curv[k0]) * u;
    return out;
  }

  /** World position for track coordinates. */
  worldPos(s: number, x: number, h: number, frame: Frame, out: THREE.Vector3): THREE.Vector3 {
    this.frameAt(s, frame);
    return out.copy(frame.pos).addScaledVector(frame.right, x).addScaledVector(frame.normal, h);
  }

  /**
   * Project a world point onto the spline searching locally around sGuess.
   * Returns the refined arc length. Search window is asymmetric (mostly forward).
   */
  project(p: THREE.Vector3, sGuess: number, back = 4, forward = 12): number {
    const k0 = Math.max(0, Math.floor((sGuess - back) / this.ds));
    const k1 = Math.min(this.count - 1, Math.ceil((sGuess + forward) / this.ds));
    let best = k0;
    let bestD = Infinity;
    const pos = this.pos;
    for (let k = k0; k <= k1; k++) {
      const dx = p.x - pos[k * 3];
      const dy = p.y - pos[k * 3 + 1];
      const dz = p.z - pos[k * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    _a.set(p.x - pos[best * 3], p.y - pos[best * 3 + 1], p.z - pos[best * 3 + 2]);
    _b.set(this.tan[best * 3], this.tan[best * 3 + 1], this.tan[best * 3 + 2]);
    const s = best * this.ds + Math.max(-this.ds, Math.min(this.ds, _a.dot(_b)));
    return this.clampS(s);
  }
}
