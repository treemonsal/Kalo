"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { FriendSummary } from "../../lib/social";
import { Avatar } from "./progress-ui";
import { Icon } from "./icons";
import { loadImage } from "./picture";
import { PictureCrop } from "./picture-crop";
import { PictureMenu } from "./picture-menu";
import type { Mutate } from "./types";

export default function ProfileEditor({ profile, friends, busy, mutate, onInvite, onRemove, onBack, onError }: {
  profile: { name: string; picture: string | null; custom: boolean }; friends: FriendSummary[]; busy: boolean; mutate: Mutate;
  onInvite: () => void; onRemove: (friend: FriendSummary) => void; onBack: () => void; onError: (message: string) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [saved, setSaved] = useState(false);
  const [pictureMenu, setPictureMenu] = useState(false);
  const [photo, setPhoto] = useState<{ image: HTMLImageElement; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  async function choose(file: Blob | undefined) {
    if (!file) return;
    setPictureMenu(false);
    if (file.size > 30_000_000) { onError("Wähle ein Foto unter 30 MB."); return; }
    try { setPhoto(await loadImage(file)); }
    catch (error) { onError(error instanceof Error ? error.message : "Dieses Bild lässt sich nicht öffnen."); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await mutate({ type: "profile", name: name.trim() })) setSaved(true);
  }
  return <>
    <div className="view-bar"><button className="icon-button" aria-label="Zurück zum Profil" onClick={onBack}><Icon kind="back" /></button></div>
    <header className="page-head"><h1>Profil bearbeiten</h1></header>
    <section className="panel flow profile-edit-panel">
      <button className="profile-picture" aria-label="Profilbild bearbeiten" disabled={busy} onClick={() => setPictureMenu(true)}><Avatar name={profile.name} picture={profile.picture} size={84} /><span className="picture-badge"><Icon kind="camera" size="s" /></span></button>
      <input ref={fileInput} type="file" accept="image/*" hidden aria-label="Profilbild wählen" onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
      <form className="profile-edit-name" onSubmit={event => void save(event)}><label>Name<input name="name" autoComplete="nickname" value={name} maxLength={30} onChange={event => { setName(event.target.value); setSaved(false); }} /></label>
        <button className="button primary" disabled={busy || saved || name.trim() === profile.name}>{saved ? "Gespeichert" : "Speichern"}</button></form>
    </section>
    <section className="panel flow"><div className="section-head"><h2>Freunde</h2><button className="icon-button" title="Freund einladen" aria-label="Freund einladen" disabled={busy} onClick={onInvite}><Icon kind="plus" /></button></div>
      {friends.length ? <ul className="friend-list">{friends.map(friend => <li key={friend.id}>
        <Avatar name={friend.name} picture={friend.picture} size={40} /><strong>{friend.name}</strong><span className="friend-streak" aria-label={friend.shared + " Tage gemeinsam"} data-active={friend.shared > 0}><Icon kind="flame" filled={friend.shared > 0} size="s" />{friend.shared}</span>
        <button className="icon-button" aria-label={friend.name + " entfernen"} title="Freund entfernen" disabled={busy} onClick={() => onRemove(friend)}><Icon kind="close" /></button>
      </li>)}</ul> : <button className="button" disabled={busy} onClick={onInvite}><Icon kind="people" /> Freund einladen</button>}
    </section>
    {pictureMenu && <PictureMenu hasPicture={Boolean(profile.picture)} busy={busy} onClose={() => setPictureMenu(false)} onChoose={() => fileInput.current?.click()}
      onCrop={() => { if (profile.picture) void fetch(profile.picture).then(response => response.blob()).then(choose).catch(() => onError("Dieses Bild lässt sich nicht öffnen.")); }}
      onRemove={() => void mutate({ type: "profile", picture: null }).then(result => { if (result) setPictureMenu(false); })} />}
    {photo && <PictureCrop key={photo.url} image={photo.image} onCancel={() => setPhoto(null)} onDone={async picture => {
      if (!await mutate({ type: "profile", picture })) throw new Error("Speichern ging nicht. Versuche es nochmals.");
      setPhoto(null);
    }} />}
  </>;
}
