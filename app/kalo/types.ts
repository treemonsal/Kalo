import type { Action, CardInput, Direction, Filter, Workspace } from "../../lib/learning";
import type { PartnerSummary, SocialAction } from "../../lib/social";

export type Draft = { id: string; title: string; cards: CardInput[]; created: number };
export type Data = {
  workspace: Workspace; drafts: Draft[]; revision: number;
  published?: Record<string, string>; push?: { enabled: boolean; morning: string; evening: string };
  partner?: PartnerSummary | null; pushKey?: string | null;
};
export type EditCard = CardInput & { id?: string; row: string };
export type Editor = { title: string; cards: EditCard[]; deckId?: string; draftId?: string; base?: string };
export type Extra = { type: "share"; deckId: string; cardIds: string[] } | { type: "discard"; draftId: string } | { type: "revoke"; token: string } | SocialAction;
export type View = "home" | "deck" | "editor" | "import" | "cards" | "study" | "chat" | "settings" | "duel";
export type DuelData = { title: string; ownerName: string; questions: { prompt: string; options: string[]; answer: string }[]; results: { name: string; correct: number; ms: number }[]; played?: boolean };
export type MutateResult = Data & { error?: string; token?: string; deckId?: string; imports?: number; duel?: DuelData };
export type MutateOptions = {
  /** Wait for earlier actions instead of being dropped while one runs (card swipes, undo, stars). */
  queue?: boolean;
  /** The caller shows its own message on failure. */
  silent?: boolean;
  /** Checked right before sending; true skips the request and counts as success. */
  skip?: () => boolean;
  /** Called in order with the outcome, before the next queued action starts. Status 0 means no connection. */
  onDone?: (ok: boolean, status: number) => void;
};
export type Mutate = (action: Action | Extra, options?: MutateOptions) => Promise<MutateResult | null>;
export type CardsStart = { key: string; order: string[]; index: number; flipped: boolean; filter: Filter; pass: Record<string, boolean> };
export type PassSnapshot = { order: string[]; index: number; pass: Record<string, boolean>; done: boolean };
export type LastActivity =
  | { mode: "cards"; deckId: string; cardId: string; order: string[]; direction: Direction; flipped: boolean }
  | { mode: "study"; sessionId: string };

export const row = (card: CardInput & { id?: string } = { front: "", back: "" }): EditCard => ({ ...card, row: crypto.randomUUID() });
export const freshEditor = (): Editor => ({ title: "", cards: [row(), row()] });
export const dateFormat = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" });
export const plural = (count: number, one: string, many: string) => count + " " + (count === 1 ? one : many);
