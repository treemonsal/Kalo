"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_LEARN_ROUNDS, dayOf, matches, previewIntervals, question, secure, sessionDecks, type Workspace } from "../../lib/learning";
import { dayStats, goalOf, nextStep, type Step } from "../../lib/progress";
import { GoalBanner, NextStepActions } from "./progress-ui";
import { play } from "./sound";
import { Icon, Key } from "./icons";
import ExamplesButton from "./examples-button";
import { clozeFrom, exampleLines } from "../../lib/examples";
import { finePointer, prefersReducedMotion, textSize } from "./motion";
import { dateFormat, plural, type Mutate } from "./types";
import { parseStored, readStored, writeStored } from "./storage";

type Session = NonNullable<Workspace["session"]>;
type Question = NonNullable<ReturnType<typeof question>>;
/** The visible result of an answer. It appears at once and stays until "Weiter", even after the session moved on. */
type Result = { q: Question; submitted: string; correct: boolean; from: string; to: string | null; mastered?: boolean };

const modeTitle = { learn: "Lernen", cram: "Pauken", review: "Wiederholen" };
// One vocabulary everywhere: «Noch nicht» (orange) and «Kann ich» (green); the review adds two steps in between.
const grades = ["Noch nicht", "Schwer", "Gut", "Einfach"] as const;
const normal = (text: string) => text.normalize("NFC").toLocaleLowerCase("de-CH").trim().replace(/\s+/g, " ");

export function positionOf(session: Session | null | undefined) {
  return session ? [session.id, session.round, session.cursor].join(":") : "";
}

function typing(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
}

function useKeys(active: boolean, handler: (key: string) => boolean) {
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (!typing(event) && handler(event.key)) event.preventDefault();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
}

function Celebration() {
  return <div className="celebration" aria-hidden="true"><span><Icon kind="check" size="l" /></span><i /><i /><i /><i /><i /><i /></div>;
}

/** One segment per card: recognised in a choice, recalled once, or learned (recalled twice). */
function level(tally: Session["tally"][string] | undefined) {
  if (!tally) return 0;
  if (tally.streak >= 2) return 3;
  if (tally.streak === 1) return 2;
  return tally.seen && !tally.missed ? 1 : 0;
}

function Mastery({ session }: { session: Session }) {
  return <div className="mastery" aria-hidden="true">
    {session.initial.map(id => <i key={id} data-level={level(session.tally[id])} />)}
  </div>;
}

type Props = {
  workspace: Workspace; session: Session; busy: boolean; mutate: Mutate; now: number;
  draftKey: string;
  onBack: () => void; onStart: (mode: "learn" | "cram", filter?: "mistakes") => void;
  onStep: (step: Step) => void; onHome: () => void;
};

export default function StudyView({ workspace, session, busy, mutate, now, draftKey, onBack, onStart, onStep, onHome }: Props) {
  const [result, setResult] = useState<Result | null>(null);
  const [openedRound, setOpenedRound] = useState("");
  const swipe = useRef<{ id: number; x: number; dx: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const leaving = useRef(false);

  /**
   * The result card leaves the way a flashcard does: it slides out to the side it was pushed and the next question
   * comes in. Swiping in either direction means «weiter»; only the card mode gives the direction a meaning.
   */
  function advance(direction: -1 | 1 = -1) {
    const element = panel.current;
    if (leaving.current) return;
    if (!element || prefersReducedMotion() || typeof element.animate !== "function") { setResult(null); return; }
    leaving.current = true;
    const from = element.style.transform || "translateX(0px)";
    element.animate([{ transform: from, opacity: 1 }, { transform: "translateX(" + direction * 110 + "%) rotate(" + direction * 6 + "deg)", opacity: 0 }],
      { duration: 200, easing: "cubic-bezier(.4,0,1,1)" }).finished.finally(() => {
        element.style.transform = "";
        leaving.current = false;
        setResult(null);
      });
  }
  const submitted = useRef("");
  const q = question(workspace);
  const current = positionOf(session);
  const shown = result && (result.to === current || (result.to === null && result.from === current)) ? result : null;
  const deck = workspace.decks.find(item => item.id === session.deckId);
  const decks = sessionDecks(workspace, session);
  const mastered = session.initial.filter(id => (session.tally[id]?.streak ?? 0) >= 2);
  const open = session.initial.filter(id => (session.tally[id]?.streak ?? 0) < 2);
  const roundBreak = session.mode === "learn" && !session.done && session.round > 1 && session.cursor === 0 && openedRound !== current && !shown;
  const roundCorrect = session.initial.filter(id => level(session.tally[id]) > 0).length;
  const front = (id: string) => decks.flatMap(item => item.cards).find(card => card.id === id)?.[session.direction] ?? "";
  // While a result is visible the count already includes it, so the bar does not jump twice.
  const total = Math.max(1, session.queue.length);
  const answered = shown ? Math.min(total, Number(shown.from.split(":")[2]) + 1) : session.done ? total : session.cursor;

  async function submit(value: string, self?: boolean, show = true) {
    if (!q || submitted.current === current) return false;
    submitted.current = current;
    const from = current;
    const correct = self ?? (q.kind === "choice" ? value === q.answer : matches(q.card, session.direction, value));
    // Sound and colour on the same frame, before the server answers.
    if (show) { setResult({ q, submitted: value, correct, from, to: null }); play(correct ? (q.gold ? "gold" : "correct") : "wrong"); }
    const wasSecure = secure(workspace, q.card.id, session.direction);
    const saved = await mutate({ type: "answer", sessionId: session.id, cursor: session.cursor, round: session.round, answer: value, self });
    if (!saved) submitted.current = "";
    const mastered = Boolean(saved && correct && !wasSecure && secure(saved.workspace, q.card.id, session.direction));
    const combo = saved?.workspace.session?.combo ?? 0;
    if (mastered) play("mastered");
    else if (correct && combo >= 5 && combo % 5 === 0) play("combo");
    if (!show) return Boolean(saved);
    if (saved) setResult(old => old && old.from === from ? { ...old, to: positionOf(saved.workspace.session), mastered } : old);
    else setResult(old => old && old.from === from ? null : old);
    return Boolean(saved);
  }

  useKeys(Boolean(shown?.to), key => {
    if (!["Enter", "ArrowRight", " "].includes(key)) return false;
    advance();
    return true;
  });

  const header = <>
    <div className="study-top">
      <button className="icon-button" aria-label={session.done ? "Zum Set" : "Lernen unterbrechen"} title={session.done ? "Zum Set" : "Unterbrechen"} onClick={onBack}><Icon kind="back" /></button>
      <div className="toolbar-title"><h1>{modeTitle[session.mode]}</h1><span className="counter">{session.mixed?.length ? "Gemischt aus " + decks.length + " Sets" : deck?.title}</span></div>
      {(session.combo ?? 0) >= 3 && !session.done && <span className="combo-chip" key={session.combo} aria-label={"Combo: " + session.combo + " richtig in Folge"}>
        <Icon kind="flame" filled /> {session.combo}</span>}
    </div>
    {session.mode === "learn" && session.initial.length > 0 ? <div className="study-progress">
      {/* Up to twelve cards get one segment each; longer units get a plain bar that stays readable. */}
      {session.initial.length <= 12 ? <Mastery session={session} />
        : <div className="meter unit"><i style={{ width: (session.initial.reduce((sum, id) => sum + Math.min(2, session.tally[id]?.streak ?? 0), 0) / (session.initial.length * 2)) * 100 + "%" }} /></div>}
      <span>{mastered.length} von {session.initial.length} sitzen{session.done ? "" : " · Runde " + session.round + " von " + MAX_LEARN_ROUNDS}</span>
    </div> : !session.done || shown ? <div className="study-progress">
      <div className="meter"><i style={{ width: (answered / total) * 100 + "%" }} /></div>
      <span>{answered} von {total} beantwortet</span>
    </div> : null}
  </>;

  if (roundBreak) return <>{header}
    <section className="panel milestone" key={current}>
      <Celebration />
      <h2>Runde {session.round - 1} geschafft</h2>
      <p>{roundCorrect} von {session.initial.length} richtig{mastered.length ? ", " + mastered.length + " davon sitzen schon sicher" : ""}.
        {" "}{session.queue.length === 1 ? "Eine Karte kommt" : session.queue.length + " Karten kommen"} in Runde {session.round} nochmals{q?.kind === "write" ? ". Jetzt schreibst du die Antworten selbst." : "."}</p>
      <div className="action-bar">
        <span />
        <button className="button primary" autoFocus onClick={() => setOpenedRound(current)}>
          {session.round >= MAX_LEARN_ROUNDS ? "Letzte Runde starten" : "Runde " + session.round + " starten"} <Icon kind="forward" />
        </button>
      </div>
    </section></>;

  if (session.done && !shown) return <>{header}<Finish session={session} workspace={workspace} busy={busy} mastered={mastered} open={open} front={front} now={now}
    onBack={onBack} onStart={onStart} onStep={onStep} onHome={onHome} onContinue={() => void mutate({ type: "continueLearn", sessionId: session.id })} /></>;

  const view = shown?.q ?? q;
  if (!view) return header;
  return <>{header}
    <section ref={panel} className="panel question" data-gold={view.gold || undefined} data-examples aria-labelledby="prompt"
      onPointerDown={event => {
        if (!shown?.to || leaving.current || !event.isPrimary) return;
        swipe.current = { id: event.pointerId, x: event.clientX, dx: 0 };
      }}
      onPointerMove={event => {
        const current = swipe.current;
        if (!current || current.id !== event.pointerId || !panel.current) return;
        current.dx = event.clientX - current.x;
        // The card follows the finger, so the swipe is visible before it counts.
        if (Math.abs(current.dx) > 6) panel.current.style.transform = "translateX(" + current.dx + "px) rotate(" + current.dx / 40 + "deg)";
      }}
      onPointerUp={event => {
        const current = swipe.current;
        swipe.current = null;
        if (!current || current.id !== event.pointerId || !panel.current) return;
        if (Math.abs(current.dx) > 70) advance(current.dx < 0 ? -1 : 1);
        else if (current.dx) {
          const element = panel.current;
          element.animate?.([{ transform: element.style.transform }, { transform: "translateX(0px)" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
          element.style.transform = "";
        }
      }}
      onPointerCancel={() => { swipe.current = null; if (panel.current) panel.current.style.transform = ""; }}>
      <ExamplesButton key={shown ? shown.from : current} card={{ cardId: view.card.id, deckId: view.deck.id, question: view.prompt, answer: view.answer, examples: view.card.examples }} revealed={Boolean(shown)} />
      <div className="question-content" key={"prompt:" + (shown ? shown.from : current)}>
        {view.gold && <span className="question-top"><span className="gold-badge"><Icon kind="sparkle" filled /> Gold · zählt doppelt</span></span>}
        <h2 id="prompt" className="prompt" data-size={textSize(view.prompt)}>{view.prompt}</h2>
      </div>
      {view.kind === "choice"
        ? <Choices q={view} shown={shown} busy={busy} onPick={option => void submit(option)} onNext={() => advance()} />
        : shown ? <Frame zone={<CorrectAnswer submitted={shown.submitted} answer={view.answer} mastered={shown.mastered} />}
            actions={<><span /><NextButton disabled={shown.to === null} onClick={() => advance()} /></>} />
          : q && <AnswerArea key={"answer:" + current} storageKey={draftKey + ":" + current} q={q} busy={busy} direction={session.direction} submit={submit}
              intervals={q.kind === "rate" ? previewIntervals(workspace, q.card.id, session.direction, now) : undefined}
              rate={async grade => Boolean(await mutate({ type: "rate", sessionId: session.id, cursor: session.cursor, grade }))} />}
    </section></>;
}

/** After a wrong answer, the first own example shows the word in use, the moment it helps most. */
function ExampleHint({ examples, answer }: { examples?: string; answer: string }) {
  // The line that uses the answer shows it in context; otherwise the first line.
  const lines = exampleLines(examples);
  const line = lines.find(item => clozeFrom(item, answer)) ?? lines[0];
  return line ? <p className="answer-example"><Icon kind="cards" size="s" /> {line}</p> : null;
}

function Frame({ zone, actions }: { zone: ReactNode; actions: ReactNode }) {
  return <><div className="answer-zone">{zone}</div>{actions && <div className="action-bar">{actions}</div>}</>;
}

function NextButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return <button className="button primary" disabled={disabled} autoFocus={finePointer()} aria-label="Weiter" onClick={onClick}><Icon kind="forward" /></button>;
}

function CorrectAnswer({ submitted, answer, mastered }: { submitted: string; answer: string; mastered?: boolean }) {
  return <div className="answer-box" data-result="correct">
    <span className="answer-label"><Icon kind="check" /><span className="sr-only">Richtig</span>{mastered && <span className="mastered-stamp" aria-label="Gemeistert"><Icon kind="sparkle" filled /></span>}</span>
    <p data-size={textSize(submitted)}>{submitted}</p>
    {normal(submitted) !== normal(answer) && <p className="answer-note">Musterantwort: {answer}</p>}
  </div>;
}

function Choices({ q, shown, busy, onPick, onNext }: { q: Question; shown: Result | null; busy: boolean; onPick: (option: string) => void; onNext: () => void }) {
  useKeys(!shown && !busy, key => {
    const option = q.options[Number(key) - 1];
    if (option) onPick(option);
    return Boolean(option);
  });
  return <Frame
    zone={<div className="answers">{q.options.map((option, i) => {
      const state = shown && (option === q.answer ? "correct" : option === shown.submitted ? "incorrect" : "faded");
      return <button key={option} className="answer" disabled={busy || !!shown} data-result={state || undefined} onClick={() => onPick(option)}>
        {state === "correct" ? <span className="answer-mark"><Icon kind="check" /><span className="sr-only">Richtige Antwort:</span></span>
          : state === "incorrect" ? <span className="answer-mark"><Icon kind="close" /><span className="sr-only">Deine Antwort, falsch:</span></span>
          : <Key>{String(i + 1)}</Key>}
        <span data-size={textSize(option)}>{option}</span>
      </button>;
    })}{shown && !shown.correct && <ExampleHint examples={q.card.examples} answer={q.answer} />}</div>}
    actions={shown ? <><span className={"action-hint " + (shown.correct ? "rating-known" : "rating-again")} aria-label={shown.correct ? "Richtig" : "Noch nicht ganz"}><Icon kind={shown.correct ? "check" : "close"} />
      {shown.mastered && <span className="mastered-stamp" aria-label="Gemeistert"><Icon kind="sparkle" filled /></span>}</span><NextButton disabled={shown.to === null} onClick={onNext} /></>
      : <><span /><span /></>} />;
}

type AnswerProps = {
  q: Question; busy: boolean; direction: Session["direction"]; storageKey: string;
  submit: (value: string, self?: boolean, show?: boolean) => Promise<boolean>;
  rate: (grade: 1 | 2 | 3 | 4) => Promise<boolean>;
  /** For review cards: how long until the card comes back for each grade. */
  intervals?: number[];
};

/** Fits a text field to its content, so a one-word answer needs one line and a sentence gets room. */
function grow(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = "auto";
  field.style.height = field.scrollHeight + 2 + "px";
}

/** «10 Min», «1 Tag», «3 Wochen»: short enough to fit under a rating button. */
function span(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return minutes + " Min";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + " Std";
  const days = Math.round(hours / 24);
  if (days < 14) return days === 1 ? "1 Tag" : days + " Tage";
  if (days < 60) return Math.round(days / 7) + " Wochen";
  return Math.round(days / 30) + " Monate";
}

type AnswerDraft = { answer: string; phase: "input" | "wrong" | "revealed" };
function isAnswerDraft(value: unknown): value is AnswerDraft {
  const draft = value as AnswerDraft | null;
  return typeof draft?.answer === "string" && draft.answer.length <= 3000 && ["input", "wrong", "revealed"].includes(draft.phase);
}

/** Holds the typed answer and the revealed state. It remounts for every new question. */
function AnswerArea({ q, busy, direction, storageKey, submit: saveAnswer, rate: saveRate, intervals }: AnswerProps) {
  const [draft, setDraft] = useState<AnswerDraft>(() => parseStored(readStored(storageKey), isAnswerDraft) ?? { answer: "", phase: "input" });
  const currentDraft = useRef(draft);
  const sending = useRef(false);
  const { answer, phase } = draft;
  function update(change: Partial<AnswerDraft>) {
    const next = { ...currentDraft.current, ...change };
    currentDraft.current = next; setDraft(next);
    writeStored(storageKey, JSON.stringify(next));
  }
  const setPhase = (phase: AnswerDraft["phase"]) => update({ phase });
  async function submit(value: string, self?: boolean, show?: boolean) {
    if (sending.current) return;
    sending.current = true;
    if (await saveAnswer(value, self, show)) writeStored(storageKey, null);
    else sending.current = false;
  }
  async function rate(grade: 1 | 2 | 3 | 4) {
    if (sending.current) return;
    sending.current = true;
    if (await saveRate(grade)) writeStored(storageKey, null);
    else sending.current = false;
  }

  useKeys(phase === "revealed" && q.kind === "rate" && !busy, key => {
    const grade = Number(key);
    if (grade >= 1 && grade <= 4) rate(grade as 1 | 2 | 3 | 4);
    return grade >= 1 && grade <= 4;
  });

  function check() {
    if (!answer.trim() || busy) return;
    if (matches(q.card, direction, answer)) void submit(answer);
    else { setPhase("wrong"); play("wrong"); }
  }

  if (q.kind === "write" && phase === "input") return <Frame
    zone={<label className="answer-field"><span className="sr-only">Deine Antwort</span>
      {/* One line for the usual short answer; the field grows with longer text. */}
      <textarea rows={1} maxLength={3000} value={answer} placeholder="Deine Antwort" autoFocus={finePointer()} className="grow-field"
        ref={grow} onInput={event => grow(event.currentTarget)}
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done"
        onChange={event => update({ answer: event.target.value })}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); check(); }
        }} /></label>}
    actions={<><button className="button" type="button" onClick={() => setPhase("wrong")}>Weiss ich nicht</button>
      <button className="button primary" disabled={busy || !answer.trim()} onClick={check}>Prüfen <Key>↵</Key></button></>} />;

  if (q.kind === "write") return <Frame
    zone={<>
      <div className="answer-box" data-result="incorrect"><span className="answer-label"><Icon kind="close" /><span className="sr-only">Deine Antwort</span></span><p data-size={textSize(answer)}>{answer.trim() || "Keine Antwort"}</p></div>
      <div className="answer-box" data-result="correct"><span className="answer-label"><Icon kind="check" /><span className="sr-only">Musterantwort</span></span><p data-size={textSize(q.answer)}>{q.answer}</p>
        <ExampleHint examples={q.card.examples} answer={q.answer} /></div>
    </>}
    actions={<>{answer.trim() ? <button className="button" disabled={busy} onClick={() => void submit(answer, true, false)}>Sinngemäss richtig</button> : <span />}
      <button className="button primary" disabled={busy} autoFocus={finePointer()} aria-label="Weiter" onClick={() => void submit(answer, false, false)}><Icon kind="forward" /></button></>} />;

  // One way to reveal: the whole answer area is the button.
  if (phase === "input") return <Frame
    zone={<button type="button" className="answer-box placeholder" autoFocus={finePointer()} onClick={() => setPhase("revealed")}><Icon kind="eye" size="l" /><span>Antwort aufdecken <Key>↵</Key></span></button>}
    actions={null} />;

  return <Frame
    zone={<div className="answer-box"><span className="answer-label">Musterantwort</span><p data-size={textSize(q.answer)}>{q.answer}</p></div>}
    actions={q.kind === "rate"
      ? <div className="grades">{grades.map((label, i) => <button key={label} className="button" data-grade={i + 1} disabled={busy} onClick={() => rate((i + 1) as 1 | 2 | 3 | 4)}
          aria-label={label + (intervals ? ", wieder in " + span(intervals[i]) : "")}><span className="grade-label"><Key>{String(i + 1)}</Key>{label}</span>{intervals && <small className="grade-next">{span(intervals[i])}</small>}</button>)}</div>
      : <><button className="button" disabled={busy} onClick={() => void submit("", false, false)}><Icon kind="repeat" /> Noch nicht</button>
        <button className="button primary" disabled={busy} autoFocus={finePointer()} onClick={() => void submit(answer, true, false)}><Icon kind="check" /> Kann ich</button></>} />;
}

type FinishProps = {
  session: Session; workspace: Workspace; busy: boolean; mastered: string[]; open: string[]; front: (id: string) => string; now: number;
  onBack: () => void; onStart: Props["onStart"]; onContinue: () => void; onStep: (step: Step) => void; onHome: () => void;
};

function Finish({ session, workspace, busy, mastered, open, front, now, onBack, onStart, onContinue, onStep, onHome }: FinishProps) {
  const step = nextStep(workspace, now, session.deckId);
  const goalReached = dayStats(workspace, dayOf(now)).points >= goalOf(workspace);
  const next = <NextStepActions step={step} goalReached={goalReached} onStep={onStep} onDone={onHome} />;
  const deck = workspace.decks.find(item => item.id === session.deckId);
  const recent = workspace.mistakes[session.deckId + ":" + session.direction] ?? [];
  const selection = deck?.cards.filter(card => session.filter === "all" || (session.filter === "starred" ? card.starred : recent.includes(card.id))) ?? [];
  const otherOpen = selection.filter(card => !session.initial.includes(card.id) && (workspace.progress[card.id + ":" + session.direction]?.streak ?? 0) < 2).length;
  const nextDue = session.initial.map(id => Date.parse(workspace.reviews[id + ":" + session.direction]?.due ?? "")).filter(Number.isFinite).sort((a, b) => a - b)[0];

  if (session.mode === "learn" && !session.initial.length) return <section className="panel milestone">
    <span className="finish-mark"><Icon kind="check" size="l" /></span>
    <h2>Hier sitzt schon alles</h2>
    <p>Alle Karten dieser Auswahl hast du sicher gelernt. Sie kommen zur Wiederholung, sobald sie fällig sind.</p>
    <div className="actions"><button className="button primary" autoFocus onClick={onBack}>Zum Set</button><button className="button" onClick={() => onStart("cram")}><Icon kind="bolt" /> Trotzdem pauken</button></div>
  </section>;

  if (session.mode === "learn") return <section className="panel milestone">
    {open.length ? <span className="finish-mark open"><Icon kind="target" size="l" /></span> : <Celebration />}
    <h2>{open.length ? "Lerneinheit beendet" : "Lerneinheit geschafft"}</h2>
    <p>{mastered.length} von {session.initial.length} Karten sitzen sicher{open.length ? ". " + plural(open.length, "Karte bleibt", "Karten bleiben") + " offen." : " und kommen zur Wiederholung, wenn sie fällig sind."}</p>
    <div className="summary">
      {mastered.length > 0 && <div><h3><Icon kind="check" /> Sitzt <span>{mastered.length}</span></h3><ul>{mastered.map(id => <li key={id}>{front(id)}</li>)}</ul></div>}
      {open.length > 0 && <div className="open"><h3><Icon kind="repeat" /> Noch offen <span>{open.length}</span></h3><ul>{open.map(id => <li key={id}>{front(id)}</li>)}</ul></div>}
    </div>
    <GoalBanner workspace={workspace} now={now} />
    <div className="actions">
      {open.length > 0 ? <button className="button primary" autoFocus disabled={busy} onClick={onContinue}><Icon kind="repeat" /> Offene Karten üben</button>
        : otherOpen > 0 && !goalReached ? <button className="button primary" autoFocus disabled={busy} onClick={() => onStart("learn")}>Nächste Einheit <Icon kind="forward" /></button>
        : next}
      <button className="button" onClick={onBack}>Zum Set</button>
    </div>
  </section>;

  if (session.mode === "cram") return <section className="panel milestone">
    {session.mistakes.length ? <span className="finish-mark open"><Icon kind="bolt" size="l" /></span> : <Celebration />}
    <h2>Paukrunde beendet</h2>
    <p>{session.correct} von {session.initial.length} Antworten waren richtig.</p>
    {session.mistakes.length > 0 && <div className="summary"><div className="open"><h3><Icon kind="repeat" /> Nochmals üben <span>{session.mistakes.length}</span></h3><ul>{session.mistakes.map(id => <li key={id}>{front(id)}</li>)}</ul></div></div>}
    <GoalBanner workspace={workspace} now={now} />
    <div className="actions">
      {session.mistakes.length > 0 ? <button className="button primary" autoFocus disabled={busy} onClick={() => onStart("cram", "mistakes")}><Icon kind="bolt" /> Fehler pauken</button> : next}
      <button className="button" onClick={onBack}>Zum Set</button>
    </div>
  </section>;

  return <section className="panel milestone">
    {session.initial.length ? <Celebration /> : <span className="finish-mark"><Icon kind="check" size="l" /></span>}
    <h2>{session.initial.length ? "Wiederholung erledigt" : "Nichts fällig"}</h2>
    <p>{session.initial.length ? plural(session.initial.length, "Karte", "Karten") + " wiederholt." : "Für diese Auswahl ist gerade nichts zu wiederholen."}
      {nextDue ? " Die nächste kommt am " + dateFormat.format(nextDue) + "." : ""}</p>
    <GoalBanner workspace={workspace} now={now} />
    <div className="actions">{next}<button className="button" onClick={onBack}>Zum Set</button></div>
  </section>;
}
