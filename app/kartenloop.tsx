"use client";

import Flashcard from "./flashcard";
import { useReminders } from "./reminders";
import { appearance, appearanceCookie, type Appearance } from "../lib/appearance";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  type Action, type CardInput, type Deck, type Direction, type Filter, type Mode, type Workspace,
  MAX_LEARN_ROUNDS, dueCards, matches, parseImport, question, reviewQueue, workspaceShape, type ImportSeparator,
} from "../lib/learning";

type Draft = { id: string; title: string; cards: CardInput[]; created: number };
type Data = { workspace: Workspace; drafts: Draft[]; revision: number };
type EditCard = CardInput & { id?: string; row: string };
type Editor = { title: string; cards: EditCard[]; deckId?: string; draftId?: string; base?: string };
type Extra = { type: "share"; deckId: string; cardIds: string[] } | { type: "discard"; draftId: string } | { type: "revoke"; token: string };
type View = "home" | "deck" | "editor" | "import" | "cards" | "study" | "chat" | "settings";
const modeTitle = { learn: "Lernen", cram: "Pauken", review: "Wiederholen" };
const row = (card: CardInput & { id?: string } = { front: "", back: "" }): EditCard => ({ ...card, row: crypto.randomUUID() });
const freshEditor = (): Editor => ({ title: "", cards: [row(), row()] });
const date = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" });

function shuffle<T>(input: T[]) {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function positionOf(session: Workspace["session"] | undefined) {
  return session ? [session.id, session.round, session.cursor].join(":") : "";
}

type StudyFeedback = {
  question: NonNullable<ReturnType<typeof question>>;
  submitted: string;
  position: string;
  round: number;
  answered: number;
  total: number;
};

function RoundCelebration() {
  return <div className="round-celebration" aria-hidden="true">
    <span>✓</span><i /><i /><i /><i /><i /><i />
  </div>;
}

type LastActivity =
  | { mode: "cards"; deckId: string; cardId: string; order: string[]; direction: Direction; flipped: boolean }
  | { mode: "study"; sessionId: string };

export default function Kalo({ accountId }: { accountId: string }) {
  const bookmarkKey = "kalo-last:" + accountId;
  const [lastActivity, setLastActivity] = useState<LastActivity | null>(null);
  const [sorted, setSorted] = useState(false);
  const [cardFocus, setCardFocus] = useState(false);
  const [rating, setRating] = useState<boolean | null>(null);
  const focusDialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (cardFocus && !focusDialog.current?.open) focusDialog.current?.showModal();
  }, [cardFocus]);

  function closeCardFocus() {
    setCardFocus(false);
    requestAnimationFrame(() => expandButton.current?.focus());
  }
  const [theme, setTheme] = useState<Appearance>("system");
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<View>("home");
  const [search, setSearch] = useState("");
  const [restoreDraft, setRestoreDraft] = useState<Workspace | null>(null);
  const [deckId, setDeckId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [separator, setSeparator] = useState<ImportSeparator>("\t");
  const [paste, setPaste] = useState("");
  const [imported, setImported] = useState<ReturnType<typeof parseImport> | null>(null);
  const [importDestination, setImportDestination] = useState<"new" | "append">("new");
  const [direction, setDirection] = useState<Direction>("front");
  const [filter, setFilter] = useState<Filter>("all");
  const [writing, setWriting] = useState(false);
  const [browse, setBrowse] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<StudyFeedback | null>(null);
  const [openedRound, setOpenedRound] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [shareCode, setShareCode] = useState("");
  const [chatIntent, setChatIntent] = useState<"study" | "explain">("study");
  const [chatLink, setChatLink] = useState("https://chatgpt.com/");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(Date.now);
  const pending = useRef(false);
  const main = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    if (pending.current) return;
    try {
      const result = await fetch("/api/workspace", { cache: "no-store" });
      if (!result.ok) throw new Error(result.status === 401 ? "Melde dich neu an, um deinen Lernstand zu laden." : "Dein Lernstand konnte gerade nicht geladen werden.");
      const next = await result.json() as Data;
      setData(old => !old || next.revision >= old.revision ? next : old);
      setTime(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verbindung fehlgeschlagen.");
    }
  }, []);

  useEffect(() => {
    setTheme(appearance(document.documentElement.dataset.appearance));
    void refresh();
    const handle = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", handle);
    document.addEventListener("visibilitychange", handle);
    const timer = window.setInterval(handle, 25_000);
    try {
      const saved = localStorage.getItem("kartenloop-chat");
      if (saved) setChatLink(saved);
    } catch { /* Optional device preference. */ }
    return () => {
      window.removeEventListener("focus", handle);
      document.removeEventListener("visibilitychange", handle);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function mutate(action: Action | Extra) {
    if (!data || pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: data.revision, action }),
      });
      const result = await response.json() as Data & { error?: string; token?: string };
      if (result.workspace) setData(old => !old || result.revision >= old.revision ? result : old);
      if (!response.ok) throw new Error(result.error || "Die Änderung konnte gerade nicht gespeichert werden.");
      setTime(Date.now());
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verbindung fehlgeschlagen.");
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const workspace = data?.workspace;
  const deck = workspace?.decks.find(item => item.id === deckId);
  const session = workspace?.session;
  const q = workspace && question(workspace);
  const card = deck?.cards.find(item => item.id === browse[index]);
  const visibleCards = deck?.cards.filter(item => filter === "all" || (filter === "starred"
    ? item.starred : workspace?.mistakes[deck.id + ":" + direction]?.includes(item.id))) ?? [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(bookmarkKey);
      if (!saved) return;
      const activity = JSON.parse(saved) as LastActivity;
      if (activity?.mode === "study" || (activity?.mode === "cards" && Array.isArray(activity.order)
          && (activity.direction === "front" || activity.direction === "back"))) setLastActivity(activity);
    } catch { /* An unavailable bookmark leaves the library usable. */ }
  }, [bookmarkKey]);

  useEffect(() => {
    let activity: LastActivity;
    if (view === "cards" && deck && card && !sorted) {
      activity = { mode: "cards", deckId: deck.id, cardId: card.id, order: browse, direction, flipped };
    } else if (view === "study" && session && !session.done) {
      activity = { mode: "study", sessionId: session.id };
    } else return;
    setLastActivity(activity);
    try { localStorage.setItem(bookmarkKey, JSON.stringify(activity)); } catch { /* Keep it for this visit. */ }
  }, [bookmarkKey, browse, card?.id, deck?.id, direction, flipped, session?.id, session?.done, sorted, view]);

  async function sortCard(known: boolean) {
    if (!deck || !card || pending.current || sorted) return;
    const saved = await mutate({ type: "sortCard", deckId: deck.id, cardId: card.id, direction, known });
    if (!saved) return;
    if (index + 1 < browse.length) step(1);
    else setSorted(true);
    setRating(known);
  }

  const questionPosition = positionOf(session);
  useEffect(() => {
    if (view === "study") { setAnswer(""); setFlipped(false); }
  }, [questionPosition, view]);

  useEffect(() => {
    if (error && ["editor", "import", "settings"].includes(view)) {
      main.current?.querySelector("[role=alert]")?.scrollIntoView({ block: "nearest" });
    }
  }, [error, view]);

  const step = useCallback((amount: number) => {
    setIndex(current => Math.max(0, Math.min(browse.length - 1, current + amount)));
    setFlipped(false);
  }, [browse.length]);

  useEffect(() => {
    if (view !== "cards") return;
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
      if (event.code === "Space" && !(event.target instanceof HTMLElement && ["BUTTON", "A"].includes(event.target.tagName))) {
        event.preventDefault();
        setFlipped(value => !value);
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [view, step]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (view !== "home" && !main.current?.contains(document.activeElement)) main.current?.focus({ preventScroll: true });
  }, [view]);

  function navigate(next: View) {
    if (view === "editor" && next !== "editor" && next !== "import" &&
        !window.confirm("Den Editor verlassen? Ungespeicherte Änderungen gehen verloren.")) return;
    setError("");
    setNotice("");
    if (next !== "cards") { setCardFocus(false); setRating(null); }
    setView(next);
    return true;
  }

  function openDeck(item: Deck) {
    setDeckId(item.id);
    setFilter("all");
    setDirection("front");
    setWriting(false);
    navigate("deck");
  }

  function edit(item?: Deck, draft?: Draft) {
    setEditor(item ? { deckId: item.id, title: item.title, cards: item.cards.map(row), base: JSON.stringify(item) } :
      draft ? { draftId: draft.id, title: draft.title, cards: draft.cards.map(row) } : freshEditor());
    navigate("editor");
  }

  function importText(destination: "new" | "append") {
    setImportDestination(destination);
    setSeparator("\t");
    setPaste("");
    setImported(null);
    navigate("import");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (editor.deckId && editor.base !== JSON.stringify(workspace?.decks.find(item => item.id === editor.deckId))) {
      setError("Dieses Set wurde auf einem anderen Gerät geändert. Kopiere deine Änderungen, bevor du den Editor neu öffnest.");
      return;
    }
    const complete = editor.cards.filter(item => item.front.trim() || item.back.trim());
    if (!complete.length || complete.some(item => !item.front.trim() || !item.back.trim())) {
      setError("Fülle bei jeder Karte beide Seiten aus.");
      return;
    }
    const result = await mutate({
      type: "save", title: editor.title, deckId: editor.deckId, draftId: editor.draftId,
      cards: complete.map(({ row: rowId, ...item }) => item),
    });
    if (result) {
      setDeckId(editor.deckId ?? result.workspace.decks[0].id);
      setView("deck");
      setEditor(null);
      setNotice("Set gespeichert.");
    }
  }

  function resume() {
    if (!session) return;
    setDeckId(session.deckId);
    setDirection(session.direction);
    setFilter(session.filter);
    setWriting(session.writing);
    setFeedback(null);
    setFlipped(false);
    setAnswer("");
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
    if (result) {
      setDeckId(target.id);
      setDirection(side);
      setFilter(selectedFilter);
      setFeedback(null);
      setFlipped(false);
      setAnswer("");
      setView("study");
    }
  }

  async function submit(value: string, self?: boolean, showFeedback = true) {
    if (!session || !q) return;
    const result = await mutate({
      type: "answer", sessionId: session.id, cursor: session.cursor, round: session.round, answer: value, self,
    });
    if (result && showFeedback) {
      setFeedback({
        question: q, submitted: value, position: positionOf(result.workspace.session),
        round: session.round, answered: session.cursor + 1, total: session.queue.length,
      });
    }
  }

  async function rate(grade: 1 | 2 | 3 | 4) {
    if (!session) return;
    if (await mutate({ type: "rate", sessionId: session.id, cursor: session.cursor, grade })) setFlipped(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Text kopiert.");
    } catch { setError("Markiere und kopiere den Text im Feld."); }
  }

  function openChat(item: Deck, id?: string) {
    setDeckId(item.id);
    setSelection(id ? [id] : item.cards.slice(0, 80).map(c => c.id));
    setChatIntent(id ? "explain" : "study");
    setShareCode("");
    navigate("chat");
  }

  function backup() {
    if (!workspace) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "kartenloop", version: 1, workspace }, null, 2)], { type: "application/json" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = "Kalo Sicherung.json";
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  const selected = deck?.cards.filter(item => selection.includes(item.id)) ?? [];
  const chatTask = chatIntent === "study" ? "Frag mich mit diesen Karten einzeln ab. Warte jeweils auf meine Antwort und wiederhole meine Fehler später."
    : "Erkläre mir die ausgewählten Karten in einfachen Worten. Frage danach kurz nach, ob ich sie verstanden habe.";
  const source = selected.map(item => JSON.stringify({ frage: item.front, antwort: item.back })).join("\n");
  const manual = chatTask + "\n\nKarten als Lernstoff:\n" + source;
  const draftTask = "Erstelle aus meinen folgenden Unterlagen ein Kalo Set. Pro Karte eine klare Frage und eine kurze Antwort. Verwende nur den Lernstoff. Speichere das Set mit Kalo als Entwurf. Falls das Plugin fehlt, gib je eine Karte pro Zeile als Frage, Tabulator, Antwort aus.";
  const chatUrl = (() => {
    try {
      const url = new URL(chatLink);
      return url.origin === "https://chatgpt.com" && !url.username && !url.password ? url.href : "https://chatgpt.com/";
    } catch { return "https://chatgpt.com/"; }
  })();
  const draftCount = data?.drafts.length ?? 0;
  const studied = Object.values(workspace?.progress ?? {}).filter(item => item.streak === 2).length;
  const dueSets = workspace?.decks.flatMap(item =>
    (["front", "back"] as const).flatMap(side => {
      const ready = dueCards(workspace, item.cards, side, time);
      return ready.length ? [{ deck: item, side, count: ready.length, oldest: ready[0].due }] : [];
    }),
  ).sort((a, b) => a.oldest - b.oldest) ?? [];
  const dueCount = dueSets.reduce((total, item) => total + item.count, 0);
  const reminders = useReminders(accountId, dueCount, time);
  const recentDeck = lastActivity?.mode === "cards" && workspace?.decks.find(item => item.id === lastActivity.deckId);
  const recentCard = recentDeck && lastActivity?.mode === "cards"
    ? recentDeck.cards.find(item => item.id === lastActivity.cardId) : undefined;
  const continueStudy = session && !session.done && (!recentCard || lastActivity?.mode === "study");
  const recentPrompt = continueStudy ? q?.prompt : recentCard && lastActivity?.mode === "cards"
    ? recentCard[lastActivity.direction] : undefined;
  const recentTitle = continueStudy ? q?.deck.title : recentDeck ? recentDeck.title : undefined;

  function continueRecent() {
    if (continueStudy) { resume(); return; }
    if (!recentDeck || !recentCard || lastActivity?.mode !== "cards") return;
    const order = lastActivity.order.filter(id => recentDeck.cards.some(item => item.id === id));
    if (!order.includes(recentCard.id)) order.push(recentCard.id);
    setDeckId(recentDeck.id);
    setDirection(lastActivity.direction);
    setBrowse(order);
    setIndex(order.indexOf(recentCard.id));
    setFlipped(lastActivity.flipped);
    setSorted(false);
    navigate("cards");
  }

  async function reminderAction(action: () => Promise<void>) {
    try { setError(""); await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Mitteilung konnte nicht gesendet werden."); }
  }

  const nextReview = Object.values(workspace?.reviews ?? {}).reduce((next, item) => {
    const due = Date.parse(item.due);
    return due > time ? Math.min(next, due) : next;
  }, Infinity);
  const query = search.trim().toLocaleLowerCase("de-CH");
  const matchingDecks = workspace?.decks.filter(item => !query ||
    [item.title, ...item.cards.flatMap(card => [card.front, card.back])]
      .some(value => value.toLocaleLowerCase("de-CH").includes(query))) ?? [];
  const mastered = session?.mode === "learn" ? Object.values(session.tally).filter(item => item.streak >= 2).length : 0;
  const canCramMistakes = session?.mode === "cram" && Boolean(workspace?.mistakes[session.deckId + ":" + session.direction]?.length);
  const currentFeedback = feedback?.position === questionPosition ? feedback : null;
  const studyQuestion = currentFeedback?.question ?? q;
  const studyRound = currentFeedback?.round ?? session?.round ?? 1;
  const roundBreak = session?.mode === "learn" && !session.done && session.round > 1 &&
    session.cursor === 0 && openedRound !== questionPosition && !currentFeedback;
  const remaining = (session?.initial.length ?? 0) - mastered;

  function changeAppearance(value: Appearance) {
    setTheme(value);
    document.documentElement.dataset.appearance = value;
    document.cookie = appearanceCookie + "=" + value + "; Path=/; Max-Age=31536000; SameSite=Lax"
      + (location.protocol === "https:" ? "; Secure" : "");
  }

  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const selected = appearance(document.documentElement.dataset.appearance);
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
        const dark = selected === "dark" || (selected === "system" && (meta.media ? meta.media.includes("dark") : system.matches));
        meta.content = dark ? "#0a092d" : "#faf9f5";
      });
    };
    sync();
    system.addEventListener("change", sync);
    return () => system.removeEventListener("change", sync);
  }, [theme]);

  function returnToDeck() {
    if (view === "study" && session) {
      if (navigate("deck")) setDeckId(session.deckId);
      return;
    }
    navigate(deck ? "deck" : "home");
  }
  const libraryView = view !== "chat" && view !== "settings";

  const cardViewer = deck && card && <section className="card-viewer">
    <header className="card-toolbar">
      <button className="icon action-icon" aria-label="Zum Set zurück" title="Zum Set zurück" onClick={returnToDeck}><NavIcon kind="back" /></button>
      <div><h1>{deck.title}</h1><span className="muted">{index + 1} / {browse.length}</span></div>
      <button className="icon action-icon" aria-label="Mischen" title="Mischen" disabled={busy} onClick={() => {
        setBrowse(shuffle(browse)); setSorted(false); setIndex(0); setFlipped(false); setRating(null);
      }}><NavIcon kind="shuffle" /></button>
      <button ref={cardFocus ? undefined : expandButton} className="icon action-icon"
        aria-label={cardFocus ? "Vollbild verlassen" : "Vollbild öffnen"} title={cardFocus ? "Vollbild verlassen" : "Vollbild öffnen"}
        onClick={cardFocus ? closeCardFocus : () => setCardFocus(true)}><NavIcon kind={cardFocus ? "shrink" : "expand"} /></button>
    </header>
    {sorted ? <section className="panel flow"><h2>Set durchgesehen</h2>
      <button className="button primary" onClick={() => navigate("home")}>Zur Bibliothek</button></section> : <>
      <Flashcard face={card[flipped ? (direction === "front" ? "back" : "front") : direction]}
        flipped={flipped} previous next busy={busy}
        onFlip={() => setFlipped(value => !value)} onStep={step => void sortCard(step < 0)} />
      <div className="swipe-actions">
        <button className="icon action-icon rate-again" disabled={busy} aria-label="Später üben" title="Später üben" onClick={() => void sortCard(false)}><NavIcon kind="repeat" /></button>
        <button className="icon action-icon rate-known" disabled={busy} aria-label="Ich kann das" title="Ich kann das" onClick={() => void sortCard(true)}><NavIcon kind="check" /></button>
      </div>
      <div className="card-controls">
        <button className="icon action-icon" disabled={busy || index === 0} aria-label="Vorherige Karte" title="Vorherige Karte" onClick={() => step(-1)}><NavIcon kind="back" /></button>
        <button className="icon action-icon" disabled={busy || index === browse.length - 1} aria-label="Nächste Karte" title="Nächste Karte" onClick={() => step(1)}><NavIcon kind="next" /></button>
        <button className="icon action-icon" aria-label="Karte mit ChatGPT besprechen" title="Karte mit ChatGPT besprechen" onClick={() => openChat(deck, card.id)}><NavIcon kind="chat" /></button>
      </div>
    </>}
    <div className="rating-slot" role="status">
      {busy ? "Wird gespeichert …" : rating !== null && <span className={rating ? "rating-known" : "rating-again"}>
        <NavIcon kind={rating ? "check" : "repeat"} /> {rating ? "Ich kann das" : "Später üben"}
      </span>}
    </div>
    {cardFocus && error && <p className="message error" role="alert">{error}</p>}
  </section>;

  return (
    <div className="shell">
      <a className="skip-link" href="#inhalt">Zum Inhalt</a>
      <aside className="rail">
        <button className="brand" onClick={() => navigate("home")}><img src="/kalo-mark.svg" alt="" /> Kalo</button>
        <button className="gear icon" aria-label="Einstellungen" aria-current={view === "settings" ? "page" : undefined} onClick={() => navigate("settings")}><NavIcon kind="settings" /></button>
        <div className="bottom-dock">
        <nav aria-label="Hauptmenü">
          <button aria-current={libraryView ? "page" : undefined} onClick={() => navigate("home")}><NavIcon kind="library" /> Bibliothek</button>
          <button aria-current={view === "chat" ? "page" : undefined} onClick={() => { if (navigate("chat")) { setDeckId(""); setShareCode(""); } }}><NavIcon kind="chat" /> ChatGPT {draftCount > 0 && <span className="badge">{draftCount}</span>}</button>
        </nav>
        <button className="nav-create" aria-label="Neues Set erstellen" onClick={() => { if (view !== "editor" || window.confirm("Ein neues Set öffnen und den aktuellen Entwurf verwerfen?")) { setDeckId(""); edit(); } }}><NavIcon kind="plus" /></button>
        </div>
        <div className="rail-note"><i /> Privater Lernraum</div>
      </aside>
      <main ref={main} className="main" id="inhalt" tabIndex={-1} aria-busy={busy}>
        {error && <div className="message error" role="alert">{error}</div>}
        {notice && <div className="message" role="status">{notice}</div>}
        {!data && <div className="panel"><h1>Kalo</h1><p>Dein Lernstand wird geladen.</p><button className="button" onClick={() => void refresh()}>Erneut laden</button></div>}

        {data && view === "home" && <>
          <header className="library-heading">
            <div>
              <span className="eyebrow">Deine Lernbibliothek</span>
              <h1>Was lernst du heute?</h1>
            </div>
            <div className="actions">
              <button className="icon action-icon" aria-label="Text importieren" title="Text importieren" onClick={() => importText("new")}><NavIcon kind="import" /></button>
            </div>
          </header>
          {recentTitle && <button className="continue-card" onClick={continueRecent}>
            <span className="continue-icon"><NavIcon kind="library" /></span>
            <span className="continue-copy"><span className="eyebrow">Weiterlernen</span><strong>{recentTitle}</strong>{recentPrompt && <span className="muted">{recentPrompt}</span>}</span>
            <span aria-hidden="true">›</span>
          </button>}
          <div className="stats">
            <div><strong>{workspace?.decks.length}</strong><span>Kartensets</span></div>
            <div className={dueCount ? "due" : undefined}><strong>{dueCount}</strong><span>Fällig</span></div>
            <div><strong>{studied}</strong><span>Gelernte Abrufe</span></div>
          </div>
          {dueSets.length > 0 && <section className="panel review-inbox" aria-labelledby="due">
            <div className="section-title"><h2 id="due">Jetzt wiederholen</h2><span>{dueCount} fällig</span></div>
            {dueSets.map(item => <div className="due-row" key={item.deck.id + item.side}>
              <div><h3>{item.deck.title}</h3><p>{item.count} {item.count === 1 ? "Karte" : "Karten"} · {item.side === "front" ? "Vorderseite zuerst" : "Rückseite zuerst"}</p></div>
              <button className="button" disabled={busy} onClick={() => void start("review", { target: item.deck, side: item.side, dueOnly: true })}
                aria-label={item.deck.title + (item.side === "front" ? ", Vorderseite zuerst wiederholen" : ", Rückseite zuerst wiederholen")}>Üben</button>
            </div>)}
          </section>}
          {!dueCount && Number.isFinite(nextReview) && <p className="next-review">Nächste Wiederholung · {date.format(nextReview)}</p>}
          <section aria-labelledby="sets">
            <div className="section-title"><h2 id="sets">Meine Sets</h2><span>{matchingDecks.length} {matchingDecks.length === 1 ? "Set" : "Sets"}</span></div>
            {Boolean(workspace?.decks.length) && <label className="library-search">Bibliothek durchsuchen
              <input type="search" value={search} placeholder="Setname, Frage oder Antwort" onChange={event => setSearch(event.target.value)} />
            </label>}
            {matchingDecks.length ? <div className="decks">{matchingDecks.map(item => <button className="deck-tile" key={item.id} onClick={() => openDeck(item)}><span className="tile-mark"><NavIcon kind="library" /></span><span className="tile-title">{item.title}</span><span className="muted">{item.cards.length} {item.cards.length === 1 ? "Karte" : "Karten"}</span><span className="tile-arrow" aria-hidden="true">↗</span></button>)}</div> :
              workspace?.decks.length ? <div className="panel empty"><h3>Keine passenden Sets</h3><button className="button" onClick={() => setSearch("")}>Suche zurücksetzen</button></div> :
                <div className="panel empty"><h3>Platz für dein erstes Set</h3><p>Schreib deine Karten selbst, importiere eine Datei oder lass ChatGPT einen Entwurf erstellen.</p><button className="button" onClick={() => navigate("chat")}>Mit ChatGPT erstellen</button></div>}
          </section>
        </>}

        {data && view === "deck" && deck && <>
          <button className="icon action-icon" aria-label="Zur Bibliothek" title="Zur Bibliothek" onClick={() => navigate("home")}><NavIcon kind="back" /></button>
          <div className="page-heading"><div><span className="eyebrow">Kartenset · {deck.cards.length} Karten</span><h1>{deck.title}</h1></div><button className="icon action-icon" aria-label="Set bearbeiten" title="Set bearbeiten" onClick={() => edit(deck)}><NavIcon kind="edit" /></button></div>
          <details className="panel study-options">
            <summary>Lernoptionen <span>{filter === "starred" ? "Markierte Karten" : filter === "mistakes" ? "Letzte Fehler" : "Alle Karten"}{direction === "back" ? " · Rückseite zuerst" : ""}{writing ? " · Nur schreiben" : ""}</span></summary>
            <div className="options">
            <label>Fragerichtung<select value={direction} onChange={event => setDirection(event.target.value as Direction)}><option value="front">Vorderseite zuerst</option><option value="back">Rückseite zuerst</option></select></label>
            <label>Auswahl<select value={filter} onChange={event => setFilter(event.target.value as Filter)}><option value="all">Alle Karten</option><option value="starred">Markierte Karten</option><option value="mistakes">Letzte Fehler</option></select></label>
            <label className="check"><input type="checkbox" checked={writing} onChange={event => setWriting(event.target.checked)} /> Nur schreiben</label>
            </div>
          </details>
          <div className="study-modes">
            <button className="mode" disabled={!visibleCards.length} onClick={() => { setBrowse(visibleCards.map(c => c.id)); setSorted(false); setIndex(0); setFlipped(false); navigate("cards"); }}><span aria-hidden="true">01</span><strong>Karten</strong><small>Umdrehen und durchblättern</small></button>
            <button className="mode" disabled={busy || !visibleCards.length} onClick={() => void start("learn")}><span aria-hidden="true">02</span><strong>Lernen</strong><small>Schritt für Schritt frei abrufen</small></button>
            <button className="mode" disabled={busy || !visibleCards.length} onClick={() => void start("cram")}><span aria-hidden="true">03</span><strong>Pauken</strong><small>Direkt üben und Fehler wiederholen</small></button>
            <button className="mode" disabled={busy || !visibleCards.length} onClick={() => void start("review")}><span aria-hidden="true">04</span><strong>Wiederholen</strong><small>{workspace ? reviewQueue(workspace, visibleCards, direction, time).length : 0} zum Üben bereit</small></button>
          </div>
          {!visibleCards.length && <p className="muted">In dieser Auswahl sind keine Karten. Wähle oben eine andere Auswahl.</p>}
          <div className="actions"><button className="button" onClick={() => openChat(deck)}>Mit ChatGPT lernen</button>{session?.deckId === deck.id && !session.done && <button className="button" onClick={resume}>Offene Runde fortsetzen</button>}</div>
          <section className="set-list panel" aria-label="Karten im Set">{deck.cards.map(item => <div key={item.id}><span>{item.front}</span><span className="muted">{item.back}</span><button className="icon" aria-label={item.starred ? "Markierung entfernen" : "Karte markieren"} aria-pressed={item.starred} disabled={busy} onClick={() => void mutate({ type: "save", deckId: deck.id, title: deck.title, cards: deck.cards.map(c => c.id === item.id ? { ...c, starred: !c.starred } : c) })}>{item.starred ? "★" : "☆"}</button></div>)}</section>
        </>}

        {data && view === "editor" && editor && <form onSubmit={save}>
          <button type="button" className="back" onClick={returnToDeck}>‹ Zurück</button>
          <div className="page-heading"><div><span className="eyebrow">Karteneditor</span><h1>{editor.draftId ? "Entwurf prüfen" : editor.deckId ? "Set bearbeiten" : "Neues Set"}</h1></div></div>
          <div className="panel editor-title"><label>Setname<input required maxLength={120} placeholder="Zum Beispiel Englisch Wortschatz" value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })} /></label></div>
          <div className="edit-list">
            {editor.cards.map((item, idx) => {
              const update = (value: Partial<EditCard>) => setEditor(current => current && { ...current, cards: current.cards.map(c => c.row === item.row ? { ...c, ...value } : c) });
              const move = (offset: number) => {
                const cards = [...editor.cards];
                [cards[idx], cards[idx + offset]] = [cards[idx + offset], cards[idx]];
                setEditor({ ...editor, cards });
              };
              return <div className="panel edit-card" key={item.row}>
                <div className="edit-head"><span className="eyebrow">Karte {idx + 1}</span><div>
                  <button type="button" className="icon" aria-label="Karte nach oben verschieben" disabled={idx === 0} onClick={() => move(-1)}>↑</button>
                  <button type="button" className="icon" aria-label="Karte nach unten verschieben" disabled={idx === editor.cards.length - 1} onClick={() => move(1)}>↓</button>
                  <button type="button" className="icon" aria-label="Karte entfernen" onClick={() => setEditor({ ...editor, cards: editor.cards.filter(c => c.row !== item.row) })}>×</button>
                </div></div>
                <div className="two"><label>Vorderseite<textarea rows={2} maxLength={1500} value={item.front} onChange={event => update({ front: event.target.value })} /></label>
                  <label>Rückseite<textarea rows={2} maxLength={1500} value={item.back} onChange={event => update({ back: event.target.value })} /></label></div>
                <details><summary>Antwortvarianten</summary><div className="two">
                  <label>Vorderseite, je eine pro Zeile<textarea rows={2} defaultValue={item.frontAliases?.join("\n")} onChange={event => update({ frontAliases: event.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} /></label>
                  <label>Rückseite, je eine pro Zeile<textarea rows={2} defaultValue={item.backAliases?.join("\n")} onChange={event => update({ backAliases: event.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} /></label>
                </div></details>
              </div>;
            })}
          </div>
          <div className="actions editor-actions">
            <button className="button primary" disabled={busy}>Set speichern</button>
            <button type="button" className="button" disabled={editor.cards.length >= 400} onClick={() => setEditor({ ...editor, cards: [...editor.cards, row()] })}>Karte hinzufügen</button>
            <button type="button" className="button" onClick={() => importText("append")}>Text importieren</button>
            {editor.deckId && <button type="button" className="button danger" disabled={busy} onClick={async () => {
              if (editor.deckId && window.confirm("Dieses Set und seinen Lernstand entfernen?")) {
                if (await mutate({ type: "delete", deckId: editor.deckId })) { setView("home"); setEditor(null); }
              }
            }}>Set entfernen</button>}
          </div>
        </form>}

        {data && view === "import" && <>
          <button className="back" onClick={() => navigate(importDestination === "append" ? "editor" : "home")}>‹ Zurück</button>
          <div className="page-heading"><div><span className="eyebrow">Kartensets</span><h1>Text importieren</h1></div></div>
          <section className="panel flow">
            <label>Karten als Text<textarea rows={7} placeholder={"Frage\tAntwort"} value={paste} onChange={event => { setPaste(event.target.value); setImported(null); }} /></label>
            <label>Trennzeichen<select value={separator} onChange={event => { setSeparator(event.target.value as ImportSeparator); setImported(null); }}>
              <option value={"\t"}>Tabulator (Quizlet und TSV)</option><option value=";">Semikolon (CSV)</option><option value=",">Komma (CSV)</option>
            </select></label>
            <p className="muted">Je eine Karte pro Zeile. Die erste Spalte ist die Vorderseite, die zweite die Rückseite.</p>
            <div className="actions"><label className="button file-button">Textdatei öffnen<input type="file" accept=".txt,.tsv,.csv,text/plain,text/tab-separated-values,text/csv" onChange={async event => {
              const file = event.currentTarget.files?.[0];
              if (file && file.size <= 1_450_000) {
                try {
                  const content = await file.text();
                  setPaste(content);
                  if (/\.csv$/i.test(file.name)) setSeparator(content.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",");
                  setImported(null);
                  setError("");
                } catch { setError("Diese Datei konnte nicht gelesen werden."); }
              }
              else if (file) setError("Diese Datei ist zu gross.");
            }} /></label><button className="button primary" disabled={!paste.trim()} onClick={() => setImported(parseImport(paste, separator))}>Vorschau</button></div>
          </section>
          {imported && <section className="panel flow"><h2>{imported.cards.length} Karten gefunden</h2>
            {imported.errors.length > 0 && <p role="alert" className="muted">Prüfe Zeilen {imported.errors.slice(0, 20).join(", ")}{imported.errors.length > 20 ? " und weitere" : ""}. Prüfe das Trennzeichen und ob beide Spalten gefüllt sind. Diese Zeilen werden übersprungen.</p>}
            <div className="preview-list">{imported.cards.slice(0, 12).map((item, idx) => <div key={idx}><span>{item.front}</span><span>{item.back}</span></div>)}</div>
            <button className="button primary" disabled={!imported.cards.length || (importDestination === "append" && (editor?.cards.length ?? 0) + imported.cards.length > 400)} onClick={() => {
              setEditor(importDestination === "append" && editor
                ? { ...editor, cards: [...editor.cards, ...imported.cards.map(row)] }
                : { title: "", cards: imported.cards.map(row) });
              setView("editor");
            }}>Karten in den Editor übernehmen</button>
          </section>}
        </>}

        {data && view === "cards" && deck && card && (cardFocus
          ? <dialog className="focus-dialog" ref={focusDialog} aria-label={deck.title + " im Vollbild"} onClose={closeCardFocus}
              onCancel={event => { event.preventDefault(); closeCardFocus(); }}>{cardViewer}</dialog>
          : cardViewer)}

        {data && view === "study" && session && <>
          <button className="icon action-icon" aria-label={session.done ? "Zum Set" : "Lernen pausieren"} title={session.done ? "Zum Set" : "Lernen pausieren"} onClick={returnToDeck}><NavIcon kind="back" /></button>
          <div className="page-heading"><div><span className="eyebrow">{workspace?.decks.find(item => item.id === session.deckId)?.title}</span><h1>{modeTitle[session.mode]}</h1></div>
            <span className="badge">{session.mode === "learn" ? "Runde " + studyRound + (studyRound <= MAX_LEARN_ROUNDS ? " / " + MAX_LEARN_ROUNDS : "") : session.mode === "cram" ? "Sofort üben" : "Fällige Karten"}</span></div>
          {!roundBreak && (currentFeedback || !session.done) && <div className="progress-wrap">
            <progress value={currentFeedback?.answered ?? session.cursor} max={currentFeedback?.total ?? session.queue.length} aria-label="Rundenfortschritt" />
            <span>{currentFeedback?.answered ?? session.cursor} / {currentFeedback?.total ?? session.queue.length}</span>
          </div>}
          {session.mode === "learn" && session.initial.length > 0 && !roundBreak && (!session.done || currentFeedback) &&
            <p className="study-overview">{mastered} von {session.initial.length} sicher gelernt</p>}
          {roundBreak ? <section className="panel flow study-milestone" key={questionPosition}>
            <RoundCelebration />
            <h2>Runde {session.round - 1} geschafft!</h2>
            <p>{session.queue.length === 1 ? "Eine Karte kommt" : session.queue.length + " Karten kommen"} in der nächsten Runde dran.</p>
            <button className="button primary" autoFocus onClick={() => setOpenedRound(questionPosition)}>
              {session.round >= MAX_LEARN_ROUNDS ? "Letzte Runde starten" : "Nächste Runde starten"} <NavIcon kind="next" />
            </button>
          </section> : session.done && !currentFeedback ? <section className="panel flow study-milestone">
            {session.mode === "learn" && session.initial.length > 0 && <RoundCelebration />}
            <h2>{!session.initial.length ? "Keine Karten bereit" : session.mode === "learn" ? "Lerneinheit abgeschlossen" : session.mode === "review" ? "Wiederholung abgeschlossen" : "Paukrunde abgeschlossen"}</h2>
            <p>{!session.initial.length ? "Schau später wieder vorbei oder wähle andere Karten."
              : session.mode === "learn" ? mastered + " von " + session.initial.length + " Karten sitzen sicher."
              : session.mode === "review" ? session.initial.length + " Karten bewertet." : session.correct + " von " + session.initial.length + " richtig."}</p>
            {session.mode === "learn" && remaining > 0 && <p className="muted">{remaining === 1 ? "Eine Karte bleibt offen." : remaining + " Karten bleiben offen."}</p>}
            <div className="actions"><button className="button primary" autoFocus onClick={returnToDeck}>Zum Set</button>
              {session.mode === "learn" && remaining > 0 && <button className="button" disabled={busy} onClick={() => void mutate({ type: "continueLearn", sessionId: session.id })}>Offene Karten weiterüben</button>}
              {canCramMistakes && <button className="button" disabled={busy} onClick={() => void start("cram", undefined, "mistakes")}>Fehler pauken</button>}</div>
          </section> : studyQuestion && <section className="panel question">
            <span className="eyebrow">{studyQuestion.kind === "choice" ? "Antwort wählen" : studyQuestion.kind === "write" ? "Antwort schreiben" : "Antwort zuerst abrufen"}</span>
            <h2>{studyQuestion.prompt}</h2>
            {studyQuestion.kind === "choice" && <div className="answers">{studyQuestion.options.map(option => {
              const result = currentFeedback && (option === studyQuestion.answer ? "correct" : option === currentFeedback.submitted ? "incorrect" : undefined);
              return <button key={option} className="button" disabled={busy || !!currentFeedback} data-result={result || undefined} onClick={() => void submit(option)}>
                {result && <span aria-label={result === "correct" ? "Richtige Antwort" : "Falsche Antwort"}>{result === "correct" ? "✓" : "×"}</span>}{option}
              </button>;
            })}</div>}
            {currentFeedback && studyQuestion.kind === "write" && <div className="answer-result" data-result="correct">
              <span className="eyebrow">✓ Richtige Antwort</span><p>{currentFeedback.submitted}</p>
            </div>}
            {currentFeedback ? <button className="button primary" autoFocus onClick={() => { setFeedback(null); setAnswer(""); setFlipped(false); }}>Weiter <NavIcon kind="next" /></button> : q && <>
              {q.kind === "write" && !flipped && <form className="flow" onSubmit={event => { event.preventDefault(); if (matches(q.card, session.direction, answer)) void submit(answer); else setFlipped(true); }}>
                <label>Deine Antwort<textarea rows={2} maxLength={3000} value={answer} onChange={event => setAnswer(event.target.value)} /></label>
                <div className="actions"><button className="button primary" disabled={busy || !answer.trim()}>Antwort prüfen</button><button className="button" type="button" onClick={() => { setAnswer(""); setFlipped(true); }}>Weiss ich nicht</button></div>
              </form>}
              {!flipped && (q.kind === "rate" || q.kind === "self") && <button className="button primary" onClick={() => setFlipped(true)}>Antwort aufdecken</button>}
              {flipped && <div className="correction">
                {q.kind === "write" && <div className="answer-result" data-result="incorrect"><span className="eyebrow">× Deine Antwort</span><p>{answer || "Übersprungen"}</p></div>}
                <div className="answer-result" data-result={q.kind === "write" ? "correct" : undefined}><span className="eyebrow">{q.kind === "write" ? "✓ " : ""}Musterantwort</span><p>{q.answer}</p></div>
                {q.kind === "rate" ? <div className="actions grades">{(["Nochmal", "Schwer", "Gut", "Einfach"] as const).map((label, i) => <button key={label} className="button" disabled={busy} onClick={() => void rate((i + 1) as 1 | 2 | 3 | 4)}>{label}</button>)}</div> :
                  <div className="actions">
                    {q.kind === "write" && <button className="button primary" disabled={busy} autoFocus onClick={() => void submit(answer, false, false)}>Weiter <NavIcon kind="next" /></button>}
                    {(q.kind === "self" || answer.trim()) && <button className="button" disabled={busy} onClick={() => void submit(answer, true, false)}>War sinngemäss richtig</button>}
                    {q.kind === "self" && <button className="button" disabled={busy} onClick={() => void submit("", false, false)}>Noch einmal üben</button>}
                  </div>}
              </div>}
            </>}
          </section>}
        </>}

        {data && view === "chat" && <>
          {deck && <button className="back" onClick={returnToDeck}>‹ {deck.title}</button>}
          <div className="page-heading"><div><span className="eyebrow">Dein bestehender Chat</span><h1>Mit ChatGPT lernen</h1></div><a className="button primary" href={chatUrl} target="_blank" rel="noreferrer">ChatGPT öffnen ↗</a></div>
          {deck && <section className="panel flow">
            <h2>{deck.title}</h2><p>Wähle bis zu 80 Karten für diesen Chat aus. Der Freigabecode gilt eine Stunde.</p>
            <label>Lernauftrag<select value={chatIntent} onChange={event => setChatIntent(event.target.value as "study" | "explain")}><option value="study">Mich abfragen</option><option value="explain">Karten erklären</option></select></label>
            <div className="selection">{deck.cards.map(item => <label className="check" key={item.id}><input type="checkbox" checked={selection.includes(item.id)} disabled={!!shareCode || (!selection.includes(item.id) && selection.length >= 80)} onChange={event => setSelection(event.target.checked ? [...selection, item.id] : selection.filter(id => id !== item.id))} />{item.front}</label>)}</div>
            <div className="actions"><span>{selection.length} gewählt</span>
              {shareCode ? <button className="button" disabled={busy} onClick={async () => { if (await mutate({ type: "revoke", token: shareCode })) setShareCode(""); }}>Freigabe beenden</button> :
                <button className="button primary" disabled={busy || !selection.length} onClick={async () => {
                  const result = await mutate({ type: "share", deckId: deck.id, cardIds: selection });
                  if (result?.token) setShareCode(result.token);
                }}>Auswahl für Chat freigeben</button>}
            </div>
            {shareCode && <label>Auftrag für den Chat<textarea readOnly rows={3} value={"Nutze das Kalo Plugin mit diesem Freigabecode " + shareCode + ". " + chatTask} /></label>}
            {shareCode && <button className="button" onClick={() => void copy("Nutze das Kalo Plugin mit diesem Freigabecode " + shareCode + ". " + chatTask)}>Chat Auftrag kopieren</button>}
            <details><summary>Ohne Plugin kopieren</summary><label>Lernauftrag mit Kartentext<textarea readOnly rows={5} value={manual} /></label><button className="button" disabled={!selected.length} onClick={() => void copy(manual)}>Text mit Karten kopieren</button></details>
          </section>}
          <section className="panel flow"><h2>Ein Set aus Unterlagen erstellen</h2><p>Öffne deinen Chat, aktiviere Kalo und füge deinen Lernstoff dort ein.</p><label>Auftrag für ein neues Set<textarea readOnly rows={3} value={draftTask} /></label><div className="actions"><button className="button" onClick={() => void copy(draftTask)}>Auftrag kopieren</button><button className="button" onClick={() => importText("new")}>Antwort als Text importieren</button></div></section>
          <section className="panel flow"><div className="section-title"><h2>Entwürfe</h2><button className="button" disabled={busy} onClick={() => void refresh()}>Aktualisieren</button></div>
            {draftCount ? data.drafts.map(draft => <div className="draft" key={draft.id}><div><h3>{draft.title}</h3><p className="muted">{draft.cards.length} Karten · {date.format(draft.created)}</p></div><div className="actions"><button className="button primary" onClick={() => edit(undefined, draft)}>Prüfen</button><button className="button" disabled={busy} onClick={() => { if (window.confirm("Diesen Entwurf entfernen?")) void mutate({ type: "discard", draftId: draft.id }); }}>Entfernen</button></div></div>) : <p className="muted">Neue Sets aus dem Chat erscheinen hier.</p>}
          </section>
        </>}

        {data && view === "settings" && <>
          <div className="page-heading"><div><span className="eyebrow">Kalo</span><h1>Einstellungen</h1></div></div>
          <section className="panel flow"><h2>Darstellung</h2>
            <fieldset className="appearance"><legend>Farbschema</legend>
              {([["system", "System"], ["light", "Hell"], ["dark", "Dunkel"]] as const).map(([value, label]) =>
                <label key={value}><input type="radio" name="appearance" value={value} checked={theme === value} onChange={() => changeAppearance(value)} /><span>{label}</span></label>)}
            </fieldset>
            <p className="muted">Die Auswahl gilt für diesen Browser.</p>
          </section>
          <section className="panel flow"><h2>Lernerinnerungen</h2>
            <p>Wenn Kalo geöffnet ist und Karten fällig sind, erhältst du höchstens eine Mitteilung pro Tag.</p>
            <div className="actions">
              <button className="button" onClick={() => void reminderAction(reminders.toggle)}>{reminders.enabled ? "Erinnerungen ausschalten" : "Erinnerungen einschalten"}</button>
              <button className="button" onClick={() => void reminderAction(reminders.test)}>Testmitteilung senden</button>
            </div>
          </section>
          <section className="panel flow"><h2>Datensicherung</h2><p>Die JSON Datei enthält deine Kartensets und deinen Lernstand.</p>
            <div className="actions"><button className="button primary" onClick={backup}>Sicherung herunterladen</button><label className="button file-button">Sicherung wiederherstellen<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
              const file = event.currentTarget.files?.[0];
              setRestoreDraft(null);
              event.currentTarget.value = "";
              if (!file) return;
              try {
                if (file.size > 3_200_000) throw new Error("Diese Sicherung ist zu gross.");
                const parsed = JSON.parse(await file.text());
                if (parsed.format !== "kartenloop" || parsed.version !== 1) throw new Error("Wähle eine gültige Kalo Sicherung.");
                const backupData = workspaceShape.safeParse(parsed.workspace);
                if (!backupData.success) throw new Error("Die Sicherung enthält ungültige Kartendaten.");
                setError("");
                setRestoreDraft(backupData.data);
              } catch (cause) { setError(cause instanceof Error ? cause.message : "Die Sicherung konnte nicht gelesen werden."); }
            }} /></label></div>
            {restoreDraft && <div className="restore-preview flow">
              <h3>Sicherung prüfen</h3>
              <p>{restoreDraft.decks.length} Sets und {restoreDraft.decks.reduce((total, item) => total + item.cards.length, 0)} Karten. Beim Wiederherstellen werden deine aktuellen Sets und dein Lernstand ersetzt.</p>
              <div className="actions">
                <button className="button danger" disabled={busy} onClick={async () => {
                  if (await mutate({ type: "restore", data: restoreDraft })) { setRestoreDraft(null); setNotice("Sicherung wiederhergestellt."); }
                }}>Aktuellen Stand ersetzen</button>
                <button className="button" onClick={() => setRestoreDraft(null)}>Abbrechen</button>
              </div>
            </div>}
          </section>
          <section className="panel flow"><h2>Dein Chat</h2><form className="flow" onSubmit={event => {
            event.preventDefault();
            if (chatUrl !== chatLink.trim() && chatLink.trim() !== "https://chatgpt.com") { setError("Verwende einen Link von https://chatgpt.com."); return; }
            try { localStorage.setItem("kartenloop-chat", chatUrl); setChatLink(chatUrl); setError(""); setNotice("Chat Link auf diesem Gerät gespeichert."); }
            catch { setError("Der Browser konnte den Chat Link nicht speichern."); }
          }}><label>Link zum bestehenden Chat<input type="url" value={chatLink} onChange={event => setChatLink(event.target.value)} /></label><button className="button" type="submit">Chat Link speichern</button></form></section>
          <a className="button" href="/signout-with-chatgpt?return_to=%2F" target="_top">Abmelden</a>
        </>}

        {data && ["deck", "cards"].includes(view) && (!deck || (view === "cards" && !card)) && <section className="panel flow"><h1>Set nicht verfügbar</h1><button className="button" onClick={() => navigate("home")}>Zur Bibliothek</button></section>}
        {data && view === "study" && !session && <section className="panel flow"><h1>Keine offene Runde</h1><button className="button" onClick={returnToDeck}>Zurück</button></section>}
      </main>
    </div>
  );
}


const actionPaths = {
  back: "M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10",
  next: "M4 12h15m-6-6 6 6-6 6",
  check: "m5 12 5 5L20 7",
  repeat: "M20 10a8 8 0 1 0-1 7M20 5v5h-5",
  plus: "M12 5v14M5 12h14",
  expand: "M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5",
  shrink: "M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5",
  shuffle: "M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c1 0 2-.5 3-2m5-8c1-1 2-2 4-2h3m-4-4 4 4-4 4",
  import: "M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5",
  edit: "m5 15-1 5 5-1L20 8l-4-4L5 15Zm9-9 4 4",
};

function NavIcon({ kind }: { kind: "library" | "chat" | "settings" | keyof typeof actionPaths }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind in actionPaths && <path d={actionPaths[kind as keyof typeof actionPaths]}/>}
    {kind === "library" && <><rect x="6" y="6" width="14" height="14" rx="3"/><path d="M4 16H3V6a3 3 0 0 1 3-3h10v1m-6 7h6m-6 4h4"/></>}
    {kind === "chat" && <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3.3A7.5 7.5 0 1 1 20 11.5ZM9 11.5h7"/>}
    {kind === "settings" && <><path d="m10 3-.6 2.1-1.7 1-2.2-.5-1.8 3.1 1.6 1.6v2l-1.6 1.6 1.8 3.1 2.2-.5 1.7 1 .6 2.1h4l.6-2.1 1.7-1 2.2.5 1.8-3.1-1.6-1.6v-2l1.6-1.6-1.8-3.1-2.2.5-1.7-1L14 3z"/><circle cx="12" cy="11.3" r="2.7"/></>}
  </svg>;
}
