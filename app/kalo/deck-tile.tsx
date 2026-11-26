"use client";

import type { Deck, Workspace } from "../../lib/learning";
import { examIn, sitting } from "../../lib/progress";
import { Icon } from "./icons";
import { MasteryRing } from "./progress-ui";
import { plural } from "./types";

/** One set in a grid: how much sits, how many cards, what is due, the exam and the subject. Used on Home and in the profile. */
export function DeckTile({ workspace, deck, now, due, onOpen }: { workspace: Workspace; deck: Deck; now: number; due: number; onOpen: (deck: Deck) => void }) {
  const done = sitting(workspace, deck);
  const exam = examIn(deck, now);
  const share = done / Math.max(1, deck.cards.length);
  return <button className="deck-tile" onClick={() => onOpen(deck)}
    aria-label={deck.title + ", " + plural(deck.cards.length, "Karte", "Karten") + ", " + Math.round(share * 100) + " Prozent sitzen" + (due ? ", " + due + " fällig" : "") + (exam !== null ? ", Prüfung in " + exam + " Tagen" : "")}>
    <MasteryRing share={share} />
    <span className="tile-title">{deck.title}</span>
    <span className="tile-meta" aria-hidden="true">
      <span><Icon kind="cards" size="s" /> {deck.cards.length}</span>
      {due > 0 && <span className="due-badge"><Icon kind="repeat" size="s" /> {due}</span>}
      {exam !== null && <span className="exam-badge"><Icon kind="calendar" size="s" /> {exam === 0 ? "heute" : exam + " T."}</span>}
      {deck.subject && <span className="subject-badge">{deck.subject}</span>}
    </span>
  </button>;
}
