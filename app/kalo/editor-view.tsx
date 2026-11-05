"use client";

import type { FormEvent } from "react";
import { Icon } from "./icons";
import { row, type EditCard, type Editor } from "./types";

type Props = {
  editor: Editor; busy: boolean;
  onChange: (update: (editor: Editor) => Editor) => void;
  onSave: (event: FormEvent) => void; onBack: () => void; onImport: () => void; onImportNew: () => void; onDelete: () => void;
};

export default function EditorView({ editor, busy, onChange, onSave, onBack, onImport, onImportNew, onDelete }: Props) {
  const fresh = !editor.deckId && !editor.draftId && editor.cards.every(card => !card.front.trim() && !card.back.trim());
  const update = (rowId: string, value: Partial<EditCard>) =>
    onChange(current => ({ ...current, cards: current.cards.map(c => c.row === rowId ? { ...c, ...value } : c) }));
  const move = (index: number, offset: number) => onChange(current => {
    const cards = [...current.cards];
    [cards[index], cards[index + offset]] = [cards[index + offset], cards[index]];
    return { ...current, cards };
  });
  const lines = (value: string) => value.split("\n").map(s => s.trim()).filter(Boolean);

  return <form onSubmit={onSave}>
    <div className="view-bar"><button type="button" className="icon-button" aria-label="Zurück" title="Zurück" onClick={onBack}><Icon kind="back" /></button></div>
    <header className="page-head"><div><h1>{editor.draftId ? "Entwurf prüfen" : editor.deckId ? "Set bearbeiten" : "Neues Set"}</h1>
</div></header>
    {fresh && <button type="button" className="import-card" onClick={onImportNew}>
      <span className="mode-icon"><Icon kind="import" /></span>
      <span className="continue-copy"><strong>Liste importieren</strong><span className="muted">Quizlet, Excel, CSV</span></span>
      <Icon kind="chevronRight" />
    </button>}
    <div className="panel editor-title"><label>Setname<input required maxLength={120} placeholder="Zum Beispiel Englisch Wortschatz" value={editor.title} onChange={event => onChange(current => ({ ...current, title: event.target.value }))} /></label></div>
    <div className="edit-list">
      {editor.cards.map((item, idx) => <div className="panel edit-card" key={item.row}>
        <div className="edit-head"><span className="eyebrow">Karte {idx + 1}</span><div>
          <button type="button" className="icon-button small" aria-label={"Karte " + (idx + 1) + " nach oben"} title="Nach oben" disabled={idx === 0} onClick={() => move(idx, -1)}><Icon kind="up" /></button>
          <button type="button" className="icon-button small" aria-label={"Karte " + (idx + 1) + " nach unten"} title="Nach unten" disabled={idx === editor.cards.length - 1} onClick={() => move(idx, 1)}><Icon kind="down" /></button>
          <button type="button" className="icon-button small" aria-label={"Karte " + (idx + 1) + " entfernen"} title="Karte entfernen" onClick={() => onChange(current => ({ ...current, cards: current.cards.filter(c => c.row !== item.row) }))}><Icon kind="trash" /></button>
        </div></div>
        <div className="two"><label>Vorderseite<textarea rows={2} maxLength={1500} value={item.front} onChange={event => update(item.row, { front: event.target.value })} /></label>
          <label>Rückseite<textarea rows={2} maxLength={1500} value={item.back} onChange={event => update(item.row, { back: event.target.value })} /></label></div>
        <details><summary>Antwortvarianten</summary><div className="two">
          <label>Vorderseite, je eine pro Zeile<textarea rows={2} defaultValue={item.frontAliases?.join("\n")} onChange={event => update(item.row, { frontAliases: lines(event.target.value) })} /></label>
          <label>Rückseite, je eine pro Zeile<textarea rows={2} defaultValue={item.backAliases?.join("\n")} onChange={event => update(item.row, { backAliases: lines(event.target.value) })} /></label>
        </div></details>
      </div>)}
    </div>
    <div className="actions editor-actions">
      <button className="button primary" disabled={busy}><Icon kind="check" /> Speichern</button>
      <button type="button" className="button" disabled={editor.cards.length >= 400} onClick={() => onChange(current => ({ ...current, cards: [...current.cards, row()] }))}><Icon kind="plus" /> Karte</button>
      <button type="button" className="button" aria-label="Text importieren" title="Text importieren" onClick={onImport}><Icon kind="import" /><span className="wide-only">Importieren</span></button>
      {editor.deckId && <button type="button" className="icon-button danger" aria-label="Set löschen" title="Set löschen" disabled={busy} onClick={onDelete}><Icon kind="trash" /></button>}
    </div>
  </form>;
}
