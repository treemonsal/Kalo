"use client";

import { useEffect, useState } from "react";
import { dueCards, reviewQueue, secure, type Deck, type Direction, type Filter, type Workspace } from "../../lib/learning";
import { examIn } from "../../lib/progress";
import { Icon, type IconKind } from "./icons";
import { plural } from "./types";

type Props = {
  workspace: Workspace; deck: Deck; time: number; busy: boolean;
  direction: Direction; filter: Filter; writing: boolean;
  onDirection: (value: Direction) => void; onFilter: (value: Filter) => void; onWriting: (value: boolean) => void;
  onHome: () => void; onEdit: () => void; onCards: () => void; onStart: (mode: "learn" | "cram" | "review") => void;
  onChat: () => void; onResume?: () => void; onStar: (cardId: string, starred: boolean) => void;
  shareToken?: string; onMeta: (meta: { examDate?: string | null; subject?: string | null }) => void; onShare: () => void; onDuel: () => void;
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
  const saved = workspace.passes?.[deck.id + ":" + direction];
  const resume = saved && !saved.done && saved.filter === filter && saved.index > 0 ? saved : null;
  const exam = examIn(deck, time);
  const subjects = [...new Set(workspace.decks.map(item => item.subject).filter(Boolean))] as string[];
  const [subject, setSubject] = useState(deck.subject ?? "");
  const [imports, setImports] = useState<number | null>(null);
  useEffect(() => {
    if (!props.shareToken) return;
    let active = true;
    fetch("/api/workspace?share=" + props.shareToken, { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<{ share?: { imports: number } }> : null)
      .then(body => { if (active && body?.share) setImports(body.share.imports); }).catch(() => undefined);
    return () => { active = false; };
  }, [props.shareToken]);
  const modes: { mode: "cards" | "learn" | "cram" | "review"; icon: IconKind; title: string; text: string }[] = [
    { mode: "cards", icon: "cards", title: "Karten", text: resume ? "weiter bei " + (resume.index + 1) + " von " + visible.length : String(visible.length) },
    { mode: "learn", icon: "target", title: "Lernen", text: open ? Math.min(open, 8) + " neu" : "0 neu" },
    { mode: "cram", icon: "bolt", title: "Pauken", text: String(visible.length) },
    { mode: "review", icon: "repeat", title: "Wiederholen", text: due ? due + " fällig" : ready ? ready + " bereit" : "0" },
  ];

  return <>
    <div className="view-bar">
      <button className="text-button" aria-label="Zurück zur Bibliothek" onClick={props.onHome}><Icon kind="back" /> Bibliothek</button>
      <button className="text-button" onClick={props.onEdit}><Icon kind="edit" /> Bearbeiten</button>
    </div>
    <header className="page-head">
      <div>
        <h1>{deck.title}</h1>
        <div className="deck-summary">
          <span className="meter"><i style={{ width: (done / Math.max(1, deck.cards.length)) * 100 + "%" }} /></span>
          <span>{done} von {plural(deck.cards.length, "Karte", "Karten")} sitzen{due ? " · " + due + " fällig" : ""}</span>
        </div>
      </div>
    </header>

    {props.onResume && <button className="continue-card compact" onClick={props.onResume}>
      <span className="continue-copy"><span className="eyebrow">Offene Runde</span><strong>Weitermachen</strong></span>
      <span className="continue-go" aria-hidden="true"><Icon kind="forward" /></span>
    </button>}

    <div className="study-modes">
      {modes.map(item => <button key={item.mode} className="mode" data-mode={item.mode} disabled={!visible.length || (busy && item.mode !== "cards")}
        onClick={() => item.mode === "cards" ? props.onCards() : props.onStart(item.mode)}>
        <span className="mode-icon"><Icon kind={item.icon} /></span><strong>{item.title}</strong><small className="mode-count">{item.text}</small>
      </button>)}
    </div>

    <section className="panel plan-panel" aria-label="Prüfung und Fach">
      <label><span className="label-icon"><Icon kind="calendar" size="s" /> Prüfung</span><input type="date" value={deck.examDate ?? ""} onChange={event => props.onMeta({ examDate: event.target.value || null })} /></label>
      <label><span className="label-icon"><Icon kind="library" size="s" /> Fach</span><input list="subjects" aria-label="Fach" value={subject} maxLength={40} placeholder="Zum Beispiel W&G" onChange={event => setSubject(event.target.value)}
        onBlur={() => { if ((deck.subject ?? "") !== subject.trim()) props.onMeta({ subject: subject.trim() || null }); }} /></label>
      <datalist id="subjects">{subjects.map(item => <option key={item} value={item} />)}</datalist>
      {exam !== null && <p className="exam-note" data-soon={exam <= 3}><Icon kind="calendar" /> {exam === 0 ? "Prüfung heute" : "Noch " + exam + (exam === 1 ? " Tag" : " Tage")} · {deck.cards.length - done ? deck.cards.length - done + " Karten sitzen noch nicht" : "alles sitzt"}</p>}
    </section>

    <div className="actions social-actions">
      <button className="text-button" onClick={props.onShare}><Icon kind="share" /> Teilen{imports ? " · " + imports + (imports === 1 ? " nutzt es" : " nutzen es") : ""}</button>
      <button className="text-button" onClick={props.onDuel}><Icon kind="swords" /> Duell</button>
      <button className="text-button" onClick={props.onChat}><Icon kind="chat" /> ChatGPT</button>
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
      <div className="section-head"><h2 id="cards-title">Karten <span className="count">{deck.cards.length}</span></h2></div>
      <ul className="panel card-rows">{deck.cards.map(item => <li key={item.id}>
        <span className="row-front">{item.front}</span><span className="row-back">{item.back}</span>
        <button className="icon-button star" aria-label={(item.starred ? "Markierung entfernen: " : "Markieren: ") + item.front} aria-pressed={item.starred}
          title={item.starred ? "Markierung entfernen" : "Markieren"} onClick={() => props.onStar(item.id, !item.starred)}><Icon kind="star" filled={item.starred} /></button>
      </li>)}</ul>
    </section>
  </>;
}
