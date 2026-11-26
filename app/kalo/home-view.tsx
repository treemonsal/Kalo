"use client";

import type { Deck, Direction, Workspace } from "../../lib/learning";
import { examIn, openCards, recentDecks, type Step } from "../../lib/progress";
import { DeckTile } from "./deck-tile";
import { DailyHero } from "./progress-ui";
import { EmptyState } from "./feedback";
import { Icon } from "./icons";
import { dateFormat, plural, type Draft } from "./types";

export type DueSet = { deck: Deck; side: Direction; count: number; oldest: number };
export type Recent = { title: string; mode: string; detail: string; progress: number; onOpen: () => void };
type Props = {
  workspace: Workspace; decks: Deck[]; busy: boolean; dueSets: DueSet[]; dueCount: number; dueByDeck: Map<string, number>; nextReview: number; now: number;
  recent?: Recent; step: Step; drafts: Draft[]; onStep: (step: Step) => void; onGoal: () => void; onDraft: (draft: Draft) => void; onProfile: () => void;
  unsaved?: { title: string; onOpen: () => void; onDiscard: () => void };
  onReview: (item: DueSet) => void; onOpenDeck: (deck: Deck) => void; onCreate: () => void; onExamDate: (deck: Deck) => void;
};

export default function HomeView({ workspace, decks, busy, dueSets, dueCount, dueByDeck, nextReview, now, recent, step, drafts, onStep, onGoal, onDraft, onProfile, unsaved, onReview, onOpenDeck, onCreate, onExamDate }: Props) {
  const missingDates = decks.filter(deck => !deck.examDate);
  const exam = decks.map(deck => ({ deck, days: examIn(deck, now), open: openCards(workspace, deck).length }))
    .filter(item => item.days !== null && item.days <= 30).sort((a, b) => a.days! - b.days!)[0];
  // Exactly one main action. An open learning round wins over a previous card view.
  const primary = step.kind === "resume"
    ? { label: "Weiterlernen", title: workspace.decks.find(deck => deck.id === step.deckId)?.title ?? step.label, detail: step.detail, progress: recent?.mode !== "Karten" ? recent?.progress : undefined, open: () => onStep(step) }
    : recent ? { label: "Weiterlernen · " + recent.mode, title: recent.title, detail: recent.detail, progress: recent.progress, open: recent.onOpen }
      : step.kind === "review" && dueSets[0] ? { label: "Jetzt wiederholen", title: dueSets[0].deck.title, detail: plural(dueCount, "fällige Karte", "fällige Karten"), open: () => onReview(dueSets[0]) }
        : step.kind !== "done" ? { label: "Als Nächstes", title: step.label, detail: step.detail, open: () => onStep(step) } : null;

  return <>
    <header className="page-head"><h1>Was lernst du heute?</h1></header>

    {missingDates.length > 0 && <section className="panel exam-date-prompt" aria-labelledby="exam-date-prompt-title">
      <span className="exam-date-mark" aria-hidden="true"><Icon kind="calendar" /></span>
      <h2 id="exam-date-prompt-title">{missingDates.length === 1 ? "Prüfungstermin fehlt" : missingDates.length + " Prüfungstermine fehlen"}</h2>
      <button className="button primary small" disabled={busy} onClick={() => onExamDate(missingDates[0])}>Datum eintragen</button>
    </section>}

    {workspace.decks.length === 0 ? <EmptyState icon="cards" title="Dein erstes Set">
      <button className="button primary" onClick={onCreate}><Icon kind="plus" /> Set erstellen</button>
    </EmptyState> : <>
      {primary ? <button className="continue-card learning-primary" disabled={busy} onClick={primary.open}>
        {/* Title first, the kind of step below it as quiet meta: no label above the heading. An empty bar says nothing, so it only appears with progress. */}
        <span className="continue-copy"><strong>{primary.title}</strong><span className="continue-meta">{primary.label}</span>
          {primary.progress !== undefined && primary.progress > 0 && <span className="meter"><i style={{ width: Math.round(primary.progress * 100) + "%" }} /></span>}
        </span><span className="continue-go" aria-hidden="true"><Icon kind="forward" /></span>
      </button> : decks.length === 0 ? <EmptyState icon="calendar" title="Keine offenen Prüfungen" text="Deine bisherigen Themen findest du weiterhin unter Alle Sets."><button className="button" onClick={onProfile}>Alle Sets</button></EmptyState>
        : <div className="daily-done"><Icon kind="check" /><div><strong>Alles für heute geschafft</strong>{Number.isFinite(nextReview) && <p>Nächste Wiederholung {dateFormat.format(nextReview)}</p>}</div></div>}
      <DailyHero workspace={workspace} now={now} onGoal={onGoal} />
    </>}

    {(unsaved || drafts.length > 0) && <div className="home-tasks">
      {unsaved && <div className="home-task"><button className="text-button" onClick={unsaved.onOpen}><Icon kind="edit" /><span>{unsaved.title || "Neues Set"} weiterbearbeiten</span><Icon kind="chevronRight" size="s" /></button>
        <button className="icon-button small" aria-label="Lokalen Entwurf verwerfen" onClick={unsaved.onDiscard}><Icon kind="close" size="s" /></button></div>}
      {drafts.map(draft => <button key={draft.id} className="text-button" onClick={() => onDraft(draft)}><Icon kind="chat" /><span>{draft.title} · Entwurf prüfen</span><Icon kind="chevronRight" size="s" /></button>)}
    </div>}

    {dueSets.length > 0 && <section className="due-section" aria-label="Fällige Karten">
      <button className="due-alert" disabled={busy} onClick={() => onReview(dueSets[0])}>
        <span className="due-alert-count">{dueCount}</span><span className="due-alert-copy">Fällig</span><Icon kind="forward" />
      </button>
      {dueSets.length > 1 && <details className="advanced due-sets"><summary aria-label="Fällige Sets anzeigen"><Icon kind="library" size="s" /> {dueSets.length}</summary>
        <ul className="due-list">{dueSets.map(item => <li key={item.deck.id + item.side}>
          <div><strong>{item.deck.title}</strong><span>{item.count} · {item.side === "front" ? "Vorderseite" : "Rückseite"}</span></div>
          <button className="icon-button" disabled={busy} onClick={() => onReview(item)} aria-label={item.deck.title + " wiederholen, " + item.count + " Karten"}><Icon kind="forward" /></button>
        </li>)}</ul>
      </details>}
    </section>}

    {exam && <button className="home-exam" onClick={() => onOpenDeck(exam.deck)}><Icon kind="calendar" /><span><strong>{exam.deck.title}</strong><span>{exam.days === 0 ? "Prüfung heute" : "Prüfung in " + exam.days + (exam.days === 1 ? " Tag" : " Tagen")}{exam.open ? " · " + exam.open + " Karten offen" : ""}</span></span><Icon kind="chevronRight" size="s" /></button>}

    {decks.length > 0 && <section aria-labelledby="recent" className="sets">
      <div className="section-head"><h2 id="recent">Zuletzt</h2>
        <button className="text-button" onClick={onProfile}>Alle Sets <Icon kind="chevronRight" size="s" /></button></div>
      <div className="decks">{recentDecks(workspace, 3, decks).map(deck => <DeckTile key={deck.id} workspace={workspace} deck={deck} now={now} due={dueByDeck.get(deck.id) ?? 0} onOpen={onOpenDeck} />)}</div>
    </section>}
  </>;
}
