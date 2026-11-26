// Browser checks for the flows that unit tests cannot see: gestures, examples, navigation, small screens.
// Run against a running dev server: `npm run dev` in one terminal, `npm run e2e` in another (or set KALO_URL).
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.KALO_URL ?? "http://127.0.0.1:5173";
const results = [];

async function signIn(page) {
  await page.goto(BASE);
  const button = page.getByText("Mit ChatGPT anmelden");
  if (await button.count()) await button.click();
  await page.waitForLoadState("networkidle");
  // Every scenario starts from an empty account and without the one-time swipe demo.
  await page.evaluate(() => localStorage.setItem("kalo-swipe-demo", "done"));
  const status = await page.evaluate(async () => (await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: { type: "restore", data: { decks: [], session: null, reviews: {}, progress: {}, mistakes: {} } } }) })).status);
  assert.equal(status, 200, "Konto zurücksetzen");
  await page.reload();
  await page.waitForLoadState("networkidle");
}

async function save(page, title, cards) {
  const status = await page.evaluate(async ([title, cards]) => (await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: { type: "save", title, cards } }) })).status, [title, cards]);
  assert.equal(status, 200, "Set speichern");
  await page.reload();
  await page.waitForLoadState("networkidle");
}

const vocabulary = [
  { front: "die Rechnung", back: "invoice", examples: "Wir haben die Rechnung bezahlt.\nWe have already paid the invoice." },
  { front: "die Frist", back: "deadline", examples: "The deadline is on Friday." },
  { front: "das Angebot", back: "offer" }, { front: "der Vertrag", back: "contract" }, { front: "die Mahnung", back: "reminder" },
];

async function scenario(name, viewport, run) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await signIn(page);
    await run(page);
    assert.deepEqual(errors, [], "keine JavaScript-Fehler");
    results.push(["ok", name]);
  } catch (error) {
    results.push(["FAIL", name + ": " + (error instanceof Error ? error.message : String(error)).split("\n")[0]]);
  } finally {
    await browser.close();
  }
}

const phone = { width: 390, height: 844 };

await scenario("Erster Start: drei Wege und Beispielset", phone, async page => {
  for (const way of ["Aus Unterlagen mit ChatGPT", "Liste importieren", "Selbst schreiben"]) assert.equal(await page.getByText(way).count(), 1, way);
  await page.getByRole("button", { name: "Beispielset ausprobieren" }).click();
  await page.waitForSelector("text=Beispiel: Rechnungswesen Grundlagen");
});

await scenario("Kartenmodus: Wischen in beide Richtungen und Pfeile", { width: 1280, height: 860 }, async page => {
  await save(page, "Wischtest", vocabulary);
  await page.locator(".deck-tile", { hasText: "Wischtest" }).click();
  await page.locator("button.mode", { hasText: "Karten" }).click();
  await page.waitForSelector(".flashcard");
  const counter = () => page.locator(".card-viewer .study-progress span").innerText();
  const box = await page.locator(".flashcard").boundingBox();
  const y = box.y + box.height / 2;
  const drag = async (from, to) => {
    await page.mouse.move(from, y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from + (to - from) * i / 8, y);
    await page.mouse.up(); await page.waitForTimeout(700);
  };
  assert.match(await counter(), /^1 von 5/);
  await drag(box.x + box.width - 40, box.x + 20);
  assert.match(await counter(), /^2 von 5/, "nach links");
  await drag(box.x + 30, box.x + box.width + 40);
  assert.match(await counter(), /^3 von 5/, "nach rechts");
  assert.equal(await page.getByRole("button", { name: /Noch nicht/ }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /Kann ich/ }).count(), 1);
});

await scenario("Beispiele: Lösung ausgeblendet, Lückentext, nach dem Umdrehen voll", phone, async page => {
  await save(page, "Beispiele", vocabulary);
  await page.locator(".deck-tile", { hasText: "Beispiele" }).click();
  await page.locator("button.mode", { hasText: "Karten" }).click();
  await page.waitForSelector(".flashcard");
  await page.getByRole("button", { name: "Beispiele und Erklärung anzeigen" }).first().click();
  await page.waitForSelector(".examples-copy");
  const before = await page.locator(".example-lines").innerText();
  assert.ok(before.includes("paid the ___") && !/invoice/i.test(before), "vor dem Antworten ausgeblendet");
  await page.getByRole("button", { name: /Lückentext-Karte/ }).first().click();
  await page.waitForSelector("text=Als Karte gespeichert");
  await page.getByRole("button", { name: "Beispiele schliessen" }).click();
  await page.waitForTimeout(300);
  await page.locator(".card-flip").first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Beispiele und Erklärung anzeigen" }).first().click();
  await page.waitForSelector(".example-lines");
  assert.ok((await page.locator(".example-lines").innerText()).includes("paid the invoice"), "nach dem Umdrehen voller Satz");
});

await scenario("Lernen: Wörter, Wischen folgt dem Finger, Beispiel nach falscher Antwort", phone, async page => {
  await save(page, "Lernen", vocabulary);
  await page.locator(".deck-tile", { hasText: "Lernen" }).click();
  await page.locator("button.mode", { hasText: "Lernen" }).click();
  await page.waitForSelector("#prompt");
  let example = false;
  for (let i = 0; i < 6 && !example; i++) {
    const prompt = await page.locator("#prompt").innerText();
    const right = vocabulary.find(card => card.front === prompt)?.back ?? "";
    await page.locator(".answer").filter({ hasNotText: right }).first().click();
    await page.waitForTimeout(400);
    example = await page.locator(".answer-example").count() > 0;
    if (!example) { await page.getByRole("button", { name: "Weiter" }).click(); await page.waitForTimeout(400); }
  }
  assert.ok(example, "Beispiel nach falscher Antwort");
  const panel = await page.locator(".question").boundingBox();
  await page.mouse.move(panel.x + 200, panel.y + 30); await page.mouse.down();
  await page.mouse.move(panel.x + 260, panel.y + 30, { steps: 5 });
  assert.match(await page.locator(".question").evaluate(element => element.style.transform), /translateX\(60/, "folgt dem Finger");
  await page.mouse.move(panel.x + 330, panel.y + 30, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".answer-mark").count(), 0, "Wischen geht weiter");
});

await scenario("Navigation: Zurück führt in den Tab, Menü im Set", phone, async page => {
  await save(page, "Navigation", vocabulary);
  await page.getByRole("button", { name: "Profil", exact: true }).click();
  await page.locator(".deck-tile").first().click();
  await page.getByRole("button", { name: "Zurück zu Profil" }).click();
  await page.waitForSelector(".profile-head");
  await page.locator(".deck-tile").first().click();
  await page.locator(".more-menu summary").click();
  assert.equal(await page.locator(".more-list button").count(), 3);
  await page.mouse.click(30, 760);
  assert.equal(await page.locator(".more-menu").evaluate(element => element.open), false, "schliesst bei Tipp daneben");
});

await scenario("320 px: kein Querscrollen, Modi als Zeilen", { width: 320, height: 640 }, async page => {
  await save(page, "Rechnungswesen Grundlagen für die Abschlussprüfung", vocabulary);
  await page.locator(".deck-tile").first().click();
  await page.waitForSelector(".study-modes");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  const tile = page.locator(".study-modes .mode", { hasText: "Wiederholen" });
  assert.ok(await tile.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "«Wiederholen» passt");
});

await scenario("Gemischtes Wiederholen: Hilfe und Lückentext bleiben im richtigen Set", phone, async page => {
  await save(page, "Gemischt A", [vocabulary[0]]);
  await save(page, "Gemischt B", [vocabulary[1]]);
  const original = await page.evaluate(async () => {
    const post = async action => {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error("Testvorbereitung fehlgeschlagen: " + response.status);
    };
    const { workspace } = await (await fetch("/api/workspace")).json();
    for (const deck of workspace.decks) for (const card of deck.cards) {
      await post({ type: "sortCard", deckId: deck.id, cardId: card.id, direction: "front", known: false });
    }
    const latest = (await (await fetch("/api/workspace")).json()).workspace;
    for (const review of Object.values(latest.reviews)) review.due = new Date(Date.now() - 1000).toISOString();
    await post({ type: "restore", data: latest });
    return workspace.decks;
  });
  const lookups = [];
  await page.route("**/api/explain", async route => {
    lookups.push(route.request().postDataJSON());
    await route.fulfill({ json: { front: { term: "", meanings: [] }, back: { term: "", meanings: [] } } });
  });
  await page.reload(); await page.waitForLoadState("networkidle");
  await page.locator(".due-alert").click();
  const seen = new Set();
  for (let i = 0; i < 2; i++) {
    await page.waitForSelector("#prompt");
    const prompt = await page.locator("#prompt").innerText();
    const deck = original.find(deck => deck.cards[0].front === prompt);
    assert.ok(deck, "Frage gehört zu einem der beteiligten Sets");
    seen.add(deck.id);
    await page.getByRole("button", { name: "Beispiele und Erklärung anzeigen" }).click();
    await page.waitForSelector(".examples-dialog[open]");
    await page.waitForFunction(() => !document.querySelector(".explain-loading"));
    assert.deepEqual(lookups.at(-1), { deckId: deck.id, cardId: deck.cards[0].id }, "Wörterbuch verwendet das tatsächliche Set (Karte " + (i + 1) + ", Anfrage " + JSON.stringify(lookups.at(-1)) + ")");
    await page.locator(".example-lines .text-button").first().click();
    await page.waitForSelector("text=Als Karte gespeichert");
    await page.getByRole("button", { name: "Beispiele schliessen" }).click();
    await page.waitForSelector(".examples-dialog", { state: "detached" });
    await page.locator(".answer-box.placeholder").click();
    await page.locator('.grades button[data-grade="3"]').click();
    // Ratings are stored asynchronously in the local journal; wait for the next question before reading it.
    if (i === 0) await page.waitForFunction(previous => {
      const question = document.querySelector("#prompt");
      return question && question.textContent !== previous;
    }, prompt);
  }
  assert.equal(seen.size, 2);
  const saved = await page.evaluate(async () => (await (await fetch("/api/workspace")).json()).workspace.decks);
  assert.ok(saved.every(deck => deck.cards.length === 2), "jedes Set bekommt nur seine eigene Lückentext-Karte");
});

await scenario("Wisch-Demo: Berührung beendet die Demo vollständig", phone, async page => {
  await save(page, "Demo", vocabulary);
  await page.evaluate(() => localStorage.removeItem("kalo-swipe-demo"));
  await page.locator(".deck-tile", { hasText: "Demo" }).click();
  await page.locator("button.mode", { hasText: "Karten" }).click();
  await page.waitForSelector('.card-stage[data-demo="true"]');
  await page.locator(".card-flip").first().click({ force: true });
  assert.equal(await page.locator(".card-stage").evaluate(element => element.dataset.demo), undefined, "die nächste Kartenfrage bleibt nach Unterbrechen nicht ausgeblendet");
});

await scenario("Feinschliff: Kreis mittig, kein Leuchten, Dialog dunkelt Leiste ab, kein blauer Ring nach Tippen", phone, async page => {
  await save(page, "Schliff", vocabulary);
  await page.locator(".deck-tile", { hasText: "Schliff" }).click();
  await page.locator("button.mode", { hasText: "Karten" }).click();
  await page.waitForSelector(".flashcard");
  assert.equal(await page.getByText("Wischen: links noch nicht").count(), 0, "kein Erklärsatz mehr");
  assert.equal(await page.locator(".progress-beam > i").evaluate(element => getComputedStyle(element, "::before").display), "none", "kein Leuchten");
  const theme = () => page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content"));
  const before = await theme();
  // One rated card, so «Mischen» asks before starting over.
  await page.locator(".swipe-actions .rate-again").click();
  await page.waitForTimeout(800);
  const shuffle = page.getByRole("button", { name: "Karten mischen und neu beginnen" });
  await shuffle.click();
  await page.waitForSelector(".sheet-dialog[open]");
  assert.notEqual(await theme(), before, "Statusleiste dunkelt mit ab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, "solid", "kein blauer Ring nach Tippen");
  await page.locator(".sheet-dialog").getByRole("button", { name: "Abbrechen" }).click();
  await page.waitForTimeout(300);
  assert.equal(await theme(), before, "Farbe kommt zurück");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Profil", exact: true }).click();
  await page.getByRole("button", { name: "Statistik" }).click();
  await page.waitForSelector(".mastery-list .mastery-ring");
  const centre = await page.locator(".mastery-list .mastery-ring").first().evaluate(element => {
    const number = element.querySelector(":scope > span");
    number.textContent = "67";
    const ring = element.getBoundingClientRect(), text = number.firstChild ? (() => { const range = document.createRange(); range.selectNodeContents(number); return range.getBoundingClientRect(); })() : number.getBoundingClientRect();
    return [Math.abs(ring.left + ring.width / 2 - (text.left + text.width / 2)), Math.abs(ring.top + ring.height / 2 - (text.top + text.height / 2))];
  });
  assert.ok(centre[0] < 2 && centre[1] < 3, "Zahl mittig im Kreis: " + centre);
});

for (const [state, text] of results) console.log((state === "ok" ? "ok   " : "FAIL ") + text);
const failed = results.filter(([state]) => state !== "ok").length;
console.log(results.length - failed + " von " + results.length + " Browserprüfungen bestanden");
process.exit(failed ? 1 : 0);
