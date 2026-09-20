import * as THREE from "three";
import { ControlPoint, SectionDef, SectionType } from "./Track";
import { DEG } from "../core/math";

interface SectionOpts {
  dy?: number; // elevation change over the section (eased)
  bank?: number; // degrees, applied at the section's interior points
  width?: number;
  type?: SectionType;
  rails?: number[];
  label?: string;
}

const ease = (u: number): number => u * u * (3 - 2 * u);

/**
 * Cursor based track authoring. Every section appends control points and a
 * section definition. Heading is a yaw angle (0 = +Z); positive turns go left.
 */
export class TrackBuilder {
  readonly points: ControlPoint[] = [];
  readonly sections: SectionDef[] = [];
  readonly loops: { center: THREE.Vector3; radius: number; forward: THREE.Vector3; right: THREE.Vector3; shift: number }[] = [];
  private pos = new THREE.Vector3(0, 0, 0);
  private yaw = 0;
  private env = 0;
  private width = 10;

  constructor(start = new THREE.Vector3(0, 0, 0)) {
    this.pos.copy(start);
    this.points.push({ pos: start.clone(), bank: 0, freeUp: false });
  }

  setEnv(e: number): this {
    this.env = e;
    return this;
  }

  setWidth(w: number): this {
    this.width = w;
    return this;
  }

  get position(): THREE.Vector3 {
    return this.pos.clone();
  }

  private forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  private rightDir(out: THREE.Vector3): THREE.Vector3 {
    // right = forward x up
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  private push(p: THREE.Vector3, bank: number, freeUp = false): void {
    this.points.push({ pos: p.clone(), bank, freeUp });
  }

  private endSection(opts: SectionOpts): void {
    this.sections.push({
      type: opts.type ?? "road",
      width: opts.width ?? this.width,
      env: this.env,
      rails: opts.rails ?? [],
      endIndex: this.points.length - 1,
      label: opts.label,
    });
  }

  /** Straight run; optional eased elevation change. */
  straight(len: number, opts: SectionOpts = {}): this {
    const fwd = this.forward(new THREE.Vector3());
    const dy = opts.dy ?? 0;
    const bank = (opts.bank ?? 0) * DEG;
    const step = Math.max(1, Math.round(len / 8));
    const start = this.pos.clone();
    for (let i = 1; i <= step; i++) {
      const u = i / step;
      const p = start.clone().addScaledVector(fwd, len * u);
      p.y = start.y + dy * ease(u);
      this.push(p, i === step ? 0 : bank);
    }
    this.pos.copy(start).addScaledVector(fwd, len);
    this.pos.y = start.y + dy;
    this.endSection(opts);
    return this;
  }

  /** Straight rising ramp whose exit tangent points upward (launch). */
  ramp(len: number, dy: number, opts: SectionOpts = {}): this {
    const fwd = this.forward(new THREE.Vector3());
    const step = Math.max(2, Math.round(len / 6));
    const start = this.pos.clone();
    for (let i = 1; i <= step; i++) {
      const u = i / step;
      const p = start.clone().addScaledVector(fwd, len * u);
      p.y = start.y + dy * u * u;
      this.push(p, 0);
    }
    this.pos.copy(start).addScaledVector(fwd, len);
    this.pos.y = start.y + dy;
    this.endSection({ ...opts, label: opts.label ?? "ramp" });
    return this;
  }

  /** Gap with no surface. The spline continues so airborne projection stays well defined. */
  gap(len: number, dy = 0, opts: SectionOpts = {}): this {
    const fwd = this.forward(new THREE.Vector3());
    const start = this.pos.clone();
    // short overhang keeps the launch direction of the previous ramp
    const prev = this.points[this.points.length - 1].pos;
    const prev2 = this.points[this.points.length - 2]?.pos ?? prev;
    const dir = prev.clone().sub(prev2);
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      this.push(start.clone().addScaledVector(dir, Math.min(4, len * 0.15)), 0);
    }
    const step = Math.max(1, Math.round(len / 12));
    for (let i = 1; i <= step; i++) {
      const u = i / step;
      const p = start.clone().addScaledVector(fwd, len * u);
      p.y = start.y + dy * (0.3 * u + 0.7 * u * u);
      this.push(p, 0);
    }
    this.pos.copy(start).addScaledVector(fwd, len);
    this.pos.y = start.y + dy;
    this.endSection({ ...opts, type: "gap" });
    return this;
  }

  /** Smooth hill: goes up by height and back down over len. */
  hill(len: number, height: number, opts: SectionOpts = {}): this {
    const fwd = this.forward(new THREE.Vector3());
    const step = Math.max(4, Math.round(len / 6));
    const start = this.pos.clone();
    for (let i = 1; i <= step; i++) {
      const u = i / step;
      const p = start.clone().addScaledVector(fwd, len * u);
      p.y = start.y + height * 0.5 * (1 - Math.cos(u * Math.PI * 2));
      this.push(p, 0);
    }
    this.pos.copy(start).addScaledVector(fwd, len);
    this.endSection({ ...opts, label: opts.label ?? "hill" });
    return this;
  }

  /** Horizontal arc. angleDeg > 0 turns left. Automatically banked unless bank given. */
  curve(angleDeg: number, radius: number, opts: SectionOpts = {}): this {
    const A = angleDeg * DEG;
    const sign = Math.sign(A) || 1;
    const fwd = this.forward(new THREE.Vector3());
    const right = this.rightDir(new THREE.Vector3());
    const center = this.pos.clone().addScaledVector(right, -sign * radius);
    const arcLen = Math.abs(A) * radius;
    const step = Math.max(3, Math.round(arcLen / 7));
    const dy = opts.dy ?? 0;
    const autoBank = Math.min(32, 900 / radius) * -sign; // bank>0 lowers right side (right turns)
    const bank = (opts.bank ?? autoBank) * DEG;
    const start = this.pos.clone();
    for (let i = 1; i <= step; i++) {
      const u = i / step;
      const phi = Math.abs(A) * u;
      const p = center
        .clone()
        .addScaledVector(right, sign * radius * Math.cos(phi))
        .addScaledVector(fwd, radius * Math.sin(phi));
      p.y = start.y + dy * ease(u);
      // ease bank in/out
      const bw = Math.sin(Math.min(1, Math.min(u, 1 - u) * 4) * Math.PI * 0.5);
      this.push(p, i === step ? 0 : bank * bw);
    }
    this.yaw += A;
    this.pos.copy(this.points[this.points.length - 1].pos);
    this.endSection(opts);
    return this;
  }

  /** Vertical loop in the heading plane, shifted laterally by `shift` to avoid self intersection. */
  loop(radius: number, shift = 7, opts: SectionOpts = {}): this {
    const fwd = this.forward(new THREE.Vector3());
    const right = this.rightDir(new THREE.Vector3());
    const start = this.pos.clone();
    const center = start.clone();
    center.y += radius;
    this.loops.push({ center: center.clone().addScaledVector(right, shift * 0.5), radius, forward: fwd.clone(), right: right.clone(), shift });
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const phi = (i / steps) * Math.PI * 2;
      const lateral = shift * ease(i / steps);
      const p = center
        .clone()
        .addScaledVector(fwd, radius * Math.sin(phi))
        .addScaledVector(right, lateral);
      p.y = center.y - radius * Math.cos(phi);
      // desired normal points at the loop axis (keeps the surface un-banked through the loop)
      const axisPoint = center.clone().addScaledVector(right, lateral);
      const up = axisPoint.sub(p).normalize();
      this.points.push({ pos: p.clone(), bank: 0, freeUp: i !== steps, up: i === steps ? undefined : up });
    }
    this.pos.copy(start).addScaledVector(right, shift);
    this.endSection({ ...opts, type: "loop", width: opts.width ?? this.width, label: "loop" });
    return this;
  }

  /** Rails section: narrow surfaces at the given lateral offsets, nothing in between. */
  rails(len: number, offsets: number[] = [-3, 0, 3], opts: SectionOpts = {}): this {
    return this.straight(len, { ...opts, type: "rail", rails: offsets });
  }

  build(): { points: ControlPoint[]; sections: SectionDef[] } {
    return { points: this.points, sections: this.sections };
  }
}
