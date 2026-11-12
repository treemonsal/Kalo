"use client";

import { useEffect, useRef, useState } from "react";
import type { Card, Direction } from "../../lib/learning";
import { Icon } from "./icons";

export default function CardExplainSheet({ card, direction, chatUrl, onClose }: { card: Card; direction: Direction; chatUrl: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; at: number } | null>(null);
  const closing = useRef(false);
  const suppressClick = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const question = card[direction];
  const answer = card[direction === "front" ? "back" : "front"];
  const task = "Erkläre mir genau diese eine Kalo Karte auf Deutsch. Erkläre den Zusammenhang verständlich, gib ein kurzes Beispiel und stelle mir danach eine Verständnisfrage.\n\nFrage: " + question + "\nAntwort: " + answer;
  useEffect(() => {
    dialog.current?.showModal();
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);
  function close() {
    if (closing.current) return;
    closing.current = true;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (dialog.current) dialog.current.dataset.closing = "true";
    closeTimer.current = setTimeout(onClose, reduced ? 0 : 220);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(task); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }
  return <dialog ref={dialog} className="card-explain-sheet" data-dragging={dragging || undefined} style={{ transform: "translateY(" + offset + "px)" }} aria-labelledby="explain-title"
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <button type="button" className="sheet-grabber" aria-label="Erklärung schliessen" onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } close(); }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); suppressClick.current = false; setDragging(true); drag.current = { y: event.clientY, at: event.timeStamp }; }}
      onPointerMove={event => { if (drag.current) setOffset(Math.max(0, event.clientY - drag.current.y)); }}
      onPointerUp={event => {
        const start = drag.current; if (!start) return;
        const distance = Math.max(0, event.clientY - start.y);
        drag.current = null;
        setDragging(false);
        suppressClick.current = distance > 6;
        if (distance > 72 || distance > 24 && distance / Math.max(1, event.timeStamp - start.at) > 0.6) close();
        else setOffset(0);
        // Pointer capture already handles the gesture; a drag must not turn into a click.
        if (distance > 6) event.preventDefault();
      }} onPointerCancel={() => { drag.current = null; suppressClick.current = true; setDragging(false); setOffset(0); }}><span /></button>
    <div className="explain-body"><div className="section-head"><h2 id="explain-title">Erklären</h2><button className="icon-button" onClick={close} aria-label="Schliessen"><Icon kind="close" /></button></div>
      <div className="explain-card"><strong>{question}</strong><p>{answer}</p></div>
      <a className="button primary" href={chatUrl} target="_blank" rel="noreferrer" onClick={() => void copy()}><Icon kind="chat" /> Mit ChatGPT erklären <Icon kind="external" size="s" /></a>
      <p className="explain-hint" role="status">{copied ? "Kopiert. In ChatGPT einfügen." : "Der Auftrag für diese Karte wird kopiert."}</p>
      {copyFailed && <label>Auftrag zum Kopieren<textarea readOnly rows={4} value={task} onFocus={event => event.currentTarget.select()} /></label>}
    </div>
  </dialog>;
}
