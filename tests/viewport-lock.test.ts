import assert from "node:assert/strict";
import test from "node:test";
import { lockViewport } from "../lib/viewport-lock.ts";

test("Vollbild hält die Seite fest und stellt beim Verlassen Stil und Scrollposition wieder her", t => {
  const root = { overflow: "auto", overscrollBehavior: "contain" };
  const body = { position: "relative", top: "2px", left: "1px", width: "90%", overflow: "auto" };
  const savedRoot = { ...root };
  const savedBody = { ...body };
  const scrolls: unknown[] = [];
  const globals: Record<string, unknown> = {
    document: { documentElement: { style: root }, body: { style: body } },
    window: { scrollX: 4, scrollY: 680, scrollTo: (position: unknown) => scrolls.push(position) },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const unlock = lockViewport();
  assert.equal(root.overflow, "hidden");
  assert.equal(root.overscrollBehavior, "none");
  assert.equal(body.position, "fixed");
  assert.equal(body.overflow, "hidden");
  assert.equal(body.top, "-680px");
  assert.equal(body.left, "-4px");
  unlock();
  assert.deepEqual(root, savedRoot);
  assert.deepEqual(body, savedBody);
  assert.deepEqual(scrolls, [{ left: 4, top: 680, behavior: "instant" }]);
  unlock();
  assert.equal(scrolls.length, 1, "zweifache Bereinigung bewegt die Seite nicht nochmals");
});
