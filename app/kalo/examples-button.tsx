"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockViewport } from "../../lib/viewport-lock";
import { Icon } from "./icons";

export default function ExamplesButton({ examples, question, onBeforeOpen }: { examples?: string; question: string; onBeforeOpen?: () => boolean }) {
  const [opened, setOpened] = useState<{ anchor: HTMLElement | null } | null>(null);
  const open = opened !== null;
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (wasOpen.current && !open) button.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  if (!examples?.trim()) return null;
  function close() {
    setOpened(null);
  }
  return <>
    <button ref={button} type="button" className="text-button examples-button" aria-label="Beispiele anzeigen" aria-haspopup="dialog" aria-expanded={open}
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        const source = event.currentTarget;
        if (onBeforeOpen?.() === false) return;
        setOpened({ anchor: source.closest<HTMLElement>(".card-faces") });
      }}><Icon kind="cards" /><span>Beispiele</span></button>
    {opened && createPortal(<ExamplesCard examples={examples} question={question} anchor={opened.anchor} onClose={close} />, document.body)}
  </>;
}

function ExamplesCard({ examples, question, anchor, onClose }: { examples: string; question: string; anchor: HTMLElement | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useLayoutEffect(() => {
    const unlock = lockViewport();
    const element = dialog.current;
    let frame = 0;
    const sync = () => {
      if (!element || !anchor) return;
      const bounds = anchor.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      element.dataset.aligned = "true";
      Object.assign(element.style, { left: bounds.left + "px", top: bounds.top + "px", width: bounds.width + "px", height: bounds.height + "px" });
    };
    const follow = () => {
      sync();
      const stage = anchor?.closest<HTMLElement>(".card-stage");
      if (stage && stage.dataset.mode !== "idle") frame = requestAnimationFrame(follow);
    };
    sync();
    if (element && !element.open) element.showModal();
    const resize = new ResizeObserver(sync);
    if (anchor) { resize.observe(anchor); frame = requestAnimationFrame(follow); }
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); unlock();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, [anchor]);
  return <dialog ref={dialog} className="sheet-dialog examples-dialog" aria-labelledby={title}
    onClose={event => { event.stopPropagation(); onClose(); }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <article className="examples-card">
      <header className="section-head"><h2 id={title}>Beispiele</h2><button type="button" className="icon-button" aria-label="Beispiele schliessen" autoFocus onClick={onClose}><Icon kind="close" /></button></header>
      <p className="examples-context">{question}</p>
      <div className="examples-copy" tabIndex={0}>{examples}</div>
      <button type="button" className="button" onClick={onClose}>Zurück zur Lernkarte</button>
    </article>
  </dialog>;
}
