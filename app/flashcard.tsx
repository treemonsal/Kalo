"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { dragOffset, swipeStep } from "../lib/swipe";

type Sample = { x: number; time: number };
type Drag = {
  id: number; x: number; y: number; offset: number; width: number;
  intent: "pending" | "horizontal" | "vertical"; samples: Sample[];
};
type Props = {
  face: string; flipped: boolean; previous: boolean; next: boolean;
  onFlip: () => void; onStep: (step: number) => void; busy?: boolean;
};

export default function Flashcard({ face, flipped, previous, next, onFlip, onStep, busy }: Props) {
  const surface = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const motion = useRef({ x: 0, frame: 0 });
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

  function settle(target: number, velocity: number, complete?: () => void) {
    cancelAnimationFrame(motion.current.frame);
    if (reducedMotion.current) {
      position(target);
      complete?.();
      return;
    }
    let speed = velocity * 1000;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.025, (now - last) / 1000);
      last = now;
      speed += ((target - motion.current.x) * 440 - speed * 38) * dt;
      position(motion.current.x + speed * dt);
      if (Math.abs(motion.current.x - target) < 0.5 && Math.abs(speed) < 9) {
        position(target);
        complete?.();
      } else {
        motion.current.frame = requestAnimationFrame(tick);
      }
    };
    motion.current.frame = requestAnimationFrame(tick);
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (busy || !event.isPrimary || event.button !== 0) return;
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
    if (!reducedMotion.current) position(dragOffset(current.offset + dx, current.width, previous, next));
  }

  function release(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    suppressClick.current = cancelled || current.intent !== "pending";
    const recent = current.samples.find(sample => event.timeStamp - sample.time <= 105);
    const velocity = recent ? (event.clientX - recent.x) / Math.max(12, event.timeStamp - recent.time) : 0;
    const boundedVelocity = Math.max(-1.6, Math.min(1.6, velocity));
    const step = !cancelled && current.intent === "horizontal"
      ? swipeStep(event.clientX - current.x, boundedVelocity, current.width, previous, next) : 0;
    if (step) {
      onStep(step);
      settle(0, reducedMotion.current ? 0 : boundedVelocity * 0.65);
    } else {
      settle(0, current.intent === "horizontal" && !cancelled ? boundedVelocity : 0);
    }
  }

  return <div className="card-stage">
    <button
      ref={surface}
      className="flashcard"
      data-face={flipped ? "back" : "front"}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={releaseOnPointerUp}
      onPointerCancel={event => release(event, true)}
      onLostPointerCapture={event => release(event, true)}
      onClick={event => {
        if (busy || (event.detail && suppressClick.current)) return;
        cancelAnimationFrame(motion.current.frame);
        settle(0, 0);
        onFlip();
      }}
    >
      <span className="swipe-stamp known" aria-hidden="true">Ich kann das</span>
      <span className="swipe-stamp again" aria-hidden="true">Später üben</span>
      <span className="eyebrow">{flipped ? "Antwort" : "Frage"}</span>
      <span key={face} className="card-copy">{face}</span>
      <span className="card-hint"><span className="sr-only">Karte umdrehen</span><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 1 0-1 7M20 5v5h-5"/></svg></span>
    </button>
  </div>;

  function releaseOnPointerUp(event: PointerEvent<HTMLButtonElement>) {
    release(event);
  }
}
