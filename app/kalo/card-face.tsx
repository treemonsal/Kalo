"use client";

import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import ExamplesButton from "./examples-button";
import type { CardContent } from "./flashcard";
import { motionDuration, prefersReducedMotion, textSize } from "./motion";

type Props = { card: CardContent; flipped: boolean; hint?: boolean; onFlip: (event: MouseEvent<HTMLButtonElement>) => void; onBeforeExamples: () => boolean };

/** One real face: turn it to its edge, replace its content, then turn it back without mirroring any text. */
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
        // A real turn in depth instead of squeezing the text: rotate to the edge, swap the content, rotate back in.
        // The content is swapped at 90 degrees, so no text is ever shown mirrored.
        animation = element.animate([{ transform: "perspective(1100px) rotateY(0deg)" }, { transform: "perspective(1100px) rotateY(90deg)" }], { duration: motionDuration(140), easing: "ease-in", fill: "forwards" });
        await animation.finished;
        if (cancelled) return;
        replace();
        const closing = animation;
        animation = element.animate([{ transform: "perspective(1100px) rotateY(-90deg)" }, { transform: "perspective(1100px) rotateY(0deg)" }], { duration: motionDuration(200), easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
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
    <div className="card-face-header"><span className="eyebrow">{side ? "Antwort" : "Frage"}</span><ExamplesButton card={{ cardId: card.key, question: card.question, answer: card.answer, examples: card.examples }} revealed={side} onBeforeOpen={beforeExamples} /></div>
    <button type="button" className="card-flip" aria-label={(side ? "Antwort: " + card.answer : "Frage: " + card.question) + ". Zum Umdrehen tippen."} onClick={onFlip}>
      <span className="card-copy" data-size={textSize(side ? card.answer : card.question)}>{side ? card.answer : card.question}</span>
      <span className="card-hint">{!side && hint ? "Tippen zum Umdrehen" : ""}</span>
    </button>
  </div>;
}
