"use client";

import { useState } from "react";
import { parseImport, type CardInput, type ImportSeparator } from "../../lib/learning";
import { NavIcon } from "./icons";

type Props = { room: number; onBack: () => void; onAccept: (cards: CardInput[]) => void; onError: (message: string) => void };

export default function ImportView({ room, onBack, onAccept, onError }: Props) {
  const [separator, setSeparator] = useState<ImportSeparator>("\t");
  const [paste, setPaste] = useState("");
  const [imported, setImported] = useState<ReturnType<typeof parseImport> | null>(null);

  return <>
    <button className="icon action-icon" aria-label="Zurück" title="Zurück" onClick={onBack}><NavIcon kind="back" /></button>
    <div className="page-heading"><div><span className="eyebrow">Kartensets</span><h1>Text importieren</h1></div></div>
    <section className="panel flow">
      <label>Karten als Text<textarea rows={7} placeholder={"Frage\tAntwort"} value={paste} onChange={event => { setPaste(event.target.value); setImported(null); }} /></label>
      <label>Trennzeichen<select value={separator} onChange={event => { setSeparator(event.target.value as ImportSeparator); setImported(null); }}>
        <option value={"\t"}>Tabulator (Quizlet und TSV)</option><option value=";">Semikolon (CSV)</option><option value=",">Komma (CSV)</option>
      </select></label>
      <p className="muted">Je eine Karte pro Zeile. Die erste Spalte ist die Vorderseite, die zweite die Rückseite.</p>
      <div className="actions"><label className="button file-button">Textdatei öffnen<input type="file" accept=".txt,.tsv,.csv,text/plain,text/tab-separated-values,text/csv" onChange={async event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        if (file.size > 1_450_000) { onError("Diese Datei ist zu gross."); return; }
        try {
          const content = await file.text();
          setPaste(content);
          if (/\.csv$/i.test(file.name)) setSeparator(content.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",");
          setImported(null);
          onError("");
        } catch { onError("Diese Datei konnte nicht gelesen werden."); }
      }} /></label><button className="button primary" disabled={!paste.trim()} onClick={() => setImported(parseImport(paste, separator))}>Vorschau</button></div>
    </section>
    {imported && <section className="panel flow"><h2>{imported.cards.length} Karten gefunden</h2>
      {imported.errors.length > 0 && <p role="alert" className="muted">Prüfe Zeilen {imported.errors.slice(0, 20).join(", ")}{imported.errors.length > 20 ? " und weitere" : ""}. Prüfe das Trennzeichen und ob beide Spalten gefüllt sind. Diese Zeilen werden übersprungen.</p>}
      {imported.cards.length > room && <p role="alert" className="muted">Ein Set fasst höchstens 400 Karten. Hier ist noch Platz für {room}.</p>}
      <div className="preview-list">{imported.cards.slice(0, 12).map((item, idx) => <div key={idx}><span>{item.front}</span><span>{item.back}</span></div>)}</div>
      <button className="button primary" disabled={!imported.cards.length || imported.cards.length > room} onClick={() => onAccept(imported.cards)}>Karten in den Editor übernehmen</button>
    </section>}
  </>;
}
