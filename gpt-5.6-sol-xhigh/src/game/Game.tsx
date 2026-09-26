import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useRef } from "react";
import * as THREE from "three";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { GameScene } from "./GameScene";
import { pollInput } from "./useGameInput";
import type { AudioBus, GamePhase, GameState, HudState, InputState } from "./types";
import {
  BOOST_PADS,
  CHECKPOINTS,
  COURSE_LENGTH,
  ENEMIES,
  LOOP_LENGTH,
  LOOP_START,
  OBSTACLES,
  RAILS,
  RAMPS,
  RINGS,
  TRACK_HALF_WIDTH,
  enemyLateral,
  tangentRise,
  zoneAt,
} from "./world";

const FIXED_STEP = 1 / 120;
const MAX_STEPS = 8;

export function createGameState(phase: GamePhase = "menu"): GameState {
  return {
    phase,
    distance: 0,
    renderDistance: 0,
    speed: phase === "running" ? 44 : 0,
    x: 0,
    renderX: 0,
    vx: 0,
    y: 0,
    renderY: 0,
    vy: 0,
    grounded: true,
    onRail: false,
    railId: -1,
    boosting: false,
    boost: 64,
    rings: 0,
    score: 0,
    combo: 0,
    health: 3,
    elapsed: 0,
    checkpoint: 0,
    invulnerable: 0,
    coyote: 0.1,
    jumpBuffer: 0,
    shake: 0,
    respawnTimer: 0,
    toast: "",
    toastUntil: 0,
    collected: new Set(),
    destroyed: new Set(),
    triggered: new Set(),
  };
}

export function hudFromState(state: GameState): HudState {
  return {
    phase: state.phase,
    speed: state.speed,
    boost: state.boost,
    rings: state.rings,
    score: Math.floor(state.score),
    combo: state.combo,
    health: state.health,
    elapsed: state.elapsed,
    distance: state.distance,
    checkpoint: state.checkpoint,
    zone: zoneAt(state.distance),
    toast: state.elapsed < state.toastUntil ? state.toast : "",
    progress: THREE.MathUtils.clamp(state.distance / COURSE_LENGTH, 0, 1),
  };
}

function moveToward(current: number, target: number, amount: number) {
  if (current < target) return Math.min(current + amount, target);
  return Math.max(current - amount, target);
}

function showToast(state: GameState, text: string, duration = 1.4) {
  state.toast = text;
  state.toastUntil = state.elapsed + duration;
}

function damagePlayer(state: GameState, audio: AudioBus) {
  if (state.invulnerable > 0 || state.phase !== "running") return;
  state.health -= 1;
  state.rings = Math.max(0, state.rings - 10);
  state.combo = 0;
  state.speed = Math.max(31, state.speed * 0.56);
  state.vy = 7;
  state.y = Math.max(state.y, 0.15);
  state.invulnerable = 1.6;
  state.shake = 1.35;
  audio.hit();

  if (state.health <= 0) {
    state.phase = "respawning";
    state.respawnTimer = 1.15;
    state.boosting = false;
    showToast(state, "SIGNAL LOST", 1.1);
  } else {
    showToast(state, "IMPACT // -10 SHARDS");
  }
}

function recoverAtCheckpoint(state: GameState) {
  state.distance = Math.min(state.checkpoint + 2, COURSE_LENGTH - 10);
  state.renderDistance = state.distance;
  state.speed = 43;
  state.x = 0;
  state.renderX = 0;
  state.vx = 0;
  state.y = 0;
  state.renderY = 0;
  state.vy = 0;
  state.grounded = true;
  state.onRail = false;
  state.railId = -1;
  state.health = 3;
  state.boost = Math.max(38, state.boost);
  state.invulnerable = 2;
  state.score = Math.max(0, state.score - 1250);
  state.phase = "running";
  showToast(state, "CHECKPOINT RESTORE", 1.6);
}

function updateForwardMotion(state: GameState, input: InputState, dt: number, audio: AudioBus) {
  const wasBoosting = state.boosting;
  state.boosting = input.boost && state.boost > 0.1 && !input.brake;
  let targetSpeed = input.brake ? 34 : input.accelerate ? 86 : 68;
  if (state.boosting) {
    targetSpeed = 124;
    state.boost = Math.max(0, state.boost - 27 * dt);
    if (!wasBoosting) audio.boost();
  } else {
    state.boost = Math.min(100, state.boost + 1.6 * dt);
  }

  const acceleration = state.speed < targetSpeed ? (state.boosting ? 40 : 18) : 13;
  state.speed = moveToward(state.speed, targetSpeed, acceleration * dt);
  state.speed -= tangentRise(state.distance) * 19 * dt;

  const inLoop = state.distance > LOOP_START - 3 && state.distance < LOOP_START + LOOP_LENGTH + 3;
  if (inLoop) state.speed = Math.max(state.speed, 49);
  state.speed = THREE.MathUtils.clamp(state.speed, 28, 126);
}

function updateLateralMotion(state: GameState, input: InputState, dt: number) {
  if (state.onRail) {
    const rail = RAILS.find((item) => item.id === state.railId);
    if (rail) {
      state.x = THREE.MathUtils.damp(state.x, rail.x, 24, dt);
      state.vx = 0;
    }
    return;
  }

  if (Math.abs(input.steer) > 0.01) {
    state.vx += input.steer * 45 * dt;
  } else {
    state.vx *= Math.exp(-8.5 * dt);
  }
  state.vx = THREE.MathUtils.clamp(state.vx, -13.5, 13.5);
  state.x += state.vx * dt;

  const edge = TRACK_HALF_WIDTH - 0.48;
  if (Math.abs(state.x) > edge) {
    state.x = Math.sign(state.x) * edge;
    state.vx *= -0.16;
    state.speed = Math.max(31, state.speed - 3.5);
  }
}

function updateVerticalMotion(state: GameState, dt: number, audio: AudioBus) {
  if (state.onRail) {
    const rail = RAILS.find((item) => item.id === state.railId);
    if (!rail || state.distance > rail.end) {
      state.onRail = false;
      state.railId = -1;
      state.vy = 6.5;
      showToast(state, "RAIL RELEASE");
    } else if (state.jumpBuffer > 0) {
      state.onRail = false;
      state.railId = -1;
      state.vy = 13;
      state.jumpBuffer = 0;
      audio.jump();
    } else {
      state.y = rail.height;
      state.vy = 0;
      state.grounded = false;
      state.speed = Math.min(126, state.speed + 6 * dt);
      return;
    }
  }

  if (state.grounded) state.coyote = 0.11;
  else state.coyote = Math.max(0, state.coyote - dt);

  if (state.jumpBuffer > 0 && (state.grounded || state.coyote > 0)) {
    state.vy = 15.8;
    state.grounded = false;
    state.coyote = 0;
    state.jumpBuffer = 0;
    audio.jump();
  }

  if (!state.grounded) {
    state.vy -= 38 * dt;
    state.y += state.vy * dt;
    if (state.y <= 0) {
      state.y = 0;
      state.vy = 0;
      state.grounded = true;
    }
  }
}

function checkTrackFeatures(state: GameState, previousDistance: number, audio: AudioBus) {
  for (const ramp of RAMPS) {
    if (
      previousDistance < ramp.d &&
      state.distance >= ramp.d &&
      Math.abs(state.x - ramp.x) < ramp.width * 0.55 &&
      state.y < 0.35
    ) {
      state.vy = ramp.power;
      state.y = 0.08;
      state.grounded = false;
      state.speed = Math.min(126, state.speed + 8);
      audio.jump();
      showToast(state, "RAMP VECTOR");
    }
  }

  if (!state.onRail) {
    for (const rail of RAILS) {
      if (
        state.distance >= rail.start &&
        state.distance <= rail.end &&
        Math.abs(state.x - rail.x) < 0.72 &&
        state.y > rail.height - 1.25 &&
        state.y < rail.height + 1.65
      ) {
        state.onRail = true;
        state.railId = rail.id;
        state.y = rail.height;
        state.vy = 0;
        state.score += 350;
        showToast(state, "MAG-RAIL LOCK");
        break;
      }
    }
  }

  for (const pad of BOOST_PADS) {
    if (previousDistance < pad.d && state.distance >= pad.d && Math.abs(state.x - pad.x) < 1.25) {
      state.speed = Math.max(state.speed, 98);
      state.boost = Math.min(100, state.boost + 22);
      state.score += 250;
      audio.boost();
      showToast(state, "IMPULSE PAD");
    }
  }

  for (const checkpoint of CHECKPOINTS) {
    const key = `checkpoint-${checkpoint}`;
    if (previousDistance < checkpoint && state.distance >= checkpoint && !state.triggered.has(key)) {
      state.triggered.add(key);
      state.checkpoint = checkpoint;
      state.boost = Math.min(100, state.boost + 18);
      state.health = Math.min(3, state.health + 1);
      state.score += 1000;
      audio.checkpoint();
      showToast(state, `CHECKPOINT ${CHECKPOINTS.indexOf(checkpoint) + 1} SYNCED`, 1.8);
    }
  }
}

function checkCollectiblesAndHazards(state: GameState, previousDistance: number, audio: AudioBus) {
  for (const ring of RINGS) {
    if (state.collected.has(ring.id)) continue;
    if (ring.d < previousDistance - 0.25 || ring.d > state.distance + 0.8) continue;
    const vertical = Math.abs(0.9 + state.y - ring.y);
    if (Math.abs(state.x - ring.x) < 0.9 && vertical < 1.12) {
      state.collected.add(ring.id);
      state.rings += 1;
      state.combo = Math.min(99, state.combo + 1);
      state.boost = Math.min(100, state.boost + 1.3);
      state.score += 100 + state.combo * 6;
      audio.ring(state.combo);
    }
  }

  for (const obstacle of OBSTACLES) {
    if (obstacle.d < previousDistance || obstacle.d > state.distance + 0.72) continue;
    if (Math.abs(state.x - obstacle.x) < obstacle.width * 0.55 + 0.3 && state.y < 1.12) {
      damagePlayer(state, audio);
      return;
    }
  }

  for (const enemy of ENEMIES) {
    if (state.destroyed.has(enemy.id)) continue;
    if (enemy.d < previousDistance || enemy.d > state.distance + 0.9) continue;
    const enemyX = enemyLateral(enemy, state.elapsed);
    if (Math.abs(state.x - enemyX) < 1.05) {
      if (state.y > 0.82 || state.onRail) {
        state.destroyed.add(enemy.id);
        state.vy = Math.max(9.5, state.vy);
        state.grounded = false;
        state.score += 650 + state.combo * 20;
        state.combo = Math.min(99, state.combo + 4);
        state.boost = Math.min(100, state.boost + 8);
        audio.enemy();
        showToast(state, "DRONE DISRUPTED");
      } else {
        damagePlayer(state, audio);
        return;
      }
    }
  }
}

function fixedUpdate(state: GameState, input: InputState, audio: AudioBus, dt: number) {
  const previousDistance = state.distance;
  state.elapsed += dt;
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
  state.shake = Math.max(0, state.shake - dt * 3.4);

  updateForwardMotion(state, input, dt, audio);
  updateLateralMotion(state, input, dt);
  updateVerticalMotion(state, dt, audio);
  state.distance += state.speed * dt;
  state.score += state.speed * dt * (3.2 + state.combo * 0.025);

  checkTrackFeatures(state, previousDistance, audio);
  checkCollectiblesAndHazards(state, previousDistance, audio);

  if (state.distance >= COURSE_LENGTH - 4 && state.phase === "running") {
    state.distance = COURSE_LENGTH - 4;
    state.speed = 0;
    state.boosting = false;
    state.phase = "finished";
    state.score += Math.max(0, 120000 - state.elapsed * 620) + state.rings * 75;
    showToast(state, "VECTOR COMPLETE", 20);
    audio.finish();
  }
}

interface EngineProps {
  stateRef: RefObject<GameState>;
  inputRef: RefObject<InputState>;
  setHud: Dispatch<SetStateAction<HudState>>;
  audio: AudioBus;
}

function GameEngine({ stateRef, inputRef, setHud, audio }: EngineProps) {
  const accumulator = useRef(0);
  const hudTimer = useRef(0);
  const previousPhase = useRef<GamePhase>(stateRef.current?.phase ?? "menu");

  useFrame((_, rawDelta) => {
    const state = stateRef.current;
    const input = inputRef.current;
    if (!state || !input) return;
    const delta = Math.min(rawDelta, 0.05);
    pollInput(input);

    if (input.pauseQueued) {
      input.pauseQueued = false;
      if (state.phase === "running") state.phase = "paused";
      else if (state.phase === "paused") state.phase = "running";
    }

    if (input.jumpQueued) {
      if (state.phase === "running") state.jumpBuffer = 0.13;
      input.jumpQueued = false;
    }

    if (state.phase === "respawning") {
      state.respawnTimer -= delta;
      state.speed = moveToward(state.speed, 0, 52 * delta);
      state.shake = Math.max(0, state.shake - delta * 2);
      if (state.respawnTimer <= 0) recoverAtCheckpoint(state);
      accumulator.current = 0;
    } else if (state.phase === "running") {
      accumulator.current = Math.min(accumulator.current + delta, FIXED_STEP * MAX_STEPS);
      let steps = 0;
      while (accumulator.current >= FIXED_STEP && steps < MAX_STEPS && state.phase === "running") {
        fixedUpdate(state, input, audio, FIXED_STEP);
        accumulator.current -= FIXED_STEP;
        steps += 1;
      }
      const prediction = Math.min(accumulator.current, FIXED_STEP);
      state.renderDistance = Math.min(COURSE_LENGTH - 4, state.distance + state.speed * prediction);
      state.renderX = THREE.MathUtils.clamp(state.x + state.vx * prediction, -TRACK_HALF_WIDTH, TRACK_HALF_WIDTH);
      state.renderY = Math.max(0, state.y + state.vy * prediction);
    } else {
      accumulator.current = 0;
      state.renderDistance = state.distance;
      state.renderX = state.x;
      state.renderY = state.y;
    }

    hudTimer.current -= delta;
    if (hudTimer.current <= 0 || previousPhase.current !== state.phase) {
      setHud(hudFromState(state));
      hudTimer.current = 0.066;
      previousPhase.current = state.phase;
    }
  }, -20);
  return null;
}

interface GameCanvasProps extends EngineProps {
  className?: string;
}

export const GameCanvas = memo(function GameCanvas({ stateRef, inputRef, setHud, audio, className }: GameCanvasProps) {
  return (
    <Canvas
      className={className}
      dpr={[1, 1.5]}
      camera={{ fov: 66, near: 0.1, far: 520, position: [0, 5, -12] }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
      }}
    >
      <GameEngine stateRef={stateRef} inputRef={inputRef} setHud={setHud} audio={audio} />
      <GameScene stateRef={stateRef} />
    </Canvas>
  );
});