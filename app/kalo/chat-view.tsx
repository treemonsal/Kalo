"use client";

import { useState } from "react";
import type { Deck } from "../../lib/learning";
import { Icon } from "./icons";
import type { Mutate } from "./types";

type Props = {
  deck?: Deck; presetCard?: string; busy: boolean; chatUrl: string; mutate: Mutate;
  copy: (text: string) => void; onBack: () => void; onImport: () => void;
};

const draftTask = "Erstelle aus meinen folgenden Unterlagen ein Kalo Set. Pro Karte eine klare Frage und eine kurze Antwort. Speichere vorhandene Beispiele im separaten Feld examples; Beispiele ersetzen keine Frage oder Antwort. Verwende nur den Lernstoff. Speichere das Set mit Kalo als Entwurf. Falls das Plugin fehlt, gib je eine Karte pro Zeile als Frage, Tabulator, Antwort aus.";
const LIMIT = 80;

export default function ChatView({ deck, presetCard, busy, chatUrl, mutate, copy, onBack, onImport }: Props) {
  const [selection, setSelection] = useState<string[]>(() => presetCard ? [presetCard] : deck?.cards.slice(0, LIMIT).map(c => c.id) ?? []);
  const [intent, setIntent] = useState<"study" | "explain">(presetCard ? "explain" : "study");
  const [shareCode, setShareCode] = useState("");

  const selected = deck?.cards.filter(item => selection.includes(item.id)) ?? [];
  const task = intent === "study" ? "Frag mich mit diesen Karten einzeln ab. Warte jeweils auf meine Antwort und wiederhole meine Fehler später."
    : "Erkläre mir die ausgewählten Karten in einfachen Worten. Frage danach kurz nach, ob ich sie verstanden habe.";
  const manual = task + "\n\nKarten als Lernstoff:\n" + selected.map(item => JSON.stringify({ frage: item.front, antwort: item.back, ...(item.examples ? { beispiele: item.examples } : {}) })).join("\n");
  const shared = "Nutze das Kalo Plugin mit diesem Freigabecode " + shareCode + ". " + task;

  return <>
    <div className="view-bar"><button className="text-button" aria-label={deck ? "Zurück zu " + deck.title : "Zurück"} onClick={onBack}><Icon kind="back" /></button></div>
    <header className="page-head"><h1>{deck ? "Mit ChatGPT lernen" : "Mit ChatGPT erstellen"}</h1>
      {deck && <a className="text-button" href={chatUrl} target="_blank" rel="noreferrer">ChatGPT öffnen <Icon kind="external" /></a>}</header>
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
    {!deck && <section className="panel chat-main"><h2>Set aus Unterlagen erstellen</h2>
      <ol className="steps"><li>Auftrag kopieren und ChatGPT öffnen</li><li>Dort einfügen und deine Unterlagen anhängen</li><li>Der Entwurf erscheint auf Home, du prüfst und speicherst</li></ol>
      <a className="button primary" href={chatUrl} target="_blank" rel="noreferrer" onClick={() => copy(draftTask)}><Icon kind="copy" /> Kopieren und ChatGPT öffnen</a>
      <button className="text-button" onClick={onImport}><Icon kind="import" /> Antwort ohne Plugin einfügen</button>
    </section>}
  </>;
}
