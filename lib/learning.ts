import { DefaultScheduler, type Grade } from "ts-fsrs";
import { z } from "zod";

const side = z.string().trim().min(1).max(1500);
const key = z.string().uuid();
export const cardInput = z.object({
  front: side, back: side,
  frontAliases: z.array(side).max(12).default([]),
  backAliases: z.array(side).max(12).default([]),
  starred: z.boolean().default(false),
});
export const deckInput = z.object({
  title: z.string().trim().min(1).max(120),
  cards: z.array(cardInput).min(1).max(400),
});
const cardShape = cardInput.extend({ id: key });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const deckShape = deckInput.extend({
  id: key, cards: z.array(cardShape).min(1).max(400),
  examDate: dateKey.nullable().optional(), subject: z.string().trim().max(40).nullable().optional(),
});
const directionShape = z.enum(["front", "back"]);
export const MAX_LEARN_ROUNDS = 4;
export const NEW_CARDS_PER_DAY = 10;
/** A learn session covers a small unit, so it ends with a clear result instead of running through a whole set. */
export const LEARN_UNIT = 8;
const modeShape = z.enum(["learn", "cram", "review"]);
const filterShape = z.enum(["all", "starred", "mistakes"]);
const tallyShape = z.object({ seen: z.boolean(), streak: z.number().int().min(0).max(2), missed: z.boolean() });
const sessionShape = z.object({
  id: key, deckId: key, mode: modeShape, direction: directionShape, filter: filterShape, writing: z.boolean(),
  initial: z.array(key).max(400), queue: z.array(key).max(400), tally: z.record(tallyShape),
  cursor: z.number().int().min(0).max(400), round: z.number().int().positive(), done: z.boolean(),
  correct: z.number().int().nonnegative(), mistakes: z.array(key).max(400),
  combo: z.number().int().nonnegative().optional(), best: z.number().int().nonnegative().optional(),
});
const reviewShape = z.object({
  cardId: z.string().max(55), due: z.string().datetime(), lastReview: z.string().datetime().nullable(),
  stability: z.number().finite(), difficulty: z.number().finite(),
  stabilityFast: z.number().finite(),
  scheduledDays: z.number().finite(), scheduleStatus: z.enum(["new", "learning", "review"]),
  learningStep: z.number().int().nonnegative().optional(), reps: z.number().int().positive(),
  lapses: z.number().int().nonnegative(), state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  introduced: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
/** What happened on one calendar day (Zurich). Points count every card, gold cards count twice. */
const dayShape = z.object({
  cards: z.number().int().nonnegative(), points: z.number().int().nonnegative(), correct: z.number().int().nonnegative(),
  secured: z.number().int().nonnegative(), ms: z.number().nonnegative(),
});
export type Day = z.infer<typeof dayShape>;

// The last swipe rating with the state before it, so exactly this rating can be taken back.
const lastSortShape = z.object({
  id: key, deckId: key, cardId: key, direction: directionShape,
  before: reviewShape.nullable(), wasMistake: z.boolean(), after: z.string().datetime(),
});
/** Where someone stands in the card mode of a set, so leaving and coming back continues the same pass. */
const passShape = z.object({
  filter: filterShape, order: z.array(key).max(400), index: z.number().int().min(0).max(400),
  known: z.array(key).max(400), later: z.array(key).max(400), done: z.boolean(), updated: z.number(),
});
export type Pass = z.infer<typeof passShape>;
export const MAX_PASSES = 40;
export const passKey = (deckId: string, direction: Direction) => deckId + ":" + direction;

export const workspaceShape = z.object({
  decks: z.array(deckShape).max(80), session: sessionShape.nullable(),
  reviews: z.record(reviewShape), progress: z.record(tallyShape), mistakes: z.record(z.array(key).max(400)),
  lastSort: lastSortShape.nullable().optional(),
  passes: z.record(passShape).optional(),
  stats: z.object({ days: z.record(dayShape), lastAt: z.number().optional() }).optional(),
  goal: z.number().int().min(5).max(200).optional(),
});
export type Card = z.infer<typeof cardShape>;
export type CardInput = z.input<typeof cardInput>;
export type Deck = z.infer<typeof deckShape>;
export type Direction = z.infer<typeof directionShape>;
export type Mode = z.infer<typeof modeShape>;
export type Filter = z.infer<typeof filterShape>;
export type Workspace = z.infer<typeof workspaceShape>;
type Review = z.infer<typeof reviewShape>;

const position = { sessionId: key, cursor: z.number().int().nonnegative() };
export const actionShape = z.discriminatedUnion("type", [
  deckInput.extend({ type: z.literal("save"), deckId: key.optional(), draftId: key.optional(), base: z.string().max(20).optional(),
    cards: z.array(cardInput.extend({ id: key.optional() })).min(1).max(400) }),
  z.object({ type: z.literal("delete"), deckId: key }),
  z.object({ type: z.literal("star"), deckId: key, cardId: key, starred: z.boolean() }),
  z.object({ type: z.literal("start"), deckId: key, mode: modeShape, direction: directionShape, filter: filterShape, writing: z.boolean().default(false), dueOnly: z.boolean().optional() }),
  z.object({ type: z.literal("continueLearn"), sessionId: key }),
  z.object({ type: z.literal("answer"), ...position, round: z.number().int().positive(), answer: z.string().max(3000), self: z.boolean().optional() }),
  z.object({ type: z.literal("rate"), ...position, grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }),
  z.object({ type: z.literal("sortCard"), deckId: key, cardId: key, direction: directionShape, known: z.boolean(), sortId: key.optional() }),
  z.object({ type: z.literal("undoSort"), sortId: key }),
  z.object({ type: z.literal("cardPass"), deckId: key, direction: directionShape, filter: filterShape,
    order: z.array(key).max(400), index: z.number().int().min(0).max(400), known: z.array(key).max(400), later: z.array(key).max(400), done: z.boolean() }),
  z.object({ type: z.literal("setGoal"), goal: z.number().int().min(5).max(200) }),
  z.object({ type: z.literal("setDeckMeta"), deckId: key, examDate: dateKey.nullable().optional(), subject: z.string().trim().max(40).nullable().optional() }),
  z.object({ type: z.literal("restore"), data: workspaceShape }),
]);
export type Action = z.input<typeof actionShape>;

const scheduler = await DefaultScheduler({ version: "FSRS-7", desiredRetention: 0.9,
  enableShortTerm: true, learningSteps: ["1m", "10m"], relearningSteps: ["10m"], enableFuzz: false });
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
/** The Zurich calendar day of a timestamp, as YYYY-MM-DD. */
export const dayOf = (now: number) => dayFormatter.format(now);
export const DEFAULT_GOAL = 20;
/** Breaks shorter than this count as learning time. */
const ACTIVE_GAP = 5 * 60_000;
const emptyDay = (): Day => ({ cards: 0, points: 0, correct: 0, secured: 0, ms: 0 });

function track(state: Workspace, now: number, change: { points?: number; correct?: boolean; secured?: boolean; cards?: number }) {
  const stats = state.stats ??= { days: {} };
  const key = dayOf(now);
  const day = stats.days[key] ??= emptyDay();
  day.cards = Math.max(0, day.cards + (change.cards ?? 1));
  day.points = Math.max(0, day.points + (change.points ?? 1));
  if (change.correct) day.correct += 1;
  if (change.secured) day.secured += 1;
  if (stats.lastAt && now > stats.lastAt && now - stats.lastAt < ACTIVE_GAP) day.ms += now - stats.lastAt;
  stats.lastAt = now;
  // Keep about half a year of history.
  const keys = Object.keys(stats.days).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 190))) delete stats.days[old];
}
const blank = () => ({ seen: false, streak: 0, missed: false });
const reverse = (side: Direction): Direction => side === "front" ? "back" : "front";
const reviewKey = (id: string, direction: Direction) => id + ":" + direction;

/** Raised when the action was made against content that changed in the meantime. */
export class ConflictError extends Error {}

export type Shuffle = <T>(items: T[]) => T[];
export const shuffle: Shuffle = input => {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

function hash(text: string) {
  let value = 2166136261;
  for (const ch of text) value = Math.imul(value ^ ch.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Fingerprint of everything the editor can change, so stale editors cannot overwrite newer content. */
export function deckDigest(deck: Pick<Deck, "title" | "cards">) {
  return hash(JSON.stringify([deck.title, deck.cards.map(c => [c.id, c.front, c.back, c.frontAliases, c.backAliases])])).toString(36);
}

export function empty(): Workspace {
  return { decks: [], session: null, reviews: {}, progress: {}, mistakes: {}, lastSort: null };
}

/** A card sits when it was learned in a learn session or has graduated in the review schedule. */
export function secure(state: Workspace, cardId: string, direction: Direction) {
  const key = reviewKey(cardId, direction);
  return state.progress[key]?.streak === 2 || state.reviews[key]?.state === 2;
}

export type ImportSeparator = "\t" | ";" | ",";

function csvRows(text: string, separator: ";" | ",") {
  const rows: { fields: string[]; line: number; invalid: boolean }[] = [];
  let fields: string[] = [];
  let field = "";
  let line = 1;
  let start = 1;
  let quoted = false;
  let closed = false;
  let invalid = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\n") line += 1;
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === separator || char === "\n") {
      fields.push(field);
      field = "";
      closed = false;
      if (char === "\n") {
        rows.push({ fields, line: start, invalid });
        start = line;
        fields = [];
        invalid = false;
      }
    } else if (char === '"' && !closed && !field) {
      quoted = true;
    } else {
      if (closed || char === '"') invalid = true;
      field += char;
    }
  }
  rows.push({ fields: [...fields, field], line: start, invalid: invalid || quoted });
  return rows;
}

export function parseImport(text: string, separator: ImportSeparator = "\t") {
  const cards: CardInput[] = [];
  const errors: number[] = [];
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows = separator === "\t"
    ? source.split("\n").map((line, index) => ({ fields: line.split("\t"), line: index + 1, invalid: false }))
    : csvRows(source, separator);
  for (const { fields, line, invalid } of rows) {
    if (!invalid && fields.length === 1 && !fields[0].trim()) continue;
    const parsed = cardInput.safeParse({ front: fields[0], back: fields[1] });
    if (invalid || fields.length !== 2 || !parsed.success || cards.length >= 400) errors.push(line);
    else cards.push(parsed.data);
  }
  return { cards, errors };
}

function normal(text: string) {
  return text.normalize("NFC").toLocaleLowerCase("de-CH").trim().replace(/\s+/g, " ");
}

export function matches(card: Card, direction: Direction, answer: string) {
  const alternatives = direction === "front" ? card.backAliases : card.frontAliases;
  return [card[reverse(direction)], ...alternatives].some(value => normal(value) === normal(answer));
}

export function choices(deck: Deck, card: Card, direction: Direction, seed = "") {
  const correct = card[reverse(direction)];
  const other = new Map<string, string>();
  if (correct.length > 110) return [];
  for (const item of deck.cards) {
    const candidate = item[reverse(direction)];
    if (candidate.length <= 110 && !matches(card, direction, candidate)) other.set(normal(candidate), candidate);
  }
  if (other.size < 3) return [];
  // Distractors stay stable for a card, but their order changes with every round.
  const stable = (text: string) => hash(card.id + text);
  const order = (text: string) => hash(seed + card.id + text);
  const distractors = [...other.values()].sort((a, b) =>
    Math.abs(a.length - correct.length) - Math.abs(b.length - correct.length) || stable(a) - stable(b)).slice(0, 3);
  return [correct, ...distractors].sort((a, b) => order(a) - order(b));
}

export function question(state: Workspace) {
  const s = state.session;
  const deck = state.decks.find(d => d.id === s?.deckId);
  const card = deck?.cards.find(c => c.id === s?.queue[s.cursor]);
  if (!s || s.done || !deck || !card) return null;
  const answer = card[reverse(s.direction)];
  const tally = s.tally[card.id] ?? blank();
  const options = s.mode === "learn" && !s.writing && !tally.seen
    ? choices(deck, card, s.direction, s.id + ":" + s.round) : [];
  const kind = s.mode === "review" ? "rate" : options.length ? "choice" : answer.length > 110 ? "self" : "write";
  // About one question in ten is a gold card that counts twice when answered correctly.
  const gold = hash(s.id + ":" + s.round + ":" + s.cursor) % 10 === 0;
  return { deck, card, kind, prompt: card[s.direction], answer, options, gold } as const;
}

export function dueCards(state: Workspace, cards: Card[], direction: Direction, now: number) {
  return cards.flatMap(card => {
    const review = state.reviews[reviewKey(card.id, direction)];
    const due = review ? Date.parse(review.due) : Infinity;
    return due <= now ? [{ card, due }] : [];
  }).sort((a, b) => a.due - b.due);
}

export function reviewQueue(state: Workspace, cards: Card[], direction: Direction, now: number, dueOnly = false) {
  const due = dueCards(state, cards, direction, now).map(item => item.card);
  if (dueOnly) return due;
  // The daily limit applies per selection, so a busy set does not block the others.
  const today = dayFormatter.format(now);
  const used = cards.filter(c => state.reviews[reviewKey(c.id, direction)]?.introduced === today).length;
  const fresh = cards.filter(c => !state.reviews[reviewKey(c.id, direction)]).slice(0, Math.max(0, NEW_CARDS_PER_DAY - used));
  return [...due, ...fresh];
}

function schedule(existing: Review | undefined, id: string, grade: Grade, now: number): Review {
  const timestamp = new Date(now);
  const card = existing ? {
    ...existing, dueAt: new Date(existing.due),
    lastReviewAt: existing.lastReview ? new Date(existing.lastReview) : null,
  } : scheduler.newCard({ cardId: id, now: timestamp });
  const { dueAt, lastReviewAt, ...next } = scheduler.review({ card, grade, now: timestamp }).card;
  return {
    ...next, cardId: id, due: dueAt.toISOString(), lastReview: lastReviewAt?.toISOString() ?? null,
    introduced: existing?.introduced ?? dayFormatter.format(now),
  };
}

function clearCard(state: Workspace, id: string) {
  for (const direction of ["front", "back"] as const) {
    delete state.reviews[reviewKey(id, direction)];
    delete state.progress[reviewKey(id, direction)];
  }
}

function checkBackup(state: Workspace) {
  const decks = new Set(state.decks.map(d => d.id));
  const cards = new Set(state.decks.flatMap(d => d.cards.map(c => c.id)));
  if (decks.size !== state.decks.length || cards.size !== state.decks.reduce((sum, d) => sum + d.cards.length, 0)) {
    throw new Error("Die Sicherung enthält doppelte Kennungen.");
  }
  for (const id of [...Object.keys(state.reviews), ...Object.keys(state.progress)]) {
    const [card, direction] = id.split(":");
    if (!cards.has(card) || !directionShape.safeParse(direction).success || id !== reviewKey(card, direction as Direction)) {
      throw new Error("Die Sicherung enthält einen unbekannten Kartenstand.");
    }
    if (state.reviews[id] && state.reviews[id].cardId !== id) throw new Error("Ungültiger Wiederholungsstand.");
  }
  const session = state.session;
  if (session) {
    const valid = new Set(state.decks.find(d => d.id === session.deckId)?.cards.map(c => c.id));
    if (!decks.has(session.deckId) || [...session.initial, ...session.queue, ...session.mistakes, ...Object.keys(session.tally)].some(id => !valid.has(id))
      || (!session.done && session.cursor >= session.queue.length)) throw new Error("Die Sicherung enthält eine ungültige Lernrunde.");
  }
}

export function apply(previous: Workspace, raw: Action, now: number, order: Shuffle = shuffle): Workspace {
  const action = actionShape.parse(raw);
  const state = structuredClone(previous);
  if (action.type === "restore") {
    checkBackup(action.data);
    return { ...action.data, lastSort: null };
  }
  if (action.type === "save") {
    const old = state.decks.find(d => d.id === action.deckId);
    if (action.deckId && !old) throw new Error("Dieses Set wurde nicht gefunden.");
    if (old && action.base && action.base !== deckDigest(old)) {
      throw new ConflictError("Dieses Set wurde inzwischen auf einem anderen Gerät geändert. Kopiere deine Änderungen und öffne den Editor neu.");
    }
    if (!old && state.decks.length >= 80) throw new Error("Du hast bereits 80 Sets.");
    // The editor does not show stars, so the stored marking wins over a possibly stale copy.
    const cards = action.cards.map(card => {
      const existing = card.id ? old?.cards.find(c => c.id === card.id) : undefined;
      return { ...card, id: card.id ?? crypto.randomUUID(), starred: existing ? existing.starred : card.starred };
    });
    const ids = new Set(cards.map(card => card.id));
    if (ids.size !== cards.length || action.cards.some(card => card.id && !old?.cards.some(c => c.id === card.id))) {
      throw new Error("Ungültige Kartenkennung.");
    }
    if (old) {
      const changed = old.cards.filter(card => {
        const current = cards.find(c => c.id === card.id);
        return !current || current.front !== card.front || current.back !== card.back ||
          JSON.stringify([current.frontAliases, current.backAliases]) !== JSON.stringify([card.frontAliases, card.backAliases]);
      });
      changed.forEach(card => clearCard(state, card.id));
      for (const direction of ["front", "back"] as const) {
        const id = reviewKey(old.id, direction);
        if (state.mistakes[id]) state.mistakes[id] = state.mistakes[id].filter(card => !changed.some(item => item.id === card));
      }
      old.title = action.title;
      old.cards = cards;
      if (state.session?.deckId === old.id && changed.length) state.session = null;
    } else {
      state.decks.unshift({ id: crypto.randomUUID(), title: action.title, cards });
    }
    return state;
  }
  if (action.type === "cardPass") {
    const deck = state.decks.find(item => item.id === action.deckId);
    if (!deck) throw new Error("Dieses Set wurde nicht gefunden.");
    const ids = new Set(deck.cards.map(card => card.id));
    const keepKnown = (list: string[]) => list.filter(id => ids.has(id));
    const passes = state.passes ??= {};
    passes[passKey(deck.id, action.direction)] = {
      filter: action.filter, order: keepKnown(action.order), index: action.index,
      known: keepKnown(action.known), later: keepKnown(action.later), done: action.done, updated: now,
    };
    // Only the most recent passes are kept.
    const stale = Object.entries(passes).sort((a, b) => b[1].updated - a[1].updated).slice(MAX_PASSES);
    for (const [staleKey] of stale) delete passes[staleKey];
    return state;
  }
  if (action.type === "delete") {
    const old = state.decks.find(d => d.id === action.deckId);
    if (!old) throw new Error("Dieses Set wurde nicht gefunden.");
    old.cards.forEach(card => clearCard(state, card.id));
    delete state.mistakes[reviewKey(old.id, "front")];
    delete state.mistakes[reviewKey(old.id, "back")];
    state.decks = state.decks.filter(d => d.id !== old.id);
    if (state.passes) for (const direction of ["front", "back"] as const) delete state.passes[passKey(old.id, direction)];
    if (state.session?.deckId === old.id) state.session = null;
    return state;
  }
  if (action.type === "setGoal") {
    state.goal = action.goal;
    return state;
  }
  if (action.type === "setDeckMeta") {
    const deck = state.decks.find(item => item.id === action.deckId);
    if (!deck) throw new Error("Dieses Set wurde nicht gefunden.");
    if (action.examDate !== undefined) deck.examDate = action.examDate;
    if (action.subject !== undefined) deck.subject = action.subject || null;
    return state;
  }
  if (action.type === "star") {
    const card = state.decks.find(item => item.id === action.deckId)?.cards.find(item => item.id === action.cardId);
    if (!card) throw new Error("Diese Karte wurde nicht gefunden.");
    card.starred = action.starred;
    return state;
  }
  if (action.type === "sortCard") {
    const deck = state.decks.find(item => item.id === action.deckId);
    if (!deck?.cards.some(card => card.id === action.cardId)) throw new Error("Diese Karte wurde nicht gefunden.");
    const id = reviewKey(action.cardId, action.direction);
    const before = state.reviews[id] ?? null;
    state.reviews[id] = schedule(state.reviews[id], id, action.known ? 3 : 1, now);
    track(state, now, { secured: before?.state !== 2 && state.reviews[id].state === 2 });
    const mistakeKey = reviewKey(deck.id, action.direction);
    const wasMistake = Boolean(state.mistakes[mistakeKey]?.includes(action.cardId));
    const mistakes = (state.mistakes[mistakeKey] ?? []).filter(cardId => cardId !== action.cardId);
    if (!action.known) mistakes.push(action.cardId);
    state.mistakes[mistakeKey] = mistakes;
    state.lastSort = action.sortId ? { id: action.sortId, deckId: deck.id, cardId: action.cardId, direction: action.direction,
      before, wasMistake, after: state.reviews[id].due } : null;
    return state;
  }
  if (action.type === "undoSort") {
    const last = state.lastSort;
    if (!last || last.id !== action.sortId) throw new ConflictError("Diese Bewertung kann nicht mehr zurückgenommen werden.");
    const id = reviewKey(last.cardId, last.direction);
    // Anything that touched the card since the swipe (editing, a review) makes the snapshot stale.
    if (state.reviews[id]?.due !== last.after) throw new ConflictError("Diese Karte wurde inzwischen weiter gelernt. Die Bewertung bleibt bestehen.");
    if (last.before) state.reviews[id] = last.before;
    else delete state.reviews[id];
    const mistakeKey = reviewKey(last.deckId, last.direction);
    const mistakes = (state.mistakes[mistakeKey] ?? []).filter(cardId => cardId !== last.cardId);
    if (last.wasMistake) mistakes.push(last.cardId);
    state.mistakes[mistakeKey] = mistakes;
    state.lastSort = null;
    track(state, now, { cards: -1, points: -1 });
    return state;
  }
  if (action.type === "start" || action.type === "continueLearn") {
    const finished = action.type === "continueLearn" ? state.session : null;
    if (action.type === "continueLearn" && (!finished?.done || finished.id !== action.sessionId || finished.mode !== "learn")) {
      throw new Error("Diese Lerneinheit ist nicht mehr aktuell.");
    }
    const config = action.type === "start" ? action : finished!;
    const deck = state.decks.find(d => d.id === config.deckId);
    if (!deck) throw new Error("Dieses Set wurde nicht gefunden.");
    const recent = state.mistakes[reviewKey(deck.id, config.direction)] ?? [];
    let cards = finished
      ? deck.cards.filter(c => finished.initial.includes(c.id) && finished.tally[c.id]?.streak < 2)
      : deck.cards.filter(c => config.filter === "all" || (config.filter === "starred" ? c.starred : recent.includes(c.id)));
    if (action.type === "start" && action.mode === "review") cards = reviewQueue(state, cards, action.direction, now, action.dueOnly);
    else if (action.type === "start" && action.mode === "learn") {
      cards = order(cards).filter(c => (state.progress[reviewKey(c.id, action.direction)]?.streak ?? 0) < 2).slice(0, LEARN_UNIT);
    } else cards = order(cards);
    const initial = cards.map(c => c.id);
    const tally = Object.fromEntries(cards.map(c => [c.id, config.mode === "learn"
      ? state.progress[reviewKey(c.id, config.direction)] ?? blank() : blank()]));
    const queue = config.mode === "learn" ? initial.filter(id => tally[id].streak < 2) : initial;
    state.session = { id: crypto.randomUUID(), deckId: deck.id, mode: config.mode,
      direction: config.direction, filter: config.filter, writing: config.writing, initial, queue, tally,
      cursor: 0, round: 1, done: !queue.length, correct: 0, mistakes: [], combo: 0, best: 0 };
    return state;
  }
  const s = state.session;
  const q = question(state);
  if (!s || !q || s.id !== action.sessionId || s.cursor !== action.cursor) throw new Error("Diese Frage wurde bereits bearbeitet.");
  if (action.type === "rate") {
    if (s.mode !== "review") throw new Error("Diese Bewertung gehört zur Wiederholung.");
    const id = reviewKey(q.card.id, s.direction);
    const before = state.reviews[id]?.state;
    state.reviews[id] = schedule(state.reviews[id], id, action.grade, now);
    const correct = action.grade >= 3;
    s.combo = correct ? (s.combo ?? 0) + 1 : 0;
    s.best = Math.max(s.best ?? 0, s.combo);
    track(state, now, { points: correct && q.gold ? 2 : 1, correct, secured: before !== 2 && state.reviews[id].state === 2 });
  } else {
    if (s.mode === "review" || action.round !== s.round) throw new Error("Diese Frage wurde bereits bearbeitet.");
    if (q.kind === "choice" && !q.options.includes(action.answer)) throw new Error("Wähle eine angebotene Antwort.");
    const correct = action.self ?? matches(q.card, s.direction, action.answer);
    if (correct) s.correct += 1;
    else if (!s.mistakes.includes(q.card.id)) s.mistakes.push(q.card.id);
    s.combo = correct ? (s.combo ?? 0) + 1 : 0;
    s.best = Math.max(s.best ?? 0, s.combo);
    let secured = false;
    if (s.mode === "learn") {
      const tally = s.tally[q.card.id];
      tally.seen = true;
      tally.missed = !correct;
      const before = tally.streak;
      if (!correct) tally.streak = 0;
      else if (q.kind !== "choice") tally.streak = Math.min(2, tally.streak + 1);
      const id = reviewKey(q.card.id, s.direction);
      state.progress[id] = tally;
      // A card learned for the first time joins the spaced repetition schedule.
      if (before < 2 && tally.streak === 2 && !state.reviews[id]) state.reviews[id] = schedule(undefined, id, 3, now);
      secured = before < 2 && tally.streak === 2;
    }
    track(state, now, { points: correct && q.gold ? 2 : 1, correct, secured });
    const mistakeKey = reviewKey(s.deckId, s.direction);
    const recent = state.mistakes[mistakeKey] ?? [];
    state.mistakes[mistakeKey] = correct ? recent.filter(id => id !== q.card.id)
      : [...new Set([...recent, q.card.id])];
  }
  s.cursor += 1;
  if (s.cursor >= s.queue.length) {
    if (s.mode === "learn") {
      const pending = s.initial.filter(id => s.tally[id].streak < 2);
      if (pending.length && s.round < MAX_LEARN_ROUNDS) {
        s.queue = order(pending);
        s.cursor = 0;
        s.round += 1;
        return state;
      }
    }
    s.done = true;
  }
  return state;
}
