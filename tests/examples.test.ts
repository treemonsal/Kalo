import assert from "node:assert/strict";
import test from "node:test";
import { clozeFrom, exampleLines, maskAnswer } from "../lib/examples.ts";

test("Beispiele verraten die Antwort vor dem Antworten nicht", () => {
  assert.equal(maskAnswer("We have already paid the invoice.", "invoice"), "We have already paid the ___.");
  assert.equal(maskAnswer("Die Rechnung kam gestern. Wir zahlen die Rechnung morgen.", "die Rechnung"), "___ kam gestern. Wir zahlen ___ morgen.");
  assert.equal(maskAnswer("Rechnungen stapeln sich.", "die Rechnung"), "Rechnungen stapeln sich.", "nur ganze Wörter");
  assert.equal(maskAnswer("We deliver tomorrow.", "to deliver"), "We ___ tomorrow.");
  assert.equal(maskAnswer("Check the border.", "order"), "Check the border.");
  assert.equal(maskAnswer("Die Frist läuft ab.", "deadline"), "Die Frist läuft ab.");
});

test("Aus einem Beispiel wird eine Lückentext-Karte", () => {
  assert.deepEqual(clozeFrom("Wir haben die Rechnung bezahlt.", "die Rechnung"), { front: "Wir haben ___ bezahlt.", back: "die Rechnung" });
  assert.deepEqual(clozeFrom("The deadline is on Friday.", "deadline"), { front: "The ___ is on Friday.", back: "deadline" });
  assert.deepEqual(clozeFrom("Eine Rechnung kam.", "die Rechnung"), { front: "Eine ___ kam.", back: "Rechnung" });
  assert.equal(clozeFrom("Die Frist läuft ab.", "deadline"), null);
  assert.deepEqual(exampleLines(" a \n\n b\n"), ["a", "b"]);
});
