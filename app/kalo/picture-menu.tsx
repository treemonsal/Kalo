"use client";

import { useEffect, useRef } from "react";
import { openDialog } from "./motion";
import { Icon } from "./icons";

export function PictureMenu({ hasPicture, busy, onChoose, onCrop, onRemove, onClose }: {
  hasPicture: boolean; busy: boolean; onChoose: () => void; onCrop: () => void; onRemove: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => openDialog(dialog.current), []);
  return <dialog ref={dialog} className="sheet-dialog" aria-labelledby="picture-menu-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sheet-body picture-menu"><div className="section-head"><h2 id="picture-menu-title">Profilbild</h2><button className="icon-button" onClick={onClose} aria-label="Schliessen"><Icon kind="close" /></button></div>
      <button className="button" disabled={busy} onClick={onChoose}><Icon kind="camera" /> {hasPicture ? "Bild ändern" : "Bild auswählen"}</button>
      {hasPicture && <><button className="button" disabled={busy} onClick={onCrop}><Icon kind="expand" /> Ausschnitt ändern</button>
        <button className="text-button danger" disabled={busy} onClick={onRemove}><Icon kind="trash" /> Bild entfernen</button></>}
    </div>
  </dialog>;
}
