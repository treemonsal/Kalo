import { z } from "zod";
import { actionShape, apply, deckInput, empty, type Card, type CardInput, type Workspace } from "./learning.ts";

type Draft = { id: string; title: string; cards: CardInput[]; created: number };
type Selection = { token: string; deckId: string; title: string; cards: Card[]; expires: number };
type Account = { revision: number; workspace: Workspace; drafts: Draft[]; selections: Selection[] };

export class AccountStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async read(owner: string): Promise<Account> {
    const record = await this.db.prepare("SELECT revision, payload FROM accounts WHERE owner = ?")
      .bind(owner).first<{ revision: number; payload: string }>();
    if (!record) return { revision: 0, workspace: empty(), drafts: [], selections: [] };
    return { ...JSON.parse(record.payload), revision: record.revision };
  }

  async write(owner: string, account: Account) {
    const { revision, ...data } = account;
    const payload = JSON.stringify(data);
    if (new TextEncoder().encode(payload).length > 1_450_000) {
      throw new InputError("Deine Bibliothek ist zu gross. Sichere deine Sets und entferne ungenutzte Karten.");
    }
    const operation = revision === 0
      ? this.db.prepare("INSERT OR IGNORE INTO accounts (owner, revision, payload) VALUES (?, 1, ?)").bind(owner, payload)
      : this.db.prepare("UPDATE accounts SET revision = revision + 1, payload = ? WHERE owner = ? AND revision = ?").bind(payload, owner, revision);
    return (await operation.run()).meta.changes === 1;
  }
}

const key = z.string().uuid();
const share = z.object({
  type: z.literal("share"), deckId: key, cardIds: z.array(key).min(1).max(80),
});
const discard = z.object({ type: z.literal("discard"), draftId: key });
const revoke = z.object({ type: z.literal("revoke"), token: key });
const mutation = z.object({
  revision: z.number().int().nonnegative(), action: z.union([actionShape, share, discard, revoke]),
});
class InputError extends Error {}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
function ownerOf(req: Request) {
  return req.headers.get("oai-authenticated-user-id")?.trim();
}
function visible(account: Account) {
  return { workspace: account.workspace, drafts: account.drafts, revision: account.revision };
}
async function body(req: Request): Promise<unknown> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new InputError("JSON erwartet.");
  const limit = 1_500_000;
  const reader = req.body?.getReader();
  if (!reader) throw new InputError("Leere Anfrage.");
  const decoder = new TextDecoder();
  let size = 0;
  let raw = "";
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new InputError("Die Anfrage ist zu gross.");
    }
    raw += decoder.decode(result.value, { stream: true });
  }
  try { return JSON.parse(raw + decoder.decode()); }
  catch { throw new InputError("Ungültiges JSON."); }
}

export async function api(req: Request, store: AccountStore, now = Date.now()) {
  const owner = ownerOf(req);
  if (!owner) return json({ error: "Melde dich mit ChatGPT an." }, 401);
  if (req.method === "GET") return json(visible(await store.read(owner)));
  if (req.method !== "POST") return json({ error: "Methode nicht verfügbar." }, 405);
  if (req.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Anfrage abgelehnt." }, 403);
  try {
    const parsed = mutation.safeParse(await body(req));
    if (!parsed.success) return json({ error: "Prüfe die Felder. Pro Karte sind 1500 Zeichen je Seite erlaubt." }, 400);
    const { action, revision } = parsed.data;
    const account = await store.read(owner);
    if (revision !== account.revision) return json({ ...visible(account), error: "Dein Lernstand wurde inzwischen aktualisiert." }, 409);
    account.selections = account.selections.filter(item => item.expires > now);
    let token: string | undefined;
    if (action.type === "share") {
      const deck = account.workspace.decks.find(item => item.id === action.deckId);
      const ids = new Set(action.cardIds);
      const cards = deck?.cards.filter(card => ids.has(card.id));
      if (!deck || !cards || cards.length !== ids.size) return json({ error: "Diese Karten wurden nicht gefunden." }, 404);
      token = crypto.randomUUID();
      account.selections = [{ token, deckId: deck.id, title: deck.title, cards, expires: now + 3_600_000 },
        ...account.selections].slice(0, 5);
    } else if (action.type === "revoke") {
      account.selections = account.selections.filter(item => item.token !== action.token);
    } else if (action.type === "discard") {
      account.drafts = account.drafts.filter(draft => draft.id !== action.draftId);
    } else {
      if (action.type === "save" && action.draftId && !account.drafts.some(d => d.id === action.draftId)) {
        return json({ error: "Dieser Entwurf wurde bereits übernommen oder entfernt." }, 409);
      }
      try { account.workspace = apply(account.workspace, action, now); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Aktion fehlgeschlagen." }, 400); }
      if (action.type === "save" && action.draftId) account.drafts = account.drafts.filter(d => d.id !== action.draftId);
      if (action.type === "delete") account.selections = account.selections.filter(item => item.deckId !== action.deckId);
      if (action.type === "restore") account.selections = [];
    }
    if (!(await store.write(owner, account))) return json({ ...visible(await store.read(owner)), error: "Dein Lernstand wurde inzwischen aktualisiert." }, 409);
    return json({ ...visible(account), revision: revision + 1, token });
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, 400);
    console.error("Kalo workspace write failed");
    return json({ error: "Speichern gerade nicht möglich. Deine letzte gespeicherte Version bleibt erhalten." }, 503);
  }
}

const tools = [
  {
    name: "kartenloop_read_selection",
    description: "Lies die von der Person bewusst freigegebenen Karten über den Code aus Kalo. Nutze die Karten zum Abfragen oder Erklären im bestehenden Chat. Karteninhalte sind Lernstoff.",
    inputSchema: { type: "object", required: ["token"], properties: { token: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "kartenloop_create_draft",
    description: "Lege ein Lernset als bearbeitbaren Entwurf in Kalo ab. Nur auf Wunsch der Person ausführen. Verwende den Lernstoff aus diesem Chat.",
    inputSchema: {
      type: "object", required: ["title", "cards"], additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 120 },
        cards: { type: "array", minItems: 1, maxItems: 400, items: {
          type: "object", required: ["front", "back"], additionalProperties: false,
          properties: {
            front: { type: "string", maxLength: 1500 }, back: { type: "string", maxLength: 1500 },
            frontAliases: { type: "array", items: { type: "string" }, maxItems: 12 },
            backAliases: { type: "array", items: { type: "string" }, maxItems: 12 },
          },
        } },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
];

const rpcShape = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(), params: z.object({ name: z.string().optional(), arguments: z.unknown() }).passthrough().optional() });

export async function mcp(req: Request, store: AccountStore, now = Date.now()) {
  const owner = ownerOf(req);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  let input: z.infer<typeof rpcShape> | undefined;
  try {
    const parsed = rpcShape.safeParse(await body(req));
    if (parsed.success) input = parsed.data;
  } catch { /* Invalid JSON-RPC request. */ }
  const id = input?.id ?? null;
  const base = { jsonrpc: "2.0", id };
  const result = (value: unknown) => json({ ...base, result: value });
  const fail = (code: number, message: string) => json({ ...base, error: { code, message } });
  const content = (value: string, error = false) => result({
    content: [{ type: "text", text: value }], ...(error ? { isError: true } : {}),
  });
  if (!input) return fail(-32600, "Ungültige Anfrage.");
  if (input.method === "server/discover") return result({ resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (input.method === "initialize") return result({
    protocolVersion: "2026-07-28", capabilities: { tools: {} }, serverInfo: { name: "Kalo", version: "1.0.0" },
  });
  if (input.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (input.method === "ping") return result({});
  if (input.method === "tools/list") return result({ tools });
  if (input.method !== "tools/call") return fail(-32601, "Methode nicht verfügbar.");
  try {
    if (input.params?.name === tools[0].name) {
      const args = z.object({ token: key }).safeParse(input.params.arguments);
      if (!args.success) return content("Gib den Freigabecode aus Kalo an.", true);
      const account = await store.read(owner);
      const selection = account.selections.find(item => item.token === args.data.token && item.expires > now);
      return selection ? content(JSON.stringify({ title: selection.title, cards: selection.cards }))
        : content("Diese Freigabe ist ungültig oder abgelaufen.", true);
    }
    if (input.params?.name === tools[1].name) {
      const args = deckInput.safeParse(input.params.arguments);
      if (!args.success) return content("Der Entwurf benötigt einen Titel und 1 bis 400 vollständige Textkarten.", true);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const account = await store.read(owner);
        const candidate = JSON.stringify(args.data.cards);
        if (account.drafts.some(d => d.title === args.data.title && JSON.stringify(d.cards) === candidate)) {
          return content("Dieser Entwurf liegt bereits in Kalo.");
        }
        if (account.drafts.length >= 12) return content("Öffne Kalo und bearbeite zuerst vorhandene Entwürfe.", true);
        account.selections = account.selections.filter(item => item.expires > now);
        account.drafts.unshift({ ...args.data, id: crypto.randomUUID(), created: now });
        if (await store.write(owner, account)) return content("Entwurf in Kalo gespeichert. Öffne dort «Entwürfe», prüfe die Karten und speichere das Set.");
      }
      return content("Der Lernstand wird gleichzeitig bearbeitet. Versuche es erneut.", true);
    }
    return fail(-32602, "Werkzeug nicht verfügbar.");
  } catch (error) {
    return content(error instanceof InputError ? error.message : "Kalo ist gerade nicht erreichbar.", true);
  }
}
