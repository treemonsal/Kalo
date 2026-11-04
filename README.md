# Kalo

Webapp für Karteikarten, adaptive Lernrunden, Pauken und fällige Wiederholungen mit FSRS. Die persönliche Lernbibliothek wird pro ChatGPT Konto gespeichert.

[Live App öffnen](https://kartenloop.netteddrive.chatgpt.site/)

## Entwickeln

Mit Node.js 24 im Projektordner ausführen:

```sh
npm ci
npm run build
npx --no-install wrangler d1 execute DB --file drizzle/0000_optimal_red_shift.sql --config dist/server/wrangler.json --local --persist-to .wrangler/state
npm run dev
```

Führe den Datenbankbefehl einmal pro neuer lokaler Datenbank aus. Die Vorschau meldet dich mit einem lokalen Testkonto an. Für eine Vorschau des gebauten Workers verwende nach der Migration `npm start`.

GitHub Actions führt bei Änderungen an `main` und bei Pull Requests Lint, Tests, Typprüfung und Build aus. Lokal: `npm run lint`, `npm test`, `npm run typecheck`. Die Live App wird über ChatGPT Sites veröffentlicht.

React und TypeScript verwenden den Sites Starter. Die Website und das Plugin nutzen dieselbe durch Sites bestätigte Identität. D1 speichert den Arbeitsstand pro Konto. Aktionen sind Befehle und werden auf den neuesten Stand angewendet, so können zwei Geräte gleichzeitig lernen. Nur ein Editor, dessen Set inzwischen anderswo geändert wurde, wird abgelehnt. Für die Berechnung der Wiederholungen gilt der Kalendertag in Zürich.

## ChatGPT verbinden

Kalo im gewünschten Chat unter den persönlichen Plugins aktivieren. In der App Karten auswählen, freigeben und den Auftrag in den Chat kopieren. Der Code verfällt nach einer Stunde und funktioniert mit dem eigenen Konto. Aus Lernstoff im Chat kann das Plugin einen Entwurf erstellen. Prüfe ihn in der App unter «Entwürfe» und speichere ihn als Set.

Bei fehlendem Plugin kannst du den Lernauftrag mit den Karten kopieren oder erstellte Karten als Text importieren. Eine Karte pro Zeile, getrennt durch einen Tabulator.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `lib/learning.ts` | Lernlogik: Sets, Runden, FSRS-Planung, Import. Reine Funktionen, gut testbar |
| `lib/service.ts` | API für die Website und das ChatGPT Plugin (MCP) |
| `app/kalo/` | Oberfläche, eine Datei pro Ansicht (`home-view`, `deck-view`, `study-view` ...) |
| `tests/` | Tests für Lernlogik, API und Wischgesten |
