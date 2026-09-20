// Unified keyboard + gamepad input with edge detection.
// Edges (pressed flags) are latched until consumed by the simulation, so a
// tap that lands between two physics steps is never lost.

export interface InputState {
  steer: number; // -1 (left) .. 1 (right)
  accel: number; // 0..1 (hold forward)
  brake: number; // 0..1
  jumpHeld: boolean;
  boostHeld: boolean;
  rollHeld: boolean;
  // latched edges
  jumpPressed: boolean;
  pausePressed: boolean;
  confirmPressed: boolean;
  restartPressed: boolean;
}

const DEADZONE = 0.16;

function applyDeadzone(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const n = (a - DEADZONE) / (1 - DEADZONE);
  return Math.sign(v) * Math.min(1, n * n * (3 - 2 * n) * 1.15);
}

export class Input {
  readonly state: InputState = {
    steer: 0,
    accel: 0,
    brake: 0,
    jumpHeld: false,
    boostHeld: false,
    rollHeld: false,
    jumpPressed: false,
    pausePressed: false,
    confirmPressed: false,
    restartPressed: false,
  };

  private keys = new Set<string>();
  private padButtonsPrev: boolean[] = [];
  private padIndex = -1;
  gamepadConnected = false;
  private attached = false;

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      code === "Space" ||
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight" ||
      code === "Tab"
    ) {
      e.preventDefault();
    }
    if (e.repeat) return;
    if (this.keys.has(code)) return;
    this.keys.add(code);
    if (code === "Space" || code === "KeyZ" || code === "KeyK" || code === "Numpad0") this.state.jumpPressed = true;
    if (code === "Escape" || code === "KeyP") this.state.pausePressed = true;
    if (code === "Enter" || code === "Space") this.state.confirmPressed = true;
    if (code === "KeyR") this.state.restartPressed = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  private onPadConnected = (e: GamepadEvent): void => {
    this.padIndex = e.gamepad.index;
    this.gamepadConnected = true;
  };

  private onPadDisconnected = (e: GamepadEvent): void => {
    if (e.gamepad.index === this.padIndex) {
      this.padIndex = -1;
      this.gamepadConnected = false;
      this.padButtonsPrev = [];
    }
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("gamepadconnected", this.onPadConnected);
    window.addEventListener("gamepaddisconnected", this.onPadDisconnected);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("gamepadconnected", this.onPadConnected);
    window.removeEventListener("gamepaddisconnected", this.onPadDisconnected);
  }

  private key(code: string): boolean {
    return this.keys.has(code);
  }

  /** Poll once per rendered frame; merges keyboard and the first active gamepad. */
  poll(): void {
    const s = this.state;
    let steer = 0;
    if (this.key("ArrowLeft") || this.key("KeyA")) steer -= 1;
    if (this.key("ArrowRight") || this.key("KeyD")) steer += 1;
    let accel = this.key("ArrowUp") || this.key("KeyW") ? 1 : 0;
    let brake = this.key("ArrowDown") || this.key("KeyS") ? 1 : 0;
    let jumpHeld = this.key("Space") || this.key("KeyZ") || this.key("KeyK") || this.key("Numpad0");
    let boostHeld = this.key("ShiftLeft") || this.key("ShiftRight") || this.key("KeyX") || this.key("KeyJ");
    let rollHeld = this.key("ControlLeft") || this.key("ControlRight") || this.key("KeyC") || this.key("KeyL");

    // Gamepad (standard mapping)
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    if (this.padIndex >= 0 && pads[this.padIndex]) pad = pads[this.padIndex];
    else {
      for (const p of pads) {
        if (p) {
          pad = p;
          this.padIndex = p.index;
          this.gamepadConnected = true;
          break;
        }
      }
    }
    if (pad) {
      const ax = applyDeadzone(pad.axes[0] ?? 0);
      if (Math.abs(ax) > Math.abs(steer)) steer = ax;
      const btn = (i: number): boolean => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      const val = (i: number): number => (pad.buttons[i] ? pad.buttons[i].value : 0);
      if (btn(14)) steer = -1;
      if (btn(15)) steer = 1;
      accel = Math.max(accel, val(7), btn(12) ? 1 : 0, -Math.min(0, applyDeadzone(pad.axes[1] ?? 0)));
      brake = Math.max(brake, val(6), btn(13) ? 1 : 0, Math.max(0, applyDeadzone(pad.axes[1] ?? 0)));
      jumpHeld = jumpHeld || btn(0);
      boostHeld = boostHeld || btn(2) || btn(5);
      rollHeld = rollHeld || btn(1) || btn(4);

      const now: boolean[] = [];
      for (let i = 0; i < pad.buttons.length; i++) now[i] = btn(i);
      const edge = (i: number): boolean => now[i] && !this.padButtonsPrev[i];
      if (edge(0)) {
        s.jumpPressed = true;
        s.confirmPressed = true;
      }
      if (edge(9)) {
        s.pausePressed = true;
        s.confirmPressed = true;
      }
      if (edge(8)) s.restartPressed = true;
      this.padButtonsPrev = now;
    }

    s.steer = steer;
    s.accel = accel;
    s.brake = brake;
    s.jumpHeld = jumpHeld;
    s.boostHeld = boostHeld;
    s.rollHeld = rollHeld;
  }

  /** Read and clear a latched edge. */
  consume(edge: "jumpPressed" | "pausePressed" | "confirmPressed" | "restartPressed"): boolean {
    const v = this.state[edge];
    this.state[edge] = false;
    return v;
  }

  clearEdges(): void {
    this.state.jumpPressed = false;
    this.state.pausePressed = false;
    this.state.confirmPressed = false;
    this.state.restartPressed = false;
  }
}
