"use client";

import type { CSSProperties } from "react";
import { dayOf, type Workspace } from "../../lib/learning";
import { dayStats, goalOf, levels, streak, week, type Step } from "../../lib/progress";
import type { PartnerSummary } from "../../lib/social";
import { Icon } from "./icons";

const weekday = new Intl.DateTimeFormat("de-CH", { weekday: "narrow", timeZone: "Europe/Zurich" });

/** A ring that fills with today's cards. Gold cards count twice. */
export function GoalRing({ points, goal, size = 64 }: { points: number; goal: number; size?: number }) {
  const progress = Math.min(1, points / Math.max(1, goal));
  const radius = 26;
  const length = 2 * Math.PI * radius;
  return <span className="goal-ring" data-done={progress >= 1} style={{ width: size, height: size }}
    role="img" aria-label={"Tagesziel: " + Math.min(points, goal) + " von " + goal + " Karten"}>
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={radius} className="ring-track" />
      <circle cx="32" cy="32" r={radius} className="ring-fill" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />
    </svg>
    <span className="ring-label">{progress >= 1 ? <Icon kind="check" /> : <><strong>{points}</strong><small>/{goal}</small></>}</span>
  </span>;
}

/** Today's goal, the streak and the last seven days at a glance. */
export function DailyHero({ workspace, now, onGoal }: { workspace: Workspace; now: number; onGoal: () => void }) {
  const goal = goalOf(workspace);
  const today = dayStats(workspace, dayOf(now));
  const current = streak(workspace, now);
  const summary = week(workspace, now);
  const left = Math.max(0, goal - today.points);
  return <section className="hero" aria-label="Heute">
    <button className="hero-goal" onClick={onGoal} aria-label="Tagesziel ändern">
      <GoalRing points={today.points} goal={goal} />
      <span className="hero-copy">
        <strong>{left ? "Noch " + left + (left === 1 ? " Karte" : " Karten") : "Tagesziel erreicht"}</strong>
        <span>{left ? "bis zum Tagesziel" : today.cards + " Karten heute"}</span>
      </span>
    </button>
    <div className="hero-streak" data-risk={current.atRisk} data-active={current.days > 0}>
      <span className="flame"><Icon kind="flame" filled={current.days > 0} /></span>
      <span className="hero-copy"><strong>{current.days} {current.days === 1 ? "Tag" : "Tage"}</strong>
        <span>{current.atRisk ? "Serie heute halten" : current.days ? "Serie" : "Starte eine Serie"}</span></span>
    </div>
    <div className="week-strip" aria-label={"Diese Woche: " + summary.cards + " Karten, " + summary.secured + " neu sicher, " + summary.minutes + " Minuten"}>
      {summary.days.map(item => <span key={item.key} className="week-day" data-reached={item.reached} data-today={item.key === dayOf(now)}
        data-rest={current.restDays.includes(item.key)} title={item.points + " Karten"}>
        <i style={{ "--fill": Math.min(100, (item.points / Math.max(1, goal)) * 100) + "%" } as CSSProperties} />
        <small>{weekday.format(Date.parse(item.key + "T12:00:00Z"))}</small>
      </span>)}
    </div>
    <p className="week-line">Diese Woche {summary.cards} Karten · {summary.secured} neu sicher{summary.minutes > 0 ? " · " + (summary.minutes < 60 ? summary.minutes + " min" : Math.floor(summary.minutes / 60) + " h " + (summary.minutes % 60) + " min") : ""}
      {summary.previousCards > 0 && summary.cards > summary.previousCards ? " · mehr als letzte Woche" : ""}</p>
  </section>;
}

export function NextStepCard({ step, onStep }: { step: Step; onStep: (step: Step) => void }) {
  if (step.kind === "done" || step.kind === "review") return null;
  return <button className="continue-card" onClick={() => onStep(step)}>
    <span className="continue-copy"><span className="eyebrow">Als Nächstes</span><strong>{step.label}</strong><span className="muted">{step.detail}</span></span>
    <span className="continue-go" aria-hidden="true"><Icon kind="forward" /></span>
  </button>;
}

/** Finish screens never end in a dead end: the next useful step, or a clear end once the goal is reached. */
export function NextStepActions({ step, goalReached, onStep, onDone }: { step: Step; goalReached: boolean; onStep: (step: Step) => void; onDone: () => void }) {
  if (step.kind === "done") return <button className="button primary" autoFocus onClick={onDone}>Fertig für heute</button>;
  return goalReached
    ? <><button className="button primary" autoFocus onClick={onDone}><Icon kind="check" /> Fertig für heute</button>
      <button className="button" onClick={() => onStep(step)}>Noch eine Runde: {step.label}</button></>
    : <button className="button primary" autoFocus onClick={() => onStep(step)}>{step.label} <Icon kind="forward" /></button>;
}

export function GoalBanner({ workspace, now }: { workspace: Workspace; now: number }) {
  const goal = goalOf(workspace);
  const today = dayStats(workspace, dayOf(now));
  if (today.points < goal) return <p className="goal-line"><GoalRing points={today.points} goal={goal} size={36} /> Noch {goal - today.points} bis zum Tagesziel</p>;
  const current = streak(workspace, now);
  return <p className="goal-line done"><GoalRing points={today.points} goal={goal} size={36} /> Tagesziel erreicht · Serie {current.days} {current.days === 1 ? "Tag" : "Tage"}</p>;
}

export function PartnerCard({ partner }: { partner: PartnerSummary }) {
  return <section className="partner-card" aria-label="Lernpartner">
    <span className="partner-avatar" aria-hidden="true">{partner.name.slice(0, 1).toUpperCase()}</span>
    <div className="partner-copy">
      <strong>{partner.name} {partner.todayDone ? "hat das Tagesziel erreicht" : "lernt heute noch"}</strong>
      <span>Gemeinsame Serie {partner.shared} {partner.shared === 1 ? "Tag" : "Tage"} · {partner.name}: {Math.min(partner.todayPoints, partner.goal)}/{partner.goal}</span>
    </div>
    <span className="partner-flame" data-on={partner.shared > 0}><Icon kind="flame" filled={partner.shared > 0} /> {partner.shared}</span>
  </section>;
}

export function SubjectLevels({ workspace }: { workspace: Workspace }) {
  const list = levels(workspace);
  if (!list.length) return null;
  return <section aria-labelledby="subjects">
    <div className="section-head"><h2 id="subjects">Deine Fächer</h2></div>
    <div className="levels">{list.map(item => <div className="level-card" key={item.subject}>
      <span className="level-badge" aria-hidden="true">{item.level}</span>
      <div><strong>{item.subject}</strong>
        <span className="tile-progress"><span className="meter"><i style={{ width: item.progress * 100 + "%" }} /></span>
          <span>{item.toNext === null ? "Höchste Stufe" : "Stufe " + (item.level + 1) + " in " + item.toNext}</span></span></div>
      <span className="sr-only">Stufe {item.level}, {item.secure} Karten sitzen</span>
    </div>)}</div>
  </section>;
}

/** Shares a link with the system share sheet where available, otherwise copies it. Returns what happened. */
export async function shareLink(url: string, title: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share && matchMedia("(hover: none)").matches) { await navigator.share({ title, url }); return "shared"; }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "shared" : "failed";
  }
}
