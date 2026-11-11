import { DEFAULT_GOAL, LEARN_UNIT, dayOf, dueCards, secure, type Day, type Deck, type Direction, type Workspace } from "./learning.ts";

const DAY = 86_400_000;
/** Cards that sit, needed for each subject level. Level 1 starts at zero. */
export const LEVELS = [0, 10, 25, 50, 90, 140, 200, 280, 380, 500];

export function goalOf(state: Workspace) {
  return state.goal ?? DEFAULT_GOAL;
}

export function dayStats(state: Workspace, key: string): Day {
  return state.stats?.days[key] ?? { cards: 0, points: 0, correct: 0, secured: 0, ms: 0 };
}

function shift(key: string, days: number) {
  return new Date(Date.parse(key + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
}

/** Monday-based week number, enough to allow one rest day per calendar week. */
function weekOf(key: string) {
  const date = new Date(key + "T12:00:00Z");
  return Math.floor((date.getTime() / DAY + 3) / 7);
}

export type Streak = { days: number; todayDone: boolean; atRisk: boolean; restDays: string[] };

/**
 * Consecutive days with the goal reached. One missed day per calendar week is covered by a rest day,
 * so a single slip does not wipe out weeks of work. Today only counts once it is reached.
 */
export function streakOf(reached: (key: string) => boolean, now: number): Streak {
  const today = dayOf(now);
  const todayDone = reached(today);
  let key = todayDone ? today : shift(today, -1);
  let days = 0;
  const restDays: string[] = [];
  const usedWeeks = new Set<number>();
  for (let i = 0; i < 800; i += 1) {
    if (reached(key)) days += 1;
    else {
      const week = weekOf(key);
      // A rest day only bridges a gap between learning days.
      if (usedWeeks.has(week) || !reached(shift(key, -1)) || days === 0 && key !== shift(today, -1)) break;
      usedWeeks.add(week);
      restDays.push(key);
    }
    key = shift(key, -1);
  }
  return { days, todayDone, atRisk: !todayDone && days > 0, restDays };
}

export function streak(state: Workspace, now: number) {
  const goal = goalOf(state);
  return streakOf(key => dayStats(state, key).points >= goal, now);
}

/** Days on which both partners reached their own goal. */
export function sharedStreak(a: Workspace, b: Workspace, now: number) {
  const goalA = goalOf(a);
  const goalB = goalOf(b);
  return streakOf(key => dayStats(a, key).points >= goalA && dayStats(b, key).points >= goalB, now);
}

export function week(state: Workspace, now: number) {
  const today = dayOf(now);
  const goal = goalOf(state);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = shift(today, i - 6);
    const stats = dayStats(state, key);
    return { key, points: stats.points, reached: stats.points >= goal };
  });
  const sum = (from: number, field: keyof Day) =>
    Array.from({ length: 7 }, (_, i) => dayStats(state, shift(today, from - i))[field]).reduce((a, b) => a + b, 0);
  return {
    days, cards: sum(0, "cards"), secured: sum(0, "secured"), correct: sum(0, "correct"),
    minutes: Math.round(sum(0, "ms") / 60_000), previousCards: sum(-7, "cards"),
  };
}

export type Level = { subject: string; secure: number; level: number; toNext: number | null; progress: number };

export function levels(state: Workspace): Level[] {
  const subjects = new Map<string, number>();
  for (const deck of state.decks) {
    if (!deck.subject) continue;
    const sits = deck.cards.filter(card => secure(state, card.id, "front") || secure(state, card.id, "back")).length;
    subjects.set(deck.subject, (subjects.get(deck.subject) ?? 0) + sits);
  }
  return [...subjects].map(([subject, sits]) => {
    const index = LEVELS.findLastIndex(min => sits >= min);
    const next = LEVELS[index + 1];
    const progress = next === undefined ? 1 : (sits - LEVELS[index]) / (next - LEVELS[index]);
    return { subject, secure: sits, level: index + 1, toNext: next === undefined ? null : next - sits, progress };
  }).sort((a, b) => b.secure - a.secure);
}

export function openCards(state: Workspace, deck: Deck, direction: Direction = "front") {
  return deck.cards.filter(card => !secure(state, card.id, direction));
}

/** Days until the exam (0 = today), or null without a date or once it has passed. */
export function examIn(deck: Deck, now: number) {
  if (!deck.examDate) return null;
  const days = Math.round((Date.parse(deck.examDate + "T12:00:00Z") - Date.parse(dayOf(now) + "T12:00:00Z")) / DAY);
  return days >= 0 ? days : null;
}

export type Step =
  | { kind: "resume"; deckId: string; label: string; detail: string }
  | { kind: "review"; deckId: string; direction: Direction; count: number; label: string; detail: string }
  | { kind: "learn"; deckId: string; count: number; label: string; detail: string }
  | { kind: "cram"; deckId: string; direction: Direction; count: number; label: string; detail: string }
  | { kind: "done"; label: string; detail: string };

const minutes = (cards: number) => Math.max(1, Math.round(cards * 0.3));

/**
 * The most useful next thing to do, so a finished unit never ends in a dead end:
 * open round, due reviews, an exam that is close, the set in focus, shaky cards, then any open set.
 */
export function nextStep(state: Workspace, now: number, focusDeckId?: string): Step {
  const session = state.session;
  const title = (id: string) => state.decks.find(deck => deck.id === id)?.title ?? "";
  if (session && !session.done) return { kind: "resume", deckId: session.deckId, label: "Runde in " + title(session.deckId) + " fortsetzen", detail: "Du bist mitten in einer Runde" };

  const due = state.decks.flatMap(deck => (["front", "back"] as const).map(direction => ({ deck, direction, count: dueCards(state, deck.cards, direction, now).length })))
    .filter(item => item.count > 0).sort((a, b) => b.count - a.count)[0];
  if (due) return { kind: "review", deckId: due.deck.id, direction: due.direction, count: due.count,
    label: due.count + " fällige Karten in " + due.deck.title, detail: "Etwa " + minutes(due.count) + " Minuten" };

  const exam = state.decks.map(deck => ({ deck, days: examIn(deck, now), open: openCards(state, deck).length }))
    .filter(item => item.days !== null && item.days <= 14 && item.open > 0).sort((a, b) => a.days! - b.days!)[0];
  if (exam) return { kind: "learn", deckId: exam.deck.id, count: Math.min(LEARN_UNIT, exam.open),
    label: "Für die Prüfung: " + exam.deck.title, detail: (exam.days === 0 ? "Prüfung heute" : "Noch " + exam.days + (exam.days === 1 ? " Tag" : " Tage")) + " · " + exam.open + " Karten offen" };

  const focus = state.decks.find(deck => deck.id === (focusDeckId ?? session?.deckId));
  const ordered = focus ? [focus, ...state.decks.filter(deck => deck !== focus)] : state.decks;
  const learnable = ordered.map(deck => ({ deck, open: openCards(state, deck).filter(card => (state.progress[card.id + ":front"]?.streak ?? 0) < 2).length }))
    .find(item => item.open > 0);
  if (focus) {
    const shaky = (state.mistakes[focus.id + ":front"] ?? []).length;
    if (learnable?.deck === focus) return { kind: "learn", deckId: focus.id, count: Math.min(LEARN_UNIT, learnable.open),
      label: "Nächste Einheit " + focus.title, detail: Math.min(LEARN_UNIT, learnable.open) + " neue Karten · etwa " + minutes(LEARN_UNIT * 3) + " Minuten" };
    if (shaky) return { kind: "cram", deckId: focus.id, direction: "front", count: shaky, label: shaky + " wacklige Karten pauken", detail: focus.title };
  }
  if (learnable) return { kind: "learn", deckId: learnable.deck.id, count: Math.min(LEARN_UNIT, learnable.open),
    label: "Weiter mit " + learnable.deck.title, detail: learnable.open + " Karten noch nicht sicher" };
  return { kind: "done", label: "Alles erledigt", detail: "Alle Karten sitzen. Die nächsten kommen, wenn sie fällig sind." };
}
