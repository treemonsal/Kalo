"use client";

import { reviewQueue, type Deck, type Direction, type Filter, type Workspace } from "../../lib/learning";
import { NavIcon } from "./icons";
import { plural } from "./types";

type Props = {
  workspace: Workspace; deck: Deck; time: number; busy: boolean;
  direction: Direction; filter: Filter; writing: boolean;
  onDirection: (value: Direction) => void; onFilter: (value: Filter) => void; onWriting: (value: boolean) => void;
  onHome: () => void; onEdit: () => void; onCards: (ids: string[]) => void; onStart: (mode: "learn" | "cram" | "review") => void;
  onChat: () => void; onResume?: () => void; onStar: (cardId: string, starred: boolean) => void;
};

export default function DeckView(props: Props) {
  const { workspace, deck, time, busy, direction, filter, writing } = props;
  const visible = deck.cards.filter(item => filter === "all" || (filter === "starred"
    ? item.starred : workspace.mistakes[deck.id + ":" + direction]?.includes(item.id)));
  const ready = reviewQueue(workspace, visible, direction, time).length;

  return <>
    <button className="icon action-icon" aria-label="Zur Bibliothek" title="Zur Bibliothek" onClick={props.onHome}><NavIcon kind="back" /></button>
    <div className="page-heading"><div><span className="eyebrow">Kartenset · {plural(deck.cards.length, "Karte", "Karten")}</span><h1>{deck.title}</h1></div>
      <button className="icon action-icon" aria-label="Set bearbeiten" title="Set bearbeiten" onClick={props.onEdit}><NavIcon kind="edit" /></button></div>
    <details className="panel study-options">
      <summary>Lernoptionen <span>{filter === "starred" ? "Markierte Karten" : filter === "mistakes" ? "Letzte Fehler" : "Alle Karten"}{direction === "back" ? " · Rückseite zuerst" : ""}{writing ? " · Nur schreiben" : ""}</span></summary>
      <div className="options">
        <label>Fragerichtung<select value={direction} onChange={event => props.onDirection(event.target.value as Direction)}><option value="front">Vorderseite zuerst</option><option value="back">Rückseite zuerst</option></select></label>
        <label>Auswahl<select value={filter} onChange={event => props.onFilter(event.target.value as Filter)}><option value="all">Alle Karten</option><option value="starred">Markierte Karten</option><option value="mistakes">Letzte Fehler</option></select></label>
        <label className="check"><input type="checkbox" checked={writing} onChange={event => props.onWriting(event.target.checked)} /> Nur schreiben</label>
      </div>
    </details>
    <div className="study-modes">
      <button className="mode" disabled={!visible.length} onClick={() => props.onCards(visible.map(c => c.id))}><span aria-hidden="true">01</span><strong>Karten</strong><small>Umdrehen und wischen</small></button>
      <button className="mode" disabled={busy || !visible.length} onClick={() => props.onStart("learn")}><span aria-hidden="true">02</span><strong>Lernen</strong><small>Schritt für Schritt frei abrufen</small></button>
      <button className="mode" disabled={busy || !visible.length} onClick={() => props.onStart("cram")}><span aria-hidden="true">03</span><strong>Pauken</strong><small>Direkt üben und Fehler wiederholen</small></button>
      <button className="mode" disabled={busy || !visible.length} onClick={() => props.onStart("review")}><span aria-hidden="true">04</span><strong>Wiederholen</strong><small>{ready} zum Üben bereit</small></button>
    </div>
    {!visible.length && <p className="muted">In dieser Auswahl sind keine Karten. Wähle oben eine andere Auswahl.</p>}
    <div className="actions"><button className="button" onClick={props.onChat}>Mit ChatGPT lernen</button>{props.onResume && <button className="button" onClick={props.onResume}>Offene Runde fortsetzen</button>}</div>
    <section className="set-list panel" aria-label="Karten im Set">{deck.cards.map(item => <div key={item.id}>
      <span>{item.front}</span><span className="muted">{item.back}</span>
      <button className="icon star" aria-label={item.starred ? "Markierung entfernen" : "Karte markieren"} aria-pressed={item.starred}
        onClick={() => props.onStar(item.id, !item.starred)}><NavIcon kind="star" filled={item.starred} /></button>
    </div>)}</section>
  </>;
}
