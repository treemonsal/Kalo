"use client";

import { readStored } from "./storage";

/**
 * Short synthesised tones, no audio files. Each sound has one meaning and plays on the same frame as its visual.
 * Off when the person turns sound off in the settings.
 */
type Tone = { frequency: number; at: number; length: number; gain?: number; type?: OscillatorType };
const patterns: Record<string, Tone[]> = {
  correct: [{ frequency: 660, at: 0, length: 0.09 }, { frequency: 880, at: 0.07, length: 0.14 }],
  wrong: [{ frequency: 220, at: 0, length: 0.16, gain: 0.05, type: "triangle" }],
  gold: [{ frequency: 880, at: 0, length: 0.08 }, { frequency: 1175, at: 0.06, length: 0.08 }, { frequency: 1568, at: 0.12, length: 0.22 }],
  combo: [{ frequency: 784, at: 0, length: 0.07 }, { frequency: 988, at: 0.06, length: 0.07 }, { frequency: 1319, at: 0.12, length: 0.16 }],
  mastered: [{ frequency: 523, at: 0, length: 0.12 }, { frequency: 784, at: 0.1, length: 0.22 }],
  goal: [{ frequency: 523, at: 0, length: 0.12 }, { frequency: 659, at: 0.12, length: 0.12 }, { frequency: 784, at: 0.24, length: 0.12 }, { frequency: 1047, at: 0.36, length: 0.32 }],
  swipe: [{ frequency: 520, at: 0, length: 0.05, gain: 0.03 }],
};
export type Sound = keyof typeof patterns;
export const SOUND_KEY = "kalo-sound";

let context: AudioContext | null = null;

export function soundOn() {
  return readStored(SOUND_KEY) !== "off";
}

export function play(sound: Sound) {
  if (typeof window === "undefined" || !soundOn()) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + 0.01;
    for (const tone of patterns[sound]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.type ?? "sine";
      oscillator.frequency.value = tone.frequency;
      const peak = tone.gain ?? 0.07;
      gain.gain.setValueAtTime(0, start + tone.at);
      gain.gain.linearRampToValueAtTime(peak, start + tone.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.at + tone.length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + tone.at);
      oscillator.stop(start + tone.at + tone.length + 0.02);
    }
  } catch { /* Audio is a bonus, never a requirement. */ }
}
