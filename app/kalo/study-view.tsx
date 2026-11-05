"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MAX_LEARN_ROUNDS, matches, question, type Workspace } from "../../lib/learning";
import { Icon, Key } from "./icons";
import { finePointer, textSize } from "./motion";
import { dateFormat, plural, type Mutate } from "./types";

type Session = NonNullable<Workspace["session"]>;
type Question = NonNullable<ReturnType<typeof question>>;
/** The visible result of an answer. It appears at once and stays until "Weiter", even after the session moved on. */
type Result = { q: Question; submitted: string; correct: boolean; from: string; to: string | null };

const modeTitle = { learn: "Lernen", cram: "Pauken", review: "Wiederholen" };
const grades = ["Nochmal", "Schwer", "Gut", "Einfach"] as const;
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
  workspace: Workspace; session: Session; busy: boolean; mutate: Mutate;
  onBack: () => void; onStart: (mode: "learn" | "cram", filter?: "mistakes") => void;
};

export default function StudyView({ workspace, session, busy, mutate, onBack, onStart }: Props) {
  const [result, setResult] = useState<Result | null>(null);
  const [openedRound, setOpenedRound] = useState("");
  const q = question(workspace);
  const current = positionOf(session);
  const shown = result && (result.to === current || (result.to === null && result.from === current)) ? result : null;
  const deck = workspace.decks.find(item => item.id === session.deckId);
  const mastered = session.initial.filter(id => (session.tally[id]?.streak ?? 0) >= 2);
  const open = session.initial.filter(id => (session.tally[id]?.streak ?? 0) < 2);
  const roundBreak = session.mode === "learn" && !session.done && session.round > 1 && session.cursor === 0 && openedRound !== current && !shown;
  const roundCorrect = session.initial.filter(id => level(session.tally[id]) > 0).length;
  const front = (id: string) => deck?.cards.find(card => card.id === id)?.[session.direction] ?? "";
  // While a result is visible the count already includes it, so the bar does not jump twice.
  const total = Math.max(1, session.queue.length);
  const answered = shown ? Math.min(total, Number(shown.from.split(":")[2]) + 1) : session.done ? total : session.cursor;

  async function submit(value: string, self?: boolean, show = true) {
    if (!q) return;
    const from = current;
    if (show) setResult({ q, submitted: value, correct: self ?? (q.kind === "choice" ? value === q.answer : matches(q.card, session.direction, value)), from, to: null });
    const saved = await mutate({ type: "answer", sessionId: session.id, cursor: session.cursor, round: session.round, answer: value, self });
    if (!show) return;
    if (saved) setResult(old => old && old.from === from ? { ...old, to: positionOf(saved.workspace.session) } : old);
    else setResult(old => old && old.from === from ? null : old);
  }

  const header = <>
    <div className="study-top">
      <button className="icon-button" aria-label={session.done ? "Zum Set" : "Lernen unterbrechen"} title={session.done ? "Zum Set" : "Unterbrechen"} onClick={onBack}><Icon kind="back" /></button>
      <div className="toolbar-title"><h1>{modeTitle[session.mode]}</h1><span className="counter">{deck?.title}</span></div>
    </div>
    {session.mode === "learn" && session.initial.length > 0 ? <div className="study-progress">
      <Mastery session={session} />
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

  if (session.done && !shown) return <>{header}<Finish session={session} workspace={workspace} busy={busy} mastered={mastered} open={open} front={front}
    onBack={onBack} onStart={onStart} onContinue={() => void mutate({ type: "continueLearn", sessionId: session.id })} /></>;

  const view = shown?.q ?? q;
  if (!view) return header;
  return <>{header}
    <section className="panel question" aria-labelledby="prompt">
      <div className="question-content" key={"prompt:" + (shown ? shown.from : current)}>
        <span className="eyebrow">{view.kind === "choice" ? "Antwort wählen" : view.kind === "write" ? "Antwort schreiben" : "Antwort abrufen"}</span>
        <h2 id="prompt" className="prompt" data-size={textSize(view.prompt)}>{view.prompt}</h2>
      </div>
      {view.kind === "choice"
        ? <Choices q={view} shown={shown} busy={busy} onPick={option => void submit(option)} onNext={() => setResult(null)} />
        : shown ? <Frame zone={<CorrectAnswer submitted={shown.submitted} answer={view.answer} />}
            actions={<><span /><NextButton disabled={shown.to === null} onClick={() => setResult(null)} /></>} />
          : q && <AnswerArea key={"answer:" + current} q={q} busy={busy} direction={session.direction} submit={submit}
              rate={grade => void mutate({ type: "rate", sessionId: session.id, cursor: session.cursor, grade })} />}
    </section></>;
}

function Frame({ zone, actions }: { zone: ReactNode; actions: ReactNode }) {
  return <><div className="answer-zone">{zone}</div><div className="action-bar">{actions}</div></>;
}

function NextButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return <button className="button primary" disabled={disabled} autoFocus={finePointer()} onClick={onClick}>Weiter <Icon kind="forward" /></button>;
}

function CorrectAnswer({ submitted, answer }: { submitted: string; answer: string }) {
  return <div className="answer-box" data-result="correct">
    <span className="answer-label"><Icon kind="check" /> Richtig</span>
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
    })}</div>}
    actions={shown ? <><span className={"action-hint " + (shown.correct ? "rating-known" : "rating-again")}>{shown.correct ? "Richtig" : "Noch nicht ganz"}</span><NextButton disabled={shown.to === null} onClick={onNext} /></>
      : <><span className="action-hint">Wähle eine Antwort</span><span /></>} />;
}

type AnswerProps = {
  q: Question; busy: boolean; direction: Session["direction"];
  submit: (value: string, self?: boolean, show?: boolean) => Promise<void>;
  rate: (grade: 1 | 2 | 3 | 4) => void;
};

/** Holds the typed answer and the revealed state. It remounts for every new question. */
function AnswerArea({ q, busy, direction, submit, rate }: AnswerProps) {
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"input" | "wrong" | "revealed">("input");

  useKeys(phase === "revealed" && q.kind === "rate" && !busy, key => {
    const grade = Number(key);
    if (grade >= 1 && grade <= 4) rate(grade as 1 | 2 | 3 | 4);
    return grade >= 1 && grade <= 4;
  });

  function check() {
    if (!answer.trim() || busy) return;
    if (matches(q.card, direction, answer)) void submit(answer);
    else setPhase("wrong");
  }

  if (q.kind === "write" && phase === "input") return <Frame
    zone={<label className="answer-field"><span className="sr-only">Deine Antwort</span>
      <textarea rows={3} maxLength={3000} value={answer} placeholder="Deine Antwort" autoFocus={finePointer()}
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done"
        onChange={event => setAnswer(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); check(); }
        }} /></label>}
    actions={<><button className="button" type="button" onClick={() => setPhase("wrong")}>Weiss ich nicht</button>
      <button className="button primary" disabled={busy || !answer.trim()} onClick={check}>Prüfen <Key>↵</Key></button></>} />;

  if (q.kind === "write") return <Frame
    zone={<>
      <div className="answer-box" data-result="incorrect"><span className="answer-label"><Icon kind="close" /> Deine Antwort</span><p data-size={textSize(answer)}>{answer.trim() || "Keine Antwort"}</p></div>
      <div className="answer-box" data-result="correct"><span className="answer-label"><Icon kind="check" /> Richtig wäre</span><p data-size={textSize(q.answer)}>{q.answer}</p></div>
    </>}
    actions={<>{answer.trim() ? <button className="button" disabled={busy} onClick={() => void submit(answer, true, false)}>Sinngemäss richtig</button> : <span />}
      <button className="button primary" disabled={busy} autoFocus={finePointer()} onClick={() => void submit(answer, false, false)}>Weiter <Icon kind="forward" /></button></>} />;

  if (phase === "input") return <Frame
    zone={<div className="answer-box placeholder"><p>Überlege dir die Antwort. Deck sie danach auf und bewerte dich ehrlich.</p></div>}
    actions={<><span /><button className="button primary" autoFocus={finePointer()} onClick={() => setPhase("revealed")}>Antwort aufdecken <Key>↵</Key></button></>} />;

  return <Frame
    zone={<div className="answer-box"><span className="answer-label">Musterantwort</span><p data-size={textSize(q.answer)}>{q.answer}</p></div>}
    actions={q.kind === "rate"
      ? <div className="grades">{grades.map((label, i) => <button key={label} className="button" data-grade={i + 1} disabled={busy} onClick={() => rate((i + 1) as 1 | 2 | 3 | 4)}><Key>{String(i + 1)}</Key>{label}</button>)}</div>
      : <><button className="button" disabled={busy} onClick={() => void submit("", false, false)}><Icon kind="repeat" /> Noch nicht</button>
        <button className="button primary" disabled={busy} autoFocus={finePointer()} onClick={() => void submit(answer, true, false)}><Icon kind="check" /> Wusste ich</button></>} />;
}

type FinishProps = {
  session: Session; workspace: Workspace; busy: boolean; mastered: string[]; open: string[]; front: (id: string) => string;
  onBack: () => void; onStart: Props["onStart"]; onContinue: () => void;
};

function Finish({ session, workspace, busy, mastered, open, front, onBack, onStart, onContinue }: FinishProps) {
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
    <div className="actions">
      {open.length > 0 && <button className="button primary" autoFocus disabled={busy} onClick={onContinue}><Icon kind="repeat" /> Offene Karten üben</button>}
      {otherOpen > 0 && <button className={"button" + (open.length ? "" : " primary")} autoFocus={!open.length} disabled={busy} onClick={() => onStart("learn")}>Nächste Einheit <Icon kind="forward" /></button>}
      <button className={"button" + (open.length || otherOpen ? "" : " primary")} autoFocus={!open.length && !otherOpen} onClick={onBack}>Zum Set</button>
    </div>
  </section>;

  if (session.mode === "cram") return <section className="panel milestone">
    {session.mistakes.length ? <span className="finish-mark open"><Icon kind="bolt" size="l" /></span> : <Celebration />}
    <h2>Paukrunde beendet</h2>
    <p>{session.correct} von {session.initial.length} Antworten waren richtig.</p>
    {session.mistakes.length > 0 && <div className="summary"><div className="open"><h3><Icon kind="repeat" /> Nochmals üben <span>{session.mistakes.length}</span></h3><ul>{session.mistakes.map(id => <li key={id}>{front(id)}</li>)}</ul></div></div>}
    <div className="actions">
      {session.mistakes.length > 0 && <button className="button primary" autoFocus disabled={busy} onClick={() => onStart("cram", "mistakes")}><Icon kind="bolt" /> Fehler pauken</button>}
      <button className={"button" + (session.mistakes.length ? "" : " primary")} autoFocus={!session.mistakes.length} onClick={onBack}>Zum Set</button>
    </div>
  </section>;

  return <section className="panel milestone">
    {session.initial.length ? <Celebration /> : <span className="finish-mark"><Icon kind="check" size="l" /></span>}
    <h2>{session.initial.length ? "Wiederholung erledigt" : "Nichts fällig"}</h2>
    <p>{session.initial.length ? plural(session.initial.length, "Karte", "Karten") + " wiederholt." : "Für diese Auswahl ist gerade nichts zu wiederholen."}
      {nextDue ? " Die nächste kommt am " + dateFormat.format(nextDue) + "." : ""}</p>
    <div className="actions"><button className="button primary" autoFocus onClick={onBack}>Zum Set</button></div>
  </section>;
}
