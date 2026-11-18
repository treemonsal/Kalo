import assert from "node:assert/strict";
import test from "node:test";
import { design, designCookie, darkBackground, designAssets } from "../lib/design.ts";
import { applyDesign } from "../app/kalo/theme.ts";

test("Designauswahl: neuer Standard, bisheriges Design bleibt explizit wählbar", () => {
  assert.equal(design(), "current");
  assert.equal(design("unbekannt"), "current");
  assert.equal(design("current"), "current");
  assert.equal(design("classic"), "classic");
  assert.equal(darkBackground(design("classic")), "#0a092d");
  assert.equal(darkBackground(design()), "#161513");
  assert.equal(designAssets("current").mark, "/kalo-brown-128.png");
  assert.equal(designAssets("classic").icon, "/kalo-mark.svg");
});

for (const appearance of ["dark", "light", "system"]) {
  test("Designwechsel und Rückwechsel speichern die Auswahl bei Farbschema " + appearance, t => {
    const meta = { content: "", media: "" };
    const icon = { href: "" }, apple = { href: "" }, manifest = { href: "" };
    const page = { documentElement: { dataset: { appearance, design: "current" } }, cookie: "", querySelectorAll: (selector: string) =>
      selector.startsWith("meta") ? [meta] : selector.includes("apple-touch-icon") ? [apple] : selector.includes("manifest") ? [manifest] : [icon] };
    const globals: Record<string, unknown> = {
      document: page,
      location: { protocol: "https:" },
      matchMedia: () => ({ matches: true }),
    };
    for (const [name, value] of Object.entries(globals)) {
      const original = Object.getOwnPropertyDescriptor(globalThis, name);
      Object.defineProperty(globalThis, name, { configurable: true, value });
      t.after(() => {
        if (original) Object.defineProperty(globalThis, name, original);
        else Reflect.deleteProperty(globalThis, name);
      });
    }
    applyDesign("classic");
    assert.equal(page.documentElement.dataset.design, "classic");
    assert.match(page.cookie, new RegExp("^" + designCookie + "=classic;"));
    assert.match(page.cookie, /Max-Age=31536000; SameSite=Lax; Secure$/);
    // The server reads this same saved value on the next page load.
    assert.equal(design(page.cookie.split(";")[0].split("=")[1]), "classic");
    assert.equal(meta.content, appearance === "light" ? "#faf9f5" : "#0a092d");
    assert.equal(icon.href, "/kalo-mark.svg");
    assert.equal(apple.href, "/kalo-180.png");
    assert.equal(manifest.href, "/kalo.webmanifest");
    applyDesign("current");
    assert.equal(page.documentElement.dataset.design, "current");
    assert.match(page.cookie, new RegExp("^" + designCookie + "=current;"));
    assert.equal(meta.content, appearance === "light" ? "#faf9f5" : "#161513");
    assert.equal(icon.href, "/kalo-brown-48.png");
    assert.equal(apple.href, "/kalo-brown-180.png");
    assert.equal(manifest.href, "/kalo-brown.webmanifest");
    assert.equal(page.documentElement.dataset.appearance, appearance);
  });
}
