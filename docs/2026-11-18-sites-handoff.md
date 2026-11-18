# Kalo: Rückführung der Sites-Ergänzungen am 18.11.2026

Dieses Protokoll beschreibt den bereits veröffentlichten Funktionsstand von [Kalo](https://kartenloop.netteddrive.chatgpt.site/), damit die weitere Entwicklung mit Claude auf derselben Grundlage erfolgt. Gemeinsame Quelle bleibt GitLab `hahntim518/kalo`, Branch `main`; der ältere GitHub-Spiegel ist keine zweite Arbeitsgrundlage.

## Herkunft und Umfang

Ausgangspunkt ist GitLab `main` bei `22a1459696d874df893ac620e846f25d7ad6a9ca`. Die Live-Site Version 27 wurde aus dem getrennten Sites-Quellrepo mit Commit `fecdaf72a16cb99d5650df82574e9a8c4a6fde9e` gebaut und veröffentlicht. Davor liegen dort die Ergänzungen `ec3b02a` (Designauswahl) und `4a2e27d` (direktes Vollbild und braunes Logo). Die Sites-Commit-IDs sind Herkunftsnachweise; sie gehören zu einem anderen Git-Verlauf und sind keine GitLab-Commits.

Übernommen werden alle gegenüber diesem GitLab-Ausgangspunkt abweichenden bzw. ergänzten Produktdateien und Tests, einschliesslich der PNG-Logos und des Manifests. Keine GitLab-Datei wird gelöscht. Die bestehende Hosting-Konfiguration, Abhängigkeiten und CI-Konfiguration bleiben erhalten. Zusätzlich ist der Ereignis-Callback `mutate` mit `useCallback` stabilisiert, damit die React-Lintprüfung die innerhalb von Nutzeraktionen verwendeten Zeitstempel korrekt behandelt; das verändert den beschriebenen Ablauf nicht.

## Verhalten und betroffene Dateien

| Änderung | Umsetzung |
| --- | --- |
| Neues Graphit-/Braundesign und Wechsel zum bisherigen Indigo-Design | `lib/design.ts`, `app/classic-design.css`, `app/kalo/settings-view.tsx`, `theme.ts`, `app/page.tsx`, `app/layout.tsx`; gerätebezogener Cookie `kalo-design`, unabhängig von Hell/Dunkel/System |
| Passendes braunes Logo auch für Favicon und Home-Bildschirm | `public/kalo-brown-*.png`, `public/kalo-brown.webmanifest`; die bisherige Designwahl behält ihre Symbole |
| Kopfzeile scrollt aus dem Bild; aktive Navigation führt sanft nach oben | `app/kalo/app.tsx`, `app/globals.css`; reduzierte Bewegung wird berücksichtigt |
| Kartenmodus öffnet direkt im Vollbild, ohne kleinen Zwischenbildschirm | `app/kalo/card-viewer.tsx`, `lib/viewport-lock.ts`; Hintergrund ist gegen Scrollen gesperrt, Stil und Scrollposition werden beim Verlassen wiederhergestellt |
| Bewertungsaktionen als farbige Texte ohne Hintergrund oder Rahmen | `app/globals.css`; Grün für «Ich kann das», Orange für «Später üben», grosse Tippflächen und Tastaturfokus bleiben erhalten |
| Leichtere und zuverlässigere Wischgesten | `lib/swipe.ts`, `app/kalo/flashcard.tsx`; kleinere Schwelle, diagonale Gesten, tatsächliche Loslassposition, Erholung nach Abbruch/Fokusverlust; direkte Fingerbewegung funktioniert auch bei reduzierter Bewegung |
| Lange Karten bleiben lesbar | Scrollbereich auf der sichtbaren Kartenseite; native vertikale Gesten nur bei überlaufendem Text |
| Weiterlernen ohne Wartezeit auf die Serverantwort | `lib/learning-sync.ts`, `lib/service.ts`, `app/kalo/app.tsx`, `types.ts`; Antworten, Bewertungen, Rücknahmen, Sterne und Kartenpositionen werden zuerst dauerhaft lokal gesichert |
| Unterbrochene Antworten bleiben erhalten | `app/kalo/study-view.tsx`; eingegebener Text sowie falsche/aufgedeckte Antwortphase sind pro Konto und Frage lokal gespeichert; nach erfolgreicher lokaler Übernahme wird der Entwurf entfernt |
| «Weiter» auch per Tastatur | Eingabe, Leertaste und Pfeil rechts bei sichtbarem, lokal gesichertem Ergebnis |

## Speicherung und Abgleich

`DurableQueue.enqueue` bestätigt eine Aktion nach erfolgreichem Schreiben in `localStorage`, bevor die Netzwerkanfrage fertig ist. `submit` behält seine bisherige Semantik für Aufrufer, die eine Serverbestätigung benötigen. Das Journal `kalo-outbox:<accountId>` und die sechs bestehenden Aktionstypen bleiben kompatibel mit bereits offenen Tabs. Kann der Browser nicht lokal speichern, wird kein Erfolg vorgetäuscht.

Die Oberfläche trennt bestätigte Serverdaten von der Vorschau mit ausstehenden lokalen Aktionen. `WorkspaceProjection` spielt diese Aktionen in Reihenfolge auf den neuesten bestätigten Stand; verspätete Antworten setzen den sichtbaren Fortschritt nicht zurück. API-Antworten enthalten dafür die bestätigten Sequenzen je Client in `confirmed`. Anfrage-ID, Client-ID und Sequenz verhindern eine doppelte Anwendung bei erneut zugestellten Antworten. `actionShuffle(requestId)` verwendet auf Gerät und Server dieselbe Reihenfolge beim automatischen Wechsel zur nächsten Lernrunde.

Konflikte bleiben im Journal und stoppen den weiteren Abgleich bis zur Prüfung. Auch im Vollbild wird ein blockierter Abgleich sichtbar. Änderungen an Sets und neue/andere Sitzungen warten weiterhin auf den Abgleich; vollständiges Offline-Laden der App oder Offline-Starten einer neuen Sitzung ist damit nicht eingeführt. Die bisherigen Kontotrennungs- und Konfliktprüfungen bleiben bestehen.

Antwortentwürfe liegen unter `kalo-answer:<accountId>:<sessionId>:<round>:<cursor>`. Persönliche Karten, lokale Journale, Zugangsdaten und Laufzeitdaten gehören nicht ins Repository.

## Prüfungen

Lokal am 18.11.2026 erfolgreich: `npm run lint`, `npm run typecheck`, `npm test` mit 84 Tests und `npm run build`. Neue Regressionen in `tests/sync.test.ts`, `tests/service.test.ts` und `tests/swipe.test.ts` prüfen schnelle Eingaben vor Serverbestätigung, Wiederzustellung, Rundenwechsel, Zusammenführung bestätigter Zustände, lokale Speicherfehler und kurze diagonale Gesten. `tests/design.test.ts` und `tests/viewport-lock.test.ts` sichern Designwechsel und Wiederherstellung des Hintergrunds ab.

Zusätzliche lokale DOM-Prüfungen mit Happy DOM bestätigten direktes Vollbild, Flip/Bewertung/Rückgängig, verzögerte Netzantworten, Offline-Weiterlernen innerhalb einer Sitzung, Entwurfswiederherstellung, Wischabbrüche und rahmenlose Bewertungsaktionen. Diese Prüfungen liefen als lokale Hilfsskripte ohne neue Projektabhängigkeit. Sie ersetzen keinen echten iPhone-/Safari-Test. Die ausgelieferten CSS-/JavaScript-Dateien von Version 27 wurden per Hash mit dem Build verglichen.

Die obigen Ergebnisse sind lokale Prüfungen, keine Aussage über den GitLab-Pipelinestatus. GitLab-Commits veröffentlichen die Site weiterhin nicht automatisch. Die offenen Integrationspunkte aus der [Anforderungsprüfung vom 13.11.2026](2026-11-13-requirements-audit.md), insbesondere Push bei geschlossener App und direkte Modellausführung im Erklärfenster, bleiben offen.
