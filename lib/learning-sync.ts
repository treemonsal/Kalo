import { z } from "zod";
import { actionShape, apply, type Action, type Shuffle, type Workspace } from "./learning.ts";

type DurableType = "answer" | "rate" | "sortCard" | "undoSort" | "star" | "cardPass";
export type DurableAction = Extract<Action, { type: DurableType }>;
export function isDurableAction(action: { type: string }): action is DurableAction {
  return ["answer", "rate", "sortCard", "undoSort", "star", "cardPass"].includes(action.type);
}

/** Replaying the same saved request uses the same round order on the device and server. */
export function actionShuffle(identity: string): Shuffle {
  let seed = 2166136261;
  for (const letter of identity) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619);
  return <T>(input: T[]) => {
    const items = [...input];
    for (let i = items.length - 1; i > 0; i--) {
      seed = Math.imul(seed, 1664525) + 1013904223 | 0;
      const j = Math.floor((seed >>> 0) / 4294967296 * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
}
const envelope = z.object({ id: z.string().uuid(), clientId: z.string().uuid(), sequence: z.number().int().positive().safe(), at: z.number().finite().nonnegative(), action: actionShape.refine(isDurableAction), content: z.string().max(20).optional() });
export type QueuedAction = { id: string; clientId: string; sequence: number; at: number; action: DurableAction; content?: string };
export type SyncState = { pending: number; phase: "idle" | "saving" | "waiting" | "blocked"; status?: number; error?: string };

/** Rebase outstanding local work over the newest confirmed state, never over an old reply. */
export class WorkspaceProjection {
  private base?: Workspace;
  private ids: string[] = [];
  private value?: Workspace;

  project(base: Workspace, items: readonly QueuedAction[], confirmed: Record<string, number> = {}) {
    const pending = items.filter(item => item.sequence > (confirmed[item.clientId] ?? 0));
    const append = this.base === base && this.ids.length <= pending.length && this.ids.every((id, i) => id === pending[i].id);
    let value = append ? this.value! : base;
    const ids = append ? [...this.ids] : [];
    for (const item of pending.slice(ids.length)) {
      try { value = apply(value, item.action, item.at, actionShuffle(item.id)); ids.push(item.id); }
      catch { break; } // A conflicting action stays in the journal for review; later work never jumps over it.
    }
    this.base = base; this.ids = ids; this.value = value;
    return value;
  }
}
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Reply<T> = { status: number; result: T };

/** Save before sending. A missing reply is retried with the same identity, never as a new rating. */
export class DurableQueue<T extends { error?: string; revision?: number; retryable?: boolean }> {
  private items: QueuedAction[];
  private waiters = new Map<string, (result: T | null) => void>();
  private running = false;
  private flight?: Promise<void>;
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
  get pendingActions() { return this.read(); }

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

  private async append(action: DurableAction, at: number, content?: string) {
    if (this.current.phase === "blocked") return Promise.reject(new Error("Prüfe zuerst die noch nicht abgeglichenen Änderungen."));
    let item!: QueuedAction;
    await this.locked(() => {
      const latest = this.journal();
      if (latest.items.length >= 1024) throw new Error("Verbinde Kalo mit dem Internet, um deine Bewertungen zu speichern.");
      item = { id: crypto.randomUUID(), clientId: latest.clientId, sequence: latest.sequence + 1, at, action, content };
      try { this.save([...latest.items, item], item); }
      catch { throw new Error("Dein Browser blockiert das lokale Speichern. Die Bewertung wurde nicht übernommen."); }
    });
    this.notify(this.running ? "saving" : "waiting");
    return item;
  }

  /** Resolves as soon as the action is durably saved, without waiting for the network. */
  async enqueue(action: DurableAction, at = Date.now(), content?: string) {
    const item = await this.append(action, at, content);
    void this.retry();
    return item;
  }

  async submit(action: DurableAction, at = Date.now(), content?: string): Promise<T | null> {
    const item = await this.append(action, at, content);
    const reply = new Promise<T | null>(resolve => this.waiters.set(item.id, resolve));
    void this.retry();
    return reply;
  }

  retry(manual = false): Promise<void> {
    if (this.flight) return this.flight;
    if (this.stopped || this.current.phase === "blocked" && !manual) return Promise.resolve();
    this.flight = this.drain().finally(() => {
      this.flight = undefined;
      // Catch an append at the instant the preceding drain finished, without looping on network failures.
      if (!this.stopped && this.current.phase !== "blocked" && this.current.status === undefined && this.read().length) {
        queueMicrotask(() => void this.retry());
      }
    });
    return this.flight;
  }

  private async drain() {
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
          if ("workspace" in reply.result) this.options.accept(reply.result);
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
