import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AccountStore, api } from "../lib/service.ts";
import type { FriendSummary } from "../lib/social.ts";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE accounts (owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)");
  let beforeRun: ((sql: string) => void) | undefined;
  const queries: string[] = [];
  const adapter = { prepare(sql: string) {
    queries.push(sql);
    const statement = db.prepare(sql);
    return { bind(...values: (string | number)[]) { return {
      first: async () => statement.get(...values) ?? null,
      all: async () => ({ results: statement.all(...values) }),
      run: async () => { beforeRun?.(sql); return { meta: { changes: Number(statement.run(...values).changes) } }; },
    }; } };
  } };
  const store = new AccountStore(adapter as unknown as D1Database);
  const now = 1_800_000_000_000;
  const call = async (owner: string, action?: unknown, at = now, path = "/api/workspace") => {
    const response = await api(new Request("https://app.test" + path, {
      method: action ? "POST" : "GET",
      headers: { "content-type": "application/json", "oai-authenticated-user-id": owner, "oai-authenticated-user-email": owner + "@test.ch" },
      body: action ? JSON.stringify({ action }) : undefined,
    }), store, at);
    return { status: response.status, ...await response.json() as Reply };
  };
  const connect = async (a: string, b: string) => {
    const invite = await call(a, { type: "inviteFriend" });
    assert.equal(invite.status, 200);
    assert.ok(invite.token);
    const accepted = await call(b, { type: "acceptFriend", token: invite.token });
    assert.equal(accepted.status, 200);
    return invite.token;
  };
  return { db, store, call, connect, now, queries, failWrites: (callback?: (sql: string) => void) => { beforeRun = callback; } };
}
type Reply = { token?: string; error?: string; revision?: number; workspace?: { decks: unknown[] }; friends?: FriendSummary[]; partner?: { name: string } | null };
const ids = (reply: Reply) => reply.friends?.map(friend => friend.id).sort();

test("Mehrere Freunde bleiben gegenseitig verbunden, Trennung entfernt genau einen", async () => {
  const { call, connect } = setup();
  await connect("alice", "bob");
  await connect("alice", "carol");
  assert.deepEqual(ids(await call("alice")), ["bob", "carol"]);
  assert.deepEqual(ids(await call("bob")), ["alice"]);
  assert.equal((await call("alice", { type: "removeFriend", friendId: "bob" })).status, 200);
  assert.deepEqual(ids(await call("alice")), ["carol"]);
  assert.deepEqual(ids(await call("bob")), []);
  assert.deepEqual(ids(await call("carol")), ["alice"]);
});

test("Bestehender Partner bleibt beim Upgrade und alte Befehle entfernen nur den angezeigten Freund", async () => {
  const { store, call, connect } = setup();
  for (const [owner, id] of [["alice", "bob"], ["bob", "alice"]]) {
    const account = await store.read(owner);
    account.partner = { id, name: id };
    assert.ok(await store.write(owner, account));
  }
  assert.deepEqual(ids(await call("alice")), ["bob"]);
  await connect("alice", "carol");
  assert.deepEqual(ids(await call("alice")), ["bob", "carol"]);
  assert.equal((await call("alice")).partner?.name, "bob");
  assert.equal((await call("alice", { type: "leavePartner" })).status, 200);
  assert.deepEqual(ids(await call("alice")), ["carol"]);
  assert.deepEqual(ids(await call("bob")), []);
  const invite = await call("alice", { type: "invitePartner" });
  assert.equal((await call("dave", { type: "acceptPartner", token: invite.token })).status, 200);
  assert.deepEqual(ids(await call("alice")), ["carol", "dave"]);
});

test("Einladung ist nach Annahme nur für dieselbe Person wiederholbar und erzeugt keine Duplikate", async () => {
  const { call, connect, now } = setup();
  const token = await connect("alice", "bob");
  assert.equal((await call("bob", { type: "acceptFriend", token })).status, 200);
  assert.equal((await call("carol", { type: "acceptFriend", token })).status, 404);
  const again = await call("alice", { type: "inviteFriend" });
  assert.equal((await call("bob", { type: "acceptFriend", token: again.token })).status, 200);
  assert.deepEqual(ids(await call("alice")), ["bob"]);
  const own = await call("alice", { type: "inviteFriend" });
  assert.equal((await call("alice", { type: "acceptFriend", token: own.token })).status, 400);
  assert.equal((await call("carol", { type: "acceptFriend", token: own.token }, now + 7 * 86_400_000)).status, 404);
  await call("bob", { type: "removeFriend", friendId: "alice" });
  assert.notEqual((await call("bob", { type: "acceptFriend", token })).status, 200, "alte verbrauchte Einladung verbindet nach Trennung nicht erneut");
  assert.deepEqual(ids(await call("alice")), []);
});

test("Nur gegenseitige Freunde sehen Profile und Fortschritt, niemals Karten oder Entwürfe", async () => {
  const { store, call, connect, queries } = setup();
  const picture = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  await call("bob", { type: "profile", name: "Bobby", picture });
  await call("bob", { type: "save", title: "Geheim", cards: [{ front: "Privater Inhalt", back: "Unsichtbar" }] });
  const alice = await store.read("alice");
  alice.partner = { id: "bob", name: "Bobby" };
  await store.write("alice", alice);
  const unilateral = await call("alice");
  assert.deepEqual(ids(unilateral), []);
  assert.equal(unilateral.partner, null);
  await connect("bob", "alice");
  queries.length = 0;
  const visible = await call("alice");
  assert.equal(visible.friends?.[0].name, "Bobby");
  assert.match(visible.friends?.[0].picture ?? "", /^\/api\/workspace\?picture=/, "Freunde bekommen nur die Adresse des Bilds");
  assert.equal(visible.friends?.[0].todayPoints, 0);
  assert.equal(visible.friends?.[0].goal, 20);
  assert.doesNotMatch(JSON.stringify(visible), /Privater Inhalt|Unsichtbar|Geheim/);
  assert.equal(queries.filter(query => query.startsWith("SELECT revision, payload FROM")).length, 1, "nur eigene Bibliothek vollständig lesen");
  assert.deepEqual(ids(await call("carol")), []);
});

test("Fehlgeschlagener gemeinsamer Schreibzugriff verbraucht weder Einladung noch halbe Verbindung", async t => {
  t.mock.method(console, "error", () => {});
  const { call, store, failWrites } = setup();
  const invite = await call("alice", { type: "inviteFriend" });
  failWrites(sql => { if (sql.includes("UPDATE accounts")) throw new Error("storage unavailable"); });
  assert.equal((await call("bob", { type: "acceptFriend", token: invite.token })).status, 503);
  failWrites();
  assert.deepEqual(ids(await call("alice")), []);
  assert.deepEqual(ids(await call("bob")), []);
  assert.ok(await store.getRecord("partner:" + invite.token));
  assert.equal((await call("bob", { type: "acceptFriend", token: invite.token })).status, 200);
  assert.deepEqual(ids(await call("alice")), ["bob"]);
});

test("SQLite rollt bei einem Fehler während der Einladung alle beteiligten Konten zurück", async t => {
  t.mock.method(console, "error", () => {});
  const { db, call } = setup();
  const invite = await call("alice", { type: "inviteFriend" });
  db.exec("CREATE TRIGGER reject_invite BEFORE UPDATE ON accounts WHEN NEW.owner LIKE 'partner:%' BEGIN SELECT RAISE(ABORT, 'write rejected'); END");
  assert.equal((await call("bob", { type: "acceptFriend", token: invite.token })).status, 503);
  assert.deepEqual(ids(await call("alice")), []);
  assert.deepEqual(ids(await call("bob")), []);
  db.exec("DROP TRIGGER reject_invite");
  assert.equal((await call("bob", { type: "acceptFriend", token: invite.token })).status, 200);
});

test("Polling aktualisiert Freunde auch wenn nur deren Fortschritt geändert wurde", async () => {
  const { call, connect, store, now } = setup();
  await connect("alice", "bob");
  const alice = await call("alice");
  const bob = await store.read("bob");
  bob.profile = { name: "Neuer Name" };
  await store.write("bob", bob);
  const poll = await call("alice", undefined, now, "/api/workspace?known=" + alice.revision);
  assert.equal(poll.friends?.[0].name, "Neuer Name");
  assert.equal(poll.partner?.name, "Neuer Name");
  const mutation = await call("alice", { type: "profile", name: "Alice" });
  assert.deepEqual(ids(mutation), ["bob"], "auch Antworten auf Bibliotheksänderungen enthalten Freunde");
});

test("Wischen liest keine Freundeskonten und schickt keine Freunde mit", async () => {
  const { call, connect, queries } = setup();
  await connect("alice", "bob");
  const saved = await call("alice", { type: "save", title: "Set", cards: [{ front: "a", back: "b" }] });
  const deck = saved.workspace!.decks[0] as { id: string; cards: { id: string }[] };
  queries.length = 0;
  const swipe = await call("alice", { type: "sortCard", deckId: deck.id, cardId: deck.cards[0].id, direction: "front", known: true });
  assert.equal(swipe.friends, undefined);
  assert.equal(queries.filter(query => query.startsWith("SELECT")).length, 1, "nur das eigene Konto lesen");
});

test("Zwei Personen können dieselbe Einladung nicht gleichzeitig beanspruchen", async () => {
  const { call } = setup();
  const invite = await call("alice", { type: "inviteFriend" });
  const results = await Promise.all(["bob", "carol"].map(owner => call(owner, { type: "acceptFriend", token: invite.token })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 404]);
  const winner = results[0].status === 200 ? "bob" : "carol";
  const loser = winner === "bob" ? "carol" : "bob";
  assert.deepEqual(ids(await call("alice")), [winner]);
  assert.deepEqual(ids(await call(loser)), []);
});

test("Ein CAS Konflikt erhält die zwischenzeitlich geänderten Kontodaten", async () => {
  const { db, call, failWrites } = setup();
  await call("alice", { type: "profile", name: "Alt" });
  const invite = await call("alice", { type: "inviteFriend" });
  let conflict = true;
  failWrites(sql => {
    if (conflict && sql.includes("UPDATE accounts")) {
      conflict = false;
      db.prepare("UPDATE accounts SET payload = json_set(payload, '$.profile.name', 'Parallel'), revision = revision + 1 WHERE owner = 'alice'").run();
    }
  });
  const accepted = await call("bob", { type: "acceptFriend", token: invite.token });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.friends?.[0].name, "Parallel");
  assert.deepEqual(ids(await call("alice")), ["bob"]);
});

test("Gleichzeitige Einladungen und Trennungen überschreiben keine anderen Freunde", async () => {
  const { call, connect } = setup();
  const first = await call("alice", { type: "inviteFriend" });
  const second = await call("alice", { type: "inviteFriend" });
  const accepted = await Promise.all([
    call("bob", { type: "acceptFriend", token: first.token }),
    call("carol", { type: "acceptFriend", token: second.token }),
  ]);
  assert.deepEqual(accepted.map(reply => reply.status), [200, 200]);
  assert.deepEqual(ids(await call("alice")), ["bob", "carol"]);
  await connect("alice", "dave");
  const removed = await Promise.all([
    call("alice", { type: "removeFriend", friendId: "bob" }),
    call("alice", { type: "removeFriend", friendId: "carol" }),
  ]);
  assert.deepEqual(removed.map(reply => reply.status), [200, 200]);
  assert.deepEqual(ids(await call("alice")), ["dave"]);
  assert.deepEqual(ids(await call("bob")), []);
  assert.deepEqual(ids(await call("carol")), []);
});

test("Annehmen und Entfernen laufen parallel und erhalten jede unbeteiligte Freundschaft", async () => {
  const { call, connect } = setup();
  await connect("alice", "bob");
  await connect("alice", "carol");
  const invite = await call("alice", { type: "inviteFriend" });
  const changes = await Promise.all([
    call("dave", { type: "acceptFriend", token: invite.token }),
    call("alice", { type: "removeFriend", friendId: "bob" }),
  ]);
  assert.deepEqual(changes.map(result => result.status), [200, 200]);
  assert.deepEqual(ids(await call("alice")), ["carol", "dave"]);
  assert.deepEqual(ids(await call("bob")), []);
  assert.deepEqual(ids(await call("carol")), ["alice"]);
  assert.deepEqual(ids(await call("dave")), ["alice"]);
  // A duplicate invite accepted while that very friend is removed still commits both sides together.
  const duplicate = await call("alice", { type: "inviteFriend" });
  const sameEdge = await Promise.all([
    call("carol", { type: "acceptFriend", token: duplicate.token }),
    call("alice", { type: "removeFriend", friendId: "carol" }),
  ]);
  assert.deepEqual(sameEdge.map(result => result.status), [200, 200]);
  const aliceIds = ids(await call("alice")) ?? [];
  const carolIds = ids(await call("carol")) ?? [];
  assert.equal(aliceIds.includes("carol"), carolIds.includes("alice"));
  assert.ok(aliceIds.includes("dave"));
});

test("Der schmale Fortschrittsabruf berechnet Punkte und gemeinsame Serie pro Freund", async () => {
  const { store, call, connect } = setup();
  await connect("alice", "bob");
  const at = Date.parse("2026-11-12T12:00:00Z");
  for (const [owner, points, goal] of [["alice", 20, 20], ["bob", 40, 30]] as const) {
    const account = await store.read(owner);
    account.workspace.goal = goal;
    account.workspace.stats = { days: { "2026-11-12": { cards: 4, points, correct: 4, secured: 0, ms: 8000 } } };
    await store.write(owner, account);
  }
  const bob = (await call("alice", undefined, at)).friends?.[0];
  assert.equal(bob?.todayPoints, 40);
  assert.equal(bob?.goal, 30);
  assert.equal(bob?.shared, 1);
});

test("Fremde Datensatzschlüssel sind keine Konten oder Freunde", async () => {
  const { call, store } = setup();
  const token = crypto.randomUUID();
  await store.putRecord("share:" + token, 0, { secret: "private share" });
  assert.equal((await call("share:" + token)).status, 401);
  assert.equal((await call("alice", { type: "removeFriend", friendId: "share:" + token })).status, 400);
  assert.deepEqual((await store.getRecord("share:" + token))?.data, { secret: "private share" });
});

test("Ein Freundeslimit lehnt neue Verbindungen explizit ab und erhält alle bisherigen", async () => {
  const { store, call } = setup();
  const account = await store.read("alice");
  account.friends = Array.from({ length: 50 }, (_, i) => ({ id: "friend" + i, name: "Name" + i }));
  await store.write("alice", account);
  const invite = await call("alice", { type: "inviteFriend" });
  const accepted = await call("bob", { type: "acceptFriend", token: invite.token });
  assert.equal(accepted.status, 409);
  assert.match(accepted.error ?? "", /50/);
  assert.equal((await store.read("alice")).friends?.length, 50);
  assert.deepEqual(ids(await call("bob")), []);
});
