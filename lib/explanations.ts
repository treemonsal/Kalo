export type WordMeaning = { definition: string; example?: string; translation?: string; language: string };
export type WordExplanation = { term: string; meanings: WordMeaning[]; source?: string; unavailable?: boolean };
export type PairExplanation = { front: WordExplanation; back: WordExplanation };
type Lookup = (input: string, init?: RequestInit) => Promise<Response>;

function text(raw: unknown) {
  if (typeof raw !== "string") return "";
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };
  return raw.slice(0, 8000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (!name.startsWith("#")) return named[name.toLowerCase()] ?? entity;
      const value = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : "";
    }).replace(/\s+/g, " ").trim().slice(0, 700);
}

/**
 * Only short dictionary terms leave the app; never send a long answer or the rest of a set.
 * Articles and «to» are dropped: Wiktionary knows «Rechnung» and «deliver», not «die Rechnung» or «to deliver».
 */
export function lookupTerm(raw: string) {
  const term = raw.trim().replace(/^(?:\(to\)|to|der|die|das|ein|eine|the|a|an)\s+/i, "").replace(/\s+\((?:sich|to|verb|noun)\)$/i, "");
  return term.length <= 64 && term.split(/\s+/).length <= 5 && /^[\p{L}\p{M} '’–-]+$/u.test(term) ? term : null;
}

/** German or English, from the look of the term: articles, umlauts and capitalised nouns are German. */
export function guessLanguage(raw: string): "de" | "en" {
  const term = raw.trim();
  if (/^(?:der|die|das|ein|eine)\s/i.test(term) || /[äöüß]/i.test(term)) return "de";
  if (/^(?:the|a|an|to)\s/i.test(term)) return "en";
  return /^\p{Lu}/u.test(term) ? "de" : "en";
}

/** Grammar pointers such as «dative plural of Aktiv» say nothing about the meaning. */
const FORM_OF = /\b(?:plural|singular|dative|genitive|accusative|nominative|inflection|past tense|participle|comparative|superlative|feminine|masculine|alternative (?:form|spelling)|obsolete (?:form|spelling)|misspelling)\b[^.]{0,40}\bof\b/i;
const words = (text: string) => new Set(text.toLowerCase().match(/\p{L}{3,}/gu) ?? []);

async function explainWord(raw: string, preferred: "en" | "de", lookup: Lookup): Promise<WordExplanation> {
  const term = lookupTerm(raw);
  const empty: WordExplanation = { term: raw, meanings: [] };
  if (!term) return empty;
  try {
    const response = await lookup("https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(term), {
      signal: AbortSignal.timeout(8000), headers: { Accept: "application/json", "User-Agent": "Kalo/1.0 (https://kartenloop.netteddrive.chatgpt.site)" },
    });
    if (response.status === 404) return empty;
    if (!response.ok) return { ...empty, unavailable: true };
    // Bound the response before parsing. Provider HTML is converted to plain text, never rendered.
    const reader = response.body?.getReader();
    if (!reader) return empty;
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 300_000) { await reader.cancel(); return { ...empty, unavailable: true }; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object") return empty;
    const entry = parsed as Record<string, unknown>;
    const language = Array.isArray(entry[preferred]) ? preferred : Array.isArray(entry.en) ? "en" : "de";
    const blocks = entry[language];
    if (!Array.isArray(blocks)) return empty;
    const first = blocks.find(block => block && Array.isArray(block.definitions));
    const meanings: WordMeaning[] = [];
    for (const item of first?.definitions ?? []) {
      if (!item || typeof item !== "object") continue;
      const definition = text(item.definition);
      // Wiktionary groups some senses under headings like «Senses having to do with birth.»; the heading is not a meaning.
      const meaningText = definition.replace(/^Senses having to do with [^.]*\.\s*/i, "");
      if (!meaningText || FORM_OF.test(meaningText)) continue;
      const sample = Array.isArray(item.parsedExamples) ? item.parsedExamples[0] : null;
      const example = text(sample?.example ?? item.examples?.[0]);
      const translation = text(sample?.translation);
      meanings.push({ definition: meaningText, language, ...(example ? { example } : {}), ...(translation ? { translation } : {}) });
      // A few more than shown, so explainPair can pick the meaning that fits the other side of the card.
      if (meanings.length === 16) break;
    }
    return { term: raw, meanings, ...(meanings.length ? { source: "https://en.wiktionary.org/wiki/" + encodeURIComponent(term) } : {}) };
  } catch { return { ...empty, unavailable: true }; }
}

/** Wiktionary explains each term separately. It does not generate or claim a translation relationship. */
export async function explainPair(front: string, back: string, lookup: Lookup = fetch): Promise<PairExplanation> {
  const [a, b] = await Promise.all([explainWord(front, guessLanguage(front), lookup), explainWord(back, guessLanguage(back), lookup)]);
  return { front: fitting(a, b, back), back: fitting(b, a, front) };
}

/**
 * The two sides check each other: a meaning that mentions the other side, or shares words with the other side's
 * meanings («Rechnung: bill, invoice» and «invoice: A bill; …»), comes first. Two meanings are kept.
 */
function fitting(word: WordExplanation, other: WordExplanation, otherTerm: string): WordExplanation {
  const clue = new Set([...words(lookupTerm(otherTerm) ?? otherTerm), ...other.meanings.flatMap(meaning => [...words(meaning.definition)])]);
  const score = (definition: string) => [...words(definition)].filter(word => clue.has(word)).length;
  const meanings = word.meanings.map((meaning, index) => ({ meaning, index, score: score(meaning.definition) }))
    .sort((x, y) => y.score - x.score || x.index - y.index).slice(0, 2).map(item => item.meaning);
  return { ...word, meanings };
}
