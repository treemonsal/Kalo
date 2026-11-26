import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cardLearningDigest, deckDigest, question, type Workspace } from "../lib/learning.ts";
import { WorkspaceProjection, type QueuedAction } from "../lib/learning-sync.ts";
import { AccountStore, api, explainApi, mcp } from "../lib/service.ts";
import type { PairExplanation } from "../lib/explanations.ts";
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

test("Schnell vorgelernte Antworten bleiben nach Hintergrundabgleich samt neuer Rundenreihenfolge identisch", async () => {
  const { store, request, now } = setup();
  const saved = await data<ApiReply>(api(request("alice", { action: { ...save, cards: Array.from({ length: 4 }, (_, i) => ({ front: "Frage " + i, back: "Antwort " + i })) } }), store, now));
  const started = await data<ApiReply>(api(request("alice", { action: { type: "start", deckId: saved.workspace.decks[0].id, direction: "front", filter: "all", mode: "learn" } }), store, now));
  const projection = new WorkspaceProjection(); const items: QueuedAction[] = []; const clientId = crypto.randomUUID();
  let local = started.workspace;
  for (let i = 0; i < 10; i++) {
    const session = local.session!;
    items.push({ id: crypto.randomUUID(), clientId, sequence: i + 1, at: now + i * 1000,
      action: { type: "answer", sessionId: session.id, cursor: session.cursor, round: session.round, answer: question(local)!.answer } });
    local = projection.project(started.workspace, items);
  }
  for (const item of items) {
    const response = await api(request("alice", { ...item, requestId: item.id }), store, now + 20_000);
    assert.equal(response.status, 200);
    const reply = await data<ApiReply & { confirmed: Record<string, number> }>(response);
    assert.equal(reply.confirmed[clientId], item.sequence);
    assert.deepEqual(new WorkspaceProjection().project(reply.workspace, items, reply.confirmed), local);
  }
  assert.deepEqual((await store.read("alice")).workspace, local);
  const last = items.at(-1)!;
  assert.equal((await api(request("alice", { ...last, requestId: last.id }), store, now + 30_000)).status, 200);
  assert.deepEqual((await store.read("alice")).workspace, local, "erneute Zustellung verändert den Fortschritt nicht");
});

test("Worterklärungen laden ausschliesslich die aktuelle eigene Karte", async () => {
  const { store, request, now } = setup();
  await api(request("alice", { action: { ...save, cards: [{ front: "improve", back: "verbessern" }, { front: "private", back: "privat" }] } }), store, now);
  const account = await store.read("alice"); const deck = account.workspace.decks[0];
  const input = { deckId: deck.id, cardId: deck.cards[0].id };
  const lookup = async (url: string) => {
    const word = new URL(url).pathname.split("/").at(-1);
    assert.ok(word === "improve" || word === "verbessern", "No other card may leave the app");
    return Response.json({ en: [{ definitions: [{ definition: "To make something better." }] }] });
  };
  assert.equal((await explainApi(request(null, input), store, lookup)).status, 401);
  assert.equal((await explainApi(request("bob", input), store, lookup)).status, 404);
  const foreign = request("alice", input); foreign.headers.set("sec-fetch-site", "same-site");
  assert.equal((await explainApi(foreign, store, lookup)).status, 403);
  const result = await explainApi(request("alice", input), store, lookup);
  assert.equal(result.status, 200);
  const resultBody = await result.json() as PairExplanation;
  assert.equal(resultBody.front.meanings[0].definition, "To make something better.");
  assert.equal(resultBody.back.term, "verbessern");
  assert.deepEqual(await store.read("alice"), account);
});
const tool = (name: string, args: unknown) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

test("Beispiele bleiben in ChatGPT Entwürfen, gespeicherten und geteilten Sets erhalten", async () => {
  const { store, request, now } = setup();
  const examples = "Ein Beispiel.\nNoch eines.";
  await mcp(request("alice", tool("kalo_create_draft", { title: "Mit Beispielen", cards: [{ front: "A", back: "B", examples }] })), store, now);
  const draft = (await store.read("alice")).drafts[0];
  assert.equal(draft.cards[0].examples, examples);
  const saved = await data<ApiReply>(api(request("alice", { action: { type: "save", draftId: draft.id, title: draft.title, cards: draft.cards } }), store, now));
  const deck = saved.workspace.decks[0];
  assert.equal(deck.cards[0].examples, examples);
  const shared = await data<ApiReply>(api(request("alice", { action: { type: "publish", deckId: deck.id } }), store, now));
  const imported = await data<ApiReply>(api(request("bob", { action: { type: "importShare", token: shared.token } }), store, now));
  assert.equal(imported.workspace.decks[0].cards[0].examples, examples);
  assert.notEqual(imported.workspace.decks[0].cards[0].id, deck.cards[0].id);
});

test("Eine lokal gespeicherte Wischbewertung bleibt nach einer reinen Beispieländerung zustellbar", async () => {
  const { store, request, now } = setup();
  const saved = await data<ApiReply>(api(request("alice", { action: { type: "save", title: "Beispiele", cards: [{ front: "A", back: "B", examples: "Erstes Beispiel" }] } }), store, now));
  const deck = saved.workspace.decks[0], card = deck.cards[0];
  const content = cardLearningDigest(card);
  await api(request("alice", { action: { type: "save", deckId: deck.id, title: deck.title, cards: [{ ...card, examples: "Neues Beispiel" }] } }), store, now + 1000);
  const response = await api(request("alice", { requestId: crypto.randomUUID(), clientId: crypto.randomUUID(), sequence: 1, at: now, content,
    action: { type: "sortCard", deckId: deck.id, cardId: card.id, direction: "front", known: true, sortId: crypto.randomUUID() } }), store, now + 2000);
  assert.equal(response.status, 200);
  assert.equal((await store.read("alice")).workspace.decks[0].cards[0].examples, "Neues Beispiel");
});

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

test("Profil: eigener Name und Bild, das Bild reist nicht mit jeder Aktion, der Partner sieht beides", async () => {
  const { store, request, now } = setup();
  type Profiled = Social & { profile: { name: string; picture: string | null; custom: boolean }; partner?: { name: string; picture?: string } | null };
  const call = async (owner: string, action: unknown) => data<Profiled>(api(request(owner, { action }), store, now));
  const picture = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const start = await data<Profiled>(api(request("alice"), store, now));
  assert.deepEqual(start.profile, { name: "alice", picture: null, custom: false }, "ohne eigenen Namen der Anmeldename");
  const named = await call("alice", { type: "profile", name: " Alice ", picture });
  assert.equal(named.profile.name, "Alice");
  assert.equal(named.profile.custom, true);
  assert.match(named.profile.picture ?? "", /^\/api\/workspace\?picture=[0-9a-f-]{36}$/, "nur eine Adresse, nicht das Bild");
  assert.ok(!JSON.stringify(await call("alice", save)).includes("base64"), "eine normale Aktion schickt kein Bild mit");
  // The picture loads from its own address, also without sign-in headers (images do not send them).
  const image = await api(request(null, undefined, named.profile.picture!), store, now);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer())].slice(0, 3), [0xff, 0xd8, 0xff]);
  assert.equal((await api(request(null, undefined, "/api/workspace?picture=" + crypto.randomUUID()), store, now)).status, 404);
  assert.equal((await api(request("alice", { action: { type: "profile", picture: "data:text/html;base64,PHNjcmlwdD4=" } }), store, now)).status, 400, "nur JPEG");
  assert.equal((await api(request("alice", { action: { type: "profile", picture: "data:image/jpeg;base64," + "A".repeat(130_000) } }), store, now)).status, 400, "zu gross");
  const replaced = await call("alice", { type: "profile", picture });
  assert.notEqual(replaced.profile.picture, named.profile.picture);
  assert.equal((await api(request(null, undefined, named.profile.picture!), store, now)).status, 404, "altes Bild aufgeräumt");
  const { token } = await call("alice", { type: "invitePartner" });
  const bob = await call("bob", { type: "acceptPartner", token });
  assert.equal(bob.partner?.name, "Alice", "der Partner sieht den eigenen Namen");
  assert.equal(bob.partner?.picture, replaced.profile.picture);
  await call("alice", { type: "profile", name: "", picture: null });
  const after = await data<Profiled>(api(request("bob"), store, now));
  assert.equal(after.partner?.picture, undefined, "entferntes Bild ist weg");
  assert.equal(after.partner?.name, "alice", "ohne eigenen Namen wieder der Anmeldename, nicht der alte");
  assert.equal((await api(request(null, undefined, replaced.profile.picture!), store, now)).status, 404);
});

test("Erneute Zustellung nach verlorener Antwort zählt eine Wischbewertung genau einmal", async () => {
  const { store, request, now } = setup();
  const saved = await data<ApiReply>(api(request("alice", { action: save }), store, now));
  const deck = saved.workspace.decks[0];
  const payload = { requestId: crypto.randomUUID(), clientId: crypto.randomUUID(), sequence: 1, at: now, action: { type: "sortCard", deckId: deck.id, cardId: deck.cards[0].id, direction: "front", known: true, sortId: crypto.randomUUID() } };
  const first = await data<ApiReply>(api(request("alice", payload), store, now));
  const again = await data<ApiReply>(api(request("alice", payload), store, now + 60_000));
  assert.equal(again.revision, first.revision);
  assert.deepEqual(again.workspace.reviews, first.workspace.reviews);
  assert.deepEqual(again.workspace.stats, first.workspace.stats);
  const bob = await api(request("bob", payload), store, now);
  assert.notEqual(bob.status, 200, "eine fremde Identität hat auch mit gleicher Anfrage ID keinen Zugriff");
});

test("Eine alte lokale Bewertung darf keine inzwischen bearbeitete Karte als gelernt markieren", async () => {
  const { store, request, now } = setup();
  const saved = await data<ApiReply>(api(request("alice", { action: save }), store, now));
  const deck = saved.workspace.decks[0]; const card = deck.cards[0];
  const content = deckDigest({ title: "", cards: [card] });
  await api(request("alice", { action: { ...save, deckId: deck.id, cards: [{ ...card, back: "Neue Antwort" }] } }), store, now + 1000);
  const response = await api(request("alice", { requestId: crypto.randomUUID(), clientId: crypto.randomUUID(), sequence: 1, at: now, content,
    action: { type: "sortCard", deckId: deck.id, cardId: card.id, direction: "front", known: true, sortId: crypto.randomUUID() } }), store, now + 2000);
  assert.equal(response.status, 409);
  assert.deepEqual((await store.read("alice")).workspace.reviews, {});
});

test("Auch nach tausenden weiteren Änderungen wird eine alte Anfrage nicht noch einmal angewendet", async () => {
  const { store, request, now } = setup();
  const saved = await data<ApiReply>(api(request("alice", { action: save }), store, now));
  const deck = saved.workspace.decks[0];
  const clientId = crypto.randomUUID();
  const action = { type: "star", deckId: deck.id, cardId: deck.cards[0].id, starred: true };
  const original = { requestId: crypto.randomUUID(), clientId, sequence: 1, action };
  await api(request("alice", original), store, now);
  for (let sequence = 2; sequence <= 2050; sequence++) await api(request("alice", { requestId: crypto.randomUUID(), clientId, sequence, action: { ...action, starred: false } }), store, now);
  const before = await store.read("alice");
  assert.equal((await api(request("alice", original), store, now)).status, 200);
  const after = await store.read("alice");
  assert.equal(after.workspace.decks[0].cards[0].starred, false);
  assert.equal(after.revision, before.revision);
});
