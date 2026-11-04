"use client";

import { useEffect, useState } from "react";
import { MAX_LEARN_ROUNDS, matches, question, type Workspace } from "../../lib/learning";
import { Key, NavIcon } from "./icons";
import type { Mutate } from "./types";

type Session = NonNullable<Workspace["session"]>;
type Question = NonNullable<ReturnType<typeof question>>;
type Feedback = { question: Question; submitted: string; position: string; round: number; answered: number; total: number };

const modeTitle = { learn: "Lernen", cram: "Pauken", review: "Wiederholen" };
const grades = ["Nochmal", "Schwer", "Gut", "Einfach"] as const;

export function positionOf(session: Session | null | undefined) {
  return session ? [session.id, session.round, session.cursor].join(":") : "";
}

function typing(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
}

function RoundCelebration() {
  return <div className="round-celebration" aria-hidden="true">
    <span>✓</span><i /><i /><i /><i /><i /><i />
  </div>;
}

type Props = {
  workspace: Workspace; session: Session; busy: boolean; mutate: Mutate;
  onBack: () => void; onCramMistakes: () => void;
};

export default function StudyView({ workspace, session, busy, mutate, onBack, onCramMistakes }: Props) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [openedRound, setOpenedRound] = useState("");
  const q = question(workspace);
  const current = positionOf(session);
  const shown = feedback?.position === current ? feedback : null;
  const studyQuestion = shown?.question ?? q;
  const round = shown?.round ?? session.round;
  const mastered = session.mode === "learn" ? Object.values(session.tally).filter(item => item.streak >= 2).length : 0;
  const remaining = session.initial.length - mastered;
  const canCramMistakes = session.mode === "cram" && Boolean(workspace.mistakes[session.deckId + ":" + session.direction]?.length);
  const roundBreak = session.mode === "learn" && !session.done && session.round > 1 &&
    session.cursor === 0 && openedRound !== current && !shown;
  const answered = shown?.answered ?? session.cursor;
  const total = shown?.total ?? session.queue.length;

  async function submit(value: string, self?: boolean, showFeedback = true) {
    if (!q) return;
    const result = await mutate({ type: "answer", sessionId: session.id, cursor: session.cursor, round: session.round, answer: value, self });
    if (result && showFeedback) {
      setFeedback({ question: q, submitted: value, position: positionOf(result.workspace.session),
        round: session.round, answered: session.cursor + 1, total: session.queue.length });
    }
  }

  useEffect(() => {
    if (!q || q.kind !== "choice" || shown || roundBreak) return;
    const key = (event: KeyboardEvent) => {
      if (typing(event)) return;
      const option = q.options[Number(event.key) - 1];
      if (option && !busy) { event.preventDefault(); void submit(option); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return <>
    <button className="icon action-icon" aria-label={session.done ? "Zum Set" : "Lernen pausieren"} title={session.done ? "Zum Set" : "Lernen pausieren"} onClick={onBack}><NavIcon kind="back" /></button>
    <div className="page-heading"><div><span className="eyebrow">{workspace.decks.find(item => item.id === session.deckId)?.title}</span><h1>{modeTitle[session.mode]}</h1></div>
      <span className="badge">{session.mode === "learn" ? "Runde " + round + " / " + MAX_LEARN_ROUNDS : session.mode === "cram" ? "Sofort üben" : "Fällige Karten"}</span></div>
    {!roundBreak && (shown || !session.done) && <div className="progress-wrap">
      <progress value={answered} max={total} aria-label="Rundenfortschritt" />
      <span>{answered} / {total}</span>
    </div>}
    {session.mode === "learn" && session.initial.length > 0 && !roundBreak && (!session.done || shown) &&
      <p className="study-overview">{mastered} von {session.initial.length} sicher gelernt</p>}

    {roundBreak ? <section className="panel flow study-milestone" key={current}>
      <RoundCelebration />
      <h2>Runde {session.round - 1} geschafft!</h2>
      <p>{session.queue.length === 1 ? "Eine Karte kommt" : session.queue.length + " Karten kommen"} in der nächsten Runde dran.</p>
      <button className="button primary" autoFocus onClick={() => setOpenedRound(current)}>
        {session.round >= MAX_LEARN_ROUNDS ? "Letzte Runde starten" : "Nächste Runde starten"} <NavIcon kind="next" />
      </button>
    </section> : session.done && !shown ? <section className="panel flow study-milestone">
      {session.mode === "learn" && session.initial.length > 0 && <RoundCelebration />}
      <h2>{!session.initial.length ? "Keine Karten bereit" : session.mode === "learn" ? "Lerneinheit abgeschlossen" : session.mode === "review" ? "Wiederholung abgeschlossen" : "Paukrunde abgeschlossen"}</h2>
      <p>{!session.initial.length ? "Schau später wieder vorbei oder wähle andere Karten."
        : session.mode === "learn" ? mastered + " von " + session.initial.length + " Karten sitzen sicher. Sie kommen zur Wiederholung, wenn sie fällig sind."
        : session.mode === "review" ? session.initial.length + " Karten bewertet." : session.correct + " von " + session.initial.length + " richtig."}</p>
      {session.mode === "learn" && remaining > 0 && <p className="muted">{remaining === 1 ? "Eine Karte bleibt offen." : remaining + " Karten bleiben offen."}</p>}
      <div className="actions"><button className="button primary" autoFocus onClick={onBack}>Zum Set</button>
        {session.mode === "learn" && remaining > 0 && <button className="button" disabled={busy} onClick={() => void mutate({ type: "continueLearn", sessionId: session.id })}>Offene Karten weiterüben</button>}
        {canCramMistakes && <button className="button" disabled={busy} onClick={onCramMistakes}>Fehler pauken</button>}</div>
    </section> : studyQuestion && <section className="panel question" key={shown ? "feedback" : current}>
      <span className="eyebrow">{studyQuestion.kind === "choice" ? "Antwort wählen" : studyQuestion.kind === "write" ? "Antwort schreiben" : "Antwort zuerst abrufen"}</span>
      <h2>{studyQuestion.prompt}</h2>
      {studyQuestion.kind === "choice" && <div className="answers">{studyQuestion.options.map((option, i) => {
        const result = shown && (option === studyQuestion.answer ? "correct" : option === shown.submitted ? "incorrect" : undefined);
        return <button key={option} className="button answer" disabled={busy || !!shown} data-result={result || undefined} onClick={() => void submit(option)}>
          {result ? <span className="answer-mark" aria-label={result === "correct" ? "Richtige Antwort" : "Falsche Antwort"}>{result === "correct" ? "✓" : "×"}</span> : <Key>{String(i + 1)}</Key>}{option}
        </button>;
      })}</div>}
      {shown && studyQuestion.kind === "write" && <div className="answer-result" data-result="correct">
        <span className="eyebrow">✓ Richtige Antwort</span><p>{shown.submitted}</p>
      </div>}
      {shown ? <button className="button primary" autoFocus onClick={() => setFeedback(null)}>Weiter <NavIcon kind="next" /></button>
        : q && <AnswerArea key={current} q={q} busy={busy} direction={session.direction} submit={submit}
          rate={grade => void mutate({ type: "rate", sessionId: session.id, cursor: session.cursor, grade })} />}
    </section>}
  </>;
}

type AnswerProps = {
  q: Question; busy: boolean; direction: Session["direction"];
  submit: (value: string, self?: boolean, showFeedback?: boolean) => Promise<void>;
  rate: (grade: 1 | 2 | 3 | 4) => void;
};

/** Holds the typed answer and the revealed state. It remounts for every new question. */
function AnswerArea({ q, busy, direction, submit, rate }: AnswerProps) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (q.kind !== "rate" || !revealed) return;
    const key = (event: KeyboardEvent) => {
      if (typing(event) || busy) return;
      const grade = Number(event.key);
      if (grade >= 1 && grade <= 4) { event.preventDefault(); rate(grade as 1 | 2 | 3 | 4); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function check() {
    if (matches(q.card, direction, answer)) void submit(answer);
    else setRevealed(true);
  }

  return <>
    {q.kind === "write" && !revealed && <form className="flow" onSubmit={event => { event.preventDefault(); check(); }}>
      <label>Deine Antwort<textarea rows={2} maxLength={3000} value={answer} autoFocus
        onChange={event => setAnswer(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (answer.trim() && !busy) check();
          }
        }} /></label>
      <div className="actions"><button className="button primary" disabled={busy || !answer.trim()}>Antwort prüfen <Key>↵</Key></button><button className="button" type="button" onClick={() => { setAnswer(""); setRevealed(true); }}>Weiss ich nicht</button></div>
    </form>}
    {!revealed && (q.kind === "rate" || q.kind === "self") && <button className="button primary" autoFocus onClick={() => setRevealed(true)}>Antwort aufdecken <Key>↵</Key></button>}
    {revealed && <div className="correction">
      {q.kind === "write" && <div className="answer-result" data-result="incorrect"><span className="eyebrow">× Deine Antwort</span><p>{answer || "Übersprungen"}</p></div>}
      <div className="answer-result" data-result={q.kind === "write" ? "correct" : undefined}><span className="eyebrow">{q.kind === "write" ? "✓ " : ""}Musterantwort</span><p>{q.answer}</p></div>
      {q.kind === "rate" ? <div className="grades">{grades.map((label, i) => <button key={label} className="button" data-grade={i + 1} disabled={busy} onClick={() => rate((i + 1) as 1 | 2 | 3 | 4)}><Key>{String(i + 1)}</Key>{label}</button>)}</div> :
        <div className="actions">
          {q.kind === "write" && <button className="button primary" disabled={busy} autoFocus onClick={() => void submit(answer, false, false)}>Weiter <NavIcon kind="next" /></button>}
          {(q.kind === "self" || answer.trim()) && <button className="button" disabled={busy} onClick={() => void submit(answer, true, false)}>War sinngemäss richtig</button>}
          {q.kind === "self" && <button className="button" disabled={busy} onClick={() => void submit("", false, false)}>Noch einmal üben</button>}
        </div>}
    </div>}
  </>;
}
