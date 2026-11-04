const actionPaths = {
  back: "M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10",
  next: "M4 12h15m-6-6 6 6-6 6",
  check: "m5 12 5 5L20 7",
  repeat: "M20 10a8 8 0 1 0-1 7M20 5v5h-5",
  plus: "M12 5v14M5 12h14",
  expand: "M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5",
  shrink: "M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5",
  shuffle: "M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c1 0 2-.5 3-2m5-8c1-1 2-2 4-2h3m-4-4 4 4-4 4",
  import: "M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5",
  edit: "m5 15-1 5 5-1L20 8l-4-4L5 15Zm9-9 4 4",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  close: "M6 6l12 12M18 6 6 18",
  up: "M12 19V5m-6 6 6-6 6 6",
  down: "M12 5v14m-6-6 6 6 6-6",
};

export type IconKind = "library" | "chat" | "settings" | keyof typeof actionPaths;

export function NavIcon({ kind, filled }: { kind: IconKind; filled?: boolean }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind in actionPaths && <path d={actionPaths[kind as keyof typeof actionPaths]} />}
    {kind === "library" && <><rect x="6" y="6" width="14" height="14" rx="3" /><path d="M4 16H3V6a3 3 0 0 1 3-3h10v1m-6 7h6m-6 4h4" /></>}
    {kind === "chat" && <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3.3A7.5 7.5 0 1 1 20 11.5ZM9 11.5h7" />}
    {kind === "settings" && <><path d="m10 3-.6 2.1-1.7 1-2.2-.5-1.8 3.1 1.6 1.6v2l-1.6 1.6 1.8 3.1 2.2-.5 1.7 1 .6 2.1h4l.6-2.1 1.7-1 2.2.5 1.8-3.1-1.6-1.6v-2l1.6-1.6-1.8-3.1-2.2.5-1.7-1L14 3z" /><circle cx="12" cy="11.3" r="2.7" /></>}
  </svg>;
}

/** Keyboard hint, hidden on touch screens where it means nothing. */
export function Key({ children }: { children: string }) {
  return <kbd className="key" aria-hidden="true">{children}</kbd>;
}
