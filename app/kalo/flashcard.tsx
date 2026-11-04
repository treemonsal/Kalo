"use client";

import { useEffect, useImperativeHandle, useRef, type PointerEvent, type Ref } from "react";
import { dragOffset, swipeStep } from "../../lib/swipe";

type Sample = { x: number; time: number };
type Drag = {
  id: number; x: number; y: number; offset: number; width: number;
  intent: "pending" | "horizontal" | "vertical"; samples: Sample[];
};
export type FlashcardHandle = { fling: (step: -1 | 1) => void };
type Props = {
  ref?: Ref<FlashcardHandle>;
  cardKey: string; question: string; answer: string; flipped: boolean;
  onFlip: () => void; onStep: (step: -1 | 1) => void;
};

/**
 * A card that follows the finger 1:1, keeps the release velocity and is thrown off screen
 * in the direction of the swipe. Springs start from the current position, so every motion
 * can be grabbed again mid-flight.
 */
export default function Flashcard({ ref, cardKey, question, answer, flipped, onFlip, onStep }: Props) {
  const surface = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const motion = useRef({ x: 0, frame: 0, leaving: false });
  const suppressClick = useRef(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reducedMotion.current = preference.matches; };
    sync();
    preference.addEventListener("change", sync);
    const state = motion.current;
    return () => {
      preference.removeEventListener("change", sync);
      cancelAnimationFrame(state.frame);
    };
  }, []);

  function position(x: number) {
    motion.current.x = x;
    const button = surface.current;
    button?.style.setProperty("--drag", x + "px");
    button?.style.setProperty("--tilt", Math.max(-12, Math.min(12, x / 16)) + "deg");
    button?.style.setProperty("--known", String(Math.max(0, Math.min(1, (x - 12) / 65))));
    button?.style.setProperty("--again", String(Math.max(0, Math.min(1, (-x - 12) / 65))));
  }

  // Critically damped enough to settle without wobble, but it keeps the hand's momentum.
  function settle(target: number, velocity: number) {
    cancelAnimationFrame(motion.current.frame);
    if (reducedMotion.current) { position(target); return; }
    let speed = velocity * 1000;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.025, (now - last) / 1000);
      last = now;
      speed += ((target - motion.current.x) * 440 - speed * 38) * dt;
      position(motion.current.x + speed * dt);
      if (Math.abs(motion.current.x - target) < 0.5 && Math.abs(speed) < 9) position(target);
      else motion.current.frame = requestAnimationFrame(tick);
    };
    motion.current.frame = requestAnimationFrame(tick);
  }

  // Continues the throw with the release velocity until the card has left the stage.
  function fling(step: -1 | 1, velocity = 0) {
    const sign = step < 0 ? 1 : -1;
    cancelAnimationFrame(motion.current.frame);
    navigator.vibrate?.(8);
    const width = surface.current?.offsetWidth ?? 400;
    if (reducedMotion.current) { onStep(step); return; }
    motion.current.leaving = true;
    let speed = sign * Math.max(Math.abs(velocity) * 1000, 1400);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.025, (now - last) / 1000);
      last = now;
      speed += sign * 5200 * dt;
      position(motion.current.x + speed * dt);
      if (Math.abs(motion.current.x) < width * 1.25) {
        motion.current.frame = requestAnimationFrame(tick);
        return;
      }
      motion.current.leaving = false;
      position(0);
      onStep(step);
    };
    motion.current.frame = requestAnimationFrame(tick);
  }

  useImperativeHandle(ref, () => ({ fling: step => { if (!motion.current.leaving) fling(step); } }));

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (motion.current.leaving || !event.isPrimary || event.button !== 0) return;
    cancelAnimationFrame(motion.current.frame);
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY, offset: motion.current.x,
      width: event.currentTarget.offsetWidth, intent: "pending",
      samples: [{ x: event.clientX, time: event.timeStamp }],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.intent === "pending" && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
      current.intent = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (current.intent !== "horizontal") return;
    current.samples = [...current.samples.filter(sample => event.timeStamp - sample.time <= 90), {
      x: event.clientX, time: event.timeStamp,
    }].slice(-6);
    if (!reducedMotion.current) position(dragOffset(current.offset + dx, current.width, true, true));
  }

  function release(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    suppressClick.current = cancelled || current.intent !== "pending";
    const recent = current.samples.find(sample => event.timeStamp - sample.time <= 105);
    const velocity = recent ? (event.clientX - recent.x) / Math.max(12, event.timeStamp - recent.time) : 0;
    const bounded = Math.max(-1.6, Math.min(1.6, velocity));
    const horizontal = !cancelled && current.intent === "horizontal";
    const step = horizontal ? swipeStep(event.clientX - current.x, bounded, current.width, true, true) : 0;
    if (step) fling(step as -1 | 1, bounded);
    else settle(0, horizontal ? bounded : 0);
  }

  return <div className="card-stage">
    <button
      ref={surface}
      className="flashcard"
      aria-label={(flipped ? "Antwort: " + answer : "Frage: " + question) + ". Tippen zum Umdrehen."}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={event => release(event)}
      onPointerCancel={event => release(event, true)}
      onLostPointerCapture={event => release(event, true)}
      onClick={event => {
        if (motion.current.leaving || (event.detail && suppressClick.current)) return;
        settle(0, 0);
        onFlip();
      }}
    >
      <span className="swipe-stamp known" aria-hidden="true">Ich kann das</span>
      <span className="swipe-stamp again" aria-hidden="true">Später üben</span>
      <span className="card-enter" key={cardKey} aria-hidden="true">
        <span className="card-faces" data-flipped={flipped}>
          <span className="card-face front"><span className="eyebrow">Frage</span><span className="card-copy">{question}</span><Hint /></span>
          <span className="card-face back"><span className="eyebrow">Antwort</span><span className="card-copy">{answer}</span><Hint /></span>
        </span>
      </span>
    </button>
  </div>;
}

function Hint() {
  return <span className="card-hint"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10a8 8 0 1 0-1 7M20 5v5h-5" /></svg></span>;
}
