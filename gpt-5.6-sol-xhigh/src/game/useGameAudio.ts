import { useCallback, useMemo, useRef } from "react";
import type { AudioBus } from "./types";

export function useGameAudio(enabled: boolean): AudioBus {
  const context = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);

  const unlock = useCallback(() => {
    if (!enabled) return;
    if (!context.current) {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return;
      try {
        context.current = new AudioContextClass();
        master.current = context.current.createGain();
        master.current.gain.value = 0.13;
        master.current.connect(context.current.destination);
      } catch {
        return;
      }
    }
    if (context.current.state === "suspended") void context.current.resume();
  }, [enabled]);

  const tone = useCallback(
    (frequency: number, duration: number, type: OscillatorType, sweep = 1, volume = 0.16) => {
      if (!enabled) return;
      unlock();
      const ctx = context.current;
      const output = master.current;
      if (!ctx || !output) return;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * sweep), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    },
    [enabled, unlock],
  );

  return useMemo(
    () => ({
      unlock,
      jump: () => tone(180, 0.18, "triangle", 2.25, 0.12),
      ring: (combo: number) => tone(680 + (combo % 8) * 42, 0.08, "sine", 1.35, 0.1),
      hit: () => tone(150, 0.32, "sawtooth", 0.28, 0.2),
      boost: () => tone(120, 0.28, "sawtooth", 3.1, 0.08),
      checkpoint: () => tone(340, 0.5, "triangle", 2.4, 0.14),
      enemy: () => tone(220, 0.14, "square", 0.45, 0.1),
      finish: () => tone(260, 0.8, "triangle", 3.4, 0.16),
    }),
    [tone, unlock],
  );
}