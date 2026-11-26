/**
 * Example sentences help without giving the answer away: before the answer is shown, every form of it that
 * appears in an example is replaced by a gap. The same gap turns an example into a cloze card.
 */
export const GAP = "___";

const ARTICLE = /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|the|a|an|to|le|la|les|l'|un|une|el|los|las)\s+/i;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The forms of an answer worth hiding: the full answer and, for «die Rechnung» or «to deliver», the bare word. */
export function answerForms(answer: string) {
  const full = answer.trim().replace(/\s*\([^)]*\)\s*$/, "");
  const bare = full.replace(ARTICLE, "");
  return [...new Set([full, bare])].filter(form => form.length >= 2 && form.length <= 80).sort((a, b) => b.length - a.length);
}

/** Replaces the answer in an example by a gap. Word boundaries keep «order» from hiding part of «border». */
export function maskAnswer(text: string, answer: string) {
  return answerForms(answer).reduce((masked, form) => maskForm(masked, form), text);
}

function maskForm(text: string, form: string) {
  return text.replace(new RegExp("(?<![\\p{L}\\p{N}])" + escape(form) + "(?![\\p{L}\\p{N}])", "giu"), GAP);
}

export function exampleLines(examples: string | undefined) {
  return (examples ?? "").split("\n").map(line => line.trim()).filter(Boolean);
}

/** A cloze card from an example line, or null when the line does not contain the answer. */
export function clozeFrom(line: string, answer: string) {
  // The back is exactly what the gap hides: «die Rechnung» when the article is in the gap, otherwise «Rechnung».
  for (const form of answerForms(answer)) {
    if (maskForm(line, form) !== line) return { front: maskAnswer(line, answer), back: form };
  }
  return null;
}
