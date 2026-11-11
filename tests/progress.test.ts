import assert from "node:assert/strict";
import test from "node:test";
import { apply as applyShuffled, dayOf, empty, question, type Action, type Workspace } from "../lib/learning.ts";
import { examIn, levels, nextStep, streak, streakOf, week } from "../lib/progress.ts";

const keep = <T,>(items: T[]) => items;
const apply = (state: Workspace, action: Action, time: number) => applyShuffled(state, action, time, keep);
const now = Date.parse("2026-11-04T10:00:00+01:00"); // a Wednesday
const DAY = 86_400_000;
const day = (offset: number) => dayOf(now + offset * DAY);

function deck(state: Workspace, title: string, count = 10) {
  return apply(state, { type: "save", title, cards: Array.from({ length: count }, (_, i) => ({ front: title + " " + i, back: "Antwort " + i })) }, now);
}

test("Jede bearbeitete Karte zählt fürs Tagesziel, Wischen ohne Unterschied", () => {
  let s = deck(empty(), "A");
  const d = s.decks[0];
  s = apply(s, { type: "sortCard", deckId: d.id, cardId: d.cards[0].id, direction: "front", known: true }, now);
  s = apply(s, { type: "sortCard", deckId: d.id, cardId: d.cards[1].id, direction: "front", known: false }, now + 30_000);
  const today = s.stats!.days[dayOf(now)];
  assert.equal(today.cards, 2);
  assert.equal(today.points, 2);
  assert.equal(today.ms, 30_000, "kurze Pausen zählen als Lernzeit");
  s = apply(s, { type: "sortCard", deckId: d.id, cardId: d.cards[2].id, direction: "front", known: true }, now + 40 * 60_000);
  assert.equal(s.stats!.days[dayOf(now)].ms, 30_000, "lange Pausen zählen nicht");
});

test("Combo und Goldkarten gibt es nur für richtige Antworten", () => {
  let s = deck(empty(), "A", 40);
  s = apply(s, { type: "start", deckId: s.decks[0].id, mode: "cram", direction: "front", filter: "all" }, now);
  let goldCorrect = 0;
  let goldSeen = 0;
  for (let i = 0; i < 40; i += 1) {
    const q = question(s)!;
    const wrong = i === 5;
    if (q.gold) goldSeen += 1;
    if (q.gold && !wrong) goldCorrect += 1;
    s = apply(s, { type: "answer", sessionId: s.session!.id, cursor: s.session!.cursor, round: s.session!.round, answer: wrong ? "falsch" : q.answer }, now);
    if (i === 4) assert.equal(s.session!.combo, 5);
    if (i === 5) assert.equal(s.session!.combo, 0);
  }
  assert.equal(s.session!.best, 34);
  assert.ok(goldSeen >= 1 && goldSeen <= 10, "etwa jede zehnte Frage ist golden: " + goldSeen);
  assert.equal(s.stats!.days[dayOf(now)].points, 40 + goldCorrect);
  assert.equal(s.stats!.days[dayOf(now)].correct, 39);
});

test("Serie zählt Tage mit erreichtem Ziel und überbrückt einen Ruhetag pro Woche", () => {
  const reached = (keys: string[]) => (key: string) => keys.includes(key);
  assert.deepEqual(streakOf(reached([day(0), day(-1), day(-2)]), now).days, 3);
  const pending = streakOf(reached([day(-1), day(-2)]), now);
  assert.equal(pending.days, 2);
  assert.equal(pending.atRisk, true, "heute fehlt noch");
  const rest = streakOf(reached([day(0), day(-2), day(-3)]), now);
  assert.equal(rest.days, 3);
  assert.deepEqual(rest.restDays, [day(-1)]);
  // Gaps on Tuesday (this week), Sunday and Friday (both last week): the second gap last week ends it.
  assert.equal(streakOf(reached([day(0), day(-2), day(-4), day(-6)]), now).days, 3, "zwei Lücken in derselben Woche beenden die Serie");
  assert.equal(streakOf(reached([day(0), day(-3)]), now).days, 1, "zwei Tage hintereinander verpasst");
  assert.equal(streakOf(reached([]), now).days, 0);
});

test("Tagesziel, Woche und Serie aus echten Aktionen", () => {
  let s = apply(deck(empty(), "A", 30), { type: "setGoal", goal: 5 }, now);
  const d = s.decks[0];
  for (const [offset, count] of [[-1, 6], [0, 5]] as const) {
    for (let i = 0; i < count; i += 1) {
      s = apply(s, { type: "sortCard", deckId: d.id, cardId: d.cards[i + (offset + 1) * 10].id, direction: "front", known: true }, now + offset * DAY + i * 1000);
    }
  }
  assert.equal(streak(s, now).days, 2);
  const summary = week(s, now);
  assert.equal(summary.cards, 11);
  assert.deepEqual(summary.days.slice(-2).map(item => item.reached), [true, true]);
});

test("Stufen pro Fach und Prüfungs-Countdown", () => {
  let s = deck(deck(empty(), "Konten", 12), "Bilanz", 4);
  const [bilanz, konten] = s.decks;
  s = apply(s, { type: "setDeckMeta", deckId: bilanz.id, subject: "Rechnungswesen", examDate: day(6) }, now);
  s = apply(s, { type: "setDeckMeta", deckId: konten.id, subject: "Rechnungswesen" }, now);
  for (const card of [...bilanz.cards, ...konten.cards]) s.progress[card.id + ":front"] = { seen: true, streak: 2, missed: false };
  const [level] = levels(s);
  assert.equal(level.subject, "Rechnungswesen");
  assert.equal(level.secure, 16);
  assert.equal(level.level, 2);
  assert.equal(level.toNext, 9);
  assert.equal(examIn(s.decks[0], now), 6);
  assert.equal(examIn({ ...s.decks[0], examDate: day(-1) }, now), null);
});

test("Der nächste Schritt führt nie in eine Sackgasse", () => {
  let s = deck(deck(empty(), "Englisch", 10), "Recht", 10);
  const [recht, englisch] = s.decks;
  assert.equal(nextStep(s, now, englisch.id).kind, "learn");
  assert.equal((nextStep(s, now, englisch.id) as { deckId: string }).deckId, englisch.id, "das Set im Fokus zuerst");
  s = apply(s, { type: "setDeckMeta", deckId: recht.id, examDate: day(3) }, now);
  assert.equal((nextStep(s, now, englisch.id) as { deckId: string }).deckId, recht.id, "eine nahe Prüfung geht vor");
  s = apply(s, { type: "sortCard", deckId: englisch.id, cardId: englisch.cards[0].id, direction: "front", known: false }, now);
  const later = Date.parse(s.reviews[englisch.cards[0].id + ":front"].due);
  assert.equal(nextStep(s, later, englisch.id).kind, "review", "fällige Karten zuerst");
  s = apply(s, { type: "start", deckId: englisch.id, mode: "cram", direction: "front", filter: "all" }, later);
  assert.equal(nextStep(s, later).kind, "resume");
});
