import assert from "node:assert/strict";
import test from "node:test";
import { DurableQueue, WorkspaceProjection, actionShuffle, type QueuedAction } from "../lib/learning-sync.ts";
import { apply, empty, question } from "../lib/learning.ts";

const action = { type: "sortCard" as const, deckId: crypto.randomUUID(), cardId: crypto.randomUUID(), direction: "front" as const, known: true, sortId: crypto.randomUUID() };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test("Warteschlange übersteht einen Neustart, behält Reihenfolge, Zeit und Anfrage IDs", async () => {
  const disk = storage();
  const sent: QueuedAction[] = [];
  const first = new DurableQueue({ owner: "alice", storage: disk, send: async () => { throw new Error("offline"); }, accept: () => undefined, changed: () => undefined });
  void first.submit(action, 1000);
  void first.submit({ ...action, known: false, sortId: crypto.randomUUID() }, 2000);
  await tick();
  assert.equal(first.state.phase, "waiting");
  assert.equal(first.state.pending, 2);
  first.dispose();
  const restored = new DurableQueue({ owner: "alice", storage: disk, send: async item => { sent.push(item); return { status: 200, result: { revision: sent.length } }; }, accept: () => undefined, changed: () => undefined });
  const bob = new DurableQueue({ owner: "bob", storage: disk, send: async () => { throw new Error(); }, accept: () => undefined, changed: () => undefined });
  assert.equal(bob.state.pending, 0);
  await restored.retry();
  assert.deepEqual(sent.map(item => item.at), [1000, 2000]);
  assert.equal(new Set(sent.map(item => item.id)).size, 2);
  assert.equal(restored.state.pending, 0);
});

test("Ein Konflikt bleibt gespeichert und stoppt spätere Bewertungen bis zur Prüfung", async () => {
  const disk = storage(); const sent: QueuedAction[] = [];
  const queue = new DurableQueue({ owner: "alice", storage: disk, send: async item => { sent.push(item); return { status: 400, result: { error: "Set gelöscht" } }; }, accept: () => undefined, changed: () => undefined });
  const one = queue.submit(action);
  const two = queue.submit({ ...action, sortId: crypto.randomUUID() });
  await tick();
  assert.equal(queue.state.phase, "blocked");
  assert.equal(queue.state.pending, 2);
  assert.equal(sent.length, 1);
  await queue.discard();
  assert.deepEqual(await Promise.all([one, two]), [null, null]);
});

test("Eine abgebrochene Antwort wird mit derselben ID erneut zugestellt", async () => {
  let attempts = 0; const sent: string[] = [];
  const queue = new DurableQueue({ owner: "alice", storage: storage(), send: async item => { sent.push(item.id); if (++attempts === 1) throw new Error("Antwort verloren"); return { status: 200, result: { revision: 1 } }; }, accept: () => undefined, changed: () => undefined });
  const result = queue.submit(action);
  await tick();
  await queue.retry();
  assert.equal((await result)?.revision, 1);
  assert.deepEqual(sent, [sent[0], sent[0]]);
});

test("Zwei offene Tabs überschreiben ihre noch nicht gesendeten Bewertungen nicht", async () => {
  const disk = storage();
  const options = { owner: "alice", storage: disk, send: async () => { throw new Error("offline"); }, accept: () => undefined, changed: () => undefined };
  const first = new DurableQueue(options);
  const second = new DurableQueue(options);
  void first.submit(action, 1000);
  void second.submit({ ...action, sortId: crypto.randomUUID() }, 2000);
  await tick(); first.dispose(); second.dispose();
  const sent: QueuedAction[] = [];
  const restored = new DurableQueue({ ...options, send: async item => { sent.push(item); return { status: 200, result: { revision: sent.length } }; } });
  await restored.retry();
  assert.deepEqual(sent.map(item => item.at), [1000, 2000]);
});

test("Lokale Zusage wartet nicht auf den Server; ein gemeinsamer Abgleich bestätigt alle schnellen Eingaben", async () => {
  const disk = storage(); const sent: QueuedAction[] = [];
  let finish!: () => void;
  const slow = new Promise<void>(resolve => { finish = resolve; });
  const queue = new DurableQueue({ owner: "alice", storage: disk, send: async item => {
    sent.push(item); await slow;
    return { status: 200, result: { revision: sent.length } };
  }, accept: () => undefined, changed: () => undefined });
  const first = await queue.enqueue(action, 1000);
  const second = await queue.enqueue({ ...action, sortId: crypto.randomUUID() }, 2000);
  assert.deepEqual(queue.pendingActions.map(item => item.id), [first.id, second.id]);
  assert.equal(queue.state.pending, 2, "beide Aktionen sind vor einer Serverbestätigung gesichert");
  assert.equal(new DurableQueue({ owner: "alice", storage: disk, send: async () => { throw Error(); }, accept() {}, changed() {} }).state.pending, 2);
  const flushed = queue.retry();
  assert.equal(flushed, queue.retry(), "ein expliziter Abgleich wartet auf dieselbe laufende Übertragung");
  finish(); await flushed;
  assert.deepEqual(sent.map(item => item.at), [1000, 2000]);
  assert.equal(queue.state.pending, 0);
});

test("Ein fehlgeschlagener lokaler Speichervorgang bestätigt und sendet keine Bewertung", async () => {
  let sent = 0;
  const queue = new DurableQueue({ owner: "alice", storage: { getItem: () => null, setItem: () => { throw Error("quota"); } },
    send: async () => { sent++; return { status: 200, result: {} }; }, accept() {}, changed() {} });
  await assert.rejects(queue.enqueue(action), /nicht übernommen/);
  assert.equal(queue.state.pending, 0); assert.equal(sent, 0);
});

test("Verzögerte Bestätigungen setzen schnelle Antworten und Rundenwechsel nicht zurück", () => {
  const now = 1_800_000_000_000;
  const saved = apply(empty(), { type: "save", title: "Schnell lernen", cards: Array.from({ length: 4 }, (_, i) => ({ front: "Frage " + i, back: "Antwort " + i })) }, now);
  const base = apply(saved, { type: "start", deckId: saved.decks[0].id, direction: "front", filter: "all", mode: "learn" }, now);
  const clientId = crypto.randomUUID(); const items: QueuedAction[] = [];
  const states = [base]; const projection = new WorkspaceProjection();
  let expected = base;
  for (let i = 0; i < 10; i++) {
    const session = expected.session!;
    const item: QueuedAction = { id: crypto.randomUUID(), clientId, sequence: i + 1, at: now + i * 1000,
      action: { type: "answer", sessionId: session.id, round: session.round, cursor: session.cursor, answer: question(expected)!.answer } };
    items.push(item);
    expected = apply(expected, item.action, item.at, actionShuffle(item.id)); states.push(expected);
    assert.deepEqual(projection.project(base, items), expected);
  }
  assert.ok(expected.session!.round > 1);
  for (let acknowledged = 1; acknowledged <= items.length; acknowledged++) {
    assert.deepEqual(projection.project(states[acknowledged], items, { [clientId]: acknowledged }), expected,
      "eine Bestätigung aus einem anderen Tab darf eine Antwort nicht doppelt anwenden");
    assert.deepEqual(projection.project(states[acknowledged], items.slice(acknowledged), { [clientId]: acknowledged }), expected);
  }
  assert.equal(base.session!.cursor, 0, "der bestätigte Ausgangszustand bleibt unverändert");
});

test("Die lokale Vorschau überspringt keinen Konflikt zugunsten späterer Änderungen", () => {
  const now = Date.now();
  const base = apply(empty(), { type: "save", title: "Konflikt", cards: [{ front: "A", back: "B" }] }, now);
  const clientId = crypto.randomUUID();
  const items: QueuedAction[] = [
    { id: crypto.randomUUID(), clientId, sequence: 1, at: now, action: { type: "answer", sessionId: crypto.randomUUID(), round: 1, cursor: 0, answer: "B" } },
    { id: crypto.randomUUID(), clientId, sequence: 2, at: now, action: { type: "star", deckId: base.decks[0].id, cardId: base.decks[0].cards[0].id, starred: true } },
  ];
  assert.deepEqual(new WorkspaceProjection().project(base, items), base);
});
