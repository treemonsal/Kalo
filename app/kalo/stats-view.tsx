"use client";

import { dayOf, secure, type Workspace } from "../../lib/learning";
import { goalOf, streak, week } from "../../lib/progress";
import { Icon } from "./icons";
import { MasteryRing, SubjectLevels } from "./progress-ui";

const weekday = new Intl.DateTimeFormat("de-CH", { weekday: "short", timeZone: "Europe/Zurich" });
const duration = (minutes: number) => minutes < 60 ? minutes + " min" : Math.floor(minutes / 60) + " h " + (minutes % 60) + " min";

/** Everything measured in one place, opened from the profile. */
export default function StatsView({ workspace, now, onBack }: { workspace: Workspace; now: number; onBack: () => void }) {
  const summary = week(workspace, now);
  const current = streak(workspace, now);
  const goal = goalOf(workspace);
  const days = Object.values(workspace.stats?.days ?? {});
  const total = { cards: days.reduce((sum, day) => sum + day.cards, 0), minutes: Math.round(days.reduce((sum, day) => sum + day.ms, 0) / 60_000) };
  const top = Math.max(goal, ...summary.days.map(item => item.points));
  const decks = workspace.decks.map(deck => ({
    deck, share: deck.cards.filter(card => secure(workspace, card.id, "front") || secure(workspace, card.id, "back")).length / Math.max(1, deck.cards.length),
  })).sort((a, b) => b.share - a.share);
  const accuracy = summary.graded ? Math.round((summary.gradedCorrect / summary.graded) * 100) : null;

  return <>
    <div className="view-bar"><button className="text-button" onClick={onBack}><Icon kind="back" /> Profil</button></div>
    <header className="page-head"><h1>Statistik</h1></header>

    <div className="stat-grid">
      <div className="stat-tile"><span className="flame" data-on={current.days > 0}><Icon kind="flame" filled={current.days > 0} /></span><strong>{current.days}</strong><span>{current.days === 1 ? "Tag Serie" : "Tage Serie"}</span></div>
      <div className="stat-tile"><Icon kind="cards" /><strong>{summary.cards}</strong><span>Karten diese Woche</span></div>
      <div className="stat-tile"><Icon kind="sparkle" /><strong>{summary.secured}</strong><span>Neu sicher</span></div>
      <div className="stat-tile"><Icon kind="target" /><strong>{accuracy === null ? "–" : accuracy + "%"}</strong><span>Richtig</span></div>
    </div>

    <section className="panel flow" aria-labelledby="week-title">
      <div className="section-head"><h2 id="week-title">Diese Woche</h2>
        {summary.previousCards > 0 && <span className="muted">Vorwoche {summary.previousCards}</span>}</div>
      <div className="week-bars" role="img" aria-label={"Punkte von Montag bis Sonntag: " + summary.days.map(item => item.points).join(", ") + ". Tagesziel " + goal + " Punkte."}>
        <span className="goal-mark" style={{ bottom: "calc(22px + (100% - 22px) * " + goal / top + ")" }} aria-hidden="true" />
        {summary.days.map(item => <span key={item.key} className="week-bar" data-reached={item.reached} data-today={item.key === dayOf(now)}>
          <i style={{ height: Math.max(2, (item.points / top) * 100) + "%" }} title={item.cards + " Karten bearbeitet · " + item.points + " Punkte"} />
          <small>{weekday.format(Date.parse(item.key + "T12:00:00Z"))}</small>
        </span>)}
      </div>
      <p className="muted">Montag bis Sonntag · Ziel: {goal} Punkte pro Tag{summary.minutes > 0 ? " · " + duration(summary.minutes) : ""}</p>
      <details className="advanced"><summary>Wie wird gezählt?</summary><p className="muted">Jede Bewertung zählt einen Punkt, richtige Goldkarten zwei. Die Trefferquote berücksichtigt Fragen und bewertete Wiederholungen. Wischbewertungen und ältere Bewertungen ohne getrennte Trefferquote zählen dabei nicht mit.</p></details>
    </section>

    <SubjectLevels workspace={workspace} />

    {decks.length > 0 && <section aria-labelledby="mastery"><div className="section-head"><h2 id="mastery">Sets</h2></div>
      <ul className="mastery-list">{decks.map(({ deck, share }) => <li key={deck.id}><MasteryRing share={share} /><span>{deck.title}</span></li>)}</ul>
    </section>}

    <p className="quiet-line">Im gespeicherten Verlauf: {total.cards} Karten bearbeitet{total.minutes ? " in " + duration(total.minutes) : ""}</p>
  </>;
}
