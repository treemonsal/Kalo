# Kalo

Webapp für Karteikarten, adaptive Lernrunden, Pauken und fällige Wiederholungen mit FSRS. Die persönliche Lernbibliothek wird pro ChatGPT Konto gespeichert.

[Live App öffnen](https://kartenloop.netteddrive.chatgpt.site/)

## Aktueller Stand und Weiterarbeit

Die gemeinsame Quelle ist [GitLab: hahntim518/kalo](https://gitlab.com/hahntim518/kalo), Branch `main`. GitHub ist nicht mehr die Arbeitsgrundlage. Vor Änderungen den aktuellen Stand von `main` laden und lokale Änderungen erhalten.

Die zuvor nur auf ChatGPT Sites gespeicherten Ergänzungen bis Version 27 sind im [Übergabeprotokoll vom 18.11.2026](docs/2026-11-18-sites-handoff.md) beschrieben: Designauswahl mit bisherigem Design, braunes Logo, direkter Vollbildmodus, lokale Speicherung ohne Wartezeit beim Weiterlernen und zuverlässigere Wischgesten. Dieses Protokoll ergänzt die ältere Anforderungsprüfung und nennt die Dateien und Tests für die Weiterarbeit mit Claude.

Die bisherigen Änderungen sind in [MR !1](https://gitlab.com/hahntim518/kalo/-/merge_requests/1) und [MR !2](https://gitlab.com/hahntim518/kalo/-/merge_requests/2) zusammengeführt. Die vollständige Prüfung steht in [Anforderungen und offene Punkte](docs/2026-11-13-requirements-audit.md). Dort umgesetzte Funktionen als Grundlage verwenden und weiterentwickeln, statt sie nochmals einzubauen. Offene Punkte sind ausdrücklich gekennzeichnet.

## Entwickeln

Mit Node.js 24 im Projektordner ausführen:

```sh
npm ci
npm run build
npx --no-install wrangler d1 execute DB --file drizzle/0000_optimal_red_shift.sql --config dist/server/wrangler.json --local --persist-to .wrangler/state
npm run dev
```

Führe den Datenbankbefehl einmal pro neuer lokaler Datenbank aus. Die Vorschau meldet dich mit einem lokalen Testkonto an. Für eine Vorschau des gebauten Workers verwende nach der Migration `npm start`.

GitLab CI ist in `.gitlab-ci.yml` für Lint, Tests, Typprüfung und Build eingerichtet. Bei der Prüfung am 13.11.2026 scheiterte die Pipeline jedoch vor dem Jobstart; der Connector lieferte keinen Fehlergrund. Die lokalen Prüfungen bestehen. Lokal: `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`. Die Live App wird separat über ChatGPT Sites veröffentlicht. Ein Commit auf GitLab veröffentlicht die Website nicht automatisch.

React und TypeScript verwenden den Sites Starter. Die Website und das Plugin nutzen dieselbe durch Sites bestätigte Identität. D1 speichert den Arbeitsstand pro Konto. Aktionen sind Befehle und werden auf den neuesten Stand angewendet, so können zwei Geräte gleichzeitig lernen. Nur ein Editor, dessen Set inzwischen anderswo geändert wurde, wird abgelehnt. Für die Berechnung der Wiederholungen gilt der Kalendertag in Zürich.

## ChatGPT verbinden

Kalo im gewünschten Chat unter den persönlichen Plugins aktivieren. Für eine Lernauswahl in der App Karten auswählen, freigeben und den Auftrag in den Chat kopieren. Der Code verfällt nach einer Stunde und funktioniert mit dem eigenen Konto. Aus Lernstoff im Chat kann das Plugin einen Entwurf erstellen. Prüfe ihn in der App unter «Entwürfe» und speichere ihn als Set.

«Erklären» direkt an einer Karte öffnet ein wegwischbares Fenster für genau diese Karte, ohne Auswahl. Es zeigt für beide kurzen Begriffe Bedeutungen und Beispiele aus Wiktionary. Das ist keine integrierte ChatGPT Antwort. «In ChatGPT vertiefen» kopiert einen Auftrag für beide Begriffe und öffnet den hinterlegten Chat; der Auftrag muss dort eingefügt werden. Bei langen Texten oder fehlenden Einträgen wird keine Erklärung vorgetäuscht.

Bei fehlendem Plugin kannst du den Lernauftrag mit den Karten kopieren oder erstellte Karten als Text importieren. Eine Karte pro Zeile, getrennt durch einen Tabulator.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `lib/learning.ts` | Lernlogik: Sets, Runden, FSRS-Planung, Import. Reine Funktionen, gut testbar |
| `lib/service.ts` | API für die Website und das ChatGPT Plugin (MCP) |
| `lib/explanations.ts` | Begrenzte Wörterbuchabfragen und sichere Aufbereitung beider Begriffe |
| `lib/social.ts` | Mehrere Freunde, Freigaben und Duelle |
| `app/kalo/` | Oberfläche, eine Datei pro Ansicht (`home-view`, `deck-view`, `study-view` ...) |
| `tests/` | Tests für Lernlogik, API und Wischgesten |

## Lernerinnerungen per Push

Der Code für morgendliche und abendliche Push Erinnerungen ist vorhanden. In der veröffentlichten Site sind am 13.11.2026 keine Laufzeitvariablen und keine verknüpften Sites Zeitpläne eingerichtet. Push bei geschlossener App gilt deshalb als offen, nicht als aktive oder getestete Funktion. Dafür braucht der Server:

1. Ein Schlüsselpaar: `node scripts/vapid-keys.mjs`. Die beiden Werte als Secrets `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` hinterlegen, optional `VAPID_SUBJECT` (zum Beispiel `mailto:du@example.com`).
2. Einen Cron-Trigger alle 15 Minuten (`*/15 * * * *`), der den `scheduled`-Handler in `worker/index.ts` aufruft.

Ohne Schlüssel bleibt Kalo bei den bisherigen Erinnerungen, die nur bei geöffneter App kommen. Auf dem iPhone funktionieren Push-Mitteilungen nur, wenn Kalo über das Teilen-Menü zum Home-Bildschirm hinzugefügt wurde.
