export type GamePhase = "menu" | "running" | "paused" | "respawning" | "finished";

export type ZoneName = "Tidal Expanse" | "Neon Foundry" | "Skybreak Array";

export interface GameState {
  phase: GamePhase;
  distance: number;
  renderDistance: number;
  speed: number;
  x: number;
  renderX: number;
  vx: number;
  y: number;
  renderY: number;
  vy: number;
  grounded: boolean;
  onRail: boolean;
  railId: number;
  boosting: boolean;
  boost: number;
  rings: number;
  score: number;
  combo: number;
  health: number;
  elapsed: number;
  checkpoint: number;
  invulnerable: number;
  coyote: number;
  jumpBuffer: number;
  shake: number;
  respawnTimer: number;
  toast: string;
  toastUntil: number;
  collected: Set<number>;
  destroyed: Set<number>;
  triggered: Set<string>;
}

export interface HudState {
  phase: GamePhase;
  speed: number;
  boost: number;
  rings: number;
  score: number;
  combo: number;
  health: number;
  elapsed: number;
  distance: number;
  checkpoint: number;
  zone: ZoneName;
  toast: string;
  progress: number;
}

export interface InputState {
  keys: Set<string>;
  steer: number;
  accelerate: boolean;
  brake: boolean;
  boost: boolean;
  jumpQueued: boolean;
  pauseQueued: boolean;
  gamepadJump: boolean;
  gamepadPause: boolean;
  touchSteer: number;
  touchBoost: boolean;
}

export interface AudioBus {
  unlock: () => void;
  jump: () => void;
  ring: (combo: number) => void;
  hit: () => void;
  boost: () => void;
  checkpoint: () => void;
  enemy: () => void;
  finish: () => void;
}

export interface RingData {
  id: number;
  d: number;
  x: number;
  y: number;
}

export interface ObstacleData {
  id: number;
  d: number;
  x: number;
  width: number;
}

export interface EnemyData {
  id: number;
  d: number;
  x: number;
  phase: number;
}

export interface RailData {
  id: number;
  start: number;
  end: number;
  x: number;
  height: number;
}

export interface RampData {
  id: number;
  d: number;
  x: number;
  width: number;
  power: number;
}

export interface BoostPadData {
  id: number;
  d: number;
  x: number;
}