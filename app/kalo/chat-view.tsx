"use client";

import { useState } from "react";
import type { Deck } from "../../lib/learning";
import { EmptyState, type Confirm } from "./feedback";
import { Icon } from "./icons";
import { dateFormat, plural, type Draft, type Mutate } from "./types";

type Props = {
  deck?: Deck; presetCard?: string; confirm: Confirm; drafts: Draft[]; busy: boolean; chatUrl: string; mutate: Mutate;
  copy: (text: string) => void; onBack: () => void; onRefresh: () => void; onImport: () => void; onReview: (draft: Draft) => void;
};

const draftTask = "Erstelle aus meinen folgenden Unterlagen ein Kalo Set. Pro Karte eine klare Frage und eine kurze Antwort. Verwende nur den Lernstoff. Speichere das Set mit Kalo als Entwurf. Falls das Plugin fehlt, gib je eine Karte pro Zeile als Frage, Tabulator, Antwort aus.";
const LIMIT = 80;

export default function ChatView({ deck, presetCard, confirm, drafts, busy, chatUrl, mutate, copy, onBack, onRefresh, onImport, onReview }: Props) {
  const [selection, setSelection] = useState<string[]>(() => presetCard ? [presetCard] : deck?.cards.slice(0, LIMIT).map(c => c.id) ?? []);
  const [intent, setIntent] = useState<"study" | "explain">(presetCard ? "explain" : "study");
  const [shareCode, setShareCode] = useState("");

  const selected = deck?.cards.filter(item => selection.includes(item.id)) ?? [];
  const task = intent === "study" ? "Frag mich mit diesen Karten einzeln ab. Warte jeweils auf meine Antwort und wiederhole meine Fehler später."
    : "Erkläre mir die ausgewählten Karten in einfachen Worten. Frage danach kurz nach, ob ich sie verstanden habe.";
  const manual = task + "\n\nKarten als Lernstoff:\n" + selected.map(item => JSON.stringify({ frage: item.front, antwort: item.back })).join("\n");
  const shared = "Nutze das Kalo Plugin mit diesem Freigabecode " + shareCode + ". " + task;

  return <>
    {deck && <div className="view-bar"><button className="text-button" aria-label={"Zurück zu " + deck.title} onClick={onBack}><Icon kind="back" /> {deck.title}</button></div>}
    <header className="page-head"><h1>Mit ChatGPT lernen</h1>
      <a className="button primary" href={chatUrl} target="_blank" rel="noreferrer">ChatGPT öffnen <Icon kind="external" /></a></header>
    {deck && <section className="panel flow">
      <h2>{deck.title}</h2><p>Wähle bis zu {LIMIT} Karten für diesen Chat aus. Der Freigabecode gilt eine Stunde.</p>
      <label>Lernauftrag<select value={intent} onChange={event => setIntent(event.target.value as "study" | "explain")}><option value="study">Mich abfragen</option><option value="explain">Karten erklären</option></select></label>
      <div className="selection">{deck.cards.map(item => <label className="check" key={item.id}><input type="checkbox" checked={selection.includes(item.id)} disabled={!!shareCode || (!selection.includes(item.id) && selection.length >= LIMIT)} onChange={event => setSelection(event.target.checked ? [...selection, item.id] : selection.filter(id => id !== item.id))} />{item.front}</label>)}</div>
      <div className="actions"><span>{selection.length} gewählt</span>
        {shareCode ? <button className="button" disabled={busy} onClick={async () => { if (await mutate({ type: "revoke", token: shareCode })) setShareCode(""); }}>Freigabe beenden</button> :
          <button className="button primary" disabled={busy || !selection.length} onClick={async () => {
            const result = await mutate({ type: "share", deckId: deck.id, cardIds: selection });
            if (result?.token) setShareCode(result.token);
          }}>Auswahl für Chat freigeben</button>}
      </div>
      {shareCode && <label>Auftrag für den Chat<textarea readOnly rows={3} value={shared} /></label>}
      {shareCode && <button className="button" onClick={() => copy(shared)}><Icon kind="copy" /> Chat Auftrag kopieren</button>}
      <details><summary>Ohne Plugin kopieren</summary><label>Lernauftrag mit Kartentext<textarea readOnly rows={5} value={manual} /></label><button className="button" disabled={!selected.length} onClick={() => copy(manual)}>Text mit Karten kopieren</button></details>
    </section>}
    <section className="panel flow"><h2>Ein Set aus Unterlagen erstellen</h2><p>Öffne deinen Chat, aktiviere Kalo und füge deinen Lernstoff dort ein.</p><label>Auftrag für ein neues Set<textarea readOnly rows={3} value={draftTask} /></label><div className="actions"><button className="button" onClick={() => copy(draftTask)}><Icon kind="copy" /> Auftrag kopieren</button><button className="button" onClick={onImport}>Antwort als Text importieren</button></div></section>
    <section className="panel flow"><div className="section-head"><h2>Entwürfe</h2><button className="icon-button" aria-label="Entwürfe aktualisieren" title="Aktualisieren" disabled={busy} onClick={onRefresh}><Icon kind="repeat" /></button></div>
      {drafts.length ? drafts.map(draft => <div className="draft" key={draft.id}><div><h3>{draft.title}</h3><p className="muted">{plural(draft.cards.length, "Karte", "Karten")} · {dateFormat.format(draft.created)}</p></div><div className="actions"><button className="button primary" onClick={() => onReview(draft)}>Prüfen</button><button className="icon-button" aria-label={"Entwurf " + draft.title + " löschen"} title="Entwurf löschen" disabled={busy} onClick={async () => {
          if (await confirm({ title: "Entwurf löschen?", message: "«" + draft.title + "» mit " + plural(draft.cards.length, "Karte", "Karten") + " wird entfernt.", confirm: "Löschen", destructive: true })) void mutate({ type: "discard", draftId: draft.id });
        }}><Icon kind="trash" /></button></div></div>) : <EmptyState icon="chat" title="Noch keine Entwürfe" text="Sets, die ChatGPT für dich erstellt, erscheinen hier zum Prüfen." />}
    </section>
  </>;
}
