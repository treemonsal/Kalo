import assert from "node:assert/strict";
import test from "node:test";
import { dragOffset, swipeIntent, swipeStep } from "../lib/swipe.ts";

test("Ein kurzer Tipp bewegt die Karte nicht, ein schneller Wisch blättert", () => {
  assert.equal(swipeStep(-3, -0.04, 320, true, true), 0);
  assert.equal(swipeStep(-27, -0.9, 320, true, true), 1);
  assert.equal(swipeStep(82, 0, 320, true, true), -1);
});

test("Grenzen geben nach und blockieren Blättern aus dem Set", () => {
  assert.equal(swipeStep(120, 0.5, 320, false, true), 0);
  assert.equal(swipeStep(-120, -0.5, 320, true, false), 0);
  assert.equal(dragOffset(-80, 320, true, true), -80);
  assert.ok(dragOffset(-80, 320, true, false) > -40);
});

test("Richtungswechsel beim Loslassen kann einen begonnenen Wisch abbrechen", () => {
  assert.equal(swipeStep(-75, 0.9, 320, true, true), 0);
});

test("Kurze ruhige Gesten und kleine Diagonalen werden in beiden Richtungen erkannt", () => {
  assert.equal(swipeStep(-52, 0, 360, true, true), 1);
  assert.equal(swipeStep(52, 0, 360, true, true), -1);
  assert.equal(swipeStep(-60, Number.NaN, 420, true, true), 1);
  assert.equal(swipeIntent(50, 55), "horizontal");
  assert.equal(swipeIntent(-50, 35), "horizontal");
  assert.equal(swipeIntent(4, 40), "vertical");
  assert.equal(swipeIntent(3, 4), "pending");
});
