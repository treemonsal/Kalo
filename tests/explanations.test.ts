import assert from "node:assert/strict";
import test from "node:test";
import { explainPair } from "../lib/explanations.ts";

test("Worterklärung liefert für beide Begriffe Bedeutung und übersetztes Beispiel", async () => {
  const replies: Record<string, unknown> = {
    improve: { en: [{ partOfSpeech: "Verb", language: "English", definitions: [
      { definition: "To make <a>better</a>; to increase quality.", parsedExamples: [{ example: "Practice <b>improves</b> your English." }] },
      { definition: "To become better." },
    ] }] },
    verbessern: { de: [{ partOfSpeech: "Verb", language: "German", definitions: [
      { definition: "to improve (to make better)", parsedExamples: [{ example: "Ich <b>verbessere</b> mein Englisch.", translation: "I improve my English." }] },
    ] }] },
  };
  const result = await explainPair("(to) improve", "verbessern", async input => Response.json(replies[decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1)!)]));
  assert.equal(result.front.meanings[0].definition, "To make better; to increase quality.");
  assert.equal(result.front.meanings[0].example, "Practice improves your English.");
  assert.equal(result.back.meanings[0].translation, "I improve my English.");
  assert.equal(result.back.meanings[0].definition, "to improve (to make better)");
  assert.equal(result.front.source, "https://en.wiktionary.org/wiki/improve");
});

test("fehlende und lange Begriffe werden nie als Erklärung ausgegeben", async () => {
  const missing = await explainPair("notawordxx", "Eine lange private Erklärung mit mehr als fünf einzelnen Wörtern.", async () => new Response("missing", { status: 404 }));
  assert.deepEqual(missing.front.meanings, []);
  assert.deepEqual(missing.back.meanings, []);
  const offline = await explainPair("improve", "verbessern", async () => { throw new Error("offline"); });
  assert.equal(offline.front.unavailable, true);
  assert.equal(offline.back.unavailable, true);
});

test("fremdes HTML und unvollständige Antworten werden sicher als Text behandelt", async () => {
  const result = await explainPair("improve", "verbessern", async () => Response.json({ en: [{ partOfSpeech: "Verb", definitions: [
    { definition: "<script>danger()</script><b>better</b> &amp; stronger &#8212; &#x1F4D6;", examples: ["A &lt;b&gt;word&lt;/b&gt;"] },
    { definition: 45 },
  ] }] }));
  assert.equal(result.front.meanings[0].definition, "better & stronger — 📖");
  assert.equal(result.front.meanings.length, 1);
});
