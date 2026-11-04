import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apply, choices, empty, parseImport, question, type Workspace } from "../lib/learning.ts";

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
  const q = question(state)!;
  const current = state.session!;
  return apply(state, { type: "answer", sessionId: current.id, cursor: current.cursor, round: current.round, answer, self }, now);
}

test("importiert eine vorhandene Quizlet Datei und meldet kaputte Zeilen", () => {
  const text = process.env.KARTENLOOP_QUIZLET_FIXTURE
    ? readFileSync(process.env.KARTENLOOP_QUIZLET_FIXTURE, "utf8")
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
