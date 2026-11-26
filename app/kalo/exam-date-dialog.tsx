"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { Deck } from "../../lib/learning";
import { lockViewport } from "../../lib/viewport-lock";
import { Icon } from "./icons";

type Props = { deck: Deck; busy: boolean; onClose: () => void; onSave: (date: string) => Promise<boolean> };

export default function ExamDateDialog({ deck, busy, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [date, setDate] = useState(deck.examDate ?? "");
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    const unlock = lockViewport();
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    return unlock;
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || saving.current || !date) return;
    saving.current = true; setError("");
    try {
      if (await onSave(date)) return;
      setError("Das Datum konnte nicht gespeichert werden. Prüfe deine Verbindung und versuche es erneut.");
    } catch { setError("Das Datum konnte nicht gespeichert werden. Versuche es erneut."); }
    finally { saving.current = false; }
  }

  return <dialog ref={dialog} className="sheet-dialog exam-date-dialog" aria-labelledby="exam-date-title" aria-describedby="exam-date-description"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <form className="sheet-body" onSubmit={event => void save(event)}>
      <div className="section-head"><h2 id="exam-date-title">Prüfungsdatum eintragen</h2><button type="button" className="icon-button" aria-label="Schliessen" onClick={onClose}><Icon kind="close" /></button></div>
      <p id="exam-date-description">Wann ist die Prüfung für «{deck.title}»?</p>
      <label>Prüfungsdatum<input type="date" required autoFocus disabled={busy} value={date} onChange={event => setDate(event.target.value)} /></label>
      <p>Ab dem Prüfungstag erscheint dieses Thema nicht mehr auf deiner Startseite. Im Profil bleibt es erhalten.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="actions"><button type="submit" className="button primary" disabled={busy || !date}>{busy ? "Wird gespeichert …" : "Prüfungsdatum speichern"}</button><button type="button" className="text-button" onClick={onClose}>Nicht jetzt</button></div>
    </form>
  </dialog>;
}
