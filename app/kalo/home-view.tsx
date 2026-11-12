"use client";

import type { Deck, Direction, Workspace } from "../../lib/learning";
import { examIn, openCards, recentDecks, type Step } from "../../lib/progress";
import { DeckTile } from "./profile-view";
import { DailyHero, NextStepCard } from "./progress-ui";
import { EmptyState } from "./feedback";
import { Icon } from "./icons";
import { dateFormat, plural, type Draft } from "./types";

export type DueSet = { deck: Deck; side: Direction; count: number; oldest: number };
export type Recent = { title: string; mode: string; detail: string; progress: number; onOpen: () => void };
type Props = {
  workspace: Workspace; busy: boolean; dueSets: DueSet[]; dueCount: number; nextReview: number; now: number;
  recent?: Recent; step: Step; drafts: Draft[]; onStep: (step: Step) => void; onGoal: () => void; onDraft: (draft: Draft) => void; onProfile: () => void;
  unsaved?: { title: string; onOpen: () => void; onDiscard: () => void };
  onReview: (item: DueSet) => void; onOpenDeck: (deck: Deck) => void; onCreate: () => void;
};

export default function HomeView({ workspace, busy, dueSets, dueCount, nextReview, now, recent, step, drafts, onStep, onGoal, onDraft, onProfile, unsaved, onReview, onOpenDeck, onCreate }: Props) {
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

    {/* Sets from ChatGPT open straight in the editor: check, then save or discard. */}
    {drafts.map(draft => <button key={draft.id} className="continue-card" onClick={() => onDraft(draft)}>
      <span className="continue-copy"><span className="eyebrow">Entwurf von ChatGPT</span><strong>{draft.title}</strong><span className="muted">{plural(draft.cards.length, "Karte", "Karten")} · prüfen und speichern</span></span>
      <span className="continue-go" aria-hidden="true"><Icon kind="forward" /></span>
    </button>)}

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
      {/* One button for everything due: it starts with the oldest set, the finish screen leads on to the next one. */}
      <button className="button primary due-go" disabled={busy} onClick={() => onReview(dueSets[0])}><Icon kind="repeat" /> Jetzt üben</button>
      {dueSets.length > 1 && <details className="advanced due-sets"><summary>Aus {dueSets.length} Sets</summary>
        <ul className="due-list">{dueSets.map(item => <li key={item.deck.id + item.side}>
          <div><strong>{item.deck.title}</strong><span><Icon kind="cards" size="s" /> {item.count}{dueSets.some(other => other.deck.id === item.deck.id && other.side !== item.side) ? (item.side === "front" ? " · Vorderseite" : " · Rückseite") : ""}</span></div>
          <button className="text-button" disabled={busy} onClick={() => onReview(item)}
            aria-label={item.deck.title + " wiederholen, " + plural(item.count, "Karte", "Karten") + (item.side === "front" ? ", Vorderseite zuerst" : ", Rückseite zuerst")}><Icon kind="repeat" /> Üben</button>
        </li>)}</ul>
      </details>}
    </section> : workspace.decks.length > 0 && Number.isFinite(nextReview) && <p className="quiet-line"><Icon kind="check" /> Nächste Wiederholung {dateFormat.format(nextReview)}</p>}

    {exams.length > 0 && <section className="exam-list" aria-label="Prüfungen">{exams.map(({ deck, days, open }) =>
      <button key={deck.id} className="exam-card" data-soon={days! <= 3} onClick={() => onOpenDeck(deck)}>
        <span className="exam-days"><strong>{days === 0 ? "Heute" : days}</strong>{days ? <small>{days === 1 ? "Tag" : "Tage"}</small> : null}</span>
        <span className="exam-copy"><strong>Prüfung {deck.title}</strong><span>{open ? open + " Karten sitzen noch nicht" : "Alle Karten sitzen"}</span></span>
        <Icon kind="chevronRight" />
      </button>)}</section>}

    {workspace.decks.length > 0 ? <section aria-labelledby="recent" className="sets">
      <div className="section-head"><h2 id="recent">Zuletzt</h2>
        {workspace.decks.length > 3 && <button className="text-button" onClick={onProfile}>Alle {workspace.decks.length} Sets <Icon kind="chevronRight" /></button>}</div>
      <div className="decks">{recentDecks(workspace).map(deck => <DeckTile key={deck.id} workspace={workspace} deck={deck} now={now} due={dueByDeck.get(deck.id) ?? 0} onOpen={onOpenDeck} />)}</div>
    </section>
      : <EmptyState icon="cards" title="Dein erstes Set" text="Tippe unten auf Plus. Du kannst Karten selber schreiben oder von ChatGPT erstellen lassen.">
        <button className="button primary" onClick={onCreate}><Icon kind="plus" /> Set erstellen</button>
      </EmptyState>}
  </>;
}
