"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Appearance } from "../../lib/appearance";
import { deckDigest, dueCards, type CardInput, type Deck, type Direction, type Filter, type Mode } from "../../lib/learning";
import CardViewer from "./card-viewer";
import ChatView from "./chat-view";
import DeckView from "./deck-view";
import EditorView from "./editor-view";
import HomeView, { type DueSet } from "./home-view";
import { NavIcon } from "./icons";
import ImportView from "./import-view";
import { useReminders } from "./reminders";
import SettingsView from "./settings-view";
import { parseStored, readStored, useStored, writeStored } from "./storage";
import StudyView from "./study-view";
import { applyAppearance, syncThemeColor } from "./theme";
import { freshEditor, row, type CardsStart, type Data, type Draft, type Editor, type LastActivity, type Mutate, type MutateResult, type View } from "./types";

const DEFAULT_CHAT = "https://chatgpt.com/";
const MAX_CARDS = 400;
const POLL_MS = 25_000;

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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const dataRef = useRef<Data | null>(null);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const lastRefresh = useRef(0);
  const main = useRef<HTMLElement>(null);

  const storedBookmark = useStored(bookmarkKey);
  const storedEditor = useStored(editorKey);
  const storedChat = useStored("kalo-chat") ?? readStored("kartenloop-chat");
  const lastActivity = useMemo(() => parseStored(storedBookmark, isActivity), [storedBookmark]);
  const unsavedEditor = useMemo(() => parseStored(storedEditor, isEditor), [storedEditor]);
  const chatLink = storedChat ?? DEFAULT_CHAT;

  const accept = useCallback((next: Data) => {
    setData(old => {
      const value = !old || next.revision >= old.revision ? next : old;
      dataRef.current = value;
      return value;
    });
  }, []);

  const refresh = useCallback(async (force = false) => {
    const started = Date.now();
    if (pending.current || (!force && started - lastRefresh.current < 2_000)) return;
    lastRefresh.current = started;
    try {
      const known = dataRef.current?.revision;
      const result = await fetch("/api/workspace" + (known === undefined ? "" : "?known=" + known), { cache: "no-store" });
      if (!result.ok) throw new Error(result.status === 401 ? "Melde dich neu an, um deinen Lernstand zu laden." : "Dein Lernstand konnte gerade nicht geladen werden.");
      const next = await result.json() as Data | { unchanged: true };
      if (!("unchanged" in next)) accept(next);
      setTime(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verbindung fehlgeschlagen.");
    }
  }, [accept]);

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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2_800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Queued actions (card swipes) run one after another, all others are dropped while one is running.
  const mutate: Mutate = async (action, options) => {
    if (!dataRef.current || (pending.current && !options?.queue)) return null;
    pending.current += 1;
    setBusy(true);
    setError("");
    const run = async (): Promise<MutateResult | null> => {
      try {
        const response = await fetch("/api/workspace", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: dataRef.current?.revision, action }),
        });
        const result = await response.json() as MutateResult;
        if (result.workspace) accept(result);
        if (!response.ok) throw new Error(result.error || "Die Änderung konnte gerade nicht gespeichert werden.");
        setTime(Date.now());
        return result;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Verbindung fehlgeschlagen.");
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

  const workspace = data?.workspace;
  const deck = workspace?.decks.find(item => item.id === deckId);
  const session = workspace?.session;

  useEffect(() => {
    if (error && ["editor", "import", "settings"].includes(view)) {
      main.current?.querySelector("[role=alert]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [error, view]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (view !== "home" && !main.current?.contains(document.activeElement)) main.current?.focus({ preventScroll: true });
  }, [view]);

  function navigate(next: View) {
    setError("");
    setView(next);
  }

  function changeEditor(update: (current: Editor) => Editor) {
    if (!editor) return;
    const next = update(editor);
    setEditor(next);
    writeStored(editorKey, JSON.stringify(next));
  }

  function openEditor(next: Editor, persist = false) {
    if (unsavedEditor && !persist && !window.confirm("Ungespeicherte Änderungen an «" + (unsavedEditor.title || "Neues Set") + "» verwerfen?")) return;
    writeStored(editorKey, persist ? JSON.stringify(next) : null);
    setEditor(next);
    navigate("editor");
  }

  function edit(item?: Deck, draft?: Draft) {
    openEditor(item ? { deckId: item.id, title: item.title, cards: item.cards.map(row), base: deckDigest(item) }
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
    } else openEditor({ title: "", cards: cards.map(row) }, true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const complete = editor.cards.filter(item => item.front.trim() || item.back.trim());
    if (!complete.length || complete.some(item => !item.front.trim() || !item.back.trim())) {
      setError("Fülle bei jeder Karte beide Seiten aus.");
      return;
    }
    const result = await mutate({
      type: "save", title: editor.title, deckId: editor.deckId, draftId: editor.draftId, base: editor.base,
      cards: complete.map(item => ({ id: item.id, front: item.front, back: item.back,
        frontAliases: item.frontAliases, backAliases: item.backAliases, starred: item.starred })),
    });
    if (!result) return;
    writeStored(editorKey, null);
    setDeckId(editor.deckId ?? result.workspace.decks[0].id);
    setEditor(null);
    navigate("deck");
    setNotice("Set gespeichert.");
  }

  async function removeDeck() {
    if (!editor?.deckId || !window.confirm("Dieses Set und seinen Lernstand endgültig entfernen?")) return;
    if (await mutate({ type: "delete", deckId: editor.deckId })) {
      writeStored(editorKey, null);
      setEditor(null);
      navigate("home");
      setNotice("Set entfernt.");
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

  async function start(mode: Mode, options?: { target: Deck; side: Direction; dueOnly: true }, override?: Filter) {
    const target = options?.target ?? deck;
    if (!target) return;
    const side = options?.side ?? direction;
    const selectedFilter = options ? "all" : override ?? filter;
    if (session && !session.done) {
      if (!options && session.deckId === target.id && session.mode === mode && session.direction === side
          && session.filter === selectedFilter && session.writing === writing) {
        resume();
        return;
      }
      if (!window.confirm("Eine Lernrunde ist offen. Neue Runde starten?")) return;
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

  function openCards(order: string[], index = 0, flipped = false) {
    setCardsStart({ key: crypto.randomUUID(), order, index, flipped });
    navigate("cards");
  }

  function openChat(item?: Deck, cardId?: string) {
    setDeckId(item?.id ?? "");
    setChatCard(cardId);
    navigate("chat");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Text kopiert.");
    } catch { setError("Markiere und kopiere den Text im Feld."); }
  }

  function returnToDeck() {
    if (view === "study" && session) setDeckId(session.deckId);
    navigate(deck || (view === "study" && session) ? "deck" : "home");
  }

  const learned = Object.values(workspace?.progress ?? {}).filter(item => item.streak === 2).length;
  const dueSets: DueSet[] = workspace?.decks.flatMap(item =>
    (["front", "back"] as const).flatMap(side => {
      const ready = dueCards(workspace, item.cards, side, time);
      return ready.length ? [{ deck: item, side, count: ready.length, oldest: ready[0].due }] : [];
    }),
  ).sort((a, b) => a.oldest - b.oldest) ?? [];
  const dueCount = dueSets.reduce((total, item) => total + item.count, 0);
  const reminders = useReminders(accountId, dueCount, time);
  const nextReview = Object.values(workspace?.reviews ?? {}).reduce((next, item) => {
    const due = Date.parse(item.due);
    return due > time ? Math.min(next, due) : next;
  }, Infinity);

  const recentDeck = lastActivity?.mode === "cards" ? workspace?.decks.find(item => item.id === lastActivity.deckId) : undefined;
  const recentCard = lastActivity?.mode === "cards" ? recentDeck?.cards.find(item => item.id === lastActivity.cardId) : undefined;
  const continueStudy = session && !session.done && (!recentCard || lastActivity?.mode === "study");
  const studyPrompt = continueStudy && workspace ? workspace.decks.find(d => d.id === session.deckId) : undefined;
  const recent = continueStudy && studyPrompt ? {
    title: studyPrompt.title,
    prompt: studyPrompt.cards.find(card => card.id === session.queue[session.cursor])?.[session.direction],
    onOpen: resume,
  } : recentDeck && recentCard && lastActivity?.mode === "cards" ? {
    title: recentDeck.title,
    prompt: recentCard[lastActivity.direction],
    onOpen: () => {
      const order = lastActivity.order.filter(id => recentDeck.cards.some(item => item.id === id));
      if (!order.includes(recentCard.id)) order.push(recentCard.id);
      setDeckId(recentDeck.id);
      setDirection(lastActivity.direction);
      openCards(order, order.indexOf(recentCard.id), lastActivity.flipped);
    },
  } : undefined;

  const libraryView = view !== "chat" && view !== "settings";
  const draftCount = data?.drafts.length ?? 0;

  return (
    <div className="shell">
      <a className="skip-link" href="#inhalt">Zum Inhalt</a>
      <aside className="rail">
        {/* A tiny static SVG mark, image optimisation would add nothing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <button className="brand" onClick={() => navigate("home")}><img src="/kalo-mark.svg" alt="" width={34} height={34} /> Kalo</button>
        <button className="gear icon" aria-label="Einstellungen" aria-current={view === "settings" ? "page" : undefined} onClick={() => navigate("settings")}><NavIcon kind="settings" /></button>
      </aside>
      <main ref={main} className="main" id="inhalt" tabIndex={-1} aria-busy={busy}>
        {error && <div className="message error" role="alert">{error}</div>}
        <div className="toast-slot" role="status" aria-live="polite">{notice && <div className="toast" key={notice}>{notice}</div>}</div>
        {!data && <div className="panel loading"><h1>Kalo</h1><p>Dein Lernstand wird geladen.</p><button className="button" onClick={() => void refresh(true)}>Erneut laden</button></div>}

        {workspace && view === "home" && <HomeView workspace={workspace} busy={busy} dueSets={dueSets} dueCount={dueCount} learned={learned} nextReview={nextReview}
          recent={recent}
          unsaved={unsavedEditor ? { title: unsavedEditor.title, onOpen: () => { setEditor(unsavedEditor); navigate("editor"); }, onDiscard: () => writeStored(editorKey, null) } : undefined}
          onReview={item => void start("review", { target: item.deck, side: item.side, dueOnly: true })}
          onOpenDeck={item => { setDeckId(item.id); setFilter("all"); setDirection("front"); setWriting(false); navigate("deck"); }}
          onImport={() => importText("new")} onChat={() => openChat()} onCreate={() => edit()} />}

        {workspace && view === "deck" && deck && <DeckView workspace={workspace} deck={deck} time={time} busy={busy}
          direction={direction} filter={filter} writing={writing} onDirection={setDirection} onFilter={setFilter} onWriting={setWriting}
          onHome={() => navigate("home")} onEdit={() => edit(deck)} onCards={ids => openCards(ids)} onStart={mode => void start(mode)}
          onChat={() => openChat(deck)} onResume={session?.deckId === deck.id && !session.done ? resume : undefined}
          onStar={(cardId, starred) => void mutate({ type: "star", deckId: deck.id, cardId, starred }, { queue: true })} />}

        {data && view === "editor" && editor && <EditorView editor={editor} busy={busy} onChange={changeEditor} onSave={save}
          onBack={returnToDeck} onImport={() => importText("append")} onDelete={() => void removeDeck()} />}

        {data && view === "import" && <ImportView room={importTarget === "append" && editor ? MAX_CARDS - editor.cards.filter(c => c.front.trim() || c.back.trim()).length : MAX_CARDS}
          onBack={() => navigate(importTarget === "append" && editor ? "editor" : "home")} onAccept={acceptImport} onError={setError} />}

        {data && view === "cards" && deck && cardsStart && <CardViewer key={cardsStart.key} deck={deck} start={cardsStart} direction={direction} error={error}
          onSort={async (cardId, known) => Boolean(await mutate({ type: "sortCard", deckId: deck.id, cardId, direction, known }, { queue: true }))}
          onBack={returnToDeck} onHome={() => navigate("home")} onChat={cardId => openChat(deck, cardId)}
          onBookmark={activity => writeStored(bookmarkKey, JSON.stringify(activity))} />}

        {workspace && view === "study" && session && <StudyView workspace={workspace} session={session} busy={busy} mutate={mutate}
          onBack={returnToDeck} onCramMistakes={() => void start("cram", undefined, "mistakes")} />}

        {data && view === "chat" && <ChatView key={deckId + ":" + chatCard} deck={deck} presetCard={chatCard} drafts={data.drafts} busy={busy}
          chatUrl={safeChatUrl(chatLink)} mutate={mutate} copy={text => void copy(text)} onBack={returnToDeck} onRefresh={() => void refresh(true)}
          onImport={() => importText("new")} onReview={draft => edit(undefined, draft)} />}

        {workspace && view === "settings" && <SettingsView workspace={workspace} busy={busy} theme={theme} chatLink={chatLink} reminders={reminders}
          mutate={mutate} onError={setError} onNotice={setNotice}
          onTheme={value => { setTheme(value); applyAppearance(value); }}
          onChatLink={value => {
            const url = safeChatUrl(value);
            if (url !== value.trim() && value.trim() !== "https://chatgpt.com") return false;
            writeStored("kalo-chat", url);
            return true;
          }} />}

        {data && ["deck", "cards"].includes(view) && !deck && <section className="panel flow"><h1>Set nicht verfügbar</h1><button className="button" onClick={() => navigate("home")}>Zur Bibliothek</button></section>}
        {data && view === "study" && !session && <section className="panel flow"><h1>Keine offene Runde</h1><button className="button" onClick={returnToDeck}>Zurück</button></section>}
      </main>
      {/* Outside the top bar: its backdrop filter would otherwise anchor this fixed dock to the bar. */}
      <div className="bottom-dock">
        <nav aria-label="Hauptmenü">
          <button aria-current={libraryView ? "page" : undefined} onClick={() => navigate("home")}><NavIcon kind="library" /> Bibliothek</button>
          <button aria-current={view === "chat" ? "page" : undefined} onClick={() => openChat()}><NavIcon kind="chat" /> ChatGPT {draftCount > 0 && <span className="badge">{draftCount}</span>}</button>
        </nav>
        <button className="nav-create" aria-label="Neues Set erstellen" onClick={() => { setDeckId(""); edit(); }}><NavIcon kind="plus" /></button>
      </div>
    </div>
  );
}
