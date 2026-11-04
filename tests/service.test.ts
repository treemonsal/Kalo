import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { type Workspace } from "../lib/learning.ts";
import { AccountStore, api, mcp } from "../lib/service.ts";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE accounts (owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)");
  const adapter = {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return { bind(...values: (string | number)[]) {
        return { first: async () => statement.get(...values) ?? null,
          run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }) };
      } };
    },
  };
  const store = new AccountStore(adapter as unknown as D1Database);
  const now = 1_800_000_000_000;
  const request = (owner: string | null, input?: unknown, path = "/api/workspace") =>
    new Request("https://app.test" + path, {
      headers: { "content-type": "application/json", ...(owner ? { "oai-authenticated-user-id": owner } : {}) },
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
