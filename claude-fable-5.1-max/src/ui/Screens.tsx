import { useState, useSyncExternalStore, type MutableRefObject } from "react";
import { store, Quality } from "../game/core/store";
import type { Game } from "../game/Game";
import { cn } from "../utils/cn";

interface Props {
  quality: Quality;
  setQuality: (q: Quality) => void;
  game: MutableRefObject<Game | null>;
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t * 100) % 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

const Button = ({ children, onClick, primary, className }: { children: React.ReactNode; onClick: () => void; primary?: boolean; className?: string }) => (
  <button
    onClick={onClick}
    onMouseDown={(e) => e.preventDefault()}
    className={cn(
      "pointer-events-auto rounded-md border px-6 py-3 text-sm font-bold uppercase tracking-[0.3em] transition-all active:scale-95",
      primary
        ? "border-cyan-300 bg-cyan-300 text-slate-900 shadow-[0_0_30px_rgba(103,232,249,0.55)] hover:bg-white hover:shadow-[0_0_40px_rgba(255,255,255,0.6)]"
        : "border-white/30 bg-white/5 text-white hover:border-white hover:bg-white/15",
      className
    )}
  >
    {children}
  </button>
);

const Key = ({ k }: { k: string }) => (
  <kbd className="rounded border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">{k}</kbd>
);

export function Screens({ quality, setQuality, game }: Props) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [muted, setMuted] = useState(false);

  const toggleMute = (): void => {
    setMuted((m) => {
      game.current?.setMuted(!m);
      return !m;
    });
  };

  if (snap.state === "title") {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/50 via-black/20 to-black/70 font-mono text-white">
        <div className="mb-2 text-xs uppercase tracking-[0.6em] text-cyan-200/80">A momentum runner</div>
        <h1 className="bg-gradient-to-b from-white via-cyan-100 to-cyan-400 bg-clip-text text-[80px] font-black leading-none tracking-tighter text-transparent drop-shadow-[0_0_30px_rgba(103,232,249,0.45)] md:text-[120px]">
          ZENITH DASH
        </h1>
        <div className="mt-1 text-sm uppercase tracking-[0.5em] text-white/70">Horizon Circuit · 3 zones · 3 loops</div>

        <div className="mt-10 flex items-center gap-4">
          <Button primary onClick={() => game.current?.startGame()}>
            Start Run
          </Button>
          <Button onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</Button>
        </div>

        <div className="pointer-events-auto mt-8 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/70">
          <span className="mr-2">Quality</span>
          {(["low", "medium", "high"] as Quality[]).map((q) => (
            <button
              key={q}
              onClick={() => setQuality(q)}
              className={cn(
                "rounded border px-3 py-1 transition-colors",
                q === quality ? "border-cyan-300 bg-cyan-300/20 text-cyan-100" : "border-white/20 text-white/60 hover:border-white/60"
              )}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mt-10 grid max-w-3xl grid-cols-2 gap-x-12 gap-y-2 text-xs text-white/75 md:grid-cols-3">
          <div>
            <Key k="A" /> <Key k="D" /> / <Key k="←" /> <Key k="→" /> steer
          </div>
          <div>
            <Key k="W" /> accelerate · <Key k="S" /> brake
          </div>
          <div>
            <Key k="Space" /> jump · in air: homing attack
          </div>
          <div>
            <Key k="Shift" /> boost (uses gauge)
          </div>
          <div>
            <Key k="Ctrl" /> roll: attack, duck bars, faster downhill
          </div>
          <div>
            <Key k="Esc" /> pause · <Key k="R" /> restart
          </div>
        </div>
        <div className="mt-6 text-[11px] uppercase tracking-[0.3em] text-white/45">
          Gamepad: stick steer · A jump · X / RB boost · B / LB roll · RT accel · LT brake
          {snap.gamepad && <span className="ml-3 text-emerald-300">● connected</span>}
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-[0.3em] text-white/45">Press Enter / Start to begin</div>
      </div>
    );
  }

  if (snap.state === "paused") {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/55 font-mono text-white backdrop-blur-[2px]">
        <div className="text-5xl font-black uppercase tracking-[0.3em]">Paused</div>
        <div className="mt-8 flex gap-4">
          <Button primary onClick={() => game.current?.togglePause()}>
            Resume
          </Button>
          <Button onClick={() => game.current?.restart()}>Restart</Button>
          <Button onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</Button>
          <Button onClick={() => game.current?.quitToTitle()}>Quit</Button>
        </div>
      </div>
    );
  }

  if (snap.state === "gameover") {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/60 font-mono text-white">
        <div className="text-6xl font-black uppercase tracking-[0.3em] text-red-400">Game Over</div>
        <div className="mt-3 text-sm uppercase tracking-[0.4em] text-white/70">Score {snap.score.toLocaleString()}</div>
        <div className="mt-8 flex gap-4">
          <Button primary onClick={() => game.current?.restart()}>
            Try Again
          </Button>
          <Button onClick={() => game.current?.quitToTitle()}>Title</Button>
        </div>
      </div>
    );
  }

  if (snap.state === "results" && snap.results) {
    const r = snap.results;
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/55 font-mono text-white">
        <div className="text-xs uppercase tracking-[0.6em] text-cyan-200/80">Horizon Circuit</div>
        <div className="mt-1 text-5xl font-black uppercase tracking-[0.2em]">Course Clear</div>
        <div className="mt-8 grid grid-cols-[auto_auto] gap-x-10 gap-y-2 text-lg tabular-nums">
          <span className="text-white/60">Time</span>
          <span className="text-right">{formatTime(r.time)}</span>
          <span className="text-white/60">Rings</span>
          <span className="text-right">{r.rings}</span>
          <span className="text-white/60">Enemies</span>
          <span className="text-right">{r.enemies}</span>
          <span className="text-white/60">Top speed</span>
          <span className="text-right">{Math.round(r.maxSpeed * 3.6)} km/h</span>
          <span className="text-white/60">Total score</span>
          <span className="text-right font-bold text-amber-300">{r.score.toLocaleString()}</span>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <span className="text-sm uppercase tracking-[0.4em] text-white/60">Rank</span>
          <span
            className={cn(
              "text-8xl font-black leading-none drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]",
              r.rank === "S" ? "text-amber-300" : r.rank === "A" ? "text-cyan-300" : r.rank === "B" ? "text-emerald-300" : "text-white"
            )}
          >
            {r.rank}
          </span>
        </div>
        <div className="mt-8 flex gap-4">
          <Button primary onClick={() => game.current?.restart()}>
            Run Again
          </Button>
          <Button onClick={() => game.current?.quitToTitle()}>Title</Button>
        </div>
      </div>
    );
  }

  return null;
}
