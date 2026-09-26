import { useCallback, useEffect, useRef, useState } from "react";
import { createGameState, GameCanvas, hudFromState } from "./game/Game";
import type { GameState } from "./game/types";
import { useGameAudio } from "./game/useGameAudio";
import { useGameInput } from "./game/useGameInput";

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

export default function App() {
  const stateRef = useRef<GameState>(createGameState());
  const inputRef = useGameInput();
  const [hud, setHud] = useState(() => hudFromState(stateRef.current));
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audio = useGameAudio(soundEnabled);

  useEffect(() => {
    document.title = "Vanta Vector | High-Speed 3D Runner";
  }, []);

  const startRun = useCallback(() => {
    audio.unlock();
    inputRef.current.keys.clear();
    inputRef.current.jumpQueued = false;
    inputRef.current.pauseQueued = false;
    stateRef.current = createGameState("running");
    setHud(hudFromState(stateRef.current));
  }, [audio, inputRef]);

  const resumeRun = useCallback(() => {
    stateRef.current.phase = "running";
    setHud(hudFromState(stateRef.current));
  }, []);

  const pauseRun = useCallback(() => {
    if (stateRef.current.phase !== "running") return;
    stateRef.current.phase = "paused";
    setHud(hudFromState(stateRef.current));
  }, []);

  const returnToMenu = useCallback(() => {
    stateRef.current = createGameState("menu");
    setHud(hudFromState(stateRef.current));
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((enabled) => !enabled);
  }, []);

  const setTouchSteer = (direction: number) => {
    inputRef.current.touchSteer = direction;
  };

  const queueJump = () => {
    inputRef.current.jumpQueued = true;
  };

  const setTouchBoost = (active: boolean) => {
    inputRef.current.touchBoost = active;
  };

  const inGame = hud.phase !== "menu";
  const showHud = hud.phase === "running" || hud.phase === "respawning";

  return (
    <main className="game-shell">
      <GameCanvas stateRef={stateRef} inputRef={inputRef} setHud={setHud} audio={audio} className="game-canvas" />
      <div className="screen-vignette" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      {showHud && (
        <div className="hud" aria-live="polite">
          <div className="hud-progress" aria-label={`${Math.round(hud.progress * 100)} percent complete`}>
            <span style={{ transform: `scaleX(${hud.progress})` }} />
          </div>

          <header className="hud-top">
            <div className="hud-brand">
              <span className="hud-brand-mark">V</span>
              <div>
                <strong>VANTA VECTOR</strong>
                <small>RUN 01 / {hud.zone.toUpperCase()}</small>
              </div>
            </div>

            <div className="hud-score">
              <span>SCORE</span>
              <strong>{hud.score.toString().padStart(7, "0")}</strong>
            </div>

            <div className="hud-status">
              <div className="health" aria-label={`${hud.health} integrity remaining`}>
                {[0, 1, 2].map((index) => (
                  <span key={index} className={index < hud.health ? "active" : ""} />
                ))}
              </div>
              <button className="icon-button" type="button" onClick={pauseRun} aria-label="Pause run">
                II
              </button>
            </div>
          </header>

          <div className="hud-lower-left">
            <div className="speed-readout">
              <strong>{Math.round(hud.speed * 3.6)}</strong>
              <span>KM/H</span>
            </div>
            <div className="run-meta">
              <span>{formatTime(hud.elapsed)}</span>
              <span>{Math.floor(hud.distance)} M</span>
            </div>
          </div>

          <div className="hud-lower-center">
            <div className="boost-label">
              <span>VECTOR BOOST</span>
              <strong>{Math.round(hud.boost)}%</strong>
            </div>
            <div className="boost-track">
              <span style={{ transform: `scaleX(${hud.boost / 100})` }} />
            </div>
          </div>

          <div className="hud-lower-right">
            <div className="shard-count">
              <span className="shard-icon" />
              <strong>{hud.rings.toString().padStart(3, "0")}</strong>
            </div>
            {hud.combo > 2 && <span className="combo">CHAIN x{hud.combo}</span>}
          </div>

          {hud.toast && <div className="event-toast">{hud.toast}</div>}

          <div className="touch-controls" aria-label="Touch controls">
            <div className="touch-steer">
              <button type="button" onPointerDown={() => setTouchSteer(-1)} aria-label="Steer left">
                L
              </button>
              <button type="button" onPointerDown={() => setTouchSteer(1)} aria-label="Steer right">
                R
              </button>
            </div>
            <div className="touch-actions">
              <button type="button" onPointerDown={queueJump} aria-label="Jump">
                JUMP
              </button>
              <button
                type="button"
                onPointerDown={() => setTouchBoost(true)}
                onPointerUp={() => setTouchBoost(false)}
                aria-label="Boost"
              >
                BOOST
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "menu" && (
        <section className="title-screen">
          <div className="title-copy">
            <p className="eyebrow">KINETIC RUNNER / PROTOCOL 01</p>
            <h1>
              <span>VANTA</span>
              VECTOR
            </h1>
            <p className="title-description">
              Hold the line through gravity loops, mag-rails, and three collapsing horizons.
            </p>
            <div className="title-actions">
              <button className="primary-action" type="button" onClick={startRun}>
                <span>START RUN</span>
                <span className="action-arrow">-&gt;</span>
              </button>
              <button className="sound-action" type="button" onClick={toggleSound}>
                AUDIO {soundEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          <div className="control-legend">
            <span><kbd>A D</kbd> STEER</span>
            <span><kbd>SPACE</kbd> JUMP</span>
            <span><kbd>SHIFT</kbd> BOOST</span>
            <span><kbd>PAD</kbd> SUPPORTED</span>
          </div>
        </section>
      )}

      {hud.phase === "paused" && (
        <section className="modal-screen pause-screen">
          <p className="eyebrow">SIMULATION SUSPENDED</p>
          <h2>PAUSED</h2>
          <div className="modal-actions">
            <button className="primary-action compact" type="button" onClick={resumeRun}>
              RESUME
            </button>
            <button className="text-action" type="button" onClick={startRun}>
              RESTART RUN
            </button>
            <button className="text-action" type="button" onClick={returnToMenu}>
              EXIT TO TITLE
            </button>
          </div>
        </section>
      )}

      {hud.phase === "respawning" && (
        <div className="respawn-screen">
          <span>RECONSTRUCTING VECTOR</span>
        </div>
      )}

      {hud.phase === "finished" && (
        <section className="modal-screen finish-screen">
          <p className="eyebrow">COURSE SECURED</p>
          <h2>VECTOR COMPLETE</h2>
          <div className="results-line">
            <span><small>FINAL TIME</small>{formatTime(hud.elapsed)}</span>
            <span><small>SHARDS</small>{hud.rings}</span>
            <span><small>SCORE</small>{hud.score.toLocaleString()}</span>
          </div>
          <div className="modal-actions horizontal">
            <button className="primary-action compact" type="button" onClick={startRun}>
              RUN AGAIN
            </button>
            <button className="text-action" type="button" onClick={returnToMenu}>
              TITLE
            </button>
          </div>
        </section>
      )}

      {inGame && hud.phase !== "finished" && (
        <button className="audio-toggle" type="button" onClick={toggleSound} aria-label="Toggle sound">
          AUDIO {soundEnabled ? "ON" : "OFF"}
        </button>
      )}
    </main>
  );
}