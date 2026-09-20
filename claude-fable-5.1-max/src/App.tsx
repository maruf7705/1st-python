import { useEffect, useRef, useState } from "react";
import { Game } from "./game/Game";
import { Quality } from "./game/core/store";
import { HUD } from "./ui/HUD";
import { Screens } from "./ui/Screens";

function autoQuality(): Quality {
  if (typeof window === "undefined") return "medium";
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return "low";
  if (cores >= 8 && dpr <= 2) return "high";
  return "medium";
}

function GameCanvas({ quality, onReady }: { quality: Quality; onReady: (g: Game | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let game: Game | null = null;
    try {
      game = new Game(canvas, quality);
      onReady(game);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to initialise WebGL");
    }
    return () => {
      onReady(null);
      game?.dispose();
    };
  }, [quality, onReady]);

  return (
    <div className="absolute inset-0">
      <canvas ref={ref} className="block h-full w-full" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black p-8 text-center font-mono text-white">
          <div>
            <div className="text-xl font-bold">Could not start the renderer</div>
            <div className="mt-2 text-white/70">{error}</div>
            <div className="mt-2 text-white/50">WebGL 2 is required.</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [quality, setQuality] = useState<Quality>(() => autoQuality());
  const gameRef = useRef<Game | null>(null);
  const onReady = useRef((g: Game | null) => {
    gameRef.current = g;
  }).current;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black">
      <GameCanvas quality={quality} onReady={onReady} />
      <HUD />
      <Screens quality={quality} setQuality={setQuality} game={gameRef} />
    </div>
  );
}
