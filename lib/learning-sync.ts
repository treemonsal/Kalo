import { z } from "zod";
import { actionShape, type Action } from "./learning.ts";

type DurableType = "answer" | "rate" | "sortCard" | "undoSort" | "star" | "cardPass";
export type DurableAction = Extract<Action, { type: DurableType }>;
export function isDurableAction(action: { type: string }): action is DurableAction {
  return ["answer", "rate", "sortCard", "undoSort", "star", "cardPass"].includes(action.type);
}
const envelope = z.object({ id: z.string().uuid(), clientId: z.string().uuid(), sequence: z.number().int().positive().safe(), at: z.number().finite().nonnegative(), action: actionShape.refine(isDurableAction), content: z.string().max(20).optional() });
export type QueuedAction = { id: string; clientId: string; sequence: number; at: number; action: DurableAction; content?: string };
export type SyncState = { pending: number; phase: "idle" | "saving" | "waiting" | "blocked"; status?: number; error?: string };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Reply<T> = { status: number; result: T };

/** Save before sending. A missing reply is retried with the same identity, never as a new rating. */
export class DurableQueue<T extends { error?: string; revision?: number; retryable?: boolean }> {
  private items: QueuedAction[];
  private waiters = new Map<string, (result: T | null) => void>();
  private running = false;
  private stopped = false;
  private current: SyncState;
  private readonly key: string;
  private readonly fallbackClient = crypto.randomUUID();
  private readonly options: { owner: string; storage: Storage; send: (item: QueuedAction) => Promise<Reply<T>>; read?: () => Promise<T>;
    lock?: <R>(work: () => R) => Promise<R>; accept: (result: T) => void; changed: (state: SyncState) => void };

  constructor(options: DurableQueue<T>["options"]) {
    this.options = options;
    this.key = "kalo-outbox:" + options.owner;
    this.items = this.read();
    this.current = { pending: this.items.length, phase: this.items.length ? "waiting" : "idle" };
  }

  private read() {
    return this.journal().items;
  }

  private journal() {
    let raw: unknown;
    try { raw = JSON.parse(this.options.storage.getItem(this.key) ?? "null"); } catch { raw = null; }
    const parsed = z.object({ owner: z.literal(this.options.owner), clientId: z.string().uuid(), sequence: z.number().int().nonnegative().safe(), items: z.array(envelope).max(1024) }).safeParse(raw);
    return parsed.success ? parsed.data as { owner: string; clientId: string; sequence: number; items: QueuedAction[] }
      : { owner: this.options.owner, clientId: this.fallbackClient, sequence: 0, items: [] as QueuedAction[] };
  }

  private async locked<R>(work: () => R): Promise<R> {
    return this.options.lock ? this.options.lock(work) : work();
  }

  get state() { return this.current; }

  private notify(phase: SyncState["phase"], status?: number, error?: string) {
    this.current = { pending: this.items.length, phase, status, error };
    if (!this.stopped) this.options.changed(this.current);
  }

  private save(items: QueuedAction[], client?: { clientId: string; sequence: number }) {
    // A storage failure must not masquerade as a durable save.
    const current = client ?? this.journal();
    this.options.storage.setItem(this.key, JSON.stringify({ owner: this.options.owner, clientId: current.clientId, sequence: current.sequence, items }));
    this.items = items;
  }

  async submit(action: DurableAction, at = Date.now(), content?: string): Promise<T | null> {
    if (this.current.phase === "blocked") return Promise.reject(new Error("Prüfe zuerst die noch nicht abgeglichenen Änderungen."));
    let item!: QueuedAction;
    await this.locked(() => {
      const latest = this.journal();
      if (latest.items.length >= 1024) throw new Error("Verbinde Kalo mit dem Internet, um deine Bewertungen zu speichern.");
      item = { id: crypto.randomUUID(), clientId: latest.clientId, sequence: latest.sequence + 1, at, action, content };
      try { this.save([...latest.items, item], item); }
      catch { throw new Error("Dein Browser blockiert das lokale Speichern. Die Bewertung wurde nicht übernommen."); }
    });
    const reply = new Promise<T | null>(resolve => this.waiters.set(item.id, resolve));
    this.notify(this.running ? "saving" : "waiting");
    void this.retry();
    return reply;
  }

  async retry(manual = false) {
    if (this.stopped || this.running || this.current.phase === "blocked" && !manual) return;
    this.running = true;
    try {
      while (!this.stopped) {
        await this.locked(() => { this.items = this.read(); });
        if (!this.items.length) break;
        const item = this.items[0];
        this.notify("saving");
        let reply: Reply<T>;
        try { reply = await this.options.send(item); }
        catch { this.notify("waiting", 0); return; }
        if (this.stopped) return;
        if (reply.status < 200 || reply.status >= 300) {
          const temporary = reply.status >= 500 || reply.status === 429 || reply.status === 409 && reply.result.retryable === true;
          this.notify(temporary ? "waiting" : "blocked", reply.status, reply.result.error);
          return;
        }
        try { await this.locked(() => this.save(this.read().filter(pending => pending.id !== item.id))); }
        catch { this.notify("waiting", 0, "Dein Browser konnte den Speicherstand nicht aktualisieren."); return; }
        this.options.accept(reply.result);
        this.waiters.get(item.id)?.(reply.result);
        this.waiters.delete(item.id);
      }
      // Another tab may have delivered one of our requests. Read its actual server result.
      if (this.waiters.size && this.options.read && !this.stopped) {
        try {
          const latest = await this.options.read();
          if (this.stopped) return;
          this.options.accept(latest);
          for (const resolve of this.waiters.values()) resolve(latest);
          this.waiters.clear();
        } catch { this.notify("waiting", 0); return; }
      }
      this.notify("idle");
    } finally { this.running = false; }
  }

  async discard() {
    if (this.running) return;
    await this.locked(() => this.save([], { clientId: crypto.randomUUID(), sequence: 0 }));
    for (const resolve of this.waiters.values()) resolve(null);
    this.waiters.clear();
    this.notify("idle");
  }

  dispose() { this.stopped = true; this.waiters.clear(); }
}
