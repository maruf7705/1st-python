import { Track } from "./Track";
import { TrackBuilder } from "./TrackBuilder";

export type EntityKind =
  | "ring"
  | "dashring"
  | "drone"
  | "crawler"
  | "spiky"
  | "spikes"
  | "crate"
  | "barrier"
  | "boost"
  | "spring"
  | "checkpoint"
  | "goal";

export const CHUNK_LEN = 200;

export interface Entity {
  id: number;
  kind: EntityKind;
  s: number;
  x: number;
  h: number;
  alive: boolean;
  chunk: number;
  slot: number; // index inside the chunk's instanced mesh
  // dynamics / per kind data
  s0: number;
  x0: number;
  phase: number;
  range: number;
  speed: number;
  axis: 0 | 1; // 0 = lateral patrol, 1 = along track
  barrierType: 0 | 1 | 2; // 0 wall with gap at x, 1 low bar (jump), 2 high bar (roll)
  anim: number; // generic animation timer (spring squash, checkpoint flip)
  order: number; // checkpoint order
  yaw: number;
}

export interface LevelData {
  name: string;
  track: Track;
  entities: Entity[];
  checkpointCount: number;
  goalS: number;
  loops: TrackBuilder["loops"];
}

let nextId = 1;

function makeEntity(kind: EntityKind, s: number, x: number, h: number): Entity {
  return {
    id: nextId++,
    kind,
    s,
    x,
    h,
    alive: true,
    chunk: Math.floor(s / CHUNK_LEN),
    slot: 0,
    s0: s,
    x0: x,
    phase: 0,
    range: 0,
    speed: 0,
    axis: 0,
    barrierType: 0,
    anim: 0,
    order: 0,
    yaw: 0,
  };
}

class Placer {
  entities: Entity[] = [];
  checkpoints = 0;
  constructor(private track: Track) {}

  private add(e: Entity): Entity {
    if (e.s > 2 && e.s < this.track.length - 2) this.entities.push(e);
    return e;
  }

  ring(s: number, x: number, h = 1.0): void {
    this.add(makeEntity("ring", s, x, h));
  }
  ringLine(s: number, count: number, spacing: number, x: number, h = 1.0): void {
    for (let i = 0; i < count; i++) this.ring(s + i * spacing, x, h);
  }
  ringRows(s: number, count: number, spacing: number, xs: number[], h = 1.0): void {
    for (let i = 0; i < count; i++) for (const x of xs) this.ring(s + i * spacing, x, h);
  }
  ringZigzag(s: number, count: number, spacing: number, amp: number): void {
    for (let i = 0; i < count; i++) this.ring(s + i * spacing, Math.sin(i * 0.9) * amp, 1.0);
  }
  /** Parabolic arc of rings between s0 and s1 peaking at peakH. */
  ringArc(s0: number, s1: number, count: number, x: number, peakH: number, baseH = 1.0): void {
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const h = baseH + (peakH - baseH) * (1 - (2 * u - 1) * (2 * u - 1));
      this.ring(s0 + (s1 - s0) * u, x, h);
    }
  }
  ringCircle(sCenter: number, hCenter: number, radius: number, count: number, x: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.ring(sCenter + Math.cos(a) * radius, x, hCenter + Math.sin(a) * radius);
    }
  }
  dashRing(s: number, x: number, h: number): void {
    this.add(makeEntity("dashring", s, x, h));
  }
  drone(s: number, x: number, range = 2.5, speed = 1.2, h = 1.6): void {
    const e = makeEntity("drone", s, x, h);
    e.range = range;
    e.speed = speed;
    e.axis = 0;
    e.phase = Math.random() * Math.PI * 2;
    this.add(e);
  }
  crawler(s: number, x: number, range = 8, speed = 0.9): void {
    const e = makeEntity("crawler", s, x, 0.55);
    e.range = range;
    e.speed = speed;
    e.axis = 1;
    e.phase = Math.random() * Math.PI * 2;
    this.add(e);
  }
  spiky(s: number, x: number, range = 0, speed = 0.7): void {
    const e = makeEntity("spiky", s, x, 0.9);
    e.range = range;
    e.speed = speed;
    e.axis = 0;
    this.add(e);
  }
  spikes(s: number, x: number): void {
    this.add(makeEntity("spikes", s, x, 0));
  }
  crate(s: number, x: number): void {
    this.add(makeEntity("crate", s, x, 0.8));
  }
  barrier(s: number, type: 0 | 1 | 2, gapX = 0): void {
    const e = makeEntity("barrier", s, gapX, 0);
    e.barrierType = type;
    this.add(e);
  }
  boost(s: number, x = 0): void {
    this.add(makeEntity("boost", s, x, 0));
  }
  spring(s: number, x = 0): void {
    this.add(makeEntity("spring", s, x, 0));
  }
  checkpoint(s: number): void {
    const e = makeEntity("checkpoint", s, 0, 0);
    e.order = ++this.checkpoints;
    this.add(e);
  }
  goal(s: number): void {
    this.add(makeEntity("goal", s, 0, 0));
  }
}

export function buildLevel(): LevelData {
  nextId = 1;
  const b = new TrackBuilder();
  const marks: Record<string, number> = {};
  const mark = (name: string): void => {
    marks[name] = b.points.length - 1;
  };

  // ───────────── ENV 0: Azure Coast ─────────────
  b.setEnv(0);
  mark("start");
  b.straight(90);
  b.curve(-35, 90);
  mark("slope1");
  b.straight(110, { dy: -12 });
  b.straight(40);
  mark("boost1");
  b.ramp(36, 6);
  mark("ramp1");
  b.gap(30, -4);
  mark("land1");
  b.straight(70);
  mark("curve2");
  b.curve(50, 70);
  mark("hill1");
  b.hill(120, 10);
  mark("cp1");
  b.straight(40);
  mark("preLoop1");
  b.straight(30);
  mark("loop1");
  b.loop(13, 7);
  mark("barriers1");
  b.straight(100);
  b.straight(20);
  mark("rails1");
  b.rails(140, [-3, 0, 3]);
  mark("cp2");
  b.straight(40);
  b.setEnv(1);
  mark("descent1");
  b.straight(120, { dy: -16 });

  // ───────────── ENV 1: Neon District ─────────────
  mark("cityCurve1");
  b.curve(-45, 80);
  mark("cityCurve2");
  b.curve(45, 80);
  mark("spring1");
  b.straight(60);
  b.gap(36, -2);
  mark("land2");
  b.straight(60);
  mark("preLoop2");
  b.straight(40);
  mark("loop2");
  b.loop(16, 8);
  mark("barriers2");
  b.straight(90);
  mark("cityCurve3");
  b.curve(90, 60, { bank: -30 });
  mark("cp3");
  b.straight(40);
  b.setEnv(2);
  mark("climb1");
  b.straight(100, { dy: 14 });

  // ───────────── ENV 2: Ember Canyon ─────────────
  mark("descent2");
  b.straight(160, { dy: -30 });
  // Hops are spaced for the full speed range: at 90 m/s a ramp launch flies ~160 m,
  // so every landing zone is long enough to come down on solid road.
  mark("hop1");
  b.ramp(30, 5);
  b.gap(40, -4);
  b.straight(150);
  mark("hop2");
  b.ramp(30, 5);
  b.gap(36, -3);
  b.straight(150);
  mark("hop3");
  b.ramp(30, 6);
  b.gap(44, -4);
  mark("land3");
  b.straight(160);
  mark("canyonCurve");
  b.curve(-60, 70);
  mark("rails2");
  b.rails(160, [-3.2, 0, 3.2], { dy: -10 });
  mark("cp4");
  b.straight(40);
  mark("preLoop3");
  b.straight(30);
  mark("loop3");
  b.loop(18, 9);
  mark("hill2");
  b.hill(100, 8);
  mark("final");
  b.straight(200);
  mark("goal");
  b.straight(70);

  const built = b.build();
  const track = new Track(built.points, built.sections);
  const S = (name: string): number => track.controlS[marks[name]];
  const P = new Placer(track);

  // ───────────── Entities: Coast ─────────────
  P.ringRows(S("start") + 22, 6, 4, [-2, 0, 2]);
  P.ringLine(S("start") + 100, 10, 5, 2.5);
  P.ringZigzag(S("slope1") + 10, 14, 6, 3);
  P.drone(S("slope1") + 95, 0, 3, 1.3);
  P.boost(S("boost1") - 20, 0);
  P.ringArc(S("ramp1") - 4, S("land1") + 8, 9, 0, 7.5);
  P.ringRows(S("land1") + 16, 4, 4, [-2.5, 2.5]);
  P.crate(S("land1") + 40, -2.5);
  P.crate(S("land1") + 40, 2.5);
  P.ringLine(S("land1") + 32, 6, 3, 0);
  P.drone(S("curve2") + 20, -1.5, 2.5, 1.4);
  P.drone(S("curve2") + 42, 1.5, 2.5, 1.1);
  P.ringLine(S("curve2") + 8, 8, 5, -3);
  P.ringLine(S("hill1") + 20, 5, 5, 0);
  P.ringArc(S("hill1") + 48, S("hill1") + 84, 7, 0, 4.5);
  P.ringLine(S("hill1") + 90, 5, 5, 0);
  P.checkpoint(S("cp1") + 12);
  P.boost(S("preLoop1") + 14, 0);
  {
    const l0 = S("loop1");
    const l1 = S("barriers1");
    for (let i = 1; i <= 10; i++) P.ring(l0 + ((l1 - l0) * i) / 11, 0, 1.0);
  }
  P.barrier(S("barriers1") + 22, 0, -2.6);
  P.ringLine(S("barriers1") + 16, 4, 3, -2.6);
  P.barrier(S("barriers1") + 50, 1, 0);
  P.ringArc(S("barriers1") + 42, S("barriers1") + 60, 5, 0, 3.6);
  P.barrier(S("barriers1") + 78, 0, 2.6);
  P.ringLine(S("barriers1") + 72, 4, 3, 2.6);
  P.spikes(S("barriers1") + 96, -3);
  P.spikes(S("barriers1") + 96, 3);
  P.ringLine(S("rails1") + 10, 6, 6, -3);
  P.ringLine(S("rails1") + 50, 6, 6, 3);
  P.ringLine(S("rails1") + 90, 6, 6, 0);
  P.drone(S("rails1") + 75, 0, 0, 0, 3.2);
  P.checkpoint(S("cp2") + 12);
  P.ringZigzag(S("descent1") + 10, 16, 6, 3.2);
  P.crawler(S("descent1") + 70, -2, 6, 1);
  P.crawler(S("descent1") + 90, 2, 6, 1);

  // ───────────── Entities: City ─────────────
  P.ringLine(S("cityCurve1") + 10, 9, 6, -2.5);
  P.crawler(S("cityCurve1") + 30, 1.5, 6, 1.2);
  P.spiky(S("cityCurve1") + 55, -1);
  P.ringLine(S("cityCurve2") + 10, 9, 6, 2.5);
  P.spiky(S("cityCurve2") + 26, 2.5, 2.5, 0.8);
  P.spiky(S("cityCurve2") + 46, -2.5, 2.5, 0.8);
  P.drone(S("cityCurve2") + 60, 0, 3, 1.5);
  // spring at +44 launches 31 m/s up; gap spans +60..+96 -> clearable from cruise speed
  P.spring(S("spring1") + 44, 0);
  P.ringCircle(S("spring1") + 60, 11, 4, 8, 0);
  P.dashRing(S("spring1") + 74, 0, 14);
  P.ring(S("spring1") + 86, 0, 11.5);
  P.ring(S("spring1") + 90, 0, 9.8);
  P.ring(S("spring1") + 94, 0, 6.2);
  P.ring(S("spring1") + 98, 0, 2.5);
  P.crate(S("land2") + 30, 0);
  P.crate(S("land2") + 30, -3);
  P.crate(S("land2") + 30, 3);
  P.ringRows(S("land2") + 36, 4, 4, [-1.5, 1.5]);
  P.boost(S("preLoop2") + 20, 0);
  {
    const l0 = S("loop2");
    const l1 = S("barriers2");
    for (let i = 1; i <= 12; i++) P.ring(l0 + ((l1 - l0) * i) / 13, 0, 1.0);
  }
  P.barrier(S("barriers2") + 26, 2, 0);
  P.ringLine(S("barriers2") + 14, 4, 3, 0, 0.7);
  P.barrier(S("barriers2") + 40, 1, 0);
  P.barrier(S("barriers2") + 62, 0, 0);
  P.ringLine(S("barriers2") + 56, 4, 3, 0);
  P.barrier(S("barriers2") + 82, 2, 0);
  P.ringLine(S("cityCurve3") + 10, 12, 6, -2);
  P.drone(S("cityCurve3") + 30, 0, 3, 1.6);
  P.drone(S("cityCurve3") + 60, 0, 3, 1.6);
  P.spiky(S("cityCurve3") + 80, 2);
  P.checkpoint(S("cp3") + 12);
  P.ringRows(S("climb1") + 10, 7, 6, [-2, 2]);

  // ───────────── Entities: Canyon ─────────────
  P.boost(S("descent2") + 10, 0);
  P.boost(S("descent2") + 80, 0);
  P.ringZigzag(S("descent2") + 20, 18, 7, 3.2);
  P.crawler(S("descent2") + 120, 0, 8, 1.4);
  P.ringArc(S("hop1") + 26, S("hop1") + 78, 7, 0, 7);
  P.ringRows(S("hop1") + 100, 5, 6, [-2, 2]);
  P.drone(S("hop1") + 140, 0, 3, 1.5);
  P.ringArc(S("hop2") + 26, S("hop2") + 76, 7, 0, 7);
  P.crawler(S("hop2") + 110, 0, 8, 1.2);
  P.ringZigzag(S("hop2") + 120, 8, 6, 3);
  P.ringArc(S("hop3") + 26, S("hop3") + 86, 8, 0, 8);
  P.spikes(S("land3") + 60, 0);
  P.ringRows(S("land3") + 54, 3, 4, [-3, 3]);
  P.ringLine(S("land3") + 90, 8, 6, 0);
  P.drone(S("canyonCurve") + 15, -1, 3, 1.6);
  P.spiky(S("canyonCurve") + 35, 1.5, 2, 1);
  P.drone(S("canyonCurve") + 50, 1, 3, 1.6);
  P.spiky(S("canyonCurve") + 65, -1.5, 2, 1);
  P.ringLine(S("canyonCurve") + 8, 10, 6, 3.2);
  P.ringLine(S("rails2") + 10, 7, 7, -3.5);
  P.ringLine(S("rails2") + 60, 7, 7, 3.5);
  P.ringLine(S("rails2") + 110, 7, 7, 0);
  P.drone(S("rails2") + 40, 3.5, 0, 0, 3.2);
  P.drone(S("rails2") + 95, -3.5, 0, 0, 3.2);
  P.checkpoint(S("cp4") + 12);
  P.boost(S("preLoop3") + 14, 0);
  {
    const l0 = S("loop3");
    const l1 = S("hill2");
    for (let i = 1; i <= 14; i++) P.ring(l0 + ((l1 - l0) * i) / 15, 0, 1.0);
  }
  P.ringArc(S("hill2") + 40, S("hill2") + 75, 7, 0, 5);
  P.boost(S("final") + 10, 0);
  P.boost(S("final") + 70, 0);
  P.boost(S("final") + 130, 0);
  P.ringRows(S("final") + 20, 8, 5, [-3, 0, 3]);
  P.crawler(S("final") + 100, -2, 6, 1.3);
  P.crawler(S("final") + 115, 2, 6, 1.3);
  P.ringRows(S("final") + 140, 8, 5, [-2, 2]);
  P.goal(S("goal") + 20);

  const entities = P.entities.sort((a, c) => a.s - c.s);
  return {
    name: "Horizon Circuit",
    track,
    entities,
    checkpointCount: P.checkpoints,
    goalS: S("goal") + 20,
    loops: b.loops,
  };
}
