"use client";

import { useEffect, useRef, useState } from "react";
import { shuffle, type Deck, type Direction } from "../../lib/learning";
import Flashcard, { type FlashcardHandle } from "./flashcard";
import { Key, NavIcon } from "./icons";
import type { CardsStart, LastActivity } from "./types";

type Props = {
  deck: Deck; start: CardsStart; direction: Direction; error: string;
  onSort: (cardId: string, known: boolean) => Promise<boolean>;
  onBack: () => void; onHome: () => void; onChat: (cardId: string) => void;
  onBookmark: (activity: LastActivity) => void;
};

export default function CardViewer({ deck, start, direction, error, onSort, onBack, onHome, onChat, onBookmark }: Props) {
  const [order, setOrder] = useState(start.order);
  const [index, setIndex] = useState(start.index);
  const [flipped, setFlipped] = useState(start.flipped);
  const [sorted, setSorted] = useState(false);
  const [rating, setRating] = useState<boolean | null>(null);
  const [focus, setFocus] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const expand = useRef<HTMLButtonElement>(null);
  const flashcard = useRef<FlashcardHandle>(null);

  const visible = order.filter(id => deck.cards.some(card => card.id === id));
  const position = Math.min(index, Math.max(0, visible.length - 1));
  const card = deck.cards.find(item => item.id === visible[position]);
  const other = direction === "front" ? "back" : "front";

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
  }

  // Optimistic: the next card appears at once, the rating is saved in the background.
  function sort(known: boolean) {
    if (!card) return;
    const at = position;
    setRating(known);
    if (position + 1 < visible.length) step(1);
    else setSorted(true);
    void onSort(card.id, known).then(saved => {
      if (saved) return;
      setSorted(false);
      setIndex(at);
      setRating(null);
    });
  }

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
      const onControl = event.target instanceof HTMLElement && ["BUTTON", "A"].includes(event.target.tagName)
        && !event.target.classList.contains("flashcard");
      if (event.code === "Space" && !onControl) { event.preventDefault(); setFlipped(value => !value); }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
      if (event.key === "1") flashcard.current?.fling(1);
      if (event.key === "2") flashcard.current?.fling(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function closeFocus() {
    setFocus(false);
    requestAnimationFrame(() => expand.current?.focus());
  }

  if (!card && !sorted) return <section className="panel flow"><h1>Karte nicht verfügbar</h1><button className="button" onClick={onBack}>Zum Set</button></section>;

  const content = <section className="card-viewer">
    <header className="card-toolbar">
      <button className="icon action-icon" aria-label="Zum Set zurück" title="Zum Set zurück" onClick={focus ? closeFocus : onBack}><NavIcon kind="back" /></button>
      <div><h1>{deck.title}</h1><span className="muted counter">{position + 1} / {visible.length}</span></div>
      <button className="icon action-icon" aria-label="Mischen" title="Mischen" onClick={() => {
        setOrder(shuffle(visible)); setSorted(false); setIndex(0); setFlipped(false); setRating(null);
      }}><NavIcon kind="shuffle" /></button>
      <button ref={focus ? undefined : expand} className="icon action-icon"
        aria-label={focus ? "Vollbild verlassen" : "Vollbild öffnen"} title={focus ? "Vollbild verlassen" : "Vollbild öffnen"}
        onClick={focus ? closeFocus : () => setFocus(true)}><NavIcon kind={focus ? "shrink" : "expand"} /></button>
    </header>
    <div className="deck-progress" aria-hidden="true"><i style={{ width: ((sorted ? visible.length : position) / Math.max(1, visible.length)) * 100 + "%" }} /></div>
    {sorted || !card ? <section className="panel flow study-milestone"><h2>Set durchgesehen</h2>
      <p>Deine Bewertungen fliessen in die Wiederholungsplanung ein.</p>
      <div className="actions">
        <button className="button primary" autoFocus onClick={onHome}>Zur Bibliothek</button>
        <button className="button" onClick={() => { setOrder(shuffle(visible)); setIndex(0); setSorted(false); setFlipped(false); setRating(null); }}>Nochmals gemischt</button>
      </div></section> : <>
      <Flashcard ref={flashcard} cardKey={card.id} question={card[direction]} answer={card[other]} flipped={flipped}
        onFlip={() => setFlipped(value => !value)} onStep={value => sort(value < 0)} />
      <div className="rating-slot" role="status">
        {rating !== null && <span key={position + ":" + rating} className={rating ? "rating-known" : "rating-again"}>
          <NavIcon kind={rating ? "check" : "repeat"} /> {rating ? "Ich kann das" : "Später üben"}
        </span>}
      </div>
      <div className="swipe-actions">
        <button className="button rate-again" aria-label="Später üben" onClick={() => flashcard.current?.fling(1)}><NavIcon kind="repeat" /> Später üben <Key>1</Key></button>
        <button className="button rate-known" aria-label="Ich kann das" onClick={() => flashcard.current?.fling(-1)}><NavIcon kind="check" /> Ich kann das <Key>2</Key></button>
      </div>
      <div className="card-controls">
        <button className="icon action-icon" disabled={position === 0} aria-label="Vorherige Karte" title="Vorherige Karte" onClick={() => step(-1)}><NavIcon kind="back" /></button>
        <button className="icon action-icon" aria-label="Karte mit ChatGPT besprechen" title="Karte mit ChatGPT besprechen" onClick={() => onChat(card.id)}><NavIcon kind="chat" /></button>
        <button className="icon action-icon" disabled={position === visible.length - 1} aria-label="Nächste Karte" title="Nächste Karte" onClick={() => step(1)}><NavIcon kind="next" /></button>
      </div>
    </>}
    {focus && error && <p className="message error" role="alert">{error}</p>}
  </section>;

  return focus
    ? <dialog className="focus-dialog" ref={dialog} aria-label={deck.title + " im Vollbild"} onClose={closeFocus}
        onCancel={event => { event.preventDefault(); closeFocus(); }}>{content}</dialog>
    : content;
}
