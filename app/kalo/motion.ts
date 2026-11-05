/**
 * Shared motion rules for Kalo. CSS uses the matching tokens in globals.css (--ease-*, --t-*).
 *
 * Springs are described the way Apple does: `response` is roughly how long the motion takes,
 * `damping` 1 means no overshoot. Only motion that the hand started (a throw, a drag release)
 * may overshoot a little; everything else settles calmly.
 */
export type Spring = { response: number; damping: number };

export const springs = {
  /** A card or element returning to rest, no overshoot. */
  settle: { response: 0.36, damping: 1 },
  /** A released drag that carries momentum back, slight overshoot. */
  release: { response: 0.4, damping: 0.82 },
  /** An element coming back into view (undo). */
  enter: { response: 0.42, damping: 0.9 },
} satisfies Record<string, Spring>;

/** A throw keeps the finger's velocity and accelerates out of view (px/s and px/s²). */
export const toss = { minSpeed: 1500, acceleration: 6000 };

/** Advances a damped spring by dt seconds. Starts from the current value and velocity, so it can be interrupted. */
export function stepSpring(x: number, velocity: number, target: number, spring: Spring, dt: number) {
  const stiffness = (2 * Math.PI / spring.response) ** 2;
  const friction = 4 * Math.PI * spring.damping / spring.response;
  const next = velocity + (-stiffness * (x - target) - friction * velocity) * dt;
  return { x: x + next * dt, velocity: next };
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A short tick on devices that support it, only for committed decisions. */
export function haptic() {
  if (typeof navigator !== "undefined") navigator.vibrate?.(8);
}

/** Large text gets smaller type, so long cards stay readable without overflowing. */
export function textSize(text: string): "xl" | "l" | "m" | "s" {
  const length = text.trim().length;
  if (length <= 40) return "xl";
  if (length <= 110) return "l";
  if (length <= 180) return "m";
  return "s";
}

/** True on devices with a precise pointer, where focusing a field does not pop up a keyboard. */
export function finePointer() {
  return typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
}
