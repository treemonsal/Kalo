import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { type Workspace } from "../lib/learning.ts";
import { AccountStore, api, mcp } from "../lib/service.ts";
import { reminderFor, runReminders, vapidAuthorization } from "../lib/push.ts";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE accounts (owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)");
  const adapter = {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return { bind(...values: (string | number)[]) {
        return { first: async () => statement.get(...values) ?? null, all: async () => ({ results: statement.all(...values) }),
          run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }) };
      } };
    },
  };
  const store = new AccountStore(adapter as unknown as D1Database);
  const now = 1_800_000_000_000;
  const request = (owner: string | null, input?: unknown, path = "/api/workspace") =>
    new Request("https://app.test" + path, {
      headers: { "content-type": "application/json", ...(owner ? { "oai-authenticated-user-id": owner, "oai-authenticated-user-email": owner + "@test.ch" } : {}) },
      method: input ? "POST" : "GET", body: input ? JSON.stringify(input) : undefined,
    });
  return { store, request, now };
}
const save = { type: "save", title: "Privat", cards: [{ front: "Geheim", back: "Antwort" }] };
const tool = (name: string, args: unknown) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

type ApiReply = { workspace: Workspace; revision: number; drafts: { id: string }[]; token?: string };
type McpReply = { result: { isError?: boolean } };
async function data<T>(response: Promise<Response> | Response): Promise<T> {
  return (await (await response).json()) as T;
}

test("Site und Chat trennen Identitäten und Freigaben verfallen", async () => {
  const { store, request, now } = setup();
  const response = await api(request("alice", { revision: 0, action: save }), store, now);
  assert.equal(response.status, 200);
  const saved = await data<ApiReply>(response);
  const deck = saved.workspace.decks[0];
  const { token } = await data<ApiReply>(api(request("alice", { revision: 1, action: { type: "share", deckId: deck.id, cardIds: [deck.cards[0].id] } }), store, now));
  const call = tool("kalo_read_selection", { token });
  assert.equal((await api(request(null), store, now)).status, 401);
  assert.equal((await mcp(request(null, call), store, now)).status, 401);
  assert.deepEqual((await data<ApiReply>(api(request("bob"), store, now))).workspace.decks, []);
  assert.equal((await data<McpReply>(mcp(request("bob", call), store, now))).result.isError, true);
  assert.match(JSON.stringify(await data<McpReply>(mcp(request("alice", call), store, now))), /Geheim/);
  assert.equal((await data<McpReply>(mcp(request("alice", call), store, now + 3_600_001))).result.isError, true);
});

test("parallele Schreibzugriffe gehen nicht verloren und alte Revisionen blockieren nichts", async () => {
  const { store, request, now } = setup();
  const results = await Promise.all(["Erste", "Zweite"].map(title => api(request("alice", {
    revision: 0, action: { ...save, title },
  }), store, now)));
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  const account = await store.read("alice");
  assert.equal(account.workspace.decks.length, 2);
  const deck = account.workspace.decks[0];
  const star = { type: "star", deckId: deck.id, cardId: deck.cards[0].id, starred: true };
  assert.equal((await api(request("alice", { revision: 0, action: star }), store, now)).status, 200);
  assert.equal((await store.read("alice")).revision, 3);
});

test("Polling lädt nur bei Änderungen und fremde Sites dürfen nichts ändern", async () => {
  const { store, request, now } = setup();
  await api(request("alice", { action: save }), store, now);
  const unchanged = await data<{ unchanged?: boolean }>(api(request("alice", undefined, "/api/workspace?known=1"), store, now));
  assert.equal(unchanged.unchanged, true);
  const changed = await data<ApiReply>(api(request("alice", undefined, "/api/workspace?known=0"), store, now));
  assert.equal(changed.workspace.decks.length, 1);
  const sibling = request("alice", { action: save });
  sibling.headers.set("sec-fetch-site", "same-site");
  assert.equal((await api(sibling, store, now)).status, 403);
});

test("Fehler bei einer Aktion liefern den aktuellen Stand mit", async () => {
  const { store, request, now } = setup();
  await api(request("alice", { action: save }), store, now);
  const reply = await api(request("alice", { action: { type: "delete", deckId: crypto.randomUUID() } }), store, now);
  assert.equal(reply.status, 400);
  assert.equal((await data<ApiReply>(reply)).workspace.decks.length, 1);
});

test("ChatGPT legt einen Entwurf ab, erst Bestätigung erstellt das Set", async () => {
  const { store, request, now } = setup();
  const call = tool("kalo_create_draft", { title: save.title, cards: save.cards });
  assert.equal((await data<McpReply>(mcp(request("alice", call), store, now))).result.isError, undefined);
  const account = await data<ApiReply>(api(request("alice"), store, now));
  assert.equal(account.workspace.decks.length, 0);
  assert.equal(account.drafts.length, 1);
  assert.equal((await store.read("bob")).drafts.length, 0);
  const action = { ...save, draftId: account.drafts[0].id };
  assert.equal((await api(request("alice", { revision: account.revision, action }), store, now)).status, 200);
  assert.equal((await store.read("alice")).drafts.length, 0);
});

test("Sites erhält eine vollständige MCP Discovery und findet beide Werkzeuge", async () => {
  const { store, request, now } = setup();
  const discover = { jsonrpc: "2.0", id: 1, method: "server/discover" };
  const discovery = await data<{ result: { resultType: string; supportedVersions: string[] } }>(
    mcp(request("alice", discover, "/mcp"), store, now),
  );
  assert.equal(discovery.result.resultType, "complete");
  assert.deepEqual(discovery.result.supportedVersions, ["2026-07-28"]);
  const list = await data<{ result: { tools: { name: string }[] } }>(
    mcp(request("alice", { ...discover, method: "tools/list" }, "/mcp"), store, now),
  );
  assert.deepEqual(list.result.tools.map(item => item.name), ["kalo_read_selection", "kalo_create_draft"]);
});

test("Rückgängig über die API und veraltete Rücknahmen", async () => {
  const { store, request, now } = setup();
  const saved = await data<ApiReply>(api(request("alice", { action: save }), store, now));
  const deck = saved.workspace.decks[0];
  const sortId = crypto.randomUUID();
  const sort = { type: "sortCard", deckId: deck.id, cardId: deck.cards[0].id, direction: "front", known: true, sortId };
  assert.equal((await api(request("alice", { action: sort }), store, now)).status, 200);
  const undone = await api(request("alice", { action: { type: "undoSort", sortId } }), store, now);
  assert.equal(undone.status, 200);
  assert.deepEqual((await data<ApiReply>(undone)).workspace.reviews, {});
  const again = await api(request("alice", { action: { type: "undoSort", sortId } }), store, now);
  assert.equal(again.status, 409);
  assert.equal((await data<ApiReply>(again)).workspace.decks.length, 1, "der aktuelle Stand kommt mit");
});

const post = (owner: string, action: unknown) => ({ owner, input: { action } });
type Social = ApiReply & { error?: string; token?: string; deckId?: string; partner?: { name: string; shared: number } | null;
  duel?: { results: { name: string; correct: number }[] }; share?: { title: string; imports: number; own: boolean } };

test("Sets per Link teilen: Kopie für andere, Zähler für die Besitzerin", async () => {
  const { store, request, now } = setup();
  const call = async (who: { owner: string; input: unknown }, path?: string) => data<Social>(api(request(who.owner, who.input, path), store, now));
  const deck = (await call(post("alice", save))).workspace.decks[0];
  const { token } = await call(post("alice", { type: "publish", deckId: deck.id }));
  assert.ok(token);
  const preview = await data<Social>(api(request("bob", undefined, "/api/workspace?share=" + token), store, now));
  assert.equal(preview.share?.title, "Privat");
  assert.equal(preview.share?.own, false);
  const imported = await call(post("bob", { type: "importShare", token }));
  assert.equal(imported.workspace.decks[0].title, "Privat");
  assert.notEqual(imported.workspace.decks[0].id, deck.id, "eine eigene Kopie");
  assert.equal((await data<Social>(api(request("alice", undefined, "/api/workspace?share=" + token), store, now))).share?.imports, 1);
  assert.equal((await call(post("alice", { type: "publish", deckId: deck.id }))).token, token, "derselbe Link bleibt");
  assert.equal((await api(request("bob", { action: { type: "importShare", token: crypto.randomUUID() } }), store, now)).status, 404);
});

test("Lernpartner: Einladung, gemeinsame Serie und Trennung", async () => {
  const { store, request, now } = setup();
  const call = async (owner: string, action: unknown) => data<Social>(api(request(owner, { action }), store, now));
  const { token } = await call("alice", { type: "invitePartner" });
  assert.equal((await api(request("alice", { action: { type: "acceptPartner", token } }), store, now)).status, 400, "nicht mit sich selbst");
  const accepted = await call("bob", { type: "acceptPartner", token });
  assert.equal(accepted.partner?.name, "alice");
  const alice = await data<Social>(api(request("alice"), store, now));
  assert.equal(alice.partner?.name, "bob");
  assert.equal((await api(request("carol", { action: { type: "acceptPartner", token } }), store, now)).status, 404, "Einladung nur einmal");
  await call("bob", { type: "leavePartner" });
  assert.equal((await data<Social>(api(request("alice"), store, now))).partner, null);
});

test("Duell: gleiche Fragen, Ergebnis pro Person, nur ein Versuch", async () => {
  const { store, request, now } = setup();
  const cards = Array.from({ length: 8 }, (_, i) => ({ front: "Frage " + i, back: "Antwort " + i }));
  const deck = (await data<Social>(api(request("alice", { action: { type: "save", title: "Duell", cards } }), store, now))).workspace.decks[0];
  const { token } = await data<Social>(api(request("alice", { action: { type: "createDuel", deckId: deck.id } }), store, now));
  const duel = (await data<{ duel: { questions: { answer: string }[] } }>(api(request("bob", undefined, "/api/workspace?duel=" + token), store, now))).duel;
  assert.equal(duel.questions.length, 8);
  const answers = duel.questions.map((q, i) => i < 6 ? q.answer : "falsch");
  const result = await data<Social>(api(request("bob", { action: { type: "duelResult", token, answers, ms: 41_000 } }), store, now));
  assert.deepEqual(result.duel?.results.map(r => [r.name, r.correct]), [["bob", 6]]);
  const again = await data<Social>(api(request("bob", { action: { type: "duelResult", token, answers: duel.questions.map(q => q.answer), ms: 1 } }), store, now));
  assert.equal(again.duel?.results[0].correct, 6, "der erste Versuch zählt");
  const small = (await data<Social>(api(request("alice", { action: { type: "save", title: "Klein", cards: cards.slice(0, 3) } }), store, now))).workspace.decks[0];
  assert.equal((await api(request("alice", { action: { type: "createDuel", deckId: small.id } }), store, now)).status, 400);
});

test("Push: VAPID-Signatur ist gültig, Erinnerung kommt einmal am Morgen", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
  const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
  const keys = { publicKey, privateKey, subject: "mailto:test@kalo.ch" };
  const header = await vapidAuthorization("https://push.example.com/abc", keys, Date.now());
  const [jwt] = header.slice("vapid t=".length).split(", k=");
  const [head, payload, signature] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(payload, "base64url").toString()).aud, "https://push.example.com");
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(head + "." + payload)));

  const { store, request } = setup();
  const morning = Date.parse("2026-11-04T06:50:00+01:00");
  const deck = (await data<Social>(api(request("alice", { action: save }), store, morning - 3_600_000))).workspace.decks[0];
  await api(request("alice", { action: { type: "sortCard", deckId: deck.id, cardId: deck.cards[0].id, direction: "front", known: false } }), store, morning - 3_600_000);
  const subscription = { endpoint: "https://push.example.com/abc", keys: { p256dh: "x", auth: "y" } };
  await api(request("alice", { action: { type: "pushSubscribe", subscription, morning: "06:45", evening: "19:30" } }), store, morning);
  assert.equal(reminderFor(await store.read("alice"), morning), "morning");
  const sent: string[] = [];
  const send = (async (url: string) => { sent.push(url); return new Response(null, { status: 201 }); }) as typeof fetch;
  assert.equal(await runReminders(store, keys, morning, send), 1);
  assert.equal(await runReminders(store, keys, morning + 60_000, send), 0, "nicht zweimal am selben Tag");
  const text = await data<{ title: string }>(api(request("alice", undefined, "/api/workspace?notice=1"), store, morning));
  assert.match(text.title, /fällig/);
});
