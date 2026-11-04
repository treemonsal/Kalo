"use client";

import type { FormEvent } from "react";
import { NavIcon } from "./icons";
import { row, type EditCard, type Editor } from "./types";

type Props = {
  editor: Editor; busy: boolean;
  onChange: (update: (editor: Editor) => Editor) => void;
  onSave: (event: FormEvent) => void; onBack: () => void; onImport: () => void; onDelete: () => void;
};

export default function EditorView({ editor, busy, onChange, onSave, onBack, onImport, onDelete }: Props) {
  const update = (rowId: string, value: Partial<EditCard>) =>
    onChange(current => ({ ...current, cards: current.cards.map(c => c.row === rowId ? { ...c, ...value } : c) }));
  const move = (index: number, offset: number) => onChange(current => {
    const cards = [...current.cards];
    [cards[index], cards[index + offset]] = [cards[index + offset], cards[index]];
    return { ...current, cards };
  });
  const lines = (value: string) => value.split("\n").map(s => s.trim()).filter(Boolean);

  return <form onSubmit={onSave}>
    <button type="button" className="icon action-icon" aria-label="Zurück" title="Zurück" onClick={onBack}><NavIcon kind="back" /></button>
    <div className="page-heading"><div><span className="eyebrow">Karteneditor · wird auf diesem Gerät mitgesichert</span><h1>{editor.draftId ? "Entwurf prüfen" : editor.deckId ? "Set bearbeiten" : "Neues Set"}</h1></div></div>
    <div className="panel editor-title"><label>Setname<input required maxLength={120} placeholder="Zum Beispiel Englisch Wortschatz" value={editor.title} onChange={event => onChange(current => ({ ...current, title: event.target.value }))} /></label></div>
    <div className="edit-list">
      {editor.cards.map((item, idx) => <div className="panel edit-card" key={item.row}>
        <div className="edit-head"><span className="eyebrow">Karte {idx + 1}</span><div>
          <button type="button" className="icon" aria-label="Karte nach oben verschieben" disabled={idx === 0} onClick={() => move(idx, -1)}><NavIcon kind="up" /></button>
          <button type="button" className="icon" aria-label="Karte nach unten verschieben" disabled={idx === editor.cards.length - 1} onClick={() => move(idx, 1)}><NavIcon kind="down" /></button>
          <button type="button" className="icon" aria-label="Karte entfernen" onClick={() => onChange(current => ({ ...current, cards: current.cards.filter(c => c.row !== item.row) }))}><NavIcon kind="close" /></button>
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
      <button className="button primary" disabled={busy}>Set speichern</button>
      <button type="button" className="button" disabled={editor.cards.length >= 400} onClick={() => onChange(current => ({ ...current, cards: [...current.cards, row()] }))}>Karte hinzufügen</button>
      <button type="button" className="button" onClick={onImport}>Text importieren</button>
      {editor.deckId && <button type="button" className="button danger" disabled={busy} onClick={onDelete}>Set entfernen</button>}
    </div>
  </form>;
}
