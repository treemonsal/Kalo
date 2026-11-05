import type { Action, CardInput, Direction, Workspace } from "../../lib/learning";

export type Draft = { id: string; title: string; cards: CardInput[]; created: number };
export type Data = { workspace: Workspace; drafts: Draft[]; revision: number };
export type EditCard = CardInput & { id?: string; row: string };
export type Editor = { title: string; cards: EditCard[]; deckId?: string; draftId?: string; base?: string };
export type Extra = { type: "share"; deckId: string; cardIds: string[] } | { type: "discard"; draftId: string } | { type: "revoke"; token: string };
export type View = "home" | "deck" | "editor" | "import" | "cards" | "study" | "chat" | "settings";
export type MutateResult = Data & { error?: string; token?: string };
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
export type CardsStart = { key: string; order: string[]; index: number; flipped: boolean };
export type LastActivity =
  | { mode: "cards"; deckId: string; cardId: string; order: string[]; direction: Direction; flipped: boolean }
  | { mode: "study"; sessionId: string };

export const row = (card: CardInput & { id?: string } = { front: "", back: "" }): EditCard => ({ ...card, row: crypto.randomUUID() });
export const freshEditor = (): Editor => ({ title: "", cards: [row(), row()] });
export const dateFormat = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" });
export const plural = (count: number, one: string, many: string) => count + " " + (count === 1 ? one : many);
