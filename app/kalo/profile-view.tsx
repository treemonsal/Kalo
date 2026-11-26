"use client";

import { useState } from "react";
import type { Deck, Workspace } from "../../lib/learning";
import { streak } from "../../lib/progress";
import type { FriendSummary } from "../../lib/social";
import { EmptyState } from "./feedback";
import { Icon } from "./icons";
import { DeckTile } from "./deck-tile";
import { Avatar } from "./progress-ui";

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
      <div className="section-head"><h2 id="sets" aria-label="Meine Sets"><Icon kind="library" /><span className="count">{workspace.decks.length}</span></h2>
        {workspace.decks.length > 2 && <label className="search"><Icon kind="search" /><span className="sr-only">Sets durchsuchen</span><input type="search" value={search} placeholder="Suchen" onChange={event => setSearch(event.target.value)} /></label>}
      </div>
      {decks.length ? <div className="decks">{decks.map(deck => <DeckTile key={deck.id} workspace={workspace} deck={deck} now={now} due={dueByDeck.get(deck.id) ?? 0} onOpen={onOpenDeck} />)}</div>
        : workspace.decks.length ? <EmptyState icon="search" title="Nichts gefunden"><button className="button" onClick={() => setSearch("")}>Suche zurücksetzen</button></EmptyState>
          : <EmptyState icon="cards" title="Dein erstes Set"><button className="button primary" onClick={onCreate}><Icon kind="plus" /> Set erstellen</button></EmptyState>}
    </section>
  </>;
}
