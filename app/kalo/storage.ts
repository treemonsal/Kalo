"use client";

import { useSyncExternalStore } from "react";

// localStorage can be missing (private mode, blocked storage). The memory copy keeps the visit working.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readStored(key: string): string | null {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; }
  catch { return memory.get(key) ?? null; }
}

export function writeStored(key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* The memory copy is enough for this visit. */ }
  listeners.forEach(listener => listener());
}

/** Reads a stored string and re-renders when it changes. The server render always sees null. */
export function useStored(key: string) {
  return useSyncExternalStore(subscribe, () => readStored(key), () => null);
}

export function parseStored<T>(value: string | null, valid: (input: unknown) => input is T): T | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return valid(parsed) ? parsed : null;
  } catch { return null; }
}
