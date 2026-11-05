"use client";

import { useEffect, useRef, useState } from "react";
import { dayOf, shuffle, type Deck, type Direction, type Workspace } from "../../lib/learning";
import { dayStats, goalOf, nextStep, type Step } from "../../lib/progress";
import { GoalBanner, NextStepActions } from "./progress-ui";
import { play } from "./sound";
import type { Problem } from "./feedback";
import Flashcard, { type FlashcardHandle } from "./flashcard";
import { Icon, Key } from "./icons";
import type { CardsStart, LastActivity } from "./types";

export type UndoResult = "ok" | "conflict" | "offline";
type Swipe = { id: string; cardId: string; at: number; known: boolean };

type Props = {
  deck: Deck; start: CardsStart; direction: Direction; workspace: Workspace; now: number; onStep: (step: Step) => void;
  onSort: (cardId: string, known: boolean, sortId: string) => Promise<boolean>;
  onUndo: (sortId: string) => Promise<UndoResult>;
  onProblem: (problem: Problem | null) => void;
  onBack: () => void; onHome: () => void; onChat: (cardId: string) => void;
  onBookmark: (activity: LastActivity) => void;
};

export default function CardViewer({ deck, start, direction, workspace, now, onStep, onSort, onUndo, onProblem, onBack, onHome, onChat, onBookmark }: Props) {
  const [order, setOrder] = useState(start.order);
  const [index, setIndex] = useState(start.index);
  const [flipped, setFlipped] = useState(start.flipped);
  const [sorted, setSorted] = useState(false);
  const [last, setLast] = useState<Swipe | null>(null);
  const [entry, setEntry] = useState<{ key: string; from: -1 | 1 } | null>(null);
  const [pass, setPass] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState(false);
  const [announce, setAnnounce] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const expand = useRef<HTMLButtonElement>(null);
  const flashcard = useRef<FlashcardHandle>(null);

  const visible = order.filter(id => deck.cards.some(card => card.id === id));
  const position = Math.min(index, Math.max(0, visible.length - 1));
  const card = deck.cards.find(item => item.id === visible[position]);
  const nextCard = deck.cards.find(item => item.id === visible[position + 1]);
  const other = direction === "front" ? "back" : "front";
  const known = Object.values(pass).filter(Boolean).length;
  const later = Object.keys(pass).filter(id => !pass[id]);

  useEffect(() => {
    if (focus && !dialog.current?.open) dialog.current?.showModal();
  }, [focus]);

  useEffect(() => {
    if (card && !sorted) onBookmark({ mode: "cards", deckId: deck.id, cardId: card.id, order: visible, direction, flipped });
  // The bookmark follows the visible card only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, deck.id, direction, flipped, sorted, order]);

  function step(amount: number) {
    setIndex(current => Math.max(0, Math.min(visible.length - 1, current + amount)));
    setFlipped(false);
    setEntry(null);
  }

  function restart(ids: string[]) {
    setOrder(shuffle(ids));
    setIndex(0);
    setSorted(false);
    setFlipped(false);
    setLast(null);
    setPass({});
    setEntry(null);
  }

  // Optimistic: the next card is already there, the rating is saved in order in the background.
  function sort(rating: boolean) {
    if (!card) return;
    const swipe: Swipe = { id: crypto.randomUUID(), cardId: card.id, at: position, known: rating };
    setLast(swipe);
    setPass(current => ({ ...current, [card.id]: rating }));
    setEntry(null);
    setFlipped(false);
    if (position + 1 < visible.length) setIndex(position + 1);
    else setSorted(true);
    setAnnounce(rating ? "Ich kann das" : "Später üben");
    play("swipe");
    void onSort(card.id, rating, swipe.id).then(saved => {
      if (saved) return;
      setLast(current => current?.id === swipe.id ? null : current);
      setPass(current => { const copy = { ...current }; delete copy[swipe.cardId]; return copy; });
      setIndex(current => Math.min(current, swipe.at));
      setSorted(false);
      setFlipped(false);
      onProblem({ message: "Die Bewertung wurde nicht gespeichert. Die Karte ist wieder da. Bewerte sie nochmals, sobald die Verbindung steht." });
    });
  }

  function undo(swipe = last) {
    if (!swipe) return;
    setLast(null);
    setPass(current => { const copy = { ...current }; delete copy[swipe.cardId]; return copy; });
    setSorted(false);
    setIndex(swipe.at);
    setFlipped(false);
    setEntry({ key: swipe.cardId, from: swipe.known ? 1 : -1 });
    setAnnounce("Bewertung zurückgenommen");
    onProblem(null);
    void onUndo(swipe.id).then(result => {
      if (result === "ok") return;
      // The rating is still stored, so the view moves past the card again.
      setPass(current => ({ ...current, [swipe.cardId]: swipe.known }));
      setIndex(current => current === swipe.at ? swipe.at + 1 : current);
      if (swipe.at + 1 >= visible.length) setSorted(true);
      setEntry(null);
      if (result === "offline") {
        setLast(swipe);
        onProblem({ message: "Rückgängig hat nicht geklappt, weil die Verbindung fehlt. Die Bewertung ist noch gespeichert.", action: { label: "Erneut versuchen", run: () => undo(swipe) } });
      } else onProblem({ message: "Diese Bewertung lässt sich nicht mehr zurücknehmen. Sie bleibt gespeichert." });
    });
  }

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey || !event.altKey)) { event.preventDefault(); undo(); return; }
      if (event.altKey || event.ctrlKey || event.metaKey || sorted) return;
      const onControl = target && ["BUTTON", "A"].includes(target.tagName) && !target.classList.contains("flashcard");
      if (event.code === "Space" && !onControl) { event.preventDefault(); setFlipped(value => !value); }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
      if (event.key === "1") flashcard.current?.fling(false);
      if (event.key === "2") flashcard.current?.fling(true);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function closeFocus() {
    setFocus(false);
    requestAnimationFrame(() => expand.current?.focus());
  }

  if (!card && !sorted) return <section className="panel flow"><h1>Karte nicht verfügbar</h1><p>Diese Karte wurde inzwischen gelöscht.</p><button className="button" onClick={onBack}>Zum Set</button></section>;

  const undoButton = last && <button className="pill-button" onClick={() => undo()}><Icon kind="undo" /> Rückgängig <Key>Z</Key></button>;
  const content = <section className="card-viewer">
    <header className="card-toolbar">
      <button className="icon-button" aria-label={focus ? "Vollbild verlassen" : "Zurück zum Set"} title={focus ? "Vollbild verlassen" : "Zurück zum Set"} onClick={focus ? closeFocus : onBack}><Icon kind="back" /></button>
      <div className="toolbar-title"><h1>{deck.title}</h1><span className="counter">{sorted ? visible.length : position + 1} von {visible.length}</span></div>
      <button className="icon-button" aria-label="Karten mischen" title="Mischen" onClick={() => restart(visible)}><Icon kind="shuffle" /></button>
      <button ref={focus ? undefined : expand} className="icon-button" aria-label={focus ? "Vollbild verlassen" : "Vollbild"} title={focus ? "Vollbild verlassen" : "Vollbild"}
        onClick={focus ? closeFocus : () => setFocus(true)}><Icon kind={focus ? "shrink" : "expand"} /></button>
    </header>
    <div className="meter" aria-hidden="true"><i style={{ width: ((sorted ? visible.length : position) / Math.max(1, visible.length)) * 100 + "%" }} /></div>
    <span className="sr-only" role="status">{announce}</span>

    {sorted || !card ? <section className="panel finish">
      <span className="finish-mark"><Icon kind="check" size="l" /></span>
      <h2>Set durchgesehen</h2>
      <p>{known === 1 ? "Eine Karte kannst du" : known + " Karten kannst du"}{later.length ? ", " + (later.length === 1 ? "eine übst du" : later.length + " übst du") + " gleich nochmals" : ""}.
        {" "}Deine Bewertungen fliessen in die Wiederholung ein.</p>
      <GoalBanner workspace={workspace} now={now} />
      <div className="actions">
        {later.length > 0 ? <button className="button primary" autoFocus onClick={() => restart(later)}><Icon kind="repeat" /> {later.length === 1 ? "Eine Karte" : later.length + " Karten"} nochmals</button>
          : <NextStepActions step={nextStep(workspace, now, deck.id)} goalReached={dayStats(workspace, dayOf(now)).points >= goalOf(workspace)} onStep={onStep} onDone={onHome} />}
        <button className="button" onClick={onHome}>Zur Bibliothek</button>
        <button className="button" onClick={() => restart(visible)}><Icon kind="shuffle" /> Neu mischen</button>
        {undoButton}
      </div>
    </section> : <>
      <Flashcard ref={flashcard} entry={entry} flipped={flipped}
        card={{ key: card.id, question: card[direction], answer: card[other] }}
        next={nextCard && { key: nextCard.id, question: nextCard[direction], answer: nextCard[other] }}
        onFlip={() => setFlipped(value => !value)} onSwipe={sort} />
      <div className="swipe-status">
        {last ? <span className={last.known ? "rating-known" : "rating-again"} key={last.id}>
          <Icon kind={last.known ? "check" : "repeat"} /> {last.known ? "Ich kann das" : "Später üben"}</span>
          : <span className="muted swipe-hint"><Icon kind="back" size="s" /> Später üben · Ich kann das <Icon kind="forward" size="s" /></span>}
        {undoButton}
      </div>
      <div className="swipe-actions">
        <button className="button rate-again" onClick={() => flashcard.current?.fling(false)}><Icon kind="repeat" /> Später üben <Key>1</Key></button>
        <button className="button rate-known" onClick={() => flashcard.current?.fling(true)}><Icon kind="check" /> Ich kann das <Key>2</Key></button>
      </div>
      <div className="card-controls">
        <button className="icon-button" disabled={position === 0} aria-label="Vorherige Karte" title="Vorherige Karte" onClick={() => step(-1)}><Icon kind="chevronLeft" /></button>
        <button className="pill-button" onClick={() => onChat(card.id)}><Icon kind="chat" /> Erklären lassen</button>
        <button className="icon-button" disabled={position === visible.length - 1} aria-label="Nächste Karte ohne Bewertung" title="Nächste Karte" onClick={() => step(1)}><Icon kind="chevronRight" /></button>
      </div>
    </>}
  </section>;

  return focus
    ? <dialog className="focus-dialog" ref={dialog} aria-label={deck.title + " im Vollbild"} onClose={closeFocus}
        onCancel={event => { event.preventDefault(); closeFocus(); }}>{content}</dialog>
    : content;
}
