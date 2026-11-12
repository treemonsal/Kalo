"use client";

import type { CSSProperties } from "react";
import { dayOf, type Workspace } from "../../lib/learning";
import { dayStats, goalOf, levels, streak, type Step } from "../../lib/progress";
import type { PartnerSummary } from "../../lib/social";
import { Icon } from "./icons";


/** A ring that fills with today's cards. Gold cards count twice. */
export function GoalRing({ points, goal, size = 64 }: { points: number; goal: number; size?: number }) {
  const progress = Math.min(1, points / Math.max(1, goal));
  const radius = 26;
  const length = 2 * Math.PI * radius;
  return <span className="goal-ring" data-done={progress >= 1} style={{ width: size, height: size }}
    role="img" aria-label={"Tagesziel: " + Math.min(points, goal) + " von " + goal + " Punkte"}>
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={radius} className="ring-track" />
      <circle cx="32" cy="32" r={radius} className="ring-fill" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />
    </svg>
    <span className="ring-label">{progress >= 1 ? <Icon kind="check" /> : <><strong>{points}</strong><small>/{goal}</small></>}</span>
  </span>;
}

/** How much of a set sits, as a small ring with the percentage. */
export function MasteryRing({ share }: { share: number }) {
  const radius = 15;
  const length = 2 * Math.PI * radius;
  return <span className="mastery-ring" data-full={share >= 1} aria-hidden="true">
    <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r={radius} className="ring-track" /><circle cx="18" cy="18" r={radius} className="ring-fill" strokeDasharray={length} strokeDashoffset={length * (1 - share)} /></svg>
    <span>{share >= 1 ? <Icon kind="check" size="s" /> : Math.round(share * 100)}</span>
  </span>;
}

/** Today's progress is a pair of compact icon metrics. */
export function DailyHero({ workspace, now, onGoal }: { workspace: Workspace; now: number; onGoal: () => void }) {
  const goal = goalOf(workspace);
  const today = dayStats(workspace, dayOf(now));
  const current = streak(workspace, now);
  return <section className="hero compact" aria-label="Heute">
    <button className="hero-goal" onClick={onGoal} aria-label={"Tagesziel ändern, " + today.points + " von " + goal + " Punkten"} title="Tagesziel" data-done={today.points >= goal}>
      <Icon kind="target" /><strong>{today.points}<span className="metric-goal">/{goal}</span></strong>
    </button>
    <div className="hero-streak" data-active={current.days > 0} aria-label={current.days + " Tage Serie"} title="Serie">
      <span className="flame"><Icon kind="flame" filled={current.days > 0} /></span><strong>{current.days}</strong>
    </div>
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

/** Own picture, or the first letter of the name without one. */
export function Avatar({ name, picture, size = 40 }: { name: string; picture?: string | null; size?: number }) {
  return <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.42 }}>
    {/* A small data URL from the profile, image optimisation would add nothing. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {picture ? <img src={picture} alt="" width={size} height={size} /> : (name.trim()[0] ?? "K").toUpperCase()}
  </span>;
}

export function PartnerCard({ partner }: { partner: PartnerSummary }) {
  return <section className="partner-card" aria-label="Lernpartner">
    <Avatar name={partner.name} picture={partner.picture} />
    <div className="partner-copy">
      <strong>{partner.name}</strong>
      <span className="partner-flame" data-on={partner.shared > 0}><Icon kind="flame" filled={partner.shared > 0} size="s" /> {partner.shared} {partner.shared === 1 ? "Tag" : "Tage"} gemeinsam</span>
    </div>
    <span className="partner-today">{partner.todayDone ? <strong className="rating-known"><Icon kind="check" /></strong> : <strong>{Math.min(partner.todayPoints, partner.goal)}/{partner.goal}</strong>}<span>heute</span></span>
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

/** End of a card pass: share known (green), still learning (red) and skipped (grey), like a donut chart. */
export function ResultDonut({ known, later, total }: { known: number; later: number; total: number }) {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  const skipped = Math.max(0, total - known - later);
  const percent = Math.round((known / Math.max(1, total)) * 100);
  const segments = [
    { key: "known", value: known, className: "donut-known" },
    { key: "later", value: later, className: "donut-later" },
    { key: "skipped", value: skipped, className: "donut-skipped" },
  ].filter(item => item.value > 0);
  // A small gap separates the segments when there is more than one.
  const gap = segments.length > 1 ? 4 : 0;
  let offset = 0;
  return <div className="result" role="img" aria-label={percent + " Prozent kannst du. " + known + " kann ich, " + later + " noch nicht" + (skipped ? ", " + skipped + " übersprungen" : "") + "."}>
    <span className="donut">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={radius} className="donut-track" />
        {segments.map(item => {
          const size = Math.max(0, (item.value / Math.max(1, total)) * length - gap);
          const circle = <circle key={item.key} cx="64" cy="64" r={radius} className={"donut-segment " + item.className}
            strokeDasharray={size + " " + (length - size)} strokeDashoffset={-offset} style={{ "--size": size + "px", "--rest": length - size + "px" } as CSSProperties} />;
          offset += (item.value / Math.max(1, total)) * length;
          return circle;
        })}
      </svg>
      <span className="donut-label"><strong>{percent}<small>%</small></strong><span>kannst du</span></span>
    </span>
    <ul className="donut-legend" aria-hidden="true">
      <li className="donut-known"><i /><span>Kann ich</span><strong>{known}</strong></li>
      <li className="donut-later"><i /><span>Noch nicht</span><strong>{later}</strong></li>
      {skipped > 0 && <li className="donut-skipped"><i /><span>Übersprungen</span><strong>{skipped}</strong></li>}
    </ul>
  </div>;
}
