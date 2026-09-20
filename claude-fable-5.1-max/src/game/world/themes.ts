import * as THREE from "three";

export interface Theme {
  name: string;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  skyBottom: THREE.Color;
  sunColor: THREE.Color;
  sunDir: THREE.Vector3;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  roadTint: THREE.Color;
  edgeGlow: THREE.Color;
  groundColor: THREE.Color;
  groundGrid: THREE.Color;
  mountains: [THREE.Color, THREE.Color, THREE.Color];
  stars: number;
  cloudColor: THREE.Color;
  cloudOpacity: number;
  props: "coast" | "city" | "canyon";
  accent: string; // css color for HUD
}

const c = (hex: number): THREE.Color => new THREE.Color(hex);

export const THEMES: Theme[] = [
  {
    name: "Azure Coast",
    skyTop: c(0x1a5fd6),
    skyHorizon: c(0xa8ddff),
    skyBottom: c(0x2f8fc8),
    sunColor: c(0xfff2d0),
    sunDir: new THREE.Vector3(0.45, 0.62, -0.35).normalize(),
    sunIntensity: 2.6,
    hemiSky: c(0x8fd0ff),
    hemiGround: c(0x2f7f6a),
    hemiIntensity: 1.1,
    fogColor: c(0xbfe6ff),
    fogNear: 140,
    fogFar: 760,
    roadTint: c(0xdfe5ee),
    edgeGlow: c(0xffbf47),
    groundColor: c(0x1f8fca),
    groundGrid: c(0x7fd8ff),
    mountains: [c(0x2f8a63), c(0x5aa89c), c(0x8dc4dc)],
    stars: 0,
    cloudColor: c(0xffffff),
    cloudOpacity: 0.85,
    props: "coast",
    accent: "#ffbf47",
  },
  {
    name: "Neon District",
    skyTop: c(0x050212),
    skyHorizon: c(0x4a1a7a),
    skyBottom: c(0x120826),
    sunColor: c(0xc4d4ff),
    sunDir: new THREE.Vector3(-0.35, 0.5, 0.5).normalize(),
    sunIntensity: 0.9,
    hemiSky: c(0x5a3aa8),
    hemiGround: c(0x0c0620),
    hemiIntensity: 0.9,
    fogColor: c(0x1b0b36),
    fogNear: 90,
    fogFar: 560,
    roadTint: c(0x4d5570),
    edgeGlow: c(0xff2fd6),
    groundColor: c(0x0a0716),
    groundGrid: c(0x3a1f8f),
    mountains: [c(0x140a2e), c(0x1f1147), c(0x2c1a5e)],
    stars: 1,
    cloudColor: c(0x6a3fb0),
    cloudOpacity: 0.35,
    props: "city",
    accent: "#ff2fd6",
  },
  {
    name: "Ember Canyon",
    skyTop: c(0x3b1a5e),
    skyHorizon: c(0xff9d5c),
    skyBottom: c(0x8a3a2a),
    sunColor: c(0xffb070),
    sunDir: new THREE.Vector3(-0.6, 0.22, -0.4).normalize(),
    sunIntensity: 2.2,
    hemiSky: c(0xd88a7a),
    hemiGround: c(0x5a2a1a),
    hemiIntensity: 1.0,
    fogColor: c(0xd98a5a),
    fogNear: 150,
    fogFar: 820,
    roadTint: c(0xd2c3b3),
    edgeGlow: c(0xff6a1a),
    groundColor: c(0xa85a36),
    groundGrid: c(0xd07a4a),
    mountains: [c(0x6e3226), c(0x92503f), c(0xc48366)],
    stars: 0.25,
    cloudColor: c(0xffc9a0),
    cloudOpacity: 0.7,
    props: "canyon",
    accent: "#ff6a1a",
  },
];

/** Blended theme values (allocates nothing after construction). */
export class BlendedTheme {
  skyTop = new THREE.Color();
  skyHorizon = new THREE.Color();
  skyBottom = new THREE.Color();
  sunColor = new THREE.Color();
  sunDir = new THREE.Vector3();
  sunIntensity = 1;
  hemiSky = new THREE.Color();
  hemiGround = new THREE.Color();
  hemiIntensity = 1;
  fogColor = new THREE.Color();
  fogNear = 100;
  fogFar = 600;
  groundColor = new THREE.Color();
  groundGrid = new THREE.Color();
  mountains: [THREE.Color, THREE.Color, THREE.Color] = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  stars = 0;
  cloudColor = new THREE.Color();
  cloudOpacity = 1;
  edgeGlow = new THREE.Color();

  blend(a: Theme, b: Theme, t: number): void {
    this.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
    this.skyHorizon.copy(a.skyHorizon).lerp(b.skyHorizon, t);
    this.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, t);
    this.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
    this.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
    this.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
    this.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
    this.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
    this.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t;
    this.fogColor.copy(a.fogColor).lerp(b.fogColor, t);
    this.fogNear = a.fogNear + (b.fogNear - a.fogNear) * t;
    this.fogFar = a.fogFar + (b.fogFar - a.fogFar) * t;
    this.groundColor.copy(a.groundColor).lerp(b.groundColor, t);
    this.groundGrid.copy(a.groundGrid).lerp(b.groundGrid, t);
    for (let i = 0; i < 3; i++) this.mountains[i].copy(a.mountains[i]).lerp(b.mountains[i], t);
    this.stars = a.stars + (b.stars - a.stars) * t;
    this.cloudColor.copy(a.cloudColor).lerp(b.cloudColor, t);
    this.cloudOpacity = a.cloudOpacity + (b.cloudOpacity - a.cloudOpacity) * t;
    this.edgeGlow.copy(a.edgeGlow).lerp(b.edgeGlow, t);
  }
}
