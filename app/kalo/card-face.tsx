"use client";

import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import ExamplesButton from "./examples-button";
import type { CardContent } from "./flashcard";
import { prefersReducedMotion, textSize } from "./motion";

type Props = { card: CardContent; flipped: boolean; hint?: boolean; onFlip: (event: MouseEvent<HTMLButtonElement>) => void; onBeforeExamples: () => boolean };

/** One real face: fold it closed, replace its content, then unfold without mirroring any text. */
export default function CardFace({ card, flipped, hint, onFlip, onBeforeExamples }: Props) {
  const face = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(flipped);
  const shown = useRef(flipped);
  const scroll = useRef([0, 0]);
  const stop = useRef<() => void>(() => undefined);
  const show = useCallback((nextSide: boolean) => {
    if (shown.current === nextSide) return;
    const copy = face.current?.querySelector<HTMLElement>(".card-copy");
    scroll.current[Number(shown.current)] = copy?.scrollTop ?? 0;
    shown.current = nextSide;
    flushSync(() => setSide(nextSide));
    const nextCopy = face.current?.querySelector<HTMLElement>(".card-copy");
    if (nextCopy) nextCopy.scrollTop = scroll.current[Number(nextSide)];
  }, []);

  useLayoutEffect(() => {
    const element = face.current;
    if (!element || shown.current === flipped) return;
    let cancelled = false;
    let animation: Animation | undefined;
    const cancel = () => { cancelled = true; animation?.cancel(); };
    stop.current = cancel;
    const replace = () => show(flipped);
    if (prefersReducedMotion() || typeof element.animate !== "function") {
      queueMicrotask(() => { if (!cancelled) replace(); });
      return cancel;
    }
    void (async () => {
      try {
        animation = element.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 120, easing: "ease-in", fill: "forwards" });
        await animation.finished;
        if (cancelled) return;
        replace();
        const closing = animation;
        animation = element.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
        closing.cancel();
        await animation.finished;
        if (!cancelled) animation.cancel();
      } catch {
        if (!cancelled) { animation?.cancel(); replace(); }
      }
    })();
    return cancel;
  }, [flipped, show]);

  function beforeExamples() {
    if (!onBeforeExamples()) return false;
    stop.current();
    show(flipped);
    return true;
  }

  return <div ref={face} className={"card-face " + (side ? "back" : "front")} aria-hidden="false">
    <div className="card-face-header"><span className="eyebrow">{side ? "Antwort" : "Frage"}</span><ExamplesButton question={card.question} examples={card.examples} onBeforeOpen={beforeExamples} /></div>
    <button type="button" className="card-flip" aria-label={(side ? "Antwort: " + card.answer : "Frage: " + card.question) + ". Zum Umdrehen tippen."} onClick={onFlip}>
      <span className="card-copy" data-size={textSize(side ? card.answer : card.question)}>{side ? card.answer : card.question}</span>
      <span className="card-hint">{!side && hint ? "Tippen zum Umdrehen" : ""}</span>
    </button>
  </div>;
}
