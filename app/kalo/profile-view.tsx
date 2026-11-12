"use client";

import { useState } from "react";
import { secure, type Deck, type Workspace } from "../../lib/learning";
import { examIn, streak } from "../../lib/progress";
import type { FriendSummary } from "../../lib/social";
import { EmptyState } from "./feedback";
import { Icon } from "./icons";
import { Avatar, MasteryRing } from "./progress-ui";
import { plural } from "./types";

type Props = {
  workspace: Workspace; now: number; profile: { name: string; picture: string | null; custom: boolean };
  friends: FriendSummary[]; dueByDeck: Map<string, number>;
  onOpenDeck: (deck: Deck) => void; onCreate: () => void;
};

export default function ProfileView({ workspace, now, profile, friends, dueByDeck, onOpenDeck, onCreate }: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("de-CH");
  const decks = workspace.decks.filter(item => !query || [item.title, item.subject ?? "", ...item.cards.flatMap(card => [card.front, card.back])].some(value => value.toLocaleLowerCase("de-CH").includes(query)));
  const cards = workspace.decks.reduce((total, deck) => total + deck.cards.length, 0);
  const days = streak(workspace, now).days;
  return <>
    <section className="profile-head" aria-label="Profil">
      <Avatar name={profile.name} picture={profile.picture} size={84} />
      <h1 className="profile-title">{profile.name}</h1>
      <ul className="profile-metrics">
        <li aria-label={workspace.decks.length + " Sets"} title="Sets"><Icon kind="library" /><span>{workspace.decks.length}</span></li>
        <li aria-label={cards + " Karten"} title="Karten"><Icon kind="cards" /><span>{cards}</span></li>
        <li aria-label={days + " Tage Serie"} title="Serie" data-active={days > 0}><Icon kind="flame" filled={days > 0} /><span>{days}</span></li>
      </ul>
    </section>
    {friends.length > 0 && <section className="profile-friends" aria-label="Freunde"><div className="friend-tiles">{friends.map(friend =>
      <div key={friend.id} className="friend-tile"><Avatar name={friend.name} picture={friend.picture} size={44} /><span>{friend.name}</span><span className="friend-streak" aria-label={friend.shared + " Tage gemeinsam"} data-active={friend.shared > 0}><Icon kind="flame" filled={friend.shared > 0} size="s" />{friend.shared}</span></div>
    )}</div></section>}
    <section aria-labelledby="sets" className="sets">
      <div className="section-head"><h2 id="sets">Meine Sets</h2>
        {workspace.decks.length > 2 && <label className="search"><Icon kind="search" /><span className="sr-only">Sets durchsuchen</span><input type="search" value={search} placeholder="Suchen" onChange={event => setSearch(event.target.value)} /></label>}
      </div>
      {decks.length ? <div className="decks">{decks.map(deck => <DeckTile key={deck.id} workspace={workspace} deck={deck} now={now} due={dueByDeck.get(deck.id) ?? 0} onOpen={onOpenDeck} />)}</div>
        : workspace.decks.length ? <EmptyState icon="search" title="Nichts gefunden"><button className="button" onClick={() => setSearch("")}>Suche zurücksetzen</button></EmptyState>
          : <EmptyState icon="cards" title="Dein erstes Set"><button className="button primary" onClick={onCreate}><Icon kind="plus" /> Set erstellen</button></EmptyState>}
    </section>
  </>;
}

export function DeckTile({ workspace, deck, now, due, onOpen }: { workspace: Workspace; deck: Deck; now: number; due: number; onOpen: (deck: Deck) => void }) {
  const done = deck.cards.filter(card => secure(workspace, card.id, "front") || secure(workspace, card.id, "back")).length;
  const exam = examIn(deck, now);
  const share = done / Math.max(1, deck.cards.length);
  return <button className="deck-tile" onClick={() => onOpen(deck)}
    aria-label={deck.title + ", " + plural(deck.cards.length, "Karte", "Karten") + ", " + Math.round(share * 100) + " Prozent sitzen" + (due ? ", " + due + " fällig" : "") + (exam !== null ? ", Prüfung in " + exam + " Tagen" : "")}>
    <MasteryRing share={share} />
    <span className="tile-title">{deck.title}</span>
    <span className="tile-meta" aria-hidden="true">
      <span><Icon kind="cards" size="s" /> {deck.cards.length}</span>
      {due > 0 && <span className="due-badge"><Icon kind="repeat" size="s" /> {due}</span>}
      {exam !== null && <span className="exam-badge"><Icon kind="calendar" size="s" /> {exam === 0 ? "heute" : exam + " T."}</span>}
      {deck.subject && <span className="subject-badge">{deck.subject}</span>}
    </span>
  </button>;
}
