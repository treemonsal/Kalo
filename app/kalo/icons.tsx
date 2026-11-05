/**
 * One icon set: 24px grid, 1.75 stroke, round caps. Each shape has one meaning.
 * back = navigate back, undo = take back an action, repeat = practise again or try again.
 */
const paths = {
  back: "M19 12H5m6-6-6 6 6 6",
  forward: "M5 12h14m-6-6 6 6-6 6",
  chevronLeft: "m14.5 6-6 6 6 6",
  chevronRight: "m9.5 6 6 6-6 6",
  undo: "M9 15 4 10l5-5M4 10h10.5a5.5 5.5 0 0 1 0 11H12",
  repeat: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15",
  check: "m5 12.5 4.5 4.5L19 7.5",
  close: "M6.5 6.5l11 11m0-11-11 11",
  plus: "M12 5v14M5 12h14",
  shuffle: "M4 7h2.5c4.5 0 6.5 10 11 10H20m-2.5-2.5L20 17l-2.5 2.5M4 17h2.5c1.4 0 2.6-1 3.6-2.4m3.8-5.2C15 8 16.1 7 17.5 7H20m-2.5-2.5L20 7l-2.5 2.5",
  expand: "M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5",
  shrink: "M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5",
  import: "M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 15.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5",
  edit: "M4.5 19.5 5.5 15 15.8 4.7a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L9 18.5l-4.5 1ZM14 6.5l3.5 3.5",
  star: "m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z",
  trash: "M4.5 7h15M10 11v6m4-6v6M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2",
  up: "M12 19V5m-6 6 6-6 6 6",
  down: "M12 5v14m-6-6 6 6 6-6",
  external: "M14 5h5v5m0-5-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4",
  copy: "M9 9h9.5a.5.5 0 0 1 .5.5V19a1 1 0 0 1-1 1H9.5a.5.5 0 0 1-.5-.5V9Zm-4 6V5a1 1 0 0 1 1-1h9",
  alert: "M12 8.5v4.5m0 3v.01M10.3 4.2 3 17a2 2 0 0 0 1.7 3h14.6A2 2 0 0 0 21 17L13.7 4.2a2 2 0 0 0-3.4 0Z",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  cards: "M8 7V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H17M5.5 7h9A1.5 1.5 0 0 1 16 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4",
  chat: "M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3.3A7.5 7.5 0 1 1 20 11.5ZM9 11.5h7",
  library: "M5.5 4h3A1.5 1.5 0 0 1 10 5.5v13A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Zm7.2 1.3 2.9-.8a1.5 1.5 0 0 1 1.8 1l3.4 12.6a1.5 1.5 0 0 1-1 1.8l-2.9.8a1.5 1.5 0 0 1-1.8-1L11.7 7.1a1.5 1.5 0 0 1 1-1.8Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.6.1-1.4-.1-1.4 2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.4-1.4L14.2 2.7h-4.4l-.4 2.5A7 7 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.4 1.4l.4 2.5h4.4l.4-2.5a7 7 0 0 0 2.4-1.4l2.4 1 2-3.4-2-1.6Z",
  cloudOff: "M3 3l18 18M8.5 8.5A4.5 4.5 0 0 0 6.5 18H17m3.4-1.6A3.5 3.5 0 0 0 17.5 11h-.6A6 6 0 0 0 10.4 6.1",
} as const;

export type IconKind = keyof typeof paths;

export function Icon({ kind, filled, size }: { kind: IconKind; filled?: boolean; size?: "s" | "l" }) {
  return <svg className={"icon-svg" + (size ? " icon-" + size : "")} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={paths[kind]} />
  </svg>;
}

/** Keyboard hint, hidden on touch screens where it means nothing. */
export function Key({ children }: { children: string }) {
  return <kbd className="key" aria-hidden="true">{children}</kbd>;
}
