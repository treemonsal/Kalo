"use client";

import { dueCards, reviewQueue, secure, type Deck, type Direction, type Filter, type Workspace } from "../../lib/learning";
import { Icon, type IconKind } from "./icons";
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
  const due = dueCards(workspace, visible, direction, time).length;
  const done = deck.cards.filter(card => secure(workspace, card.id, direction)).length;
  const open = visible.filter(card => (workspace.progress[card.id + ":" + direction]?.streak ?? 0) < 2).length;
  const starred = deck.cards.filter(card => card.starred).length;
  const modes: { mode: "cards" | "learn" | "cram" | "review"; icon: IconKind; title: string; text: string }[] = [
    { mode: "cards", icon: "cards", title: "Karten", text: "Umdrehen und wischen" },
    { mode: "learn", icon: "target", title: "Lernen", text: open ? plural(Math.min(open, 8), "Karte", "Karten") + " in der nächsten Einheit" : "Alles sitzt" },
    { mode: "cram", icon: "bolt", title: "Pauken", text: "Alle Karten direkt abfragen" },
    { mode: "review", icon: "repeat", title: "Wiederholen", text: due ? due + " fällig" : ready ? ready + " neu bereit" : "Nichts fällig" },
  ];

  return <>
    <div className="view-bar">
      <button className="icon-button" aria-label="Zur Bibliothek" title="Zur Bibliothek" onClick={props.onHome}><Icon kind="back" /></button>
      <button className="button small" onClick={props.onEdit}><Icon kind="edit" /> Bearbeiten</button>
    </div>
    <header className="page-head">
      <div>
        <span className="eyebrow">Kartenset</span>
        <h1>{deck.title}</h1>
        <div className="deck-summary">
          <span className="meter"><i style={{ width: (done / Math.max(1, deck.cards.length)) * 100 + "%" }} /></span>
          <span>{done} von {plural(deck.cards.length, "Karte", "Karten")} sitzen{due ? " · " + due + " fällig" : ""}</span>
        </div>
      </div>
    </header>

    {props.onResume && <button className="continue-card compact" onClick={props.onResume}>
      <span className="continue-copy"><span className="eyebrow">Offene Runde</span><strong>Dort weitermachen, wo du aufgehört hast</strong></span>
      <span className="continue-go" aria-hidden="true"><Icon kind="forward" /></span>
    </button>}

    <div className="study-modes">
      {modes.map(item => <button key={item.mode} className="mode" data-mode={item.mode} disabled={!visible.length || (busy && item.mode !== "cards")}
        onClick={() => item.mode === "cards" ? props.onCards(visible.map(c => c.id)) : props.onStart(item.mode)}>
        <span className="mode-icon"><Icon kind={item.icon} /></span><strong>{item.title}</strong><small>{item.text}</small>
      </button>)}
    </div>

    <details className="panel options-panel">
      <summary><span>Lernoptionen</span><span className="summary-value">{filter === "starred" ? "Markierte Karten" : filter === "mistakes" ? "Letzte Fehler" : "Alle Karten"}{direction === "back" ? " · Rückseite zuerst" : ""}{writing ? " · Nur schreiben" : ""}</span></summary>
      <div className="options">
        <label>Fragerichtung<select value={direction} onChange={event => props.onDirection(event.target.value as Direction)}><option value="front">Vorderseite zuerst</option><option value="back">Rückseite zuerst</option></select></label>
        <label>Auswahl<select value={filter} onChange={event => props.onFilter(event.target.value as Filter)}><option value="all">Alle Karten</option><option value="starred">Markierte Karten ({starred})</option><option value="mistakes">Letzte Fehler</option></select></label>
        <label className="check"><input type="checkbox" checked={writing} onChange={event => props.onWriting(event.target.checked)} /> Beim Lernen nur schreiben</label>
      </div>
    </details>
    {!visible.length && <p className="quiet-line"><Icon kind="alert" /> In dieser Auswahl sind keine Karten. Wähle unter Lernoptionen eine andere Auswahl.</p>}

    <section className="set-list" aria-labelledby="cards-title">
      <div className="section-head"><h2 id="cards-title">Karten <span className="count">{deck.cards.length}</span></h2>
        <button className="button small" onClick={props.onChat}><Icon kind="chat" /> Mit ChatGPT lernen</button></div>
      <ul className="panel card-rows">{deck.cards.map(item => <li key={item.id}>
        <span className="row-front">{item.front}</span><span className="row-back">{item.back}</span>
        <button className="icon-button star" aria-label={(item.starred ? "Markierung entfernen: " : "Markieren: ") + item.front} aria-pressed={item.starred}
          title={item.starred ? "Markierung entfernen" : "Markieren"} onClick={() => props.onStar(item.id, !item.starred)}><Icon kind="star" filled={item.starred} /></button>
      </li>)}</ul>
    </section>
  </>;
}
