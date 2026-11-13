"use client";

import { dayOf, secure, type Workspace } from "../../lib/learning";
import { goalOf, streak, week } from "../../lib/progress";
import { Icon } from "./icons";
import { MasteryRing, SubjectLevels } from "./progress-ui";

const weekday = new Intl.DateTimeFormat("de-CH", { weekday: "short", timeZone: "Europe/Zurich" });

/** Everything measured in one place, opened from the profile. */
export default function StatsView({ workspace, now, onBack }: { workspace: Workspace; now: number; onBack: () => void }) {
  const summary = week(workspace, now);
  const current = streak(workspace, now);
  const goal = goalOf(workspace);
  const top = Math.max(goal, ...summary.days.map(item => item.points));
  const decks = workspace.decks.map(deck => ({
    deck, share: deck.cards.filter(card => secure(workspace, card.id, "front") || secure(workspace, card.id, "back")).length / Math.max(1, deck.cards.length),
  })).sort((a, b) => b.share - a.share);
  const accuracy = summary.graded ? Math.round((summary.gradedCorrect / summary.graded) * 100) : null;

  return <>
    <div className="view-bar"><button className="icon-button" aria-label="Zurück zum Profil" onClick={onBack}><Icon kind="back" /></button></div>
    <header className="page-head"><h1>Statistik</h1></header>

    <div className="stat-grid">
      <div className="stat-tile" aria-label={current.days + " Tage Serie"} title="Serie"><span className="flame" data-on={current.days > 0}><Icon kind="flame" filled={current.days > 0} /></span><strong>{current.days}</strong></div>
      <div className="stat-tile" aria-label={summary.cards + " Karten bearbeitet"} title="Bearbeitete Karten"><Icon kind="cards" /><strong>{summary.cards}</strong></div>
      <div className="stat-tile" aria-label={summary.secured + " Karten gelernt"} title="Gelernte Karten"><Icon kind="sparkle" /><strong>{summary.secured}</strong></div>
      <div className="stat-tile" aria-label={accuracy === null ? "Noch keine bewerteten Antworten" : accuracy + " Prozent richtig"} title="Richtige Antworten"><Icon kind="target" /><strong>{accuracy === null ? "–" : accuracy + "%"}</strong></div>
    </div>

    <section className="panel flow" aria-labelledby="week-title">
      <div className="section-head"><h2 id="week-title">Diese Woche</h2></div>
      <div className="week-bars" role="img" aria-label={"Punkte von Montag bis Sonntag: " + summary.days.map(item => item.points).join(", ") + ". Tagesziel " + goal + " Punkte."}>
        <span className="goal-mark" style={{ bottom: "calc(22px + (100% - 22px) * " + goal / top + ")" }} aria-hidden="true"><span className="goal-number">{goal}</span></span>
        {summary.days.map(item => <span key={item.key} className="week-bar" data-reached={item.reached} data-today={item.key === dayOf(now)}>
          <i style={{ height: Math.max(2, (item.points / top) * 100) + "%" }} title={item.cards + " Karten bearbeitet · " + item.points + " Punkte"} />
          <small>{weekday.format(Date.parse(item.key + "T12:00:00Z"))}</small>
        </span>)}
      </div>

    </section>

    <SubjectLevels workspace={workspace} />

    {decks.length > 0 && <section aria-labelledby="mastery"><div className="section-head"><h2 id="mastery" aria-label="Sets"><Icon kind="library" /><span className="sr-only">Sets</span></h2></div>
      <ul className="mastery-list">{decks.map(({ deck, share }) => <li key={deck.id}><MasteryRing share={share} /><span>{deck.title}</span></li>)}</ul>
    </section>}

  </>;
}
