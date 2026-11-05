"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type PointerEvent, type Ref } from "react";
import { dragOffset, swipeStep } from "../../lib/swipe";
import { Icon } from "./icons";
import { haptic, prefersReducedMotion, springs, stepSpring, textSize, toss, type Spring } from "./motion";

type Sample = { x: number; time: number };
type Drag = { id: number; x: number; y: number; offset: number; width: number; intent: "pending" | "horizontal" | "vertical"; samples: Sample[] };
type Mode = "idle" | "drag" | "settle" | "toss";
export type FlashcardHandle = { fling: (known: boolean) => void };
export type CardContent = { key: string; question: string; answer: string };

type Props = {
  ref?: Ref<FlashcardHandle>;
  card: CardContent;
  /** The card that follows, shown underneath like the next card in a stack. */
  next?: CardContent;
  flipped: boolean;
  /** When this card comes back (undo), it enters from the side it was thrown to. */
  entry?: { key: string; from: -1 | 1 } | null;
  onFlip: () => void;
  onSwipe: (known: boolean) => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * The card follows the finger 1:1, keeps the release velocity, is thrown off in the direction of the swipe
 * and can be caught again mid-flight. The next card waits underneath and grows into place.
 */
export default function Flashcard({ ref, card, next, flipped, entry, onFlip, onSwipe }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const motion = useRef({ x: 0, velocity: 0, frame: 0, mode: "idle" as Mode, swapping: false, fallback: 0, queued: [] as boolean[] });
  const suppressClick = useRef(false);

  useEffect(() => {
    const state = motion.current;
    return () => { cancelAnimationFrame(state.frame); window.clearTimeout(state.fallback); };
  }, []);

  // Long text scrolls inside the card. A fade at the bottom shows that there is more.
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const mark = () => element.querySelectorAll<HTMLElement>(".card-copy").forEach(copy => {
      copy.dataset.overflow = String(copy.scrollHeight > copy.clientHeight + 2);
    });
    mark();
    const observer = new ResizeObserver(mark);
    observer.observe(element);
    return () => observer.disconnect();
  }, [card.key, card.question, card.answer, next?.key]);

  function width() {
    return surface.current?.offsetWidth || 360;
  }

  function paint(x: number) {
    motion.current.x = x;
    const element = stage.current;
    if (!element) return;
    element.style.setProperty("--drag", x + "px");
    element.style.setProperty("--tilt", clamp(x / 20, -9, 9) + "deg");
    element.style.setProperty("--known", String(clamp((x - 10) / 75, 0, 1)));
    element.style.setProperty("--again", String(clamp((-x - 10) / 75, 0, 1)));
    element.style.setProperty("--progress", String(clamp(Math.abs(x) / (width() * 0.55), 0, 1)));
  }

  function setMode(mode: Mode) {
    motion.current.mode = mode;
    if (stage.current) stage.current.dataset.mode = mode;
  }

  function run(step: (dt: number) => boolean) {
    cancelAnimationFrame(motion.current.frame);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      if (!step(dt)) motion.current.frame = requestAnimationFrame(tick);
    };
    motion.current.frame = requestAnimationFrame(tick);
  }

  // Springs start from the current position and speed, so a new touch can always take over.
  function settle(velocity: number, spring: Spring = springs.settle) {
    const state = motion.current;
    if (prefersReducedMotion()) { paint(0); setMode("idle"); return; }
    setMode("settle");
    state.velocity = velocity;
    run(dt => {
      const result = stepSpring(state.x, state.velocity, 0, spring, dt);
      state.velocity = result.velocity;
      paint(result.x);
      if (Math.abs(state.x) > 0.4 || Math.abs(state.velocity) > 8) return false;
      paint(0);
      setMode("idle");
      return true;
    });
  }

  function commit(known: boolean) {
    const state = motion.current;
    setMode("idle");
    state.swapping = true;
    if (stage.current) stage.current.dataset.swapping = "true";
    onSwipe(known);
    // If no new card arrives (for example the last card was rated), the card glides back.
    window.clearTimeout(state.fallback);
    state.fallback = window.setTimeout(() => {
      if (!state.swapping) return;
      state.queued = [];
      state.swapping = false;
      delete stage.current?.dataset.swapping;
      settle(0);
    }, 450);
  }

  function throwCard(known: boolean, velocity: number) {
    const state = motion.current;
    const sign = known ? 1 : -1;
    haptic();
    if (prefersReducedMotion()) { commit(known); return; }
    setMode("toss");
    state.velocity = sign * Math.max(Math.abs(velocity), toss.minSpeed);
    const limit = width() * 1.2 + 80;
    run(dt => {
      // Further taps are waiting: this card makes room faster.
      state.velocity += sign * toss.acceleration * (state.queued.length ? 3 : 1) * dt;
      paint(state.x + state.velocity * dt);
      if (Math.abs(state.x) < limit) return false;
      commit(known);
      return true;
    });
  }

  useImperativeHandle(ref, () => ({
    fling: known => {
      const state = motion.current;
      if (state.mode === "drag") return;
      // Fast repeated input is kept in order and thrown as soon as the next card is in place.
      if (state.mode === "toss" || state.swapping) { if (state.queued.length < 8) state.queued.push(known); return; }
      throwCard(known, 0);
    },
  }));

  // Runs before paint: the old card never shows up again at rest, so there is no flicker.
  useLayoutEffect(() => {
    const state = motion.current;
    cancelAnimationFrame(state.frame);
    window.clearTimeout(state.fallback);
    state.swapping = false;
    delete stage.current?.dataset.swapping;
    paint(0);
    setMode("idle");
    if (entry && entry.key === card.key) {
      state.queued = [];
      if (!prefersReducedMotion()) {
        paint(entry.from * (width() * 1.1));
        settle(0, springs.enter);
      }
    } else if (state.queued.length) throwCard(state.queued.shift()!, 0);
  // Only a new card resets the motion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.key]);

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    const state = motion.current;
    if (state.swapping || !event.isPrimary || event.button !== 0) return;
    // Catching a card mid-flight takes it back into the hand.
    cancelAnimationFrame(state.frame);
    suppressClick.current = state.mode === "toss" || state.mode === "settle" && Math.abs(state.x) > 6;
    setMode("drag");
    drag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY, offset: state.x, width: event.currentTarget.offsetWidth,
      intent: Math.abs(state.x) > 6 ? "horizontal" : "pending", samples: [{ x: event.clientX, time: event.timeStamp }],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.intent === "pending" && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
      current.intent = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (current.intent !== "horizontal") return;
    current.samples = [...current.samples.filter(sample => event.timeStamp - sample.time <= 90), { x: event.clientX, time: event.timeStamp }].slice(-6);
    if (!prefersReducedMotion()) paint(dragOffset(current.offset + dx, current.width, true, true));
  }

  function release(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (current.intent !== "pending") suppressClick.current = true;
    const recent = current.samples.find(sample => event.timeStamp - sample.time <= 105);
    const velocity = recent ? (event.clientX - recent.x) / Math.max(12, event.timeStamp - recent.time) : 0;
    const bounded = clamp(velocity, -2.4, 2.4);
    const horizontal = !cancelled && current.intent === "horizontal";
    const travelled = motion.current.x;
    const step = horizontal ? swipeStep(travelled, bounded, current.width, true, true) : 0;
    if (step) throwCard(step < 0, bounded * 1000);
    else if (current.intent === "pending" && Math.abs(travelled) < 1) setMode("idle");
    else settle(horizontal ? bounded * 1000 : 0, springs.release);
  }

  return <div className="card-stage" ref={stage} data-mode="idle">
    {next && <div className="card-under" aria-hidden="true">
      <span className="card-face"><span className="eyebrow">Frage</span><span className="card-copy" data-size={textSize(next.question)}>{next.question}</span></span>
    </div>}
    <button
      ref={surface}
      className="flashcard"
      aria-label={(flipped ? "Antwort: " + card.answer : "Frage: " + card.question) + ". Zum Umdrehen tippen."}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={event => release(event)}
      onPointerCancel={event => release(event, true)}
      onLostPointerCapture={event => release(event, true)}
      onClick={event => {
        const state = motion.current;
        if (state.swapping || state.mode === "toss" || (event.detail && suppressClick.current)) { suppressClick.current = false; return; }
        onFlip();
      }}
    >
      <span className="card-faces" key={card.key} data-flipped={flipped} aria-hidden="true">
        <span className="card-face front"><span className="eyebrow">Frage</span><span className="card-copy" data-size={textSize(card.question)}>{card.question}</span><span className="card-hint">Zum Umdrehen tippen</span></span>
        <span className="card-face back"><span className="eyebrow">Antwort</span><span className="card-copy" data-size={textSize(card.answer)}>{card.answer}</span><span className="card-hint">Zum Umdrehen tippen</span></span>
      </span>
      <span className="swipe-stamp known" aria-hidden="true"><Icon kind="check" /> Ich kann das</span>
      <span className="swipe-stamp again" aria-hidden="true"><Icon kind="repeat" /> Später üben</span>
    </button>
  </div>;
}
