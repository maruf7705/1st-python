import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { store } from "../game/core/store";
import { PHYS } from "../game/Player";
import { cn } from "../utils/cn";

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t * 10) % 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

export function HUD() {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const speedText = useRef<HTMLSpanElement>(null);
  const speedBar = useRef<HTMLDivElement>(null);
  const boostBar = useRef<HTMLDivElement>(null);
  const boostWrap = useRef<HTMLDivElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);
  const [toast, setToast] = useState<{ text: string; id: number; tone: string } | null>(null);
  const [ringPulse, setRingPulse] = useState(0);
  const prevRings = useRef(0);

  useEffect(() => {
    return store.subscribeFrame((f) => {
      const kmh = Math.round(f.speed * 3.6);
      if (speedText.current) speedText.current.textContent = kmh.toString();
      const n = Math.min(1, f.speed / PHYS.ABS_MAX);
      if (speedBar.current) {
        speedBar.current.style.transform = `scaleX(${n})`;
        speedBar.current.style.background = f.boosting
          ? "linear-gradient(90deg,#ffb347,#ff5e3a)"
          : "linear-gradient(90deg,#39d0ff,#7cf5ff)";
      }
      if (boostBar.current) boostBar.current.style.transform = `scaleX(${f.boost})`;
      if (boostWrap.current) boostWrap.current.style.boxShadow = f.boosting ? "0 0 22px 4px rgba(255,140,60,0.55)" : "none";
      if (fpsRef.current) fpsRef.current.textContent = `${f.fps} FPS`;
      if (stateRef.current) stateRef.current.textContent = f.grinding ? "GRIND" : f.airborne ? "AIR" : f.boosting ? "BOOST" : "RUN";
    });
  }, []);

  useEffect(() => {
    if (!snap.message) return;
    setToast(snap.message);
    const id = window.setTimeout(() => setToast((t) => (t && t.id === snap.message?.id ? null : t)), 1800);
    return () => window.clearTimeout(id);
  }, [snap.message]);

  useEffect(() => {
    if (snap.rings > prevRings.current) {
      setRingPulse((p) => p + 1);
    }
    prevRings.current = snap.rings;
  }, [snap.rings]);

  const visible = snap.state === "playing" || snap.state === "paused" || snap.state === "dead";
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-white">
      {/* top left: rings / score / time */}
      <div className="absolute left-5 top-5 flex flex-col gap-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-3">
          <div
            key={ringPulse}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border-[5px] border-amber-400 bg-amber-300/10 shadow-[0_0_14px_rgba(251,191,36,0.6)]",
              ringPulse > 0 && "animate-[ping_0.35s_ease-out_1]"
            )}
          />
          <span className={cn("text-4xl font-black tabular-nums tracking-tight", snap.rings === 0 && "animate-pulse text-red-400")}>
            {snap.rings.toString().padStart(3, "0")}
          </span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-white/60">Score</div>
        <div className="text-2xl font-bold tabular-nums">{snap.score.toLocaleString()}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-white/60">Time</div>
        <div className="text-2xl font-bold tabular-nums">{formatTime(snap.time)}</div>
      </div>

      {/* top right: lives / env / fps */}
      <div className="absolute right-5 top-5 flex flex-col items-end gap-1 text-right drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.max(0, snap.lives) }).map((_, i) => (
            <div key={i} className="h-4 w-4 rotate-45 rounded-sm bg-gradient-to-br from-sky-300 to-blue-600 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
          ))}
          <span className="ml-1 text-sm uppercase tracking-widest text-white/70">Lives</span>
        </div>
        <div className="mt-2 text-xs uppercase tracking-[0.35em] text-white/60">Zone</div>
        <div className="text-lg font-bold uppercase tracking-wider">{snap.envName}</div>
        <div className="mt-2 text-xs uppercase tracking-[0.3em] text-white/60">
          Checkpoint {snap.checkpointIndex}/{snap.totalCheckpoints}
        </div>
        <span ref={fpsRef} className="mt-1 text-[10px] tracking-widest text-white/40" />
      </div>

      {/* progress bar */}
      <div className="absolute left-1/2 top-4 h-1.5 w-[38%] -translate-x-1/2 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-white" style={{ width: `${snap.progress * 100}%` }} />
      </div>

      {/* toast */}
      {toast && (
        <div
          key={toast.id}
          className={cn(
            "absolute left-1/2 top-[22%] -translate-x-1/2 animate-[toastIn_0.25s_ease-out] text-3xl font-black uppercase tracking-[0.25em] drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]",
            toast.tone === "good" && "text-emerald-300",
            toast.tone === "bad" && "text-red-400",
            toast.tone === "info" && "text-white"
          )}
        >
          {toast.text}
        </div>
      )}

      {/* bottom right: speedometer & boost */}
      <div className="absolute bottom-6 right-6 flex w-[300px] flex-col items-end gap-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
        <div className="flex items-baseline gap-2">
          <span ref={stateRef} className="rounded bg-white/10 px-2 py-0.5 text-[10px] tracking-[0.3em] text-white/70" />
          <span ref={speedText} className="text-6xl font-black tabular-nums leading-none">
            0
          </span>
          <span className="text-sm uppercase tracking-widest text-white/60">km/h</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-sm bg-white/10 [clip-path:polygon(4%_0,100%_0,100%_100%,0_100%)]">
          <div ref={speedBar} className="h-full w-full origin-left bg-cyan-300" style={{ transform: "scaleX(0)" }} />
        </div>
        <div className="flex w-full items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">Boost</span>
          <div ref={boostWrap} className="h-2 flex-1 overflow-hidden rounded-sm bg-white/10 transition-shadow">
            <div ref={boostBar} className="h-full w-full origin-left bg-gradient-to-r from-orange-400 to-yellow-300" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>
      </div>

      {/* bottom left: controls hint */}
      <div className="absolute bottom-6 left-6 text-[11px] uppercase tracking-[0.2em] text-white/45">
        <div>A/D steer · Space jump (air: homing) · Shift boost · Ctrl roll · S brake</div>
        <div className="mt-1">Esc pause · R restart{snap.gamepad ? " · 🎮 connected" : ""}</div>
      </div>
    </div>
  );
}
