"use client";

import { useState } from "react";
import type { Deck, Direction, Workspace } from "../../lib/learning";
import { NavIcon } from "./icons";
import { dateFormat, plural } from "./types";

export type DueSet = { deck: Deck; side: Direction; count: number; oldest: number };
type Props = {
  workspace: Workspace; busy: boolean; dueSets: DueSet[]; dueCount: number; learned: number; nextReview: number;
  recent?: { title: string; prompt?: string; onOpen: () => void };
  unsaved?: { title: string; onOpen: () => void; onDiscard: () => void };
  onReview: (item: DueSet) => void; onOpenDeck: (deck: Deck) => void; onImport: () => void; onChat: () => void; onCreate: () => void;
};

export default function HomeView({ workspace, busy, dueSets, dueCount, learned, nextReview, recent, unsaved, onReview, onOpenDeck, onImport, onChat, onCreate }: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("de-CH");
  const decks = workspace.decks.filter(item => !query ||
    [item.title, ...item.cards.flatMap(card => [card.front, card.back])]
      .some(value => value.toLocaleLowerCase("de-CH").includes(query)));

  return <>
    <header className="library-heading">
      <div>
        <span className="eyebrow">Deine Lernbibliothek</span>
        <h1>Was lernst du heute?</h1>
      </div>
      <div className="actions">
        <button className="icon action-icon" aria-label="Text importieren" title="Text importieren" onClick={onImport}><NavIcon kind="import" /></button>
      </div>
    </header>
    {unsaved && <div className="continue-card unsaved">
      <span className="continue-icon"><NavIcon kind="edit" /></span>
      <span className="continue-copy"><span className="eyebrow">Nicht gespeichert</span><strong>{unsaved.title || "Neues Set"}</strong><span className="muted">Deine Änderungen im Editor sind auf diesem Gerät gesichert.</span></span>
      <span className="actions"><button className="button primary" onClick={unsaved.onOpen}>Weiterbearbeiten</button><button className="button" onClick={unsaved.onDiscard}>Verwerfen</button></span>
    </div>}
    {recent && <button className="continue-card" onClick={recent.onOpen}>
      <span className="continue-icon"><NavIcon kind="library" /></span>
      <span className="continue-copy"><span className="eyebrow">Weiterlernen</span><strong>{recent.title}</strong>{recent.prompt && <span className="muted">{recent.prompt}</span>}</span>
      <span className="chevron" aria-hidden="true">›</span>
    </button>}
    <div className="stats">
      <div><strong>{workspace.decks.length}</strong><span>Kartensets</span></div>
      <div className={dueCount ? "due" : undefined}><strong>{dueCount}</strong><span>Fällig</span></div>
      <div><strong>{learned}</strong><span>Sicher gelernt</span></div>
    </div>
    {dueSets.length > 0 && <section className="panel review-inbox" aria-labelledby="due">
      <div className="section-title"><h2 id="due">Jetzt wiederholen</h2><span>{dueCount} fällig</span></div>
      {dueSets.map(item => <div className="due-row" key={item.deck.id + item.side}>
        <div><h3>{item.deck.title}</h3><p>{plural(item.count, "Karte", "Karten")} · {item.side === "front" ? "Vorderseite zuerst" : "Rückseite zuerst"}</p></div>
        <button className="button" disabled={busy} onClick={() => onReview(item)}
          aria-label={item.deck.title + (item.side === "front" ? ", Vorderseite zuerst wiederholen" : ", Rückseite zuerst wiederholen")}>Üben</button>
      </div>)}
    </section>}
    {!dueCount && Number.isFinite(nextReview) && <p className="next-review">Nächste Wiederholung · {dateFormat.format(nextReview)}</p>}
    <section aria-labelledby="sets">
      <div className="section-title"><h2 id="sets">Meine Sets</h2><span>{plural(decks.length, "Set", "Sets")}</span></div>
      {workspace.decks.length > 0 && <label className="library-search"><span className="sr-only">Bibliothek durchsuchen</span>
        <input type="search" value={search} placeholder="Setname, Frage oder Antwort suchen" onChange={event => setSearch(event.target.value)} />
      </label>}
      {decks.length ? <div className="decks">{decks.map(item => <button className="deck-tile" key={item.id} onClick={() => onOpenDeck(item)}>
        <span className="tile-mark"><NavIcon kind="library" /></span><span className="tile-title">{item.title}</span>
        <span className="muted">{plural(item.cards.length, "Karte", "Karten")}</span><span className="tile-arrow" aria-hidden="true">›</span>
      </button>)}</div> :
        workspace.decks.length ? <div className="panel empty"><h3>Keine passenden Sets</h3><button className="button" onClick={() => setSearch("")}>Suche zurücksetzen</button></div> :
          <div className="panel empty"><h3>Platz für dein erstes Set</h3><p>Schreib deine Karten selbst, importiere eine Datei oder lass ChatGPT einen Entwurf erstellen.</p>
            <div className="actions"><button className="button primary" onClick={onCreate}>Set erstellen</button><button className="button" onClick={onChat}>Mit ChatGPT erstellen</button></div></div>}
    </section>
  </>;
}
