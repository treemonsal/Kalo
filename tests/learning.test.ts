import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apply as applyShuffled, choices, deckDigest, empty, parseImport, question, reviewQueue, type Action, type Workspace } from "../lib/learning.ts";

// Keeps the deck order so the scenarios below stay readable. Shuffling has its own test.
const keep = <T,>(items: T[]) => items;
const apply = (state: Workspace, action: Action, time: number) => applyShuffled(state, action, time, keep);

const now = Date.parse("2026-11-03T14:00:00+01:00");
function setup(count = 4) {
  const cards = Array.from({ length: count }, (_, i) => ({
    front: "Frage " + i,
    back: "Antwort " + i,
    backAliases: i ? [] : ["Richtig"],
  }));
  const state = apply(empty(), { type: "save", title: "Test", cards }, now);
  return { state, deck: state.decks[0] };
}
function submit(state: Workspace, answer: string, self?: boolean) {
  const current = state.session!;
  return apply(state, { type: "answer", sessionId: current.id, cursor: current.cursor, round: current.round, answer, self }, now);
}

test("importiert eine vorhandene Quizlet Datei und meldet kaputte Zeilen", () => {
  const text = process.env.KALO_QUIZLET_FIXTURE
    ? readFileSync(process.env.KALO_QUIZLET_FIXTURE, "utf8")
    : Array.from({ length: 12 }, (_, i) => "Frage " + i + "\tAntwort " + i).join("\n");
  const parsed = parseImport(text);
  assert.ok(parsed.cards.length > 10);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parseImport("Frage\tAntwort\r\nFehler").errors[0], 2);
});

test("Auswahl allein zählt nicht als freier Abruf, Fehler erscheinen erneut", () => {
  const { state, deck } = setup();
  let s = apply(state, { type: "start", deckId: deck.id, mode: "learn", direction: "front", filter: "all" }, now);
  assert.equal(question(s)?.kind, "choice");
  assert.equal(choices(deck, deck.cards[0], "front").length, 4);
  for (const card of deck.cards) s = submit(s, card.back);
  assert.equal(s.session?.round, 2);
  assert.equal(question(s)?.kind, "write");
  s = submit(s, "Falsch");
  for (const card of deck.cards.slice(1)) s = submit(s, card.back);
  s = submit(s, " richtig ");
  for (const card of deck.cards.slice(1)) s = submit(s, card.back);
  assert.equal(question(s)?.card.id, deck.cards[0].id);
  s = submit(s, "Richtig");
  assert.equal(s.session?.done, true);
});

test("Lernen endet nach vier Runden und offene Karten können weitergeübt werden", () => {
  const { state, deck } = setup(2);
  const start = { type: "start", deckId: deck.id, mode: "learn", direction: "front", filter: "mistakes" } as const;
  let s = apply(state, { ...start, mode: "cram", filter: "all" }, now);
  s = submit(submit(s, "Falsch"), "Falsch");
  s = apply(s, start, now);
  s = submit(s, deck.cards[0].back);
  s = submit(s, "Falsch");
  s = submit(s, deck.cards[0].back);
  s = submit(s, "Falsch");
  s = submit(s, "Falsch");
  assert.equal(s.session?.round, 4);
  s = submit(s, deck.cards[1].back);
  assert.equal(s.session?.done, true);
  assert.equal(question(s), null);

  assert.equal(s.mistakes[deck.id + ":front"].length, 0);
  const continuation = { type: "continueLearn", sessionId: s.session!.id } as const;
  s = apply(s, continuation, now);
  assert.throws(() => apply(s, continuation, now));
  assert.deepEqual(s.session?.queue, [deck.cards[1].id]);
  s = submit(s, deck.cards[1].back);
  assert.equal(s.session?.done, true);
});

test("kleine Sets und umgekehrte Richtung funktionieren", () => {
  const { state, deck } = setup(1);
  const s = apply(state, { type: "start", deckId: deck.id, mode: "learn", direction: "back", filter: "all" }, now);
  assert.equal(question(s)?.kind, "write");
  assert.equal(question(s)?.prompt, "Antwort 0");
  assert.equal(submit(s, "Frage 0").session?.round, 2);
});

test("Pauken ändert keine Fälligkeit, Bewertungen gelten einmal und neue Karten sind begrenzt", () => {
  const { state, deck } = setup(12);
  let s = apply(state, { type: "start", deckId: deck.id, mode: "review", direction: "front", filter: "all" }, now);
  assert.equal(s.session?.queue.length, 10);
  const action = { type: "rate", sessionId: s.session!.id, cursor: 0, grade: 3 } as const;
  s = apply(s, action, now);
  assert.throws(() => apply(s, action, now));
  const due = Object.values(s.reviews)[0].due;
  assert.ok(Date.parse(due) > now);
  const saved = JSON.stringify(s.reviews);
  s = apply(s, { type: "start", deckId: deck.id, mode: "cram", direction: "front", filter: "all" }, now);
  s = submit(s, "Antwort 0");
  assert.equal(JSON.stringify(s.reviews), saved);
  s = apply(s, { type: "start", deckId: deck.id, mode: "review", direction: "front", filter: "all" }, Date.parse(due));
  assert.equal(question(s)?.card.id, deck.cards[0].id);
});

test("Wiederholungsstand und offene Runde überstehen eine JSON Sicherung", () => {
  const { state, deck } = setup(2);
  let s = apply(state, { type: "start", deckId: deck.id, mode: "review", direction: "front", filter: "all" }, now);
  s = apply(s, { type: "rate", sessionId: s.session!.id, cursor: 0, grade: 1 }, now);
  const restored = apply(empty(), { type: "restore", data: JSON.parse(JSON.stringify(s)) }, now);
  assert.deepEqual(restored, s);
  assert.equal(question(restored)?.card.id, deck.cards[1].id);
});

test("CSV importiert zitierte Trennzeichen, doppelte Anführungszeichen und Zeilenumbrüche", () => {
  const result = parseImport('"Begriff; Teil";"Eine ""Definition""\nmit zweiter Zeile"\r\nUnvollständig\r\nNeu;Antwort', ";");
  assert.deepEqual(result.cards.map(card => [card.front, card.back]), [
    ["Begriff; Teil", 'Eine "Definition"\nmit zweiter Zeile'], ["Neu", "Antwort"],
  ]);
  assert.deepEqual(result.errors, [3]);
});

test("Schnelle Wiederholung startet nur fällige Karten der gewählten Richtung", () => {
  const { state, deck } = setup(2);
  const start = { type: "start", deckId: deck.id, mode: "review", direction: "back", filter: "all" } as const;
  let next = apply(state, start, now);
  next = apply(next, { type: "rate", sessionId: next.session!.id, cursor: 0, grade: 1 }, now);
  const due = Date.parse(Object.values(next.reviews)[0].due);
  assert.equal(apply(next, { ...start, dueOnly: true }, now).session?.queue.length, 0);
  assert.equal(apply(next, { ...start, direction: "front", dueOnly: true }, due).session?.queue.length, 0);
  assert.deepEqual(apply(next, { ...start, dueOnly: true }, due).session?.queue, [deck.cards[0].id]);
});

test("Wischbewertungen planen Karten und aktualisieren die Fehlerliste", () => {
  const { state, deck } = setup(1);
  const id = deck.cards[0].id;
  const action = { type: "sortCard", deckId: deck.id, cardId: id, direction: "front" } as const;
  const missed = apply(state, { ...action, known: false }, now);
  const known = apply(state, { ...action, known: true }, now);
  assert.deepEqual(missed.mistakes[deck.id + ":front"], [id]);
  assert.deepEqual(known.mistakes[deck.id + ":front"], []);
  assert.ok(Date.parse(missed.reviews[id + ":front"].due) < Date.parse(known.reviews[id + ":front"].due));
});

test("Lernen mischt die Karten und die Antwortpositionen wechseln pro Runde", () => {
  const { state, deck } = setup(8);
  const reversed = <T,>(items: T[]) => [...items].reverse();
  const s = applyShuffled(state, { type: "start", deckId: deck.id, mode: "learn", direction: "front", filter: "all" }, now, reversed);
  assert.equal(s.session?.queue[0], deck.cards.at(-1)!.id);
  const positions = new Set(Array.from({ length: 12 }, (_, round) =>
    choices(deck, deck.cards[0], "front", "runde-" + round).indexOf(deck.cards[0].back)));
  assert.ok(positions.size > 1);
  assert.deepEqual(new Set(choices(deck, deck.cards[0], "front", "a")), new Set(choices(deck, deck.cards[0], "front", "b")));
});

test("Das Tageslimit für neue Karten gilt pro Set", () => {
  let s = apply(empty(), { type: "save", title: "A", cards: Array.from({ length: 12 }, (_, i) => ({ front: "a" + i, back: "b" + i })) }, now);
  s = apply(s, { type: "save", title: "B", cards: Array.from({ length: 12 }, (_, i) => ({ front: "c" + i, back: "d" + i })) }, now);
  const [b, a] = s.decks;
  for (const card of a.cards.slice(0, 10)) s = apply(s, { type: "sortCard", deckId: a.id, cardId: card.id, direction: "front", known: true }, now);
  assert.equal(reviewQueue(s, a.cards, "front", now).filter(card => !s.reviews[card.id + ":front"]).length, 0);
  assert.equal(reviewQueue(s, b.cards, "front", now).length, 10);
});

test("Sicher gelernte Karten kommen in die Wiederholungsplanung", () => {
  const { state, deck } = setup(1);
  let s = apply(state, { type: "start", deckId: deck.id, mode: "learn", direction: "front", filter: "all" }, now);
  s = submit(s, deck.cards[0].back);
  assert.equal(s.reviews[deck.cards[0].id + ":front"], undefined);
  s = submit(s, deck.cards[0].back);
  assert.equal(s.session?.done, true);
  assert.ok(Date.parse(s.reviews[deck.cards[0].id + ":front"].due) > now);
});

test("Markieren behält den Lernstand, ein veralteter Editor wird abgelehnt", () => {
  const { state, deck } = setup(2);
  const card = deck.cards[0];
  let s = apply(state, { type: "sortCard", deckId: deck.id, cardId: card.id, direction: "front", known: true }, now);
  const base = deckDigest(s.decks[0]);
  s = apply(s, { type: "star", deckId: deck.id, cardId: card.id, starred: true }, now);
  assert.equal(s.decks[0].cards[0].starred, true);
  assert.ok(s.reviews[card.id + ":front"]);
  assert.equal(deckDigest(s.decks[0]), base);
  const edit = { type: "save", deckId: deck.id, title: "Neu", base, cards: deck.cards } as const;
  s = apply(s, edit, now);
  assert.equal(s.decks[0].cards[0].starred, true, "der Editor überschreibt keine Markierung");
  assert.throws(() => apply(s, edit, now), /anderen Gerät/);
});
