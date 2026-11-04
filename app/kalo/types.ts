import type { Action, CardInput, Direction, Workspace } from "../../lib/learning";

export type Draft = { id: string; title: string; cards: CardInput[]; created: number };
export type Data = { workspace: Workspace; drafts: Draft[]; revision: number };
export type EditCard = CardInput & { id?: string; row: string };
export type Editor = { title: string; cards: EditCard[]; deckId?: string; draftId?: string; base?: string };
export type Extra = { type: "share"; deckId: string; cardIds: string[] } | { type: "discard"; draftId: string } | { type: "revoke"; token: string };
export type View = "home" | "deck" | "editor" | "import" | "cards" | "study" | "chat" | "settings";
export type MutateResult = Data & { error?: string; token?: string };
export type Mutate = (action: Action | Extra, options?: { queue?: boolean }) => Promise<MutateResult | null>;
export type CardsStart = { key: string; order: string[]; index: number; flipped: boolean };
export type LastActivity =
  | { mode: "cards"; deckId: string; cardId: string; order: string[]; direction: Direction; flipped: boolean }
  | { mode: "study"; sessionId: string };

export const row = (card: CardInput & { id?: string } = { front: "", back: "" }): EditCard => ({ ...card, row: crypto.randomUUID() });
export const freshEditor = (): Editor => ({ title: "", cards: [row(), row()] });
export const dateFormat = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" });
export const plural = (count: number, one: string, many: string) => count + " " + (count === 1 ? one : many);
