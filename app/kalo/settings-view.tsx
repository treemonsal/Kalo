"use client";

import { useState } from "react";
import type { Appearance } from "../../lib/appearance";
import type { Design } from "../../lib/design";
import { workspaceShape, type Workspace } from "../../lib/learning";
import { goalOf } from "../../lib/progress";
import { Icon } from "./icons";
import { SOUND_KEY, play } from "./sound";
import { useStored, writeStored } from "./storage";
import type { Mutate } from "./types";

export const BACKUP_FORMAT = "kalo";
const LEGACY_FORMAT = "kartenloop";

type Props = {
  workspace: Workspace; busy: boolean; theme: Appearance; design: Design; chatLink: string;
  pushKey?: string | null; push?: { enabled: boolean; morning: string; evening: string };
  onBack: () => void;
  mutate: Mutate; onTheme: (value: Appearance) => void; onDesign: (value: Design) => void; onChatLink: (value: string) => boolean;
  onError: (message: string) => void; onNotice: (message: string) => void;
};

const GOALS = [10, 20, 30, 50];
const TIMES = ["06:15", "06:45", "07:15", "12:00", "16:30", "18:00", "19:30", "20:30", "21:30"];
const bytes = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)), c => c.charCodeAt(0));

export default function SettingsView({ workspace, busy, theme, design, chatLink, mutate, onTheme, onDesign, onChatLink, onError, onNotice, pushKey, push, onBack }: Props) {
  const sound = useStored(SOUND_KEY) !== "off";
  const morning = push?.morning ?? "06:45";
  const evening = push?.evening ?? "19:30";

  async function enablePush() {
    if (!pushKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Dieser Browser kann keine Push-Mitteilungen empfangen. Auf dem iPhone: Kalo im Teilen-Menü zum Home-Bildschirm hinzufügen und von dort öffnen.");
    }
    if (await Notification.requestPermission() !== "granted") throw new Error("Erlaube Mitteilungen für Kalo in den Einstellungen deines Geräts.");
    const registration = await navigator.serviceWorker.register("/kalo-notifications.js");
    await navigator.serviceWorker.ready;
    const subscription = (await registration.pushManager.getSubscription()) ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(pushKey) });
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("Die Anmeldung für Mitteilungen ist fehlgeschlagen.");
    if (await mutate({ type: "pushSubscribe", subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, morning, evening })) onNotice("Erinnerungen eingeschaltet");
  }
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
    <div className="view-bar"><button className="icon-button" aria-label="Zurück zum Profil" onClick={onBack}><Icon kind="back" /></button></div>
    <header className="page-head"><h1>Einstellungen</h1></header>
    <section className="panel flow"><h2>Darstellung</h2>
      <div className="setting"><span className="setting-label" id="design">Design</span>
        <div className="appearance" role="radiogroup" aria-labelledby="design" aria-describedby="design-note">
          {([["current", "Neu"], ["classic", "Bisherig"]] as const).map(([value, label]) =>
            <label key={value}><input type="radio" name="design" value={value} checked={design === value} onChange={() => onDesign(value)} /><span>{label}</span></label>)}
        </div></div>
      <p className="muted" id="design-note">Neu: Graphit. Bisherig: Indigo und die vertraute Schrift. Jederzeit wechselbar.</p>
      <div className="setting"><span className="setting-label" id="scheme">Farbschema</span>
        <div className="appearance" role="radiogroup" aria-labelledby="scheme">
          {([["dark", "Dunkel"], ["light", "Hell"], ["system", "System"]] as const).map(([value, label]) =>
            <label key={value}><input type="radio" name="appearance" value={value} checked={theme === value} onChange={() => onTheme(value)} /><span>{label}</span></label>)}
        </div></div>
    </section>
    <section className="panel flow"><h2>Tagesziel</h2>
      <div className="setting"><span className="setting-label" id="goal">Punkte pro Tag</span>
        <div className="appearance" role="radiogroup" aria-labelledby="goal">
          {GOALS.map(value => <label key={value}><input type="radio" name="goal" checked={goalOf(workspace) === value} onChange={() => void mutate({ type: "setGoal", goal: value })} /><span>{value}</span></label>)}
        </div></div>
      <p>Jede Bewertung zählt einen Punkt. Richtige Goldkarten zählen zwei.</p>
      <p className="muted">Goldkarten zählen doppelt. Ein verpasster Tag pro Woche gilt als Ruhetag.</p>
      <label className="check"><input type="checkbox" checked={sound} onChange={event => { writeStored(SOUND_KEY, event.target.checked ? "on" : "off"); if (event.target.checked) play("correct"); }} /> Töne beim Lernen</label>
    </section>
    {pushKey && <section className="panel flow"><h2>Lernerinnerungen</h2>
      <>
        <p>Morgens bei fälligen Karten, abends nur für deine Serie.</p>
        <div className="two">
          <label>Morgens<select value={morning} onChange={event => void mutate({ type: "pushTimes", morning: event.target.value, evening })}>{TIMES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label>Abends<select value={evening} onChange={event => void mutate({ type: "pushTimes", morning, evening: event.target.value })}>{TIMES.map(t => <option key={t}>{t}</option>)}</select></label>
        </div>
        <div className="actions">
          {push?.enabled ? <button className="button" onClick={() => void mutate({ type: "pushUnsubscribe" })}>Erinnerungen ausschalten</button>
            : <button className="button primary" onClick={() => void reminderAction(enablePush)}><Icon kind="bell" /> Erinnerungen einschalten</button>}
        </div>
      </>
    </section>}
    <section className="panel"><details className="advanced"><summary>Erweitert</summary><div className="flow">
    <section className="flow"><h3>Datensicherung</h3><p>Die JSON Datei enthält deine Kartensets und deinen Lernstand.</p>
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
    <section className="flow"><h3>Dein Chat</h3><form className="flow" onSubmit={event => {
      event.preventDefault();
      if (onChatLink(link)) onNotice("Chat Link auf diesem Gerät gespeichert.");
      else onError("Verwende einen Link von https://chatgpt.com.");
    }}><label>Link zum bestehenden Chat<input type="url" value={link} onChange={event => setLink(event.target.value)} /></label><button className="button" type="submit">Chat Link speichern</button></form></section>
    </div></details></section>
    <a className="button" href="/signout-with-chatgpt?return_to=%2F" target="_top">Abmelden</a>
  </>;
}
