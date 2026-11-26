"use client";

import { useState } from "react";
import type { Deck, Workspace } from "../../lib/learning";
import { sitting, streak } from "../../lib/progress";
import type { PartnerSummary } from "../../lib/social";
import { EmptyState } from "./feedback";
import { Icon } from "./icons";
import { loadImage } from "./picture";
import { PictureCrop } from "./picture-crop";
import { DeckTile } from "./deck-tile";
import { Avatar, PartnerCard } from "./progress-ui";
import type { Mutate } from "./types";

type Props = {
  workspace: Workspace; now: number; busy: boolean; profile: { name: string; picture: string | null; custom: boolean };
  partner?: PartnerSummary | null; dueByDeck: Map<string, number>; mutate: Mutate;
  onOpenDeck: (deck: Deck) => void; onCreate: () => void; onError: (message: string) => void;
};

/** Who you are and all your sets, like the profile in MyStyle. */
export default function ProfileView({ workspace, now, busy, profile, partner, dueByDeck, mutate, onOpenDeck, onCreate, onError }: Props) {
  const [search, setSearch] = useState("");
  const [naming, setNaming] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ image: HTMLImageElement; url: string } | null>(null);
  const query = search.trim().toLocaleLowerCase("de-CH");
  const decks = workspace.decks.filter(item => !query ||
    [item.title, item.subject ?? "", ...item.cards.flatMap(card => [card.front, card.back])]
      .some(value => value.toLocaleLowerCase("de-CH").includes(query)));
  const cards = workspace.decks.reduce((total, deck) => total + deck.cards.length, 0);
  const sits = workspace.decks.reduce((total, deck) => total + sitting(workspace, deck), 0);
  const days = streak(workspace, now).days;
  const stats = ([["Sets", workspace.decks.length], ["Karten", cards], ["Sitzen", sits], ["Serie", days]] as const);

  async function choose(file: File | undefined) {
    if (!file) return;
    try { setPhoto(await loadImage(file)); }
    catch (error) { onError(error instanceof Error ? error.message : "Dieses Bild geht nicht."); }
  }

  function closePhoto() {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  }

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (naming === null) return;
    if (await mutate({ type: "profile", name: naming.trim() })) setNaming(null);
  }

  return <>
    <section className="profile-head" aria-label="Profil">
      <label className="profile-picture" title="Profilbild ändern">
        <Avatar name={profile.name} picture={profile.picture} size={84} />
        <span className="picture-badge" aria-hidden="true"><Icon kind="camera" size="s" /></span>
        <input type="file" accept="image/*" className="sr-only" disabled={busy} aria-label="Profilbild wählen"
          onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      {naming === null
        ? <div className="profile-name"><h1>{profile.name}</h1>
          <button className="icon-button" aria-label="Namen ändern" title="Namen ändern" onClick={() => setNaming(profile.custom ? profile.name : "")}><Icon kind="edit" /></button></div>
        : <form className="profile-name-form" onSubmit={saveName}>
          <label className="sr-only" htmlFor="profile-name">Dein Name</label>
          <input id="profile-name" autoFocus maxLength={30} value={naming} placeholder={profile.name} onChange={event => setNaming(event.target.value)} />
          <button className="button primary small" disabled={busy}>Speichern</button>
          <button type="button" className="button small" onClick={() => setNaming(null)}>Abbrechen</button>
          {profile.picture && <button type="button" className="text-button" disabled={busy} onClick={() => void mutate({ type: "profile", picture: null })}>Bild entfernen</button>}
        </form>}
      {/* Numbers only once they say something: no row of zeros. */}
      {workspace.decks.length > 0 && <dl className="profile-stats">{stats.map(([label, value]) =>
        <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>}
    </section>

    {photo && <PictureCrop image={photo.image} onCancel={closePhoto} onDone={picture => { closePhoto(); void mutate({ type: "profile", picture }); }} />}

    {partner && <PartnerCard partner={partner} />}

    <section aria-labelledby="sets" className="sets">
      <div className="section-head"><h2 id="sets">Meine Sets</h2>
        {workspace.decks.length > 2 && <label className="search"><Icon kind="search" /><span className="sr-only">Sets durchsuchen</span>
          <input type="search" value={search} placeholder="Suchen" onChange={event => setSearch(event.target.value)} /></label>}
      </div>
      {decks.length ? <div className="decks">{decks.map(deck => <DeckTile key={deck.id} workspace={workspace} deck={deck} now={now} due={dueByDeck.get(deck.id) ?? 0} onOpen={onOpenDeck} />)}</div>
        : workspace.decks.length ? <EmptyState icon="search" title="Nichts gefunden" text={"Kein Set enthält «" + search.trim() + "»."}><button className="button" onClick={() => setSearch("")}>Suche zurücksetzen</button></EmptyState>
          : <EmptyState icon="cards" title="Dein erstes Set"><button className="button primary" onClick={onCreate}><Icon kind="plus" /> Set erstellen</button></EmptyState>}
    </section>
  </>;
}
