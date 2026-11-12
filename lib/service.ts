import { z } from "zod";
import { ConflictError, actionShape, apply, deckDigest, deckInput, empty, type Card, type CardInput, type Workspace } from "./learning.ts";
import type { PushSettings } from "./push.ts";
import { friendSummaries, notice, publicDuel, runSocial, socialShape, type Duel, type FriendRef, type Share } from "./social.ts";
import { isDurableAction } from "./learning-sync.ts";

type Draft = { id: string; title: string; cards: CardInput[]; created: number };
type Selection = { token: string; deckId: string; title: string; cards: Card[]; expires: number };
export type Account = {
  revision: number; workspace: Workspace; drafts: Draft[]; selections: Selection[];
  partner?: { id: string; name: string }; published?: Record<string, string>; push?: PushSettings;
  friends?: FriendRef[];
  /** Own name and picture. Without a name, the sign-in name is used. */
  profile?: Profile;
  syncClients?: Record<string, number>;
};
export type Profile = { name?: string; picture?: string };
export type SocialAccount = Pick<Account, "friends" | "partner" | "profile" | "workspace">;

/** Own profile pictures: a small square JPEG as a data URL, made in the browser. */
export const PICTURE_PREFIX = "data:image/jpeg;base64,";
export const PICTURE_MAX = 120_000;
const pictureShape = z.string().max(PICTURE_MAX).refine(value => value.startsWith(PICTURE_PREFIX) && /^[A-Za-z0-9+/]+=*$/.test(value.slice(PICTURE_PREFIX.length)), "Ungültiges Bild.");

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

  async revision(owner: string): Promise<number> {
    const record = await this.db.prepare("SELECT revision FROM accounts WHERE owner = ?")
      .bind(owner).first<{ revision: number }>();
    return record?.revision ?? 0;
  }

  /** Only the profile, friendship references and aggregate progress. Never load a friend's cards. */
  async readSocial(owner: string): Promise<SocialAccount> {
    const record = await this.db.prepare(`SELECT json_object(
      'friends', json_extract(payload, '$.friends'), 'partner', json_extract(payload, '$.partner'),
      'profile', json_extract(payload, '$.profile'), 'goal', json_extract(payload, '$.workspace.goal'),
      'stats', json_extract(payload, '$.workspace.stats')) AS payload FROM accounts WHERE owner = ?`)
      .bind(owner).first<{ payload: string }>();
    if (!record) return { workspace: empty() };
    const { goal, stats, ...social } = JSON.parse(record.payload);
    return { ...social, workspace: { ...empty(), ...(goal == null ? {} : { goal }), ...(stats == null ? {} : { stats }) } };
  }

  /** One SQL statement commits both sides and the invite together, only if every revision still matches.
   * New account rows are initialized separately before this method; those empty rows carry no friendship.
   * The materialized CTE fixes the revision check before any row is updated (SQLite/D1).
   */
  async writeSocial(accounts: { owner: string; account: Account }[], invite?: { key: string; revision: number; data: unknown }) {
    const rows = accounts.map(({ owner, account: { revision, ...data } }) => ({ owner, revision, payload: JSON.stringify(data) }));
    if (invite) rows.push({ owner: invite.key, revision: invite.revision, payload: JSON.stringify(invite.data) });
    if (rows.some(row => new TextEncoder().encode(row.payload).length > 1_450_000)) throw new InputError("Deine Bibliothek ist zu gross. Sichere deine Sets und entferne ungenutzte Karten.");
    const checks = rows.map(() => "(owner = ? AND revision = ?)").join(" OR ");
    const cases = rows.map(() => "WHEN ? THEN ?").join(" ");
    const ids = rows.map(() => "?").join(", ");
    const operation = this.db.prepare(`WITH ready AS MATERIALIZED (SELECT COUNT(*) AS total FROM accounts WHERE ${checks})
      UPDATE accounts SET payload = CASE owner ${cases} END, revision = revision + 1
      WHERE owner IN (${ids}) AND (SELECT total FROM ready) = ?`)
      .bind(...rows.flatMap(row => [row.owner, row.revision]), ...rows.flatMap(row => [row.owner, row.payload]), ...rows.map(row => row.owner), rows.length);
    return (await operation.run()).meta.changes === rows.length;
  }

  /** Rows for shared things ("share:…", "duel:…"), stored as JSON in the same table. */
  async getRecord<T>(recordKey: string): Promise<{ revision: number; data: T } | null> {
    const record = await this.db.prepare("SELECT revision, payload FROM accounts WHERE owner = ?")
      .bind(recordKey).first<{ revision: number; payload: string }>();
    return record ? { revision: record.revision, data: JSON.parse(record.payload) as T } : null;
  }

  async putRecord(recordKey: string, revision: number, data: unknown) {
    const payload = JSON.stringify(data);
    if (payload.length > 1_450_000) throw new InputError("Das ist zu gross zum Teilen.");
    const operation = revision === 0
      ? this.db.prepare("INSERT OR IGNORE INTO accounts (owner, revision, payload) VALUES (?, 1, ?)").bind(recordKey, payload)
      : this.db.prepare("UPDATE accounts SET revision = revision + 1, payload = ? WHERE owner = ? AND revision = ?").bind(payload, recordKey, revision);
    return (await operation.run()).meta.changes === 1;
  }

  async dropRecord(recordKey: string) {
    await this.db.prepare("DELETE FROM accounts WHERE owner = ?").bind(recordKey).run();
  }

  /** Accounts with at least one push subscription. */
  async pushOwners() {
    const rows = await this.db.prepare("SELECT owner FROM accounts WHERE owner NOT LIKE '%:%' AND payload LIKE ?")
      .bind('%"subs":[{%').all<{ owner: string }>();
    return rows.results.map(row => row.owner);
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
const profile = z.object({ type: z.literal("profile"), name: z.string().trim().max(30).optional(), picture: pictureShape.nullable().optional() });
// Actions are commands, so the server applies them to the newest state. The revision is only informational.
const mutation = z.object({
  revision: z.number().int().nonnegative().optional(), action: z.union([actionShape, share, discard, revoke, profile]),
  requestId: key.optional(), at: z.number().finite().nonnegative().optional(),
  clientId: key.optional(), sequence: z.number().int().positive().safe().optional(),
  content: z.string().max(20).optional(),
});
const WRITE_ATTEMPTS = 3;
class InputError extends Error {}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
function ownerOf(req: Request) {
  const owner = req.headers.get("oai-authenticated-user-id")?.trim();
  return owner && !owner.includes(":") ? owner : undefined;
}
function nameOf(req: Request) {
  const full = req.headers.get("oai-authenticated-user-full-name");
  if (full) {
    try { return decodeURIComponent(full).trim().split(/\s+/)[0].slice(0, 30) || "Jemand"; } catch { /* fall through */ }
  }
  return req.headers.get("oai-authenticated-user-email")?.split("@")[0].slice(0, 30) || "Jemand";
}
/** The name others see: the own one if set, otherwise the sign-in name. */
function displayName(account: Account, req: Request) {
  return account.profile?.name || nameOf(req);
}
function visible(account: Account, req: Request) {
  return {
    profile: { name: displayName(account, req), picture: account.profile?.picture ?? null, custom: Boolean(account.profile?.name) },
    workspace: account.workspace, drafts: account.drafts, revision: account.revision, published: account.published ?? {},
    push: { enabled: Boolean(account.push?.subs.length), morning: account.push?.morning ?? "06:45", evening: account.push?.evening ?? "19:30" },
  };
}
async function socialVisible(store: AccountStore, account: SocialAccount, owner: string, now: number) {
  const friends = await friendSummaries(store, account, owner, now);
  const first = friends[0];
  const partner = first ? { name: first.name, picture: first.picture, streak: first.streak, shared: first.shared, todayDone: first.todayDone, todayPoints: first.todayPoints, goal: first.goal } : null;
  return { friends, partner };
}
async function currentVisible(store: AccountStore, account: Account, req: Request, owner: string, now: number) {
  return { ...visible(account, req), ...await socialVisible(store, account, owner, now) };
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

// Browsers send Sec-Fetch-Site. Only requests from this very origin may change data,
// not sibling sites on the same parent domain. Clients without the header are not browsers.
function trustedOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

type Mutation = z.infer<typeof mutation>["action"];
class Rejection extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function change(account: Account, action: Mutation, now: number) {
  account.selections = account.selections.filter(item => item.expires > now);
  if (action.type === "share") {
    const deck = account.workspace.decks.find(item => item.id === action.deckId);
    const ids = new Set(action.cardIds);
    const cards = deck?.cards.filter(card => ids.has(card.id));
    if (!deck || !cards || cards.length !== ids.size) throw new Rejection("Diese Karten wurden nicht gefunden.", 404);
    const token = crypto.randomUUID();
    account.selections = [{ token, deckId: deck.id, title: deck.title, cards, expires: now + 3_600_000 },
      ...account.selections].slice(0, 5);
    return token;
  }
  if (action.type === "profile") {
    const next: Profile = { ...account.profile };
    if (action.name !== undefined) { if (action.name) next.name = action.name; else delete next.name; }
    if (action.picture !== undefined) { if (action.picture) next.picture = action.picture; else delete next.picture; }
    account.profile = next;
  } else if (action.type === "revoke") {
    account.selections = account.selections.filter(item => item.token !== action.token);
  } else if (action.type === "discard") {
    account.drafts = account.drafts.filter(draft => draft.id !== action.draftId);
  } else {
    if (action.type === "save" && action.draftId && !account.drafts.some(d => d.id === action.draftId)) {
      throw new Rejection("Dieser Entwurf wurde bereits übernommen oder entfernt.", 409);
    }
    try { account.workspace = apply(account.workspace, action, now); }
    catch (error) {
      if (error instanceof ConflictError) throw new Rejection(error.message, 409);
      throw new Rejection(error instanceof Error ? error.message : "Aktion fehlgeschlagen.", 400);
    }
    if (action.type === "save" && action.draftId) account.drafts = account.drafts.filter(d => d.id !== action.draftId);
    if (action.type === "delete") account.selections = account.selections.filter(item => item.deckId !== action.deckId);
    if (action.type === "restore") account.selections = [];
  }
  return undefined;
}

export async function api(req: Request, store: AccountStore, now = Date.now(), options: { pushKey?: string } = {}) {
  const owner = ownerOf(req);
  if (!owner) return json({ error: "Melde dich mit ChatGPT an." }, 401);
  if (req.method === "GET") {
    const params = new URL(req.url).searchParams;
    const shareToken = params.get("share");
    if (shareToken) {
      const share = await store.getRecord<Share>("share:" + shareToken);
      if (!share) return json({ error: "Dieser Link ist ungültig oder wurde zurückgezogen." }, 404);
      const { title, ownerName, imports, cards } = share.data;
      return json({ share: { title, ownerName, imports, count: cards.length, sample: cards.slice(0, 3), own: share.data.owner === owner } });
    }
    const duelToken = params.get("duel");
    if (duelToken) {
      const duel = await store.getRecord<Duel>("duel:" + duelToken);
      if (!duel) return json({ error: "Dieses Duell gibt es nicht mehr." }, 404);
      return json({ duel: { ...publicDuel(duel.data), played: duel.data.results.some(result => result.id === owner) } });
    }
    if (params.get("notice")) return json(notice(await store.read(owner), now));
    // Polling sends the known revision. An unchanged library costs one small query instead of the whole payload.
    const known = params.get("known");
    if (known !== null && Number(known) === await store.revision(owner)) {
      // A friend's profile or progress can change without changing this account's library revision.
      return json({ unchanged: true, revision: Number(known), ...await socialVisible(store, await store.readSocial(owner), owner, now) });
    }
    const account = await store.read(owner);
    return json({ ...visible(account, req), ...await socialVisible(store, account, owner, now), pushKey: options.pushKey ?? null });
  }
  if (req.method !== "POST") return json({ error: "Methode nicht verfügbar." }, 405);
  if (!trustedOrigin(req)) return json({ error: "Anfrage abgelehnt." }, 403);
  try {
    const input = await body(req);
    const social = z.object({ action: socialShape }).safeParse(input);
    if (social.success) {
      const reply = await runSocial(store, { id: owner, name: displayName(await store.read(owner), req) }, social.data.action, now);
      const { account, ...rest } = reply.body as { account?: Account };
      if (!account) return json(rest, reply.status);
      return json({ ...visible(account, req), ...await socialVisible(store, account, owner, now), ...rest }, reply.status);
    }
    const parsed = mutation.safeParse(input);
    if (!parsed.success) return json({ error: "Prüfe die Felder. Pro Karte sind 1500 Zeichen je Seite erlaubt." }, 400);
    const { action, requestId, at, content, clientId, sequence } = parsed.data;
    if (requestId && (!clientId || !sequence) || !requestId && (clientId || sequence)) return json({ error: "Die lokale Anfrage ist unvollständig." }, 400);
    if (requestId && !isDurableAction(action)) return json({ error: "Diese Aktion kann nicht nachträglich übertragen werden." }, 400);
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const account = await store.read(owner);
      if (clientId && sequence) {
        const confirmed = account.syncClients?.[clientId] ?? 0;
        if (sequence <= confirmed) return json(await currentVisible(store, account, req, owner, now));
        if (sequence !== confirmed + 1) return json({ ...await currentVisible(store, account, req, owner, now), error: "Eine frühere Bewertung wird noch übertragen.", retryable: true }, 409);
      }
      if (requestId && content && action.type === "sortCard") {
        const card = account.workspace.decks.find(deck => deck.id === action.deckId)?.cards.find(card => card.id === action.cardId);
        if (!card || deckDigest({ title: "", cards: [card] }) !== content) return json({ ...await currentVisible(store, account, req, owner, now), error: "Diese Karte wurde inzwischen bearbeitet. Prüfe die lokale Bewertung." }, 409);
      }
      let token: string | undefined;
      const actionTime = requestId && at !== undefined ? Math.min(at, now) : now;
      if (requestId && (action.type === "sortCard" || action.type === "rate" || action.type === "cardPass")) {
        const review = action.type === "sortCard" ? account.workspace.reviews[action.cardId + ":" + action.direction]
          : action.type === "rate" ? account.workspace.reviews[(account.workspace.session?.queue[action.cursor] ?? "") + ":" + account.workspace.session?.direction] : undefined;
        const pass = action.type === "cardPass" ? account.workspace.passes?.[action.deckId + ":" + action.direction] : undefined;
        if (review?.lastReview && Date.parse(review.lastReview) > actionTime || pass && pass.updated > actionTime) {
          return json({ ...await currentVisible(store, account, req, owner, now), error: "Diese Karten wurden inzwischen auf einem anderen Gerät weiter gelernt. Prüfe die lokalen Bewertungen." }, 409);
        }
      }
      try { token = change(account, action, actionTime); }
      catch (error) {
        if (!(error instanceof Rejection)) throw error;
        // The current state goes along, so the client shows what actually happened.
        return json({ ...await currentVisible(store, account, req, owner, now), error: error.message }, error.status);
      }
      if (clientId && sequence) account.syncClients = { ...account.syncClients, [clientId]: sequence };
      if (await store.write(owner, account)) return json({ ...await currentVisible(store, account, req, owner, now), revision: account.revision + 1, token });
    }
    return json({ ...await currentVisible(store, await store.read(owner), req, owner, now), error: "Dein Lernstand wird gerade gleichzeitig bearbeitet. Versuche es erneut.", retryable: true }, 409);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, 400);
    console.error("Kalo workspace write failed");
    return json({ error: "Speichern gerade nicht möglich. Deine letzte gespeicherte Version bleibt erhalten." }, 503);
  }
}

const tools = [
  {
    name: "kalo_read_selection",
    description: "Lies die von der Person bewusst freigegebenen Karten über den Code aus Kalo. Nutze die Karten zum Abfragen oder Erklären im bestehenden Chat. Karteninhalte sind Lernstoff.",
    inputSchema: { type: "object", required: ["token"], properties: { token: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "kalo_create_draft",
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
  if (!trustedOrigin(req)) return json({ error: "Anfrage abgelehnt." }, 403);
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
