"use client";

import { createContext, use, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clozeFrom, exampleLines, maskAnswer } from "../../lib/examples";
import { lookupTerm, type PairExplanation, type WordExplanation } from "../../lib/explanations";
import { lockViewport } from "../../lib/viewport-lock";
import { Icon } from "./icons";
import { prefersReducedMotion } from "./motion";
import type { Mutate } from "./types";

/** What the examples card needs from the app: where ChatGPT is, how to save, and which set the card belongs to. */
export type Help = { chatUrl: string; mutate: Mutate; deckId: string };
export const HelpContext = createContext<Help | null>(null);

type CardHelp = { cardId: string; question: string; answer: string; examples?: string };

/**
 * The one help for a card: own examples first, then the dictionary, then ChatGPT. Before the answer is shown,
 * every form of it is hidden in the examples, so they help without giving it away.
 */
export default function ExamplesButton({ card, revealed, onBeforeOpen }: { card: CardHelp; revealed: boolean; onBeforeOpen?: () => boolean }) {
  const help = use(HelpContext);
  const [opened, setOpened] = useState<{ anchor: HTMLElement | null } | null>(null);
  const open = opened !== null;
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (wasOpen.current && !open) button.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  if (!help) return null;
  return <>
    <button ref={button} type="button" className="text-button examples-button" aria-label="Beispiele und Erklärung anzeigen" aria-haspopup="dialog" aria-expanded={open}
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        const source = event.currentTarget;
        if (onBeforeOpen?.() === false) return;
        setOpened({ anchor: source.closest<HTMLElement>(".card-faces, .question") });
      }}><Icon kind="cards" /><span>Beispiele</span></button>
    {opened && createPortal(<ExamplesCard card={card} revealed={revealed} help={help} anchor={opened.anchor} onClose={() => setOpened(null)} />, document.body)}
  </>;
}

function ExamplesCard({ card, revealed, help, anchor, onClose }: { card: CardHelp; revealed: boolean; help: Help; anchor: HTMLElement | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const title = useId();
  const [added, setAdded] = useState<string[]>([]);
  const [explanation, setExplanation] = useState<PairExplanation | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "failed">(lookupTerm(card.question) || lookupTerm(card.answer) ? "loading" : "idle");
  const hide = (text: string) => revealed ? text : maskAnswer(text, card.answer);
  const lines = exampleLines(card.examples);
  const task = "Erkläre mir genau diese eine Lernkarte und gib mir drei kurze Beispielsätze dazu. Frage: «" + card.question + "». Antwort: «" + card.answer + "».";

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
    // The examples card turns in like a third side of the learning card.
    if (element && !prefersReducedMotion() && typeof element.animate === "function") {
      element.animate([{ transform: "perspective(1200px) rotateY(-90deg)", opacity: 0.4 }, { transform: "perspective(1200px) rotateY(0deg)", opacity: 1 }],
        { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
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

  useEffect(() => {
    if (lookup !== "loading") return;
    const controller = new AbortController();
    fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ deckId: help.deckId, cardId: card.cardId }), signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<PairExplanation>; })
      .then(result => { setExplanation(result); setLookup("idle"); })
      .catch(() => { if (!controller.signal.aborted) setLookup("failed"); });
    return () => controller.abort();
  }, [lookup, help.deckId, card.cardId]);

  function close() {
    const element = dialog.current;
    if (closing.current) return;
    closing.current = true;
    if (!element || prefersReducedMotion() || typeof element.animate !== "function") { onClose(); return; }
    element.animate([{ transform: "perspective(1200px) rotateY(0deg)", opacity: 1 }, { transform: "perspective(1200px) rotateY(90deg)", opacity: 0.4 }],
      { duration: 160, easing: "ease-in", fill: "forwards" }).finished.then(onClose, onClose);
  }

  async function save(key: string, action: Parameters<Mutate>[0]) {
    if (await help.mutate(action)) setAdded(current => [...current, key]);
  }

  // The term on the question side is always safe to show; the answer side only once the answer is visible.
  const terms = explanation ? [explanation.front, explanation.back].filter(word => revealed || !sameTerm(word.term, card.answer)) : [];

  return <dialog ref={dialog} className="sheet-dialog examples-dialog" aria-labelledby={title}
    onClose={event => { event.stopPropagation(); onClose(); }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <article className="examples-card">
      <header className="section-head"><h2 id={title}>Beispiele</h2><button type="button" className="icon-button" aria-label="Beispiele schliessen" autoFocus onClick={close}><Icon kind="close" /></button></header>
      <p className="examples-context">{card.question}</p>
      <div className="examples-copy" tabIndex={0}>
        {lines.length > 0 && <ul className="example-lines">{lines.map(line => {
          const cloze = clozeFrom(line, card.answer);
          const key = "cloze:" + line;
          return <li key={line}><span>{hide(line)}</span>
            {cloze && <button type="button" className="text-button small" disabled={added.includes(key)}
              onClick={() => void save(key, { type: "addCard", deckId: help.deckId, front: cloze.front, back: cloze.back })}>
              {added.includes(key) ? <><Icon kind="check" size="s" /> Als Karte gespeichert</> : <><Icon kind="plus" size="s" /> Lückentext-Karte</>}</button>}
          </li>;
        })}</ul>}

        {lookup === "loading" && <div className="explain-loading" role="status" aria-label="Wörterbuch wird geladen"><span /><span /><span /></div>}
        {terms.map(word => <DictionaryTerm key={word.term} word={word} hide={hide} added={added}
          onAdopt={(key, example) => void save(key, { type: "addExample", deckId: help.deckId, cardId: card.cardId, example })} />)}
        {lookup === "failed" && <p className="explain-missing" role="status">Wörterbuch gerade nicht erreichbar.</p>}
        {!lines.length && lookup !== "loading" && !terms.some(word => word.meanings.length) && <p className="muted">Für diese Karte gibt es noch keine Beispiele. ChatGPT schreibt dir welche.</p>}
      </div>
      <a className="button" href={help.chatUrl} target="_blank" rel="noreferrer" onClick={() => void navigator.clipboard?.writeText(task).catch(() => undefined)}>
        <Icon kind="chat" /> In ChatGPT vertiefen <Icon kind="external" size="s" /></a>
    </article>
  </dialog>;
}

function sameTerm(a: string, b: string) {
  return a.trim().toLocaleLowerCase("de-CH") === b.trim().toLocaleLowerCase("de-CH");
}

function DictionaryTerm({ word, hide, added, onAdopt }: { word: WordExplanation; hide: (text: string) => string; added: string[]; onAdopt: (key: string, example: string) => void }) {
  if (!word.meanings.length) return null;
  const meaning = word.meanings[0];
  const example = meaning.example ? meaning.example + (meaning.translation ? " / " + meaning.translation : "") : "";
  const key = "example:" + example;
  return <section className="explain-term">
    <h3>{hide(word.term)}<small>{meaning.language.toUpperCase()}</small></h3>
    <p lang="en">{hide(meaning.definition)}</p>
    {example && <blockquote lang={meaning.language}>{hide(example)}
      <button type="button" className="text-button small" disabled={added.includes(key)} onClick={() => onAdopt(key, example)}>
        {added.includes(key) ? <><Icon kind="check" size="s" /> Übernommen</> : <><Icon kind="plus" size="s" /> Zu meinen Beispielen</>}</button></blockquote>}
    {word.source && <a className="explain-source" href={word.source} target="_blank" rel="noreferrer">Wiktionary, CC BY-SA <Icon kind="external" size="s" /></a>}
  </section>;
}
