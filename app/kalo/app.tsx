"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Appearance } from "../../lib/appearance";
import { dayOf, deckDigest, dueCards, type Card, type CardInput, type Deck, type Direction, type Filter, type Mode } from "../../lib/learning";
import type { FriendSummary } from "../../lib/social";
import { dayStats, goalOf, nextStep, streak, type Step } from "../../lib/progress";
import DuelView from "./duel-view";
import { Avatar, shareLink } from "./progress-ui";
import { play } from "./sound";
import CardViewer, { type UndoResult } from "./card-viewer";
import ChatView from "./chat-view";
import DeckView from "./deck-view";
import EditorView from "./editor-view";
import { EmptyState, ErrorBanner, LibrarySkeleton, Toast, useConfirm, type Problem } from "./feedback";
import HomeView, { type DueSet, type Recent } from "./home-view";
import { Icon } from "./icons";
import ImportView from "./import-view";
import { useReminders } from "./reminders";
import SettingsView from "./settings-view";
import ProfileView from "./profile-view";
import ProfileEditor from "./profile-editor";
import StreakCelebration from "./streak-celebration";
import CardExplainSheet from "./card-explain-sheet";
import StatsView from "./stats-view";
import { parseStored, readStored, useStored, writeStored } from "./storage";
import StudyView from "./study-view";
import { applyAppearance, syncThemeColor } from "./theme";
import { DurableQueue, isDurableAction, type SyncState } from "../../lib/learning-sync";
import { freshEditor, row, type PassSnapshot, type CardsStart, type Data, type Draft, type Editor, type LastActivity, type Mutate, type MutateResult, type View } from "./types";

const DEFAULT_CHAT = "https://chatgpt.com/";
const MAX_CARDS = 400;
const POLL_MS = 25_000;
const modeName = { learn: "Lernen", cram: "Pauken", review: "Wiederholen" };

function safeChatUrl(link: string) {
  try {
    const url = new URL(link.trim());
    return url.origin === "https://chatgpt.com" && !url.username && !url.password ? url.href : DEFAULT_CHAT;
  } catch { return DEFAULT_CHAT; }
}

function isActivity(value: unknown): value is LastActivity {
  const item = value as LastActivity | null;
  return item?.mode === "study" || (item?.mode === "cards" && Array.isArray(item.order)
    && (item.direction === "front" || item.direction === "back"));
}

function isEditor(value: unknown): value is Editor {
  const item = value as Editor | null;
  return typeof item?.title === "string" && Array.isArray(item.cards)
    && item.cards.every(card => typeof card?.front === "string" && typeof card.back === "string" && typeof card.row === "string");
}

/** Turns a failed request into a message with a sensible next step. */
function problemFor(status: number, message: string | undefined, retry: () => void): Problem {
  if (status === 0) return { message: "Keine Verbindung. Deine letzte Änderung ist noch nicht gespeichert.", action: { label: "Erneut versuchen", run: retry } };
  if (status === 401) return { message: "Deine Anmeldung ist abgelaufen.", link: { label: "Neu anmelden", href: "/signin-with-chatgpt?return_to=%2F" } };
  if (status >= 500) return { message: message || "Kalo kann gerade nicht speichern.", action: { label: "Erneut versuchen", run: retry } };
  return { message: message || "Diese Änderung war nicht möglich." };
}

export default function Kalo({ accountId, initialAppearance }: { accountId: string; initialAppearance: Appearance }) {
  const bookmarkKey = "kalo-last:" + accountId;
  const editorKey = "kalo-editor:" + accountId;
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<View>("home");
  const [deckId, setDeckId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [importTarget, setImportTarget] = useState<"new" | "append">("new");
  const [direction, setDirection] = useState<Direction>("front");
  const [filter, setFilter] = useState<Filter>("all");
  const [writing, setWriting] = useState(false);
  const [cardsStart, setCardsStart] = useState<CardsStart | null>(null);
  const [chatCard, setChatCard] = useState<string>();
  const [theme, setTheme] = useState(initialAppearance);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const [confirm, confirmDialog] = useConfirm();
  const [duelToken, setDuelToken] = useState("");
  const [deckOrigin, setDeckOrigin] = useState<"home" | "profile">("home");
  const [celebrate, setCelebrate] = useState<{ previous: number; streak: number } | null>(null);
  const [explain, setExplain] = useState<{ card: Card; direction: Direction } | null>(null);
  const [sync, setSync] = useState<SyncState>({ pending: 0, phase: "idle" });
  const outbox = useRef<DurableQueue<MutateResult> | null>(null);
  const dataRef = useRef<Data | null>(null);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const lastRefresh = useRef(0);
  const failedSorts = useRef(new Set<string>());
  const main = useRef<HTMLElement>(null);
  const reload = useRef(() => undefined as void);

  const storedBookmark = useStored(bookmarkKey);
  const storedEditor = useStored(editorKey);
  const storedChat = useStored("kalo-chat") ?? readStored("kartenloop-chat");
  const lastActivity = useMemo(() => parseStored(storedBookmark, isActivity), [storedBookmark]);
  const unsavedEditor = useMemo(() => parseStored(storedEditor, isEditor), [storedEditor]);
  const chatLink = storedChat ?? DEFAULT_CHAT;

  const accept = useCallback((next: Data) => {
    const old = dataRef.current;
    if (old && next.revision < old.revision) return;
    // Mutation replies leave out partner and push key; keep the last known ones.
    const value = { ...next, friends: next.friends === undefined ? old?.friends : next.friends, partner: next.partner === undefined ? old?.partner : next.partner, pushKey: next.pushKey ?? old?.pushKey };
    dataRef.current = value;
    setData(value);
    if (!old) return;
    const today = dayOf(Date.now());
    const goal = goalOf(value.workspace);
    const before = dayStats(old.workspace, today).points;
    const after = dayStats(value.workspace, today).points;
    const shown = "kalo-goal:" + accountId;
    if (before < goal && after >= goal && readStored(shown) !== today) {
      writeStored(shown, today);
      play("goal");
      setCelebrate({ previous: streak(old.workspace, Date.now()).days, streak: streak(value.workspace, Date.now()).days });
    }
  }, [accountId]);

  useEffect(() => {
    const queue = new DurableQueue<MutateResult>({
      owner: accountId,
      storage: { getItem: key => { try { return localStorage.getItem(key); } catch { return null; } }, setItem: (key, value) => localStorage.setItem(key, value) },
      lock: work => navigator.locks ? navigator.locks.request("kalo-outbox:" + accountId, work) : Promise.resolve(work()),
      read: async () => {
        const response = await fetch("/api/workspace", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error("Laden ging nicht");
        return await response.json() as MutateResult;
      },
      send: async item => {
        const response = await fetch("/api/workspace", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ requestId: item.id, clientId: item.clientId, sequence: item.sequence, at: item.at, action: item.action, content: item.content }),
        });
        const result = await response.json() as MutateResult;
        if (response.ok && !result.workspace) throw new Error("Unvollständige Antwort");
        return { status: response.status, result };
      },
      accept: next => { accept(next); setTime(Date.now()); }, changed: setSync,
    });
    outbox.current = queue;
    queueMicrotask(() => { setSync(queue.state); void queue.retry(); });
    const retry = () => { if (!document.hidden) void queue.retry(); };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    window.addEventListener("storage", retry);
    document.addEventListener("visibilitychange", retry);
    const timer = window.setInterval(retry, POLL_MS);
    return () => {
      queue.dispose();
      outbox.current = null;
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      window.removeEventListener("storage", retry);
      document.removeEventListener("visibilitychange", retry);
      window.clearInterval(timer);
    };
  }, [accountId, accept]);

  const refresh = useCallback(async (force = false) => {
    const started = Date.now();
    if (pending.current || (!force && started - lastRefresh.current < 2_000)) return;
    lastRefresh.current = started;
    try {
      const known = dataRef.current?.revision;
      const result = await fetch("/api/workspace" + (known === undefined ? "" : "?known=" + known), { cache: "no-store" });
      if (result.status === 401) { setProblem(problemFor(401, undefined, () => undefined)); return; }
      if (!result.ok) throw new Error();
      const next = await result.json() as Data | { unchanged: true; friends?: FriendSummary[]; partner?: Data["partner"] };
      if (!("unchanged" in next)) accept(next);
      else if (dataRef.current && next.friends !== undefined) accept({ ...dataRef.current, friends: next.friends, partner: next.partner });
      setTime(Date.now());
      setProblem(current => current?.action?.label === "Erneut laden" ? null : current);
    } catch {
      setProblem({
        message: dataRef.current ? "Dein Lernstand konnte nicht aktualisiert werden. Prüfe die Verbindung." : "Dein Lernstand konnte nicht geladen werden. Prüfe die Verbindung.",
        action: { label: "Erneut laden", run: () => reload.current() },
      });
    }
  }, [accept]);

  useEffect(() => { reload.current = () => void refresh(true); }, [refresh]);

  useEffect(() => {
    // Deferred so the first load never updates state inside the effect itself.
    queueMicrotask(() => void refresh(true));
    const handle = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", handle);
    document.addEventListener("visibilitychange", handle);
    const timer = window.setInterval(handle, POLL_MS);
    const system = matchMedia("(prefers-color-scheme: dark)");
    syncThemeColor();
    system.addEventListener("change", syncThemeColor);
    return () => {
      window.removeEventListener("focus", handle);
      document.removeEventListener("visibilitychange", handle);
      window.clearInterval(timer);
      system.removeEventListener("change", syncThemeColor);
    };
  }, [refresh]);

  useEffect(() => {
    if (!celebrate) return;
    const timer = window.setTimeout(() => setCelebrate(null), 3_600);
    return () => window.clearTimeout(timer);
  }, [celebrate]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2_800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Queued actions (swipes, undo, stars) run strictly in order. Others are dropped while something runs.
  const mutate: Mutate = async (action, options = {}) => {
    if (!dataRef.current || ((pending.current || outbox.current?.state.pending) && !options.queue)) return null;
    pending.current += 1;
    setBusy(true);
    if (!options.silent) setProblem(null);
    if (isDurableAction(action)) {
      try {
        if (options.skip?.()) { options.onDone?.(true, 200); return dataRef.current as MutateResult; }
        if (!outbox.current) throw new Error("Dein Lernstand wird noch geladen.");
        const card = action.type === "sortCard" ? dataRef.current.workspace.decks.find(deck => deck.id === action.deckId)?.cards.find(card => card.id === action.cardId) : undefined;
        const result = await outbox.current.submit(action, undefined, card ? deckDigest({ title: "", cards: [card] }) : undefined);
        options.onDone?.(Boolean(result), result ? 200 : 409);
        return result;
      } catch (error) {
        options.onDone?.(false, 400);
        setProblem({ message: error instanceof Error ? error.message : "Die Bewertung konnte nicht gesichert werden." });
        return null;
      } finally {
        pending.current -= 1;
        if (!pending.current) setBusy(false);
      }
    }
    const run = async (): Promise<MutateResult | null> => {
      let status = 0;
      try {
        if (options.skip?.()) { options.onDone?.(true, 200); return dataRef.current as MutateResult; }
        const response = await fetch("/api/workspace", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: dataRef.current?.revision, action }),
        });
        status = response.status;
        const result = await response.json() as MutateResult;
        if (result.workspace) accept(result);
        if (!response.ok) {
          options.onDone?.(false, status);
          if (!options.silent) setProblem(problemFor(status, result.error, () => void mutate(action, options)));
          return null;
        }
        setTime(Date.now());
        options.onDone?.(true, status);
        return result;
      } catch {
        options.onDone?.(false, status);
        if (!options.silent) setProblem(problemFor(status, undefined, () => void mutate(action, options)));
        return null;
      } finally {
        pending.current -= 1;
        if (!pending.current) setBusy(false);
      }
    };
    const task = chain.current.then(run);
    chain.current = task.catch(() => undefined);
    return task;
  };

  // Links from other people: ?set= (shared set), ?partner= (invite), ?duel= (challenge).
  const linkHandled = useRef(false);
  useEffect(() => {
    if (!data || linkHandled.current) return;
    linkHandled.current = true;
    const params = new URLSearchParams(location.search);
    const set = params.get("set"), friend = params.get("friend") ?? params.get("partner"), duel = params.get("duel");
    if (!set && !friend && !duel) return;
    history.replaceState(null, "", location.pathname);
    void (async () => {
      if (duel) { setDuelToken(duel); setView("duel"); return; }
      if (set) {
        const response = await fetch("/api/workspace?share=" + set, { cache: "no-store" }).catch(() => null);
        const body = await response?.json().catch(() => null) as { share?: { title: string; ownerName: string; count: number; own: boolean }; error?: string } | null;
        if (!response?.ok || !body?.share) { setProblem({ message: body?.error ?? "Dieser Link ist ungültig oder wurde zurückgezogen." }); return; }
        const share = body.share;
        if (!await confirm({ title: "«" + share.title + "» übernehmen?", message: share.ownerName + " teilt " + share.count + " Karten mit dir. Du bekommst eine eigene Kopie mit eigenem Lernstand.", confirm: "Übernehmen" })) return;
        const result = await mutate({ type: "importShare", token: set });
        if (result?.deckId) { setDeckId(result.deckId); setView("deck"); setNotice("Set übernommen"); }
        return;
      }
      if (friend && await confirm({ title: "Freund hinzufügen?", message: "Ihr seht eure Namen, Profilbilder und Lernfortschritte und baut gemeinsame Serien auf.", confirm: "Hinzufügen" })) {
        if (await mutate({ type: "acceptFriend", token: friend })) setNotice("Freund hinzugefügt");
      }
    })();
  // Runs once, as soon as the library is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const workspace = data?.workspace;
  const deck = workspace?.decks.find(item => item.id === deckId);
  const session = workspace?.session;

  useEffect(() => {
    window.scrollTo(0, 0);
    if (view !== "home" && !main.current?.contains(document.activeElement)) main.current?.focus({ preventScroll: true });
  }, [view]);

  // Views live in the browser history, so the native back gesture (iPhone edge swipe, Android back) works.
  const restorable = useRef({ editor: false, cards: false, duel: false });
  useEffect(() => { restorable.current = { editor: Boolean(editor), cards: Boolean(cardsStart), duel: Boolean(duelToken) }; });
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const state = event.state as { kaloView?: View; deckId?: string } | null;
      const ready = restorable.current;
      let next: View = state?.kaloView ?? "home";
      if (next === "editor" && !ready.editor) next = "home";
      if (next === "cards" && !ready.cards) next = state?.deckId ? "deck" : "home";
      if (next === "duel" && !ready.duel) next = "home";
      setProblem(null);
      if (state?.deckId !== undefined) setDeckId(state.deckId);
      setView(next);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => { history.replaceState({ kaloView: view, deckId }, ""); }, [view, deckId]);

  function navigate(next: View) {
    setProblem(null);
    if (next !== view) history.pushState({ kaloView: next, deckId }, "");
    setView(next);
  }

  function changeEditor(update: (current: Editor) => Editor) {
    if (!editor) return;
    const next = update(editor);
    setEditor(next);
    writeStored(editorKey, JSON.stringify(next));
  }

  async function openEditor(next: Editor, persist = false) {
    if (unsavedEditor && !persist && !await confirm({
      title: "Ungespeicherte Änderungen verwerfen?",
      message: "«" + (unsavedEditor.title || "Neues Set") + "» ist noch nicht gespeichert.", confirm: "Verwerfen", destructive: true,
    })) return;
    writeStored(editorKey, persist ? JSON.stringify(next) : null);
    setEditor(next);
    navigate("editor");
  }

  function edit(item?: Deck, draft?: Draft) {
    void openEditor(item ? { deckId: item.id, title: item.title, cards: item.cards.map(row), base: deckDigest(item), examDate: item.examDate ?? "", subject: item.subject ?? "" }
      : draft ? { draftId: draft.id, title: draft.title, cards: draft.cards.map(row) } : freshEditor());
  }

  function importText(target: "new" | "append") {
    setImportTarget(target);
    navigate("import");
  }

  function acceptImport(cards: CardInput[]) {
    if (importTarget === "append" && editor) {
      changeEditor(current => ({ ...current, cards: [...current.cards.filter(c => c.front.trim() || c.back.trim()), ...cards.map(row)] }));
      navigate("editor");
    } else void openEditor({ title: "", cards: cards.map(row) }, true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const complete = editor.cards.filter(item => item.front.trim() || item.back.trim());
    if (!complete.length || complete.some(item => !item.front.trim() || !item.back.trim())) {
      setProblem({ message: "Fülle bei jeder Karte beide Seiten aus. Leere Karten werden beim Speichern weggelassen." });
      return;
    }
    const result = await mutate({
      type: "save", title: editor.title, deckId: editor.deckId, draftId: editor.draftId, base: editor.base,
      cards: complete.map(item => ({ id: item.id, front: item.front, back: item.back,
        frontAliases: item.frontAliases, backAliases: item.backAliases, starred: item.starred })),
    });
    if (!result) return;
    const savedId = editor.deckId ?? result.workspace.decks[0].id;
    const savedDeck = result.workspace.decks.find(item => item.id === savedId);
    const examDate = editor.examDate || null;
    const subject = editor.subject?.trim() || null;
    if (savedDeck && ((savedDeck.examDate ?? null) !== examDate || (savedDeck.subject ?? null) !== subject)) {
      await mutate({ type: "setDeckMeta", deckId: savedId, examDate, subject }, { queue: true });
    }
    writeStored(editorKey, null);
    setDeckId(savedId);
    setEditor(null);
    navigate("deck");
    setNotice("Set gespeichert");
  }

  async function discardDraft() {
    if (!editor?.draftId || !await confirm({ title: "Entwurf verwerfen?", message: "«" + (editor.title || "Entwurf") + "» wird entfernt.", confirm: "Verwerfen", destructive: true })) return;
    if (await mutate({ type: "discard", draftId: editor.draftId })) {
      writeStored(editorKey, null);
      setEditor(null);
      navigate("home");
      setNotice("Entwurf verworfen");
    }
  }

  async function removeDeck() {
    if (!editor?.deckId || !await confirm({
      title: "Set löschen?", message: "«" + editor.title + "» und sein Lernstand werden endgültig entfernt.", confirm: "Löschen", destructive: true,
    })) return;
    if (await mutate({ type: "delete", deckId: editor.deckId })) {
      writeStored(editorKey, null);
      setEditor(null);
      navigate("home");
      setNotice("Set gelöscht");
    }
  }

  function bookmarkStudy(sessionId: string) {
    writeStored(bookmarkKey, JSON.stringify({ mode: "study", sessionId } satisfies LastActivity));
  }

  function resume() {
    if (!session) return;
    setDeckId(session.deckId);
    setDirection(session.direction);
    setFilter(session.filter);
    setWriting(session.writing);
    bookmarkStudy(session.id);
    navigate("study");
  }

  async function start(mode: Mode, options?: { target: Deck; side: Direction; dueOnly?: true }, override?: Filter) {
    const target = options?.target ?? deck;
    if (!target) return;
    const side = options?.side ?? direction;
    const selectedFilter = options ? "all" : override ?? filter;
    if (session && !session.done) {
      if (!options && !override && session.deckId === target.id && session.mode === mode && session.direction === side
          && session.filter === selectedFilter && session.writing === writing) {
        resume();
        return;
      }
      if (!await confirm({ title: "Neue Runde starten?", message: "Deine offene Runde «" + modeName[session.mode] + "» wird beendet.", confirm: "Neue Runde" })) return;
    }
    const result = await mutate({
      type: "start", mode, deckId: target.id, direction: side,
      filter: selectedFilter, writing: options ? false : writing, dueOnly: options?.dueOnly,
    });
    if (!result) return;
    setDeckId(target.id);
    setDirection(side);
    setFilter(selectedFilter);
    if (result.workspace.session) bookmarkStudy(result.workspace.session.id);
    navigate("study");
  }

  function cardsIn(target: Deck, side: Direction, selection: Filter) {
    const recent = workspace?.mistakes[target.id + ":" + side] ?? [];
    return target.cards.filter(card => selection === "all" || (selection === "starred" ? card.starred : recent.includes(card.id))).map(card => card.id);
  }

  /** Opens the card mode and continues an unfinished pass of this set, direction and selection. */
  function openCards(target: Deck, side: Direction, selection: Filter, fallback?: { order: string[]; index: number; flipped: boolean }) {
    const saved = workspace?.passes?.[target.id + ":" + side];
    const ids = cardsIn(target, side, saved && !saved.done && !fallback ? saved.filter : selection);
    if (saved && !saved.done && (fallback || saved.filter === selection)) {
      const order = saved.order.filter(id => ids.includes(id) || target.cards.some(card => card.id === id));
      for (const id of ids) if (!order.includes(id)) order.push(id);
      const pass = Object.fromEntries([...saved.known.map(id => [id, true]), ...saved.later.map(id => [id, false])]);
      setFilter(saved.filter);
      setCardsStart({ key: crypto.randomUUID(), order, index: Math.min(saved.index, Math.max(0, order.length - 1)), flipped: false, filter: saved.filter, pass });
    } else {
      setCardsStart({ key: crypto.randomUUID(), order: fallback?.order ?? ids, index: fallback?.index ?? 0, flipped: fallback?.flipped ?? false, filter: selection, pass: {} });
    }
    navigate("cards");
  }

  const saveProgress = useCallback((target: Deck, side: Direction, selection: Filter, snapshot: PassSnapshot) => {
    void mutate({
      type: "cardPass", deckId: target.id, direction: side, filter: selection, order: snapshot.order, index: snapshot.index,
      known: Object.keys(snapshot.pass).filter(id => snapshot.pass[id]), later: Object.keys(snapshot.pass).filter(id => !snapshot.pass[id]), done: snapshot.done,
    }, { queue: true, silent: true });
  // mutate reads only refs, so a stable callback is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDeck(item: Deck, from: "home" | "profile" = "home") {
    setDeckOrigin(from);
    setDeckId(item.id); setFilter("all"); setDirection("front"); setWriting(false); navigate("deck");
  }

  function openChat(item?: Deck, cardId?: string) {
    setDeckId(item?.id ?? "");
    setChatCard(cardId);
    navigate("chat");
  }

  function explainCard(item: Deck, cardId: string) {
    const card = item.cards.find(card => card.id === cardId);
    if (card) setExplain({ card, direction });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Kopiert");
    } catch { setProblem({ message: "Kopieren ging nicht. Markiere den Text im Feld und kopiere ihn von Hand." }); }
  }

  function runStep(step: Step) {
    if (step.kind === "done") { navigate("home"); return; }
    const target = workspace?.decks.find(item => item.id === step.deckId);
    if (step.kind === "resume") { resume(); return; }
    if (!target) return;
    setDeckId(target.id);
    if (step.kind === "review") void start("review", { target, side: step.direction, dueOnly: true });
    else if (step.kind === "learn") void start("learn", { target, side: "front" });
    else void start("cram", undefined, "mistakes");
  }

  async function share(url: string, title: string) {
    const outcome = await shareLink(url, title);
    if (outcome === "copied") setNotice("Link kopiert");
    else if (outcome === "failed") setProblem({ message: "Teilen ging nicht. Der Link: " + url });
  }

  async function publish(target: Deck) {
    const result = await mutate({ type: "publish", deckId: target.id });
    if (result?.token) await share(location.origin + "/?set=" + result.token, target.title + " in Kalo");
  }

  async function createDuel(target: Deck) {
    const result = await mutate({ type: "createDuel", deckId: target.id });
    if (result?.token) { setDuelToken(result.token); navigate("duel"); }
  }

  async function inviteFriend() {
    const result = await mutate({ type: "inviteFriend" });
    if (result?.token) await share(location.origin + "/?friend=" + result.token, "Freunde in Kalo");
  }

  async function removeFriend(friend: FriendSummary) {
    if (await confirm({ title: "Freund entfernen?", message: "«" + friend.name + "» aus deinen Freunden entfernen?", confirm: "Entfernen", destructive: true })) void mutate({ type: "removeFriend", friendId: friend.id });
  }

  function returnToDeck() {
    if (view === "study" && session) setDeckId(session.deckId);
    navigate(deck || (view === "study" && session) ? "deck" : "home");
  }

  function sortCard(target: Deck, cardId: string, known: boolean, sortId: string) {
    return mutate({ type: "sortCard", deckId: target.id, cardId, direction, known, sortId }, {
      queue: true, silent: true, onDone: ok => { if (!ok) failedSorts.current.add(sortId); },
    }).then(Boolean);
  }

  function undoSort(sortId: string) {
    let status = 200;
    return mutate({ type: "undoSort", sortId }, {
      queue: true, silent: true,
      // A rating that never reached the server has nothing to take back.
      skip: () => failedSorts.current.has(sortId),
      onDone: (_ok, code) => { status = code; },
    }).then((result): UndoResult => result ? "ok" : status === 0 || status >= 500 ? "offline" : "conflict");
  }

  const dueSets: DueSet[] = workspace?.decks.flatMap(item =>
    (["front", "back"] as const).flatMap(side => {
      const ready = dueCards(workspace, item.cards, side, time);
      return ready.length ? [{ deck: item, side, count: ready.length, oldest: ready[0].due }] : [];
    }),
  ).sort((a, b) => a.oldest - b.oldest) ?? [];
  const dueCount = dueSets.reduce((total, item) => total + item.count, 0);
  // Keeps sending the in-app reminder for people who switched it on earlier.
  useReminders(accountId, dueCount, time);
  const dueByDeck = new Map<string, number>();
  dueSets.forEach(item => dueByDeck.set(item.deck.id, (dueByDeck.get(item.deck.id) ?? 0) + item.count));
  const nextReview = Object.values(workspace?.reviews ?? {}).reduce((next, item) => {
    const due = Date.parse(item.due);
    return due > time ? Math.min(next, due) : next;
  }, Infinity);

  const recentDeck = lastActivity?.mode === "cards" ? workspace?.decks.find(item => item.id === lastActivity.deckId) : undefined;
  const recentCard = lastActivity?.mode === "cards" ? recentDeck?.cards.find(item => item.id === lastActivity.cardId) : undefined;
  const continueStudy = session && !session.done && (!recentCard || lastActivity?.mode === "study");
  const studyDeck = continueStudy ? workspace?.decks.find(d => d.id === session.deckId) : undefined;
  let recent: Recent | undefined;
  if (continueStudy && studyDeck) {
    const learned = session.initial.filter(id => (session.tally[id]?.streak ?? 0) >= 2).length;
    // Each card needs two correct recalls, so the bar also moves for the first one.
    const steps = session.initial.reduce((total, id) => total + Math.min(2, session.tally[id]?.streak ?? 0), 0);
    recent = session.mode === "learn"
      ? { title: studyDeck.title, mode: modeName.learn, progress: steps / Math.max(1, session.initial.length * 2), detail: learned + " von " + session.initial.length + " sitzen · Runde " + session.round, onOpen: resume }
      : { title: studyDeck.title, mode: modeName[session.mode], progress: session.cursor / Math.max(1, session.queue.length), detail: session.cursor + " von " + session.queue.length + " beantwortet", onOpen: resume };
  } else if (recentDeck && recentCard && lastActivity?.mode === "cards") {
    const order = lastActivity.order.filter(id => recentDeck.cards.some(item => item.id === id));
    if (!order.includes(recentCard.id)) order.push(recentCard.id);
    const at = order.indexOf(recentCard.id);
    recent = {
      title: recentDeck.title, mode: "Karten", progress: (at + 1) / order.length, detail: "Karte " + (at + 1) + " von " + order.length,
      onOpen: () => { setDeckId(recentDeck.id); setDirection(lastActivity.direction); openCards(recentDeck, lastActivity.direction, "all", { order, index: at, flipped: lastActivity.flipped }); },
    };
  }

  const profileView = view === "profile" || view === "profile-edit" || view === "stats" || view === "settings";
  const homeView = !profileView && view !== "chat";
  const creating = view === "editor" || view === "import";
  const writingBusy = busy || sync.pending > 0;

  async function discardPending() {
    if (!await confirm({ title: "Lokale Änderungen verwerfen?", message: (sync.error ?? "Diese Änderungen konnten nicht abgeglichen werden.") + " " + sync.pending + " noch nicht bestätigte Aktionen werden von diesem Gerät entfernt. Bereits auf dem Server gespeicherte Bewertungen bleiben erhalten.", confirm: "Verwerfen", destructive: true })) return;
    try { await outbox.current?.discard(); navigate("home"); window.setTimeout(() => void refresh(true), 0); }
    catch { setProblem({ message: "Dein Browser blockiert den lokalen Speicher." }); }
  }

  return (
    <div className="shell" data-view={view}>
      <a className="skip-link" href="#inhalt">Zum Inhalt</a>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")} aria-label="Kalo, zur Bibliothek">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="currentColor" /><rect x="15" y="8" width="18" height="25" rx="5" fill="white" opacity=".3" transform="rotate(12 24 20)" /><rect x="8" y="7" width="19" height="25" rx="5" fill="white" transform="rotate(-10 18 19)" /><path d="M23 17a6 6 0 1 0 .5 6m-4-6 4 .5-.5-4" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg> Kalo
        </button>
        <div className="topbar-right">
          {data && (sync.pending > 0 || busy) && <span className="sync-status" role="status" aria-live="polite" data-state={sync.phase}>
            <button className="text-button" onClick={() => void outbox.current?.retry(true)} title={sync.error ?? (sync.pending ? "Auf diesem Gerät gesichert. Wird automatisch übertragen, sobald die Verbindung steht." : "Wird auf dem Server gespeichert.")}>
              <Icon kind={sync.phase === "waiting" || sync.phase === "blocked" ? "cloudOff" : "repeat"} size="s" /><span>{sync.phase === "waiting" || sync.phase === "blocked" ? "Lokal gesichert" : "Wird gespeichert"}</span><span className="sr-only">{sync.pending} Aktionen ausstehend</span>
            </button>
          </span>}
        {/* Statistics and settings belong to the profile, like in MyStyle. */}
        {view === "profile" && <div className="topbar-actions">
          <button className="icon-button" aria-label="Profil bearbeiten" title="Profil bearbeiten" onClick={() => navigate("profile-edit")}><Icon kind="edit" /></button>
          <button className="icon-button" aria-label="Statistik" title="Statistik" onClick={() => navigate("stats")}><Icon kind="pie" /></button>
          <button className="icon-button" aria-label="Einstellungen" title="Einstellungen" onClick={() => navigate("settings")}><Icon kind="settings" /></button>
        </div>}
        </div>
      </header>
      <main ref={main} className="main" id="inhalt" tabIndex={-1} aria-busy={writingBusy}>
        {data && problem && <ErrorBanner problem={problem} onDismiss={() => setProblem(null)} />}
        {sync.phase === "blocked" && <div className="banner" role="alert"><p>{sync.error ?? "Deine Anmeldung ist abgelaufen. Die Bewertungen bleiben auf diesem Gerät gesichert."}</p><div className="banner-actions">
          {sync.status === 401 ? <a className="button small" href="/signin-with-chatgpt?return_to=%2F">Neu anmelden</a> : <><button className="button small" onClick={() => void outbox.current?.retry(true)}>Erneut versuchen</button><button className="text-button" onClick={() => void discardPending()}>Verwerfen</button></>}
        </div></div>}
        <Toast message={notice} />
        {!data && (problem
          ? <EmptyState icon="cloudOff" title="Keine Verbindung" text={problem.message}>
              {problem.action && <button className="button primary" onClick={problem.action.run}><Icon kind="repeat" /> {problem.action.label}</button>}
              {problem.link && <a className="button primary" href={problem.link.href} target="_top">{problem.link.label}</a>}
            </EmptyState>
          : <LibrarySkeleton />)}

        {workspace && view === "home" && <HomeView workspace={workspace} busy={writingBusy} dueSets={dueSets} dueCount={dueCount} nextReview={nextReview}
          recent={recent} now={time} step={nextStep(workspace, time, lastActivity?.mode === "cards" ? lastActivity.deckId : undefined)}
          drafts={data?.drafts ?? []} onDraft={draft => edit(undefined, draft)} onProfile={() => navigate("profile")} onStep={runStep} onGoal={() => navigate("settings")}
          unsaved={unsavedEditor ? { title: unsavedEditor.title, onOpen: () => { setEditor(unsavedEditor); navigate("editor"); }, onDiscard: () => writeStored(editorKey, null) } : undefined}
          onReview={item => void start("review", { target: item.deck, side: item.side, dueOnly: true })}
          onOpenDeck={openDeck} onCreate={() => edit()} />}

        {workspace && view === "profile" && <ProfileView workspace={workspace} now={time}
          profile={data?.profile ?? { name: "Du", picture: null, custom: false }} friends={data?.friends ?? []} dueByDeck={dueByDeck}
          onOpenDeck={item => openDeck(item, "profile")} onCreate={() => edit()} />}

        {data && view === "profile-edit" && <ProfileEditor profile={data.profile ?? { name: "Du", picture: null, custom: false }} friends={data.friends ?? []} busy={writingBusy} mutate={mutate}
          onBack={() => navigate("profile")} onInvite={() => void inviteFriend()} onRemove={friend => void removeFriend(friend)} onError={message => setProblem({ message })} />}

        {workspace && view === "stats" && <StatsView workspace={workspace} now={time} onBack={() => history.back()} />}

        {workspace && view === "deck" && deck && <DeckView workspace={workspace} deck={deck} time={time} busy={writingBusy}
          direction={direction} filter={filter} writing={writing} onDirection={setDirection} onFilter={setFilter} onWriting={setWriting}
          onHome={() => navigate(deckOrigin)} backLabel={deckOrigin === "profile" ? "Profil" : "Home"} onEdit={() => edit(deck)} onCards={() => openCards(deck, direction, filter)} onStart={mode => void start(mode)}
          onChat={() => openChat(deck)} onResume={session?.deckId === deck.id && !session.done ? resume : undefined}
          onStar={(cardId, starred) => void mutate({ type: "star", deckId: deck.id, cardId, starred }, { queue: true })}
          shareToken={data?.published?.[deck.id]}
          onShare={() => void publish(deck)} onDuel={() => void createDuel(deck)} />}

        {data && view === "editor" && editor && <EditorView editor={editor} busy={writingBusy} subjects={[...new Set(workspace?.decks.map(item => item.subject).filter((item): item is string => Boolean(item)))]} onChange={changeEditor} onSave={save} onImportNew={() => importText("new")} onChat={() => openChat()} onDiscard={() => void discardDraft()}
          onBack={returnToDeck} onImport={() => importText("append")} onDelete={() => void removeDeck()} />}

        {data && view === "import" && <ImportView room={importTarget === "append" && editor ? MAX_CARDS - editor.cards.filter(c => c.front.trim() || c.back.trim()).length : MAX_CARDS}
          onBack={() => navigate(importTarget === "append" && editor ? "editor" : "home")} onAccept={acceptImport}
          onError={message => setProblem(message ? { message } : null)} />}

        {data && view === "cards" && deck && cardsStart && <CardViewer key={cardsStart.key} confirm={confirm} deck={deck} start={cardsStart} direction={direction}
          workspace={workspace!} now={time} onStep={runStep}
          onSort={(cardId, known, sortId) => sortCard(deck, cardId, known, sortId)} onUndo={undoSort} onProblem={setProblem}
          onBack={returnToDeck} onHome={() => navigate("home")} onChat={cardId => explainCard(deck, cardId)}
          onBookmark={activity => writeStored(bookmarkKey, JSON.stringify(activity))}
          onProgress={snapshot => saveProgress(deck, direction, cardsStart.filter, snapshot)} />}

        {workspace && view === "study" && session && <StudyView workspace={workspace} session={session} busy={writingBusy} mutate={mutate}
          onBack={returnToDeck} onStart={(mode, override) => void start(mode, undefined, override)}
          now={time} onStep={runStep} onHome={() => navigate("home")} />}

        {data && view === "duel" && duelToken && <DuelView key={duelToken} token={duelToken} mutate={mutate} onHome={() => navigate("home")}
          onShare={(token, title) => void share(location.origin + "/?duel=" + token, "Duell: " + title)} />}

        {data && view === "chat" && <ChatView key={deckId + ":" + chatCard} deck={deck} presetCard={chatCard} busy={writingBusy}
          chatUrl={safeChatUrl(chatLink)} mutate={mutate} copy={text => void copy(text)} onBack={deck ? returnToDeck : () => history.back()}
          onImport={() => importText("new")} />}

        {workspace && view === "settings" && <SettingsView workspace={workspace} busy={writingBusy} theme={theme} chatLink={chatLink}
          mutate={mutate} onError={message => setProblem(message ? { message } : null)} onNotice={setNotice}
          pushKey={data?.pushKey} push={data?.push} onBack={() => navigate("profile")}
          onTheme={value => { setTheme(value); applyAppearance(value); }}
          onChatLink={value => {
            const url = safeChatUrl(value);
            if (url !== value.trim() && value.trim() !== "https://chatgpt.com") return false;
            writeStored("kalo-chat", url);
            return true;
          }} />}

        {data && ["deck", "cards"].includes(view) && !deck && <EmptyState icon="cards" title="Set nicht verfügbar" text="Dieses Set wurde gelöscht oder auf einem anderen Gerät verändert.">
          <button className="button primary" onClick={() => navigate("home")}>Zur Bibliothek</button></EmptyState>}
        {data && view === "study" && !session && <EmptyState icon="target" title="Keine offene Runde" text="Diese Runde wurde beendet, vielleicht auf einem anderen Gerät.">
          <button className="button primary" onClick={returnToDeck}>Zurück</button></EmptyState>}
      </main>
      {/* Outside the top bar: its backdrop filter would otherwise anchor this fixed dock to the bar. */}
      <div className="bottom-dock">
        <nav aria-label="Hauptmenü">
          <button aria-current={homeView ? "page" : undefined} aria-label="Home" title="Home" onClick={() => navigate("home")}><Icon kind="home" filled={homeView} /></button>
          <button aria-current={profileView ? "page" : undefined} aria-label="Profil" onClick={() => navigate("profile")}>
            {data?.profile?.picture ? <Avatar name={data.profile.name} picture={data.profile.picture} size={24} /> : <Icon kind="person" filled={profileView} />}</button>
        </nav>
          <button className="nav-create" data-open={creating || undefined} aria-label={creating ? "Bearbeiten schliessen" : "Neues Set erstellen"} title={creating ? "Schliessen" : "Neues Set"}
            onClick={() => { if (creating) history.back(); else { setDeckId(""); edit(); } }}>
            {/* Plus turns into minus while an editor is open: the vertical stroke folds away. */}
            <svg className="icon-svg plus-minus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /><path className="pm-vertical" d="M12 5v14" /></svg>
          </button>
      </div>
      {confirmDialog}
      {celebrate && <StreakCelebration previous={celebrate.previous} days={celebrate.streak} onClose={() => setCelebrate(null)} />}
      {explain && <CardExplainSheet card={explain.card} direction={explain.direction} chatUrl={safeChatUrl(chatLink)} onClose={() => setExplain(null)} />}
    </div>
  );
}
