"use client";

import { useState } from "react";
import type { Appearance } from "../../lib/appearance";
import { workspaceShape, type Workspace } from "../../lib/learning";
import type { Mutate } from "./types";

export const BACKUP_FORMAT = "kalo";
const LEGACY_FORMAT = "kartenloop";

type Props = {
  workspace: Workspace; busy: boolean; theme: Appearance; chatLink: string;
  reminders: { enabled: boolean; toggle: () => Promise<void>; test: () => Promise<void> };
  mutate: Mutate; onTheme: (value: Appearance) => void; onChatLink: (value: string) => boolean;
  onError: (message: string) => void; onNotice: (message: string) => void;
};

export default function SettingsView({ workspace, busy, theme, chatLink, reminders, mutate, onTheme, onChatLink, onError, onNotice }: Props) {
  const [restore, setRestore] = useState<Workspace | null>(null);
  const [link, setLink] = useState(chatLink);

  async function reminderAction(action: () => Promise<void>) {
    try { onError(""); await action(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Mitteilung konnte nicht gesendet werden."); }
  }

  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: BACKUP_FORMAT, version: 1, workspace })], { type: "application/json" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = "Kalo Sicherung.json";
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return <>
    <header className="page-head"><div><span className="eyebrow">Kalo</span><h1>Einstellungen</h1></div></header>
    <section className="panel flow"><h2>Darstellung</h2>
      <fieldset className="appearance"><legend>Farbschema</legend>
        {([["system", "System"], ["light", "Hell"], ["dark", "Dunkel"]] as const).map(([value, label]) =>
          <label key={value}><input type="radio" name="appearance" value={value} checked={theme === value} onChange={() => onTheme(value)} /><span>{label}</span></label>)}
      </fieldset>
      <p className="muted">Die Auswahl gilt für diesen Browser.</p>
    </section>
    <section className="panel flow"><h2>Lernerinnerungen</h2>
      <p>Wenn Kalo geöffnet ist und Karten fällig sind, erhältst du höchstens eine Mitteilung pro Tag.</p>
      <div className="actions">
        <button className="button" onClick={() => void reminderAction(reminders.toggle)}>{reminders.enabled ? "Erinnerungen ausschalten" : "Erinnerungen einschalten"}</button>
        <button className="button" onClick={() => void reminderAction(reminders.test)}>Testmitteilung senden</button>
      </div>
    </section>
    <section className="panel flow"><h2>Datensicherung</h2><p>Die JSON Datei enthält deine Kartensets und deinen Lernstand.</p>
      <div className="actions"><button className="button primary" onClick={backup}>Sicherung herunterladen</button><label className="button file-button">Sicherung wiederherstellen<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
        const file = event.currentTarget.files?.[0];
        setRestore(null);
        event.currentTarget.value = "";
        if (!file) return;
        try {
          if (file.size > 3_200_000) throw new Error("Diese Sicherung ist zu gross.");
          const parsed = JSON.parse(await file.text());
          if ((parsed.format !== BACKUP_FORMAT && parsed.format !== LEGACY_FORMAT) || parsed.version !== 1) throw new Error("Wähle eine gültige Kalo Sicherung.");
          const data = workspaceShape.safeParse(parsed.workspace);
          if (!data.success) throw new Error("Die Sicherung enthält ungültige Kartendaten.");
          onError("");
          setRestore(data.data);
        } catch (cause) { onError(cause instanceof Error ? cause.message : "Die Sicherung konnte nicht gelesen werden."); }
      }} /></label></div>
      {restore && <div className="restore-preview flow">
        <h3>Sicherung prüfen</h3>
        <p>{restore.decks.length} Sets und {restore.decks.reduce((total, item) => total + item.cards.length, 0)} Karten. Beim Wiederherstellen werden deine aktuellen Sets und dein Lernstand ersetzt.</p>
        <div className="actions">
          <button className="button destructive" disabled={busy} onClick={async () => {
            if (await mutate({ type: "restore", data: restore })) { setRestore(null); onNotice("Sicherung wiederhergestellt."); }
          }}>Aktuellen Stand ersetzen</button>
          <button className="button" onClick={() => setRestore(null)}>Abbrechen</button>
        </div>
      </div>}
    </section>
    <section className="panel flow"><h2>Dein Chat</h2><form className="flow" onSubmit={event => {
      event.preventDefault();
      if (onChatLink(link)) onNotice("Chat Link auf diesem Gerät gespeichert.");
      else onError("Verwende einen Link von https://chatgpt.com.");
    }}><label>Link zum bestehenden Chat<input type="url" value={link} onChange={event => setLink(event.target.value)} /></label><button className="button" type="submit">Chat Link speichern</button></form></section>
    <a className="button" href="/signout-with-chatgpt?return_to=%2F" target="_top">Abmelden</a>
  </>;
}
