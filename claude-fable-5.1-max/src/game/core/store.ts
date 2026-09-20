// Small external store bridging the game loop (imperative) and React (declarative).
// Slow-changing data goes through snapshots (useSyncExternalStore); per-frame data
// (speed, boost gauge, FPS) is pushed to frame listeners that write DOM directly,
// so React never re-renders at frame rate.

export type GameState = "title" | "playing" | "paused" | "dead" | "results" | "gameover";
export type Quality = "low" | "medium" | "high";

export interface Results {
  score: number;
  time: number;
  rings: number;
  enemies: number;
  rank: string;
  maxSpeed: number;
}

export interface HudSnapshot {
  state: GameState;
  rings: number;
  score: number;
  lives: number;
  time: number;
  envName: string;
  message: { text: string; id: number; tone: "info" | "good" | "bad" } | null;
  results: Results | null;
  quality: Quality;
  gamepad: boolean;
  checkpointIndex: number;
  totalCheckpoints: number;
  progress: number; // 0..1 along the level
}

export interface FrameInfo {
  speed: number; // m/s
  boost: number; // 0..1 gauge
  boosting: boolean;
  damage: number; // 0..1 red flash
  fps: number;
  airborne: boolean;
  grinding: boolean;
}

type Listener = () => void;
type FrameListener = (f: FrameInfo) => void;

const initialSnapshot: HudSnapshot = {
  state: "title",
  rings: 0,
  score: 0,
  lives: 3,
  time: 0,
  envName: "",
  message: null,
  results: null,
  quality: "high",
  gamepad: false,
  checkpointIndex: 0,
  totalCheckpoints: 0,
  progress: 0,
};

class GameStore {
  private snapshot: HudSnapshot = initialSnapshot;
  private listeners = new Set<Listener>();
  private frameListeners = new Set<FrameListener>();
  private messageId = 0;

  getSnapshot = (): HudSnapshot => this.snapshot;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  subscribeFrame = (l: FrameListener): (() => void) => {
    this.frameListeners.add(l);
    return () => {
      this.frameListeners.delete(l);
    };
  };

  set(partial: Partial<HudSnapshot>): void {
    let changed = false;
    const prev = this.snapshot;
    for (const k in partial) {
      const key = k as keyof HudSnapshot;
      if (prev[key] !== partial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.snapshot = { ...prev, ...partial };
    this.listeners.forEach((l) => l());
  }

  message(text: string, tone: "info" | "good" | "bad" = "info"): void {
    this.messageId++;
    this.set({ message: { text, id: this.messageId, tone } });
  }

  pushFrame(info: FrameInfo): void {
    this.frameListeners.forEach((l) => l(info));
  }

  reset(): void {
    this.snapshot = { ...initialSnapshot, quality: this.snapshot.quality, gamepad: this.snapshot.gamepad };
    this.listeners.forEach((l) => l());
  }
}

export const store = new GameStore();
