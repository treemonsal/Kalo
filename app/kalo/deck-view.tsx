"use client";

import { useEffect, useRef, useState } from "react";
import { dayOf, dueCards, reviewQueue, type Deck, type Direction, type Filter, type Workspace, type Session } from "../../lib/learning";
import { examIn, sitting } from "../../lib/progress";
import { Icon, type IconKind } from "./icons";

type Props = {
  workspace: Workspace; deck: Deck; time: number; busy: boolean;
  direction: Direction; filter: Filter; writing: boolean;
  onDirection: (value: Direction) => void; onFilter: (value: Filter) => void; onWriting: (value: boolean) => void;
  onHome: () => void; backLabel: string; onEdit: () => void; onCards: () => void; onStart: (mode: "learn" | "cram" | "review") => void;
  onChat: () => void; onResume?: () => void; onStar: (cardId: string, starred: boolean) => void;
  onResumeSession: (session: Session) => void;
  shareToken?: string; onShare: () => void; onDuel: () => void;
};

/** When nothing is due: «später» (today), «ab morgen» or «in 3 Tagen», by calendar day in Zurich. Short enough for one line in the tile. */
function whenDue(at: number, now: number) {
  const days = Math.round((Date.parse(dayOf(at) + "T12:00:00Z") - Date.parse(dayOf(now) + "T12:00:00Z")) / 86_400_000);
  return days <= 0 ? "später" : days === 1 ? "ab morgen" : "in " + days + " Tagen";
}

export default function DeckView(props: Props) {
  const { workspace, deck, time, busy, direction, filter, writing } = props;
  const visible = deck.cards.filter(item => filter === "all" || (filter === "starred"
    ? item.starred : workspace.mistakes[deck.id + ":" + direction]?.includes(item.id)));
  const ready = reviewQueue(workspace, visible, direction, time).length;
  const due = dueCards(workspace, visible, direction, time).length;
  // The same rule as the tile on Home and in the profile, so a set never shows two different numbers.
  const done = sitting(workspace, deck);
  // When the next card of this side comes due, for «0 fällig · morgen».
  const next = visible.reduce((soonest, card) => {
    const at = Date.parse(workspace.reviews[card.id + ":" + direction]?.due ?? "");
    return at > time && at < soonest ? at : soonest;
  }, Infinity);
  const open = visible.filter(card => (workspace.progress[card.id + ":" + direction]?.streak ?? 0) < 2).length;
  const starred = deck.cards.filter(card => card.starred).length;
  const saved = workspace.passes?.[deck.id + ":" + direction];
  const resume = saved && !saved.done && saved.filter === filter && saved.index > 0 ? saved : null;
  const exam = examIn(deck, time);
  const [imports, setImports] = useState<number | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menu.current?.removeAttribute("open");
  // The menu closes on a tap outside or Escape, like a native menu.
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) closeMenu(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { closeMenu(); menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => {
    if (!props.shareToken) return;
    let active = true;
    fetch("/api/workspace?share=" + props.shareToken, { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<{ share?: { imports: number } }> : null)
      .then(body => { if (active && body?.share) setImports(body.share.imports); }).catch(() => undefined);
    return () => { active = false; };
  }, [props.shareToken]);
  const allModes: { mode: "cards" | "learn" | "cram" | "review"; icon: IconKind; title: string; text: string }[] = [
    { mode: "learn", icon: "target", title: "Lernen", text: open ? Math.min(open, 8) + " neu" : "0 neu" },
    { mode: "review", icon: "repeat", title: "Wiederholen", text: due ? due + " fällig" : Number.isFinite(next) ? whenDue(next, time) : "0 fällig" },
    { mode: "cram", icon: "bolt", title: "Pauken", text: String(visible.length) },
    { mode: "cards", icon: "cards", title: "Karten", text: resume ? "weiter bei " + (resume.index + 1) + " von " + visible.length : String(visible.length) },
  ];
  // Eine Hauptaktion: neue Karten lernen, sonst fällige wiederholen. Die übrigen Modi stehen kleiner darunter.
  const lead = !open && (due || ready) ? "review" : "learn";
  const modes = [...allModes.filter(m => m.mode === lead), ...allModes.filter(m => m.mode !== lead)];

  return <>
    <div className="view-bar">
      <button className="text-button" aria-label={"Zurück zu " + props.backLabel} onClick={props.onHome}><Icon kind="back" /></button>
      <div className="view-bar-actions">
        <button className="icon-button" onClick={props.onEdit} aria-label="Set bearbeiten"><Icon kind="edit" /></button>
        {/* Sharing, duel and ChatGPT are occasional: one menu instead of a row above the learning modes. */}
        <details className="more-menu" ref={menu}>
          <summary className="icon-button" aria-label="Weitere Aktionen"><Icon kind="more" /></summary>
          <div className="more-list" role="menu">
            <button role="menuitem" onClick={() => { closeMenu(); props.onShare(); }}><Icon kind="share" /><span>Teilen{imports ? <small>{imports + (imports === 1 ? " nutzt es" : " nutzen es")}</small> : null}</span></button>
            <button role="menuitem" onClick={() => { closeMenu(); props.onDuel(); }}><Icon kind="swords" /><span>Duell</span></button>
            <button role="menuitem" onClick={() => { closeMenu(); props.onChat(); }}><Icon kind="chat" /><span>Mit ChatGPT lernen</span></button>
          </div>
        </details>
      </div>
    </div>
    <header className="page-head">
      <div>
        <h1>{deck.title}</h1>
        <div className="deck-summary">
          <span className="meter"><i style={{ width: (done / Math.max(1, deck.cards.length)) * 100 + "%" }} /></span>
          <span aria-label={done + " von " + deck.cards.length + " Karten gelernt"}>{done}/{deck.cards.length}</span>
          {due > 0 && <span className="due-badge" aria-label={due + " fällig"}><Icon kind="repeat" size="s" />{due}</span>}
        </div>
      </div>
    </header>

    {props.onResume && <button className="continue-card compact" onClick={props.onResume}>
      <span className="continue-copy"><strong>Weitermachen</strong><span className="continue-meter">Offene Runde</span></span>
      <span className="continue-go" aria-hidden="true"><Icon kind="forward" /></span>
    </button>}

    {workspace.pausedSessions?.some(s => s.deckId === deck.id) && <details className="advanced paused-rounds">
      <summary aria-label="Unterbrochene Lernrunden"><Icon kind="clock" size="s" /> {workspace.pausedSessions.filter(s => s.deckId === deck.id).length}</summary>
      <ul>{workspace.pausedSessions.filter(s => s.deckId === deck.id).map(s => <li key={s.id}>
        <button onClick={() => props.onResumeSession(s)} disabled={busy}>
          <Icon kind={s.mode === "learn" ? "target" : s.mode === "cram" ? "bolt" : "repeat"} />
          <span><strong>{s.mode === "learn" ? "Lernen" : s.mode === "cram" ? "Pauken" : "Wiederholen"}</strong>
            <span>{deck.cards.find(c => c.id === s.queue[s.cursor])?.[s.direction]}</span></span>
          <small>{s.cursor + 1}/{s.queue.length}</small><Icon kind="forward" size="s" />
        </button></li>)}</ul>
    </details>}

    <div className="study-modes">
      {modes.map(item => <button key={item.mode} className={item.mode === lead ? "mode lead" : "mode"} data-mode={item.mode} data-quiet={item.mode === lead && props.onResume ? true : undefined} disabled={!visible.length || (busy && item.mode !== "cards")}
        onClick={() => item.mode === "cards" ? props.onCards() : props.onStart(item.mode)}>
        <span className="mode-icon"><Icon kind={item.icon} /></span><strong>{item.title}</strong><small className="mode-count">{item.text}</small>
      </button>)}
    </div>

    {exam !== null && <p className="deck-exam" data-soon={exam <= 3}><Icon kind="calendar" /> {exam === 0 ? "Prüfung heute" : "Prüfung in " + exam + (exam === 1 ? " Tag" : " Tagen")} · {deck.cards.length - done ? deck.cards.length - done + " Karten sitzen noch nicht" : "alles sitzt"}</p>}


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
      <div className="section-head"><h2 id="cards-title">{deck.cards.length} {deck.cards.length === 1 ? "Karte" : "Karten"}</h2></div>
      <ul className="panel card-rows">{deck.cards.map(item => <li key={item.id}>
        <span className="row-front">{item.front}</span><span className="row-back">{item.back}</span>
        <button className="icon-button star" aria-label={(item.starred ? "Markierung entfernen: " : "Markieren: ") + item.front} aria-pressed={item.starred}
          title={item.starred ? "Markierung entfernen" : "Markieren"} onClick={() => props.onStar(item.id, !item.starred)}><Icon kind="star" filled={item.starred} /></button>
      </li>)}</ul>
    </section>
  </>;
}
