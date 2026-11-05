"use client";

import { useState } from "react";
import { secure, type Deck, type Direction, type Workspace } from "../../lib/learning";
import { examIn, openCards, type Step } from "../../lib/progress";
import type { PartnerSummary } from "../../lib/social";
import { DailyHero, MasteryRing, NextStepCard, PartnerCard, SubjectLevels } from "./progress-ui";
import { EmptyState } from "./feedback";
import { Icon } from "./icons";
import { dateFormat, plural } from "./types";

export type DueSet = { deck: Deck; side: Direction; count: number; oldest: number };
export type Recent = { title: string; mode: string; detail: string; progress: number; onOpen: () => void };
type Props = {
  workspace: Workspace; busy: boolean; dueSets: DueSet[]; dueCount: number; nextReview: number; now: number;
  recent?: Recent; step: Step; partner?: PartnerSummary | null; onStep: (step: Step) => void; onGoal: () => void;
  unsaved?: { title: string; onOpen: () => void; onDiscard: () => void };
  onReview: (item: DueSet) => void; onOpenDeck: (deck: Deck) => void; onChat: () => void; onCreate: () => void;
};

export default function HomeView({ workspace, busy, dueSets, dueCount, nextReview, now, recent, step, partner, onStep, onGoal, unsaved, onReview, onOpenDeck, onChat, onCreate }: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("de-CH");
  const decks = workspace.decks.filter(item => !query ||
    [item.title, ...item.cards.flatMap(card => [card.front, card.back])]
      .some(value => value.toLocaleLowerCase("de-CH").includes(query)));
  const exams = workspace.decks.map(deck => ({ deck, days: examIn(deck, now), open: openCards(workspace, deck).length }))
    .filter(item => item.days !== null && item.days <= 30).sort((a, b) => a.days! - b.days!);
  const dueByDeck = new Map<string, number>();
  dueSets.forEach(item => dueByDeck.set(item.deck.id, (dueByDeck.get(item.deck.id) ?? 0) + item.count));

  return <>
    <header className="page-head">
      <h1>Was lernst du heute?</h1>
    </header>

    {workspace.decks.length > 0 && <DailyHero workspace={workspace} now={now} onGoal={onGoal} />}

    {unsaved && <div className="notice-card">
      <span className="notice-icon"><Icon kind="edit" /></span>
      <div className="notice-copy"><strong>{unsaved.title || "Neues Set"} ist nicht gespeichert</strong><span>Deine Änderungen sind auf diesem Gerät gesichert.</span></div>
      <div className="actions"><button className="button primary small" onClick={unsaved.onOpen}>Weiterbearbeiten</button><button className="button small" onClick={unsaved.onDiscard}>Verwerfen</button></div>
    </div>}

    {recent && <button className="continue-card" onClick={recent.onOpen}>
      <span className="continue-copy">
        <span className="eyebrow">Weiterlernen · {recent.mode}</span>
        <strong>{recent.title}</strong>
        <span className="continue-meter"><span className="meter"><i style={{ width: Math.round(recent.progress * 100) + "%" }} /></span><span>{recent.detail}</span></span>
      </span>
      <span className="continue-go" aria-hidden="true"><Icon kind="forward" /></span>
    </button>}
    {!recent && <NextStepCard step={step} onStep={onStep} />}

    {dueSets.length > 0 ? <section className="due-card" aria-labelledby="due">
      <div className="due-head">
        <span className="due-count">{dueCount}</span>
        <h2 id="due">{dueCount === 1 ? "Karte fällig" : "Karten fällig"}</h2>
      </div>
      <ul className="due-list">{dueSets.map(item => <li key={item.deck.id + item.side}>
        <div><strong>{item.deck.title}</strong><span><Icon kind="cards" size="s" /> {item.count}{dueSets.some(other => other.deck.id === item.deck.id && other.side !== item.side) ? (item.side === "front" ? " · Vorderseite" : " · Rückseite") : ""}</span></div>
        <button className="icon-button go" disabled={busy} onClick={() => onReview(item)}
          aria-label={item.deck.title + " wiederholen, " + plural(item.count, "Karte", "Karten") + (item.side === "front" ? ", Vorderseite zuerst" : ", Rückseite zuerst")}><Icon kind="forward" /></button>
      </li>)}</ul>
    </section> : workspace.decks.length > 0 && Number.isFinite(nextReview) && <p className="quiet-line"><Icon kind="check" /> Nächste Wiederholung {dateFormat.format(nextReview)}</p>}

    {exams.length > 0 && <section className="exam-list" aria-label="Prüfungen">{exams.map(({ deck, days, open }) =>
      <button key={deck.id} className="exam-card" data-soon={days! <= 3} onClick={() => onOpenDeck(deck)}>
        <span className="exam-days"><strong>{days === 0 ? "Heute" : days}</strong>{days ? <small>{days === 1 ? "Tag" : "Tage"}</small> : null}</span>
        <span className="exam-copy"><strong>Prüfung {deck.title}</strong><span>{open ? open + " Karten sitzen noch nicht" : "Alle Karten sitzen"}</span></span>
        <Icon kind="chevronRight" />
      </button>)}</section>}

    {partner && <PartnerCard partner={partner} />}
    <SubjectLevels workspace={workspace} />

    <section aria-labelledby="sets" className="sets">
      <div className="section-head"><h2 id="sets">Meine Sets</h2>
        {workspace.decks.length > 2 && <label className="search"><Icon kind="search" /><span className="sr-only">Bibliothek durchsuchen</span>
          <input type="search" value={search} placeholder="Suchen" onChange={event => setSearch(event.target.value)} /></label>}
      </div>
      {decks.length ? <div className="decks">{decks.map(deck => {
        const done = deck.cards.filter(card => secure(workspace, card.id, "front") || secure(workspace, card.id, "back")).length;
        const due = dueByDeck.get(deck.id) ?? 0;
        const exam = examIn(deck, now);
        const share = done / Math.max(1, deck.cards.length);
        return <button className="deck-tile" key={deck.id} onClick={() => onOpenDeck(deck)}
          aria-label={deck.title + ", " + plural(deck.cards.length, "Karte", "Karten") + ", " + Math.round(share * 100) + " Prozent sitzen" + (due ? ", " + due + " fällig" : "") + (exam !== null ? ", Prüfung in " + exam + " Tagen" : "")}>
          <MasteryRing share={share} />
          <span className="tile-title">{deck.title}</span>
          <span className="tile-meta" aria-hidden="true">
            <span><Icon kind="cards" size="s" /> {deck.cards.length}</span>
            {due > 0 && <span className="due-badge"><Icon kind="repeat" size="s" /> {due}</span>}
            {exam !== null && <span className="exam-badge"><Icon kind="calendar" size="s" /> {exam === 0 ? "heute" : exam + " T."}</span>}
            {deck.subject && <span className="subject-badge">{deck.subject}</span>}
          </span>
        </button>;
      })}</div>
        : workspace.decks.length ? <EmptyState icon="search" title="Nichts gefunden" text={"Kein Set enthält «" + search.trim() + "»."}><button className="button" onClick={() => setSearch("")}>Suche zurücksetzen</button></EmptyState>
          : <EmptyState icon="cards" title="Dein erstes Set">
            <button className="button primary" onClick={onCreate}><Icon kind="plus" /> Set erstellen</button>
            <button className="button" onClick={onChat}><Icon kind="chat" /> Mit ChatGPT</button>
          </EmptyState>}
    </section>
  </>;
}
