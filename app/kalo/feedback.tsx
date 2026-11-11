"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { prefersReducedMotion } from "./motion";

/** An error always comes with something the person can do next. */
export type Problem = { message: string; action?: { label: string; run: () => void }; link?: { label: string; href: string } };

export function ErrorBanner({ problem, onDismiss }: { problem: Problem; onDismiss: () => void }) {
  return <div className="banner error" role="alert">
    <span className="banner-icon"><Icon kind="alert" /></span>
    <p>{problem.message}</p>
    <div className="banner-actions">
      {problem.action && <button className="button small" onClick={() => { onDismiss(); problem.action!.run(); }}>{problem.action.label}</button>}
      {problem.link && <a className="button small" href={problem.link.href} target="_top">{problem.link.label}</a>}
      <button className="icon-button small" aria-label="Meldung schliessen" title="Schliessen" onClick={onDismiss}><Icon kind="close" /></button>
    </div>
  </div>;
}

export function Toast({ message }: { message: string }) {
  return <div className="toast-slot" role="status" aria-live="polite">
    {message && <div className="toast" key={message}><Icon kind="check" /> {message}</div>}
  </div>;
}

type Ask = { title: string; message?: string; confirm: string; destructive?: boolean; resolve: (value: boolean) => void };
export type Confirm = (options: Omit<Ask, "resolve">) => Promise<boolean>;

/** In-app confirmation, used only for actions that discard work. */
export function useConfirm(): [Confirm, React.ReactNode] {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirm = useCallback<Confirm>(options => new Promise(resolve => setAsk({ ...options, resolve })), []);
  const node = ask ? <ConfirmDialog key={ask.title + ask.confirm} ask={ask} onDone={value => { ask.resolve(value); setAsk(null); }} /> : null;
  return [confirm, node];
}

function ConfirmDialog({ ask, onDone }: { ask: Ask; onDone: (value: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  // The dialog leaves the way it came in before it closes.
  function finish(value: boolean) {
    if (finished.current) return;
    finished.current = true;
    const element = dialog.current;
    if (!element || prefersReducedMotion()) { element?.close(); onDone(value); return; }
    element.dataset.closing = "true";
    window.setTimeout(() => { element.close(); onDone(value); }, 160);
  }

  return <dialog ref={dialog} className="sheet-dialog" aria-labelledby="confirm-title" aria-describedby={ask.message ? "confirm-message" : undefined}
    onCancel={event => { event.preventDefault(); finish(false); }}
    onClick={event => { if (event.target === event.currentTarget) finish(false); }}>
    <div className="sheet-body">
      <h2 id="confirm-title">{ask.title}</h2>
      {ask.message && <p id="confirm-message">{ask.message}</p>}
      <div className="sheet-actions">
        <button className="button" autoFocus onClick={() => finish(false)}>Abbrechen</button>
        <button className={"button " + (ask.destructive ? "destructive" : "primary")} onClick={() => finish(true)}>{ask.confirm}</button>
      </div>
    </div>
  </dialog>;
}

export function LibrarySkeleton() {
  return <div className="skeleton-page" aria-busy="true" aria-label="Lernstand wird geladen">
    <div className="skeleton line short" />
    <div className="skeleton line title" />
    <div className="skeleton block" />
    <div className="skeleton-grid"><div className="skeleton tile" /><div className="skeleton tile" /><div className="skeleton tile" /></div>
  </div>;
}

export function EmptyState({ icon, title, text, children }: { icon: Parameters<typeof Icon>[0]["kind"]; title: string; text?: string; children?: React.ReactNode }) {
  return <div className="empty-state">
    <span className="empty-mark"><Icon kind={icon} size="l" /></span>
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    {children && <div className="actions center">{children}</div>}
  </div>;
}
