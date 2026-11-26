"use client";

import { useEffect, useRef, useState } from "react";
import type { View } from "./types";

export type Tab = "home" | "profile";
/** What each browser history entry remembers about the app. */
type Entry = { kaloView: View; deckId: string; tab: Tab; prev: View };
/** Views that need state that only lives in memory; after a reload their history entries fall back. */
export type Restorable = { editor: boolean; cards: boolean; duel: boolean };

/**
 * Views live in the browser history, so the native back gesture (iPhone edge swipe, Android back) works.
 * Every view belongs to a tab, like in a native app: Home or Profil. Opening Home or Profil switches the tab,
 * every other view keeps it. The dock highlights the tab and «Zurück» leads back into it.
 */
export function useNavigation({ deckId, setDeckId, onNavigate }: { deckId: string; setDeckId: (id: string) => void; onNavigate: () => void }) {
  const [view, setView] = useState<View>("home");
  const [tab, setTab] = useState<Tab>("home");
  const restorable = useRef<Restorable>({ editor: false, cards: false, duel: false });

  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const state = event.state as Partial<Entry> | null;
      const ready = restorable.current;
      let next: View = state?.kaloView ?? "home";
      if (next === "editor" && !ready.editor) next = "home";
      if (next === "cards" && !ready.cards) next = state?.deckId ? "deck" : "home";
      if (next === "duel" && !ready.duel) next = "home";
      onNavigate();
      if (state?.deckId !== undefined) setDeckId(state.deckId);
      setTab(state?.tab ?? "home");
      setView(next);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  // The setters are stable; the listener is added once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = history.state as Partial<Entry> | null;
    history.replaceState({ ...current, kaloView: view, deckId, tab } satisfies Partial<Entry>, "");
  }, [view, deckId, tab]);

  function navigate(next: View) {
    if (next === view) {
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    onNavigate();
    const nextTab: Tab = next === "home" || next === "profile" ? next : tab;
    history.pushState({ kaloView: next, deckId, tab: nextTab, prev: view } satisfies Entry, "");
    setTab(nextTab);
    setView(next);
  }

  /** Back to a view: a step back in the history when that is where we came from, so the back gesture does not loop. */
  function goBack(target: View) {
    if ((history.state as Partial<Entry> | null)?.prev === target) history.back();
    else navigate(target);
  }

  return { view, setView, tab, navigate, goBack, restorable };
}
