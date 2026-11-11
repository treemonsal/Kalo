"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "./feedback";
import { Icon, Key } from "./icons";
import { textSize } from "./motion";
import { play } from "./sound";
import type { DuelData, Mutate } from "./types";

type Props = { token: string; mutate: Mutate; onHome: () => void; onShare: (token: string, title: string) => void };

const seconds = (ms: number) => (ms / 1000).toFixed(1).replace(".", ",") + " s";

/** Ten quick choice questions against the clock. Everyone answers the same questions; the first attempt counts. */
export default function DuelView({ token, mutate, onHome, onShare }: Props) {
  const [duel, setDuel] = useState<DuelData | null>(null);
  const [failed, setFailed] = useState("");
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    let active = true;
    fetch("/api/workspace?duel=" + token, { cache: "no-store" }).then(async response => {
      const body = await response.json() as { duel: DuelData; error?: string };
      if (!active) return;
      if (!response.ok) { setFailed(body.error ?? "Dieses Duell gibt es nicht mehr."); return; }
      setDuel(body.duel);
      if (body.duel.played) setPhase("done");
    }).catch(() => { if (active) setFailed("Das Duell konnte nicht geladen werden. Prüfe die Verbindung."); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (phase !== "play") return;
    const timer = window.setInterval(() => setElapsed(Date.now() - started.current), 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  function pick(option: string) {
    if (!duel || picked !== null) return;
    const question = duel.questions[index];
    setPicked(option);
    play(option === question.answer ? "correct" : "wrong");
    const next = [...answers, option];
    window.setTimeout(async () => {
      setPicked(null);
      setAnswers(next);
      if (index + 1 < duel.questions.length) { setIndex(index + 1); return; }
      const ms = Date.now() - started.current;
      setElapsed(ms);
      setPhase("done");
      const result = await mutate({ type: "duelResult", token, answers: next, ms });
      if (result?.duel) { setDuel({ ...result.duel, played: true }); play("goal"); }
    }, 450);
  }

  useEffect(() => {
    if (phase !== "play" || !duel) return;
    const key = (event: KeyboardEvent) => {
      const option = duel.questions[index]?.options[Number(event.key) - 1];
      if (option) pick(option);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  if (failed) return <EmptyState icon="swords" title="Duell nicht verfügbar" text={failed}><button className="button primary" onClick={onHome}>Zur Bibliothek</button></EmptyState>;
  if (!duel) return <div className="skeleton block" aria-label="Duell wird geladen" />;
  const question = duel.questions[index];
  const correct = answers.filter((answer, i) => answer === duel.questions[i]?.answer).length;

  return <section className="duel">
    <div className="view-bar"><button className="text-button" aria-label="Zurück zur Bibliothek" onClick={onHome}><Icon kind="back" /> Bibliothek</button>
      {phase === "play" && <span className="duel-clock" aria-live="off"><Icon kind="bolt" /> {seconds(elapsed)}</span>}</div>
    <header className="page-head"><div><span className="eyebrow">Duell · {duel.ownerName}</span><h1>{duel.title}</h1></div></header>

    {phase === "intro" && <section className="panel milestone">
      <span className="finish-mark open"><Icon kind="swords" size="l" /></span>
      <h2>{duel.questions.length} Fragen gegen die Uhr</h2>
      <p>Alle beantworten dieselben Fragen. Es zählt zuerst, wie viele richtig sind, dann die Zeit. Du hast einen Versuch.</p>
      <div className="actions"><button className="button primary" autoFocus onClick={() => { started.current = Date.now(); setPhase("play"); }}>Los geht’s <Icon kind="forward" /></button></div>
    </section>}

    {phase === "play" && question && <section className="panel question">
      <div className="study-progress"><div className="mastery" aria-hidden="true">{duel.questions.map((_, i) => <i key={i}
        data-level={i < answers.length ? (answers[i] === duel.questions[i].answer ? 3 : 0) : i === index ? 1 : 0} />)}</div><span>{index + 1} von {duel.questions.length}</span></div>
      <div className="question-content" key={index}><h2 className="prompt" data-size={textSize(question.prompt)}>{question.prompt}</h2></div>
      <div className="answers">{question.options.map((option, i) => {
        const state = picked === null ? undefined : option === question.answer ? "correct" : option === picked ? "incorrect" : "faded";
        return <button key={option} className="answer" disabled={picked !== null} data-result={state} onClick={() => pick(option)}>
          {state === "correct" ? <span className="answer-mark"><Icon kind="check" /></span> : state === "incorrect" ? <span className="answer-mark"><Icon kind="close" /></span> : <Key>{String(i + 1)}</Key>}
          <span data-size={textSize(option)}>{option}</span></button>;
      })}</div>
    </section>}

    {phase === "done" && <section className="panel milestone">
      {answers.length > 0 && <><h2>{correct} von {duel.questions.length} richtig</h2><p>in {seconds(elapsed)}</p></>}
      <ol className="duel-results">{duel.results.map((result, i) => <li key={result.name + i} data-first={i === 0}>
        <span className="duel-rank">{i + 1}</span><strong>{result.name}</strong><span>{result.correct}/{duel.questions.length} · {seconds(result.ms)}</span>
      </li>)}</ol>
      {!duel.results.length && <p className="muted">Ergebnis wird gespeichert …</p>}
      <div className="actions">
        <button className="button primary" onClick={() => onShare(token, duel.title)}><Icon kind="share" /> Herausfordern</button>
        <button className="button" onClick={onHome}>Zur Bibliothek</button>
      </div>
    </section>}
  </section>;
}
