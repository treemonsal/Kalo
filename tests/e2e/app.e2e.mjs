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

for (const [state, text] of results) console.log((state === "ok" ? "ok   " : "FAIL ") + text);
const failed = results.filter(([state]) => state !== "ok").length;
console.log(results.length - failed + " von " + results.length + " Browserprüfungen bestanden");
process.exit(failed ? 1 : 0);
