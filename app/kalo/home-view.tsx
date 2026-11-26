"use client";

import type { Deck, Direction, Workspace } from "../../lib/learning";
import { examIn, examPace, openCards, recentDecks, type Step } from "../../lib/progress";
import { DeckTile } from "./deck-tile";
import { DailyHero } from "./progress-ui";
import { EmptyState } from "./feedback";
import { Icon } from "./icons";
import { dateFormat, plural, type Draft } from "./types";

export type DueSet = { deck: Deck; side: Direction; count: number; oldest: number };
export type Recent = { title: string; mode: string; detail: string; progress: number; onOpen: () => void };
type Props = {
  workspace: Workspace; decks: Deck[]; busy: boolean; dueSets: DueSet[]; dueCount: number; dueByDeck: Map<string, number>; storageFull: number; nextReview: number; now: number;
  recent?: Recent; step: Step; drafts: Draft[]; onStep: (step: Step) => void; onGoal: () => void; onDraft: (draft: Draft) => void; onProfile: () => void;
  unsaved?: { title: string; onOpen: () => void; onDiscard: () => void };
  onReview: (item: DueSet) => void; onOpenDeck: (deck: Deck) => void; onCreate: () => void; onChat: () => void; onImport: () => void; onSample: () => void; onExamDate: (deck: Deck) => void;
};

export default function HomeView({ workspace, decks, busy, dueSets, dueCount, dueByDeck, storageFull, nextReview, now, recent, step, drafts, onStep, onGoal, onDraft, onProfile, unsaved, onReview, onOpenDeck, onCreate, onChat, onImport, onSample, onExamDate }: Props) {
  const missingDates = decks.filter(deck => !deck.examDate);
  // The plan up to the exams: how many open cards a day, summed over every set with an upcoming exam.
  const paces = decks.map(deck => examPace(workspace, deck, now)).filter(item => item !== null);
  const perDay = paces.reduce((sum, item) => sum + item.perDay, 0);
  const exam = decks.map(deck => ({ deck, days: examIn(deck, now), open: openCards(workspace, deck).length }))
    .filter(item => item.days !== null && item.days <= 30).sort((a, b) => a.days! - b.days!)[0];
  const examFocus = exam ? examPace(workspace, exam.deck, now) : null;
  // Exactly one main action. An open learning round wins over a previous card view.
  const primary = step.kind === "resume"
    ? { label: "Weiterlernen", title: workspace.decks.find(deck => deck.id === step.deckId)?.title ?? step.label, detail: step.detail, progress: recent?.mode !== "Karten" ? recent?.progress : undefined, open: () => onStep(step) }
    : recent ? { label: "Weiterlernen · " + recent.mode, title: recent.title, detail: recent.detail, progress: recent.progress, open: recent.onOpen }
      : step.kind === "review" && dueSets[0] ? { label: "Jetzt wiederholen", title: dueSets[0].deck.title, detail: plural(dueCount, "fällige Karte", "fällige Karten"), open: () => onReview(dueSets[0]) }
        : step.kind !== "done" ? { label: "Als Nächstes", title: step.label, detail: step.detail, open: () => onStep(step) } : null;

  return <>
    <header className="page-head"><h1>Was lernst du heute?</h1></header>

    {/* Warns long before the account is full, so saving never fails out of the blue. */}
    {storageFull > 0.85 && <p className="storage-warning" role="status"><Icon kind="alert" size="s" /> Dein Speicher ist zu {Math.round(storageFull * 100)} % voll. Lösche alte Sets oder kürze lange Beispiele.</p>}

    {missingDates.length > 0 && <section className="panel exam-date-prompt" aria-labelledby="exam-date-prompt-title">
      <span className="exam-date-mark" aria-hidden="true"><Icon kind="calendar" /></span>
      <h2 id="exam-date-prompt-title">{missingDates.length === 1 ? "Prüfungstermin fehlt" : missingDates.length + " Prüfungstermine fehlen"}</h2>
      <button className="button primary small" disabled={busy} onClick={() => onExamDate(missingDates[0])}>Datum eintragen</button>
    </section>}

    {/* First start: what Kalo does, three ways to a first set, and a ready set to try every mode right away. */}
    {workspace.decks.length === 0 ? <section className="first-start" aria-labelledby="first-title">
      <h2 id="first-title">Dein erstes Set</h2>
      <p className="muted">Kalo fragt dich ab, bis die Karten sitzen, und holt sie vor der Prüfung rechtzeitig zurück.</p>
      <div className="first-ways">
        <button className="first-way" onClick={onChat}><Icon kind="chat" /><span><strong>Aus Unterlagen mit ChatGPT</strong><small>Skript oder Fotos, ChatGPT schreibt die Karten</small></span></button>
        <button className="first-way" onClick={onImport}><Icon kind="import" /><span><strong>Liste importieren</strong><small>Aus Quizlet, Excel oder CSV</small></span></button>
        <button className="first-way" onClick={onCreate}><Icon kind="edit" /><span><strong>Selbst schreiben</strong><small>Frage und Antwort, Karte für Karte</small></span></button>
      </div>
      <button className="button primary" disabled={busy} onClick={onSample}><Icon kind="cards" /> Beispielset ausprobieren</button>
    </section> : <>
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

    {exam && <button className="home-exam" onClick={() => onOpenDeck(exam.deck)}><Icon kind="calendar" /><span><strong>{exam.deck.title}</strong><span>{exam.days === 0 ? "Prüfung heute" : "Prüfung in " + exam.days + (exam.days === 1 ? " Tag" : " Tagen")}{exam.open ? " · " + exam.open + " Karten offen" : ""}{examFocus ? " · " + examFocus.perDay + " pro Tag" : ""}</span></span><Icon kind="chevronRight" size="s" /></button>}
    {paces.length > 1 && <p className="exam-pace"><Icon kind="target" size="s" /> Für alle Prüfungen: {perDay} Karten pro Tag</p>}

    {decks.length > 0 && <section aria-labelledby="recent" className="sets">
      <div className="section-head"><h2 id="recent">Zuletzt</h2>
        <button className="text-button" onClick={onProfile}>Alle Sets <Icon kind="chevronRight" size="s" /></button></div>
      <div className="decks">{recentDecks(workspace, 3, decks).map(deck => <DeckTile key={deck.id} workspace={workspace} deck={deck} now={now} due={dueByDeck.get(deck.id) ?? 0} onOpen={onOpenDeck} />)}</div>
    </section>}
  </>;
}
