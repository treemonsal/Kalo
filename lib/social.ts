import { z } from "zod";
import { apply, choices, dayOf, dueCards, shuffle, type CardInput } from "./learning.ts";
import { dayStats, goalOf, sharedStreak, streak } from "./progress.ts";
import type { Account, AccountStore } from "./service.ts";

/**
 * Sharing between people. Shared sets, partner invites and duels live in their own rows of the accounts
 * table under prefixed keys ("share:", "partner:", "duel:"), so no schema migration is needed.
 * Real owner ids come from the platform and never contain a colon.
 */
const key = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const socialShape = z.discriminatedUnion("type", [
  z.object({ type: z.literal("publish"), deckId: key }),
  z.object({ type: z.literal("importShare"), token: key }),
  z.object({ type: z.literal("invitePartner") }),
  z.object({ type: z.literal("acceptPartner"), token: key }),
  z.object({ type: z.literal("leavePartner") }),
  z.object({ type: z.literal("createDuel"), deckId: key }),
  z.object({ type: z.literal("duelResult"), token: key, answers: z.array(z.string().max(1500)).max(10), ms: z.number().int().min(0).max(3_600_000) }),
  z.object({ type: z.literal("pushSubscribe"), morning: time, evening: time,
    subscription: z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }) }),
  z.object({ type: z.literal("pushTimes"), morning: time, evening: time }),
  z.object({ type: z.literal("pushUnsubscribe"), endpoint: z.string().max(1000).optional() }),
]);
export type SocialAction = z.infer<typeof socialShape>;

export type Share = { owner: string; ownerName: string; title: string; cards: CardInput[]; imports: number; created: number };
export type Invite = { owner: string; ownerName: string; expires: number };
export type DuelQuestion = { prompt: string; options: string[]; answer: string };
export type DuelResult = { id: string; name: string; correct: number; ms: number; at: number };
export type Duel = { owner: string; ownerName: string; title: string; questions: DuelQuestion[]; results: DuelResult[]; created: number };
export type Me = { id: string; name: string };
export type SocialReply = { status: number; body: Record<string, unknown> };

const ATTEMPTS = 3;
const INVITE_DAYS = 7;
export const DUEL_SIZE = 10;

class Refusal extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** Reads, changes and writes one account with optimistic retries. */
async function updateAccount(store: AccountStore, owner: string, change: (account: Account) => void) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const account = await store.read(owner);
    change(account);
    if (await store.write(owner, account)) return { ...account, revision: account.revision + 1 };
  }
  throw new Refusal("Gerade wird gleichzeitig gespeichert. Versuche es erneut.", 409);
}

async function updateRecord<T>(store: AccountStore, recordKey: string, change: (data: T) => T) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const record = await store.getRecord<T>(recordKey);
    if (!record) throw new Refusal("Dieser Link ist ungültig oder abgelaufen.", 404);
    const next = change(record.data);
    if (await store.putRecord(recordKey, record.revision, next)) return next;
  }
  throw new Refusal("Gerade wird gleichzeitig gespeichert. Versuche es erneut.", 409);
}

/** What the people in a duel see: the questions and everyone's result. */
export function publicDuel(duel: Duel) {
  return { title: duel.title, ownerName: duel.ownerName, questions: duel.questions, results: [...duel.results].sort((a, b) => b.correct - a.correct || a.ms - b.ms) };
}

export async function runSocial(store: AccountStore, me: Me, action: SocialAction, now: number): Promise<SocialReply> {
  try {
    if (action.type === "publish") {
      const mine = await store.read(me.id);
      const deck = mine.workspace.decks.find(item => item.id === action.deckId);
      if (!deck) throw new Refusal("Dieses Set wurde nicht gefunden.", 404);
      const token = mine.published?.[deck.id] ?? crypto.randomUUID();
      const cards = deck.cards.map(({ front, back, frontAliases, backAliases }) => ({ front, back, frontAliases, backAliases }));
      const existing = await store.getRecord<Share>("share:" + token);
      const share: Share = { owner: me.id, ownerName: me.name, title: deck.title, cards, imports: existing?.data.imports ?? 0, created: existing?.data.created ?? now };
      if (!await store.putRecord("share:" + token, existing?.revision ?? 0, share)) throw new Refusal("Gerade wird gleichzeitig gespeichert. Versuche es erneut.", 409);
      await updateAccount(store, me.id, account => { account.published = { ...account.published, [deck.id]: token }; });
      return { status: 200, body: { token, imports: share.imports } };
    }
    if (action.type === "importShare") {
      const record = await store.getRecord<Share>("share:" + action.token);
      if (!record) throw new Refusal("Dieser Link ist ungültig oder wurde zurückgezogen.", 404);
      const share = record.data;
      let deckId = "";
      const account = await updateAccount(store, me.id, current => {
        if (current.workspace.decks.length >= 80) throw new Refusal("Du hast bereits 80 Sets.");
        current.workspace = apply(current.workspace, { type: "save", title: share.title, cards: share.cards }, now);
        deckId = current.workspace.decks[0].id;
      });
      if (share.owner !== me.id) await updateRecord<Share>(store, "share:" + action.token, data => ({ ...data, imports: data.imports + 1 })).catch(() => undefined);
      return { status: 200, body: { account, deckId } };
    }
    if (action.type === "invitePartner") {
      const token = crypto.randomUUID();
      await store.putRecord("partner:" + token, 0, { owner: me.id, ownerName: me.name, expires: now + INVITE_DAYS * 86_400_000 } satisfies Invite);
      return { status: 200, body: { token } };
    }
    if (action.type === "acceptPartner") {
      const record = await store.getRecord<Invite>("partner:" + action.token);
      if (!record || record.data.expires < now) throw new Refusal("Diese Einladung ist ungültig oder abgelaufen.", 404);
      const invite = record.data;
      if (invite.owner === me.id) throw new Refusal("Das ist deine eigene Einladung. Schick den Link deinem Lernpartner.");
      const mine = await store.read(me.id);
      if (mine.partner && mine.partner.id !== invite.owner) throw new Refusal("Du hast schon einen Lernpartner. Beende die Partnerschaft zuerst in den Einstellungen.", 409);
      const theirs = await store.read(invite.owner);
      if (theirs.partner && theirs.partner.id !== me.id) throw new Refusal(invite.ownerName + " hat inzwischen einen anderen Lernpartner.", 409);
      await updateAccount(store, invite.owner, account => { account.partner = { id: me.id, name: me.name }; });
      const account = await updateAccount(store, me.id, account => { account.partner = { id: invite.owner, name: invite.ownerName }; });
      await store.dropRecord("partner:" + action.token);
      return { status: 200, body: { account } };
    }
    if (action.type === "leavePartner") {
      const mine = await store.read(me.id);
      const partner = mine.partner;
      if (partner) await updateAccount(store, partner.id, account => { if (account.partner?.id === me.id) delete account.partner; });
      const account = await updateAccount(store, me.id, current => { delete current.partner; });
      return { status: 200, body: { account } };
    }
    if (action.type === "createDuel") {
      const mine = await store.read(me.id);
      const deck = mine.workspace.decks.find(item => item.id === action.deckId);
      if (!deck) throw new Refusal("Dieses Set wurde nicht gefunden.", 404);
      const token = crypto.randomUUID();
      const questions = shuffle(deck.cards)
        .map(card => ({ prompt: card.front, options: choices(deck, card, "front", token), answer: card.back }))
        .filter(item => item.options.length === 4).slice(0, DUEL_SIZE);
      if (questions.length < 5) throw new Refusal("Für ein Duell braucht das Set mindestens fünf Karten mit unterschiedlichen, kurzen Antworten.");
      await store.putRecord("duel:" + token, 0, { owner: me.id, ownerName: me.name, title: deck.title, questions, results: [], created: now } satisfies Duel);
      return { status: 200, body: { token } };
    }
    if (action.type === "duelResult") {
      const duel = await updateRecord<Duel>(store, "duel:" + action.token, data => {
        if (data.results.some(result => result.id === me.id) || data.results.length >= 30) return data;
        const correct = data.questions.filter((question, i) => action.answers[i] === question.answer).length;
        return { ...data, results: [...data.results, { id: me.id, name: me.name, correct, ms: action.ms, at: now }] };
      });
      return { status: 200, body: { duel: publicDuel(duel) } };
    }
    if (action.type === "pushSubscribe") {
      const account = await updateAccount(store, me.id, current => {
        const subs = (current.push?.subs ?? []).filter(item => item.endpoint !== action.subscription.endpoint);
        current.push = { subs: [action.subscription, ...subs].slice(0, 5), morning: action.morning, evening: action.evening, sent: current.push?.sent ?? {} };
      });
      return { status: 200, body: { account } };
    }
    if (action.type === "pushTimes") {
      const account = await updateAccount(store, me.id, current => {
        current.push = { subs: current.push?.subs ?? [], sent: current.push?.sent ?? {}, morning: action.morning, evening: action.evening };
      });
      return { status: 200, body: { account } };
    }
    const account = await updateAccount(store, me.id, current => {
      if (!current.push) return;
      current.push.subs = action.endpoint ? current.push.subs.filter(item => item.endpoint !== action.endpoint) : [];
    });
    return { status: 200, body: { account } };
  } catch (error) {
    if (error instanceof Refusal) return { status: error.status, body: { error: error.message } };
    throw error;
  }
}

export type PartnerSummary = { name: string; streak: number; shared: number; todayDone: boolean; todayPoints: number; goal: number };

export async function partnerSummary(store: AccountStore, account: Account, myId: string, now: number): Promise<PartnerSummary | null> {
  if (!account.partner) return null;
  const theirs = await store.read(account.partner.id);
  if (theirs.partner?.id !== myId) return null;
  const today = dayStats(theirs.workspace, dayOf(now));
  const own = streak(theirs.workspace, now);
  return {
    name: account.partner.name, streak: own.days, shared: sharedStreak(account.workspace, theirs.workspace, now).days,
    todayDone: own.todayDone, todayPoints: today.points, goal: goalOf(theirs.workspace),
  };
}

export function dueTotal(account: Account, now: number) {
  const workspace = account.workspace;
  return workspace.decks.reduce((total, deck) => total + dueCards(workspace, deck.cards, "front", now).length + dueCards(workspace, deck.cards, "back", now).length, 0);
}

const hour = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", hourCycle: "h23" });

/** The text of a reminder, fetched by the service worker when a push arrives. The streak warning only comes late in the day. */
export function notice(account: Account, now: number) {
  const due = dueTotal(account, now);
  const current = streak(account.workspace, now);
  if (current.atRisk && Number(hour.format(now)) >= 16) return { title: "Deine Serie von " + current.days + (current.days === 1 ? " Tag" : " Tagen") + " endet heute", body: "Ein paar Karten reichen, um sie zu halten." };
  if (due) return { title: due + (due === 1 ? " Karte ist fällig" : " Karten sind fällig"), body: "Das sind etwa " + Math.max(1, Math.round(due * 0.3)) + " Minuten." };
  return { title: "Kalo", body: "Zeit für eine kurze Lerneinheit." };
}
