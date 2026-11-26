import type { CardInput } from "./learning.ts";

/** A real first set to try every mode before writing one's own: basics of accounting from the KV curriculum. */
export const SAMPLE_SET: { title: string; cards: Pick<CardInput, "front" | "back" | "examples">[] } = {
  title: "Beispiel: Rechnungswesen Grundlagen",
  cards: [
    { front: "Aktiven", back: "Vermögen eines Unternehmens", examples: "Kasse, Bank und Mobiliar stehen in der Bilanz auf der Seite der Aktiven." },
    { front: "Passiven", back: "Kapital: Fremd- und Eigenkapital", examples: "Ein Bankdarlehen gehört zu den Passiven, genauer zum Fremdkapital." },
    { front: "Soll", back: "linke Seite eines Kontos" },
    { front: "Haben", back: "rechte Seite eines Kontos" },
    { front: "Bilanz", back: "Gegenüberstellung von Aktiven und Passiven an einem Stichtag" },
    { front: "Erfolgsrechnung", back: "Gegenüberstellung von Aufwand und Ertrag über einen Zeitraum" },
    { front: "Debitoren", back: "Forderungen aus Lieferungen und Leistungen", examples: "Ein Kunde hat die Rechnung noch nicht bezahlt: Der Betrag steht bei den Debitoren." },
    { front: "Kreditoren", back: "Verbindlichkeiten aus Lieferungen und Leistungen" },
    { front: "Liquidität", back: "Zahlungsfähigkeit eines Unternehmens" },
    { front: "Abschreibung", back: "Wertverminderung von Anlagevermögen" },
  ],
};
