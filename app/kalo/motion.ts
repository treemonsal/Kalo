import { dimThemeColor } from "./theme";

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

let hapticSwitch: HTMLLabelElement | null = null;

/**
 * A short tick, only for committed decisions. Android supports vibrate(). Safari on the iPhone does not, but since
 * iOS 18 toggling a native switch gives a system tick; an invisible switch outside the layout provides it.
 */
export function haptic() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  if (typeof navigator.vibrate === "function") { navigator.vibrate(8); return; }
  if (!/iP(hone|ad|od)/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return;
  if (!hapticSwitch) {
    hapticSwitch = document.createElement("label");
    hapticSwitch.setAttribute("aria-hidden", "true");
    hapticSwitch.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-100px;top:0";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    hapticSwitch.appendChild(input);
    document.body.appendChild(hapticSwitch);
  }
  hapticSwitch.click();
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

let press = { x: 0, y: 0, at: -Infinity };

/**
 * Remembers where the last press happened, so what it opens can grow out of that point, and whether the keyboard
 * is in use: focus rings are for keyboard users; after a tap they only flash a blue circle around a button.
 */
export function trackInput() {
  const root = document.documentElement;
  const pointer = (event: PointerEvent) => { press = { x: event.clientX, y: event.clientY, at: performance.now() }; delete root.dataset.keyboard; };
  const key = (event: KeyboardEvent) => { if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) root.dataset.keyboard = "true"; };
  addEventListener("pointerdown", pointer, { capture: true, passive: true });
  addEventListener("keydown", key, { capture: true });
  return () => { removeEventListener("pointerdown", pointer, { capture: true }); removeEventListener("keydown", key, { capture: true }); };
}

/**
 * Lets an element grow out of the point that was just pressed, so the eyes follow it instead of searching for it.
 * Without a recent press (back gesture, keyboard) it grows from its own centre. Reduced motion: a short fade.
 */
export function growFromPress(element: HTMLElement, duration = 260) {
  if (typeof element.animate !== "function") return;
  if (prefersReducedMotion()) { element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); return; }
  const box = element.getBoundingClientRect();
  const recent = performance.now() - press.at < 900;
  const x = recent ? Math.max(0, Math.min(box.width, press.x - box.left)) : box.width / 2;
  const y = recent ? Math.max(0, Math.min(box.height, press.y - box.top)) : box.height / 2;
  const origin = x + "px " + y + "px";
  element.dataset.origin = origin;
  element.animate([
    { opacity: 0, transform: "scale(.9)", transformOrigin: origin },
    { opacity: 1, transform: "scale(1)", transformOrigin: origin },
  ], { duration, easing: "cubic-bezier(.2,.8,.2,1)" });
}

/** Leaves the way it came: shrinks back into the point it grew out of. Resolves when it is gone. */
export function shrinkToPress(element: HTMLElement, duration = 170): Promise<void> {
  if (typeof element.animate !== "function" || prefersReducedMotion()) return Promise.resolve();
  const origin = element.dataset.origin ?? "50% 50%";
  return element.animate([
    { opacity: 1, transform: "scale(1)", transformOrigin: origin },
    { opacity: 0, transform: "scale(.9)", transformOrigin: origin },
  ], { duration, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).finished.then(() => undefined, () => undefined);
}

/**
 * Opens a modal dialog the same way everywhere: it grows from the pressed point and, if it dims the page, the
 * browser bar dims with it. Returns the cleanup for when the dialog goes away.
 */
export function openDialog(element: HTMLDialogElement | null, { dim = true } = {}) {
  if (!element) return () => undefined;
  if (!element.open) element.showModal();
  growFromPress(element);
  if (dim) dimThemeColor(true);
  return () => { if (dim) dimThemeColor(false); };
}
