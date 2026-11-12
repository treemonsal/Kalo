import assert from "node:assert/strict";
import test from "node:test";
import { DurableQueue, type QueuedAction } from "../lib/learning-sync.ts";

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
