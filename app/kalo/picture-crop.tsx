"use client";

import { useEffect, useRef, useState } from "react";
import { openDialog } from "./motion";
import { Icon } from "./icons";
import { cropOf, renderPicture } from "./picture";

const FRAME = 240;

/** Move and zoom the photo inside the round frame, like choosing a profile picture on the phone. */
export function PictureCrop({ image, onCancel, onDone }: { image: HTMLImageElement; onCancel: () => void; onDone: (picture: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: { x: number; y: number } } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const view = cropOf(width, height, FRAME, zoom, offset);

  useEffect(() => openDialog(dialog.current), []);

  function move(x: number, y: number) {
    setOffset(cropOf(width, height, FRAME, zoom, { x, y }).offset);
  }

  async function done() {
    setSaving(true);
    setError("");
    try { await onDone(renderPicture(image, view.crop)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Dieses Bild geht nicht."); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} className="sheet-dialog crop-dialog" aria-labelledby="crop-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}>
    <div className="sheet-body">
      <h2 id="crop-title">Ausschnitt wählen</h2>
      <p className="muted">Ziehen zum Verschieben.</p>
      <div className="crop-frame" style={{ width: FRAME, height: FRAME }} tabIndex={0} role="application"
        aria-label="Bildausschnitt. Mit den Pfeiltasten verschieben."
        onKeyDown={event => {
          if (saving) return;
          const step = event.shiftKey ? 30 : 10;
          const keys: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
          const delta = keys[event.key];
          if (!delta) return;
          event.preventDefault();
          move(view.offset.x + delta[0], view.offset.y + delta[1]);
        }}
        onPointerDown={event => { if (!saving) { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: view.offset }; } }}
        onPointerMove={event => {
          const current = drag.current;
          if (current?.id === event.pointerId) move(current.start.x + event.clientX - current.x, current.start.y + event.clientY - current.y);
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {/* A local photo just chosen, image optimisation would add nothing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt="Profilbild Vorschau" width={width} height={height} draggable={false} style={{ width: width * view.scale, height: height * view.scale,
          transform: "translate(-50%, -50%) translate(" + view.offset.x + "px, " + view.offset.y + "px)" }} />
      </div>
      <label className="crop-zoom"><Icon kind="search" size="s" /><span className="sr-only">Zoom</span>
        <input type="range" min={1} max={3} step={0.01} value={zoom} disabled={saving} onChange={event => {
          const next = Number(event.target.value);
          setZoom(next);
          setOffset(cropOf(width, height, FRAME, next, offset).offset);
        }} /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="sheet-actions">
        <button className="button" disabled={saving} onClick={onCancel}>Abbrechen</button>
        <button className="button primary" disabled={saving} autoFocus onClick={() => void done()}>{saving ? "Wird gespeichert…" : "Übernehmen"}</button>
      </div>
    </div>
  </dialog>;
}
