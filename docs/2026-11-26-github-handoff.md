# Kalo: vollständige Übergabe nach GitHub am 26.11.2026

Der Nutzer möchte alle Dateien und den aktuellen Code in GitHub sehen, damit Claude auf demselben Stand weiterarbeiten kann. Die App wurde durch diese Übertragung nicht verändert oder neu veröffentlicht.

## Verfügbare Stände

| GitHub-Branch | Inhalt und Herkunft |
| --- | --- |
| `main` | Alle 128 versionierten Dateien der veröffentlichten Sites Version 35, Quelle `a8cdebbb168c46e85a214b1b254971c5c8f52b50`, zuzüglich dieser Übergabe und des README-Hinweises. Die letzten Korrekturen sind im GitLab-Merge `d9511931a4088b234bd9f3de0c1370e1f416fc36` enthalten. |
| [`sync/gitlab-main-20261126`](https://github.com/treemonsal/Kalo/tree/sync/gitlab-main-20261126) | Unveränderte vollständige Kopie aller 130 Dateien von GitLab `main`, Commit `9bbc63bccc4b9c9b856d464bb4f70bf92590d018`. Die Datei-Inhalte und Dateimodi werden anhand der Git-Blob-IDs abgeglichen. |

Der neuere GitLab-Commit trägt den Titel «Review-Funde behoben: Richtig-Quote, Profilbild als eigene Datei, Navigation per Tab». Er bringt diese neuen Änderungen mit, ersetzt aber zugleich Teile der bereits veröffentlichten Funktionen durch ältere Implementierungen. Deshalb wird er separat erhalten, statt den funktionierenden veröffentlichten Stand damit zu überschreiben. Keine dieser neueren Änderungen geht durch die Übertragung verloren.

## Für die Weiterarbeit

Die Änderungen des separaten Branches müssen gezielt in `main` integriert werden. Den gesamten Branch unverändert zu übernehmen entfernt unter anderem Beispiele aus dem Kartendatenmodell, unterbrochene Lernrunden und den API-Einstieg für Kartenerklärungen. Die bisher erhaltenen Aufrufer benötigen diese Funktionen weiterhin.

Die lokale Prüfung des unveränderten GitLab-Stands am 26.11.2026 ergab: ESLint erfolgreich, TypeScript fehlgeschlagen. Beispiele der Fehler:

- `app/api/explain/route.ts`: `lib/service.ts` exportiert `explainApi` nicht mehr.
- `card-viewer.tsx`, `chat-view.tsx` und die Lerntests greifen auf `examples` zu, das im neuen Kartentyp fehlt.
- `deck-view.tsx` und die Lerntests benötigen `Session`, `pausedSessions` und `resumeSession`, die im neuen Lernmodell fehlen.
- `app.tsx` übergibt erforderliche Props wie `onResumeSession` und `draftKey` nicht mehr.

Nach der fehlgeschlagenen Typprüfung wurden die Tests und der Build dieses unveränderten GitLab-Stands nicht weiter ausgeführt. Diese Fehler sind bereits im kopierten Ausgangsstand vorhanden und entstehen nicht durch die GitHub-Übertragung.

## Erhaltene App-Änderungen in `main`

Der veröffentlichte Stand enthält die Designwahl, das braune Home-Symbol, den schlichten Kalo-Schriftzug, direkten Vollbild-Kartenmodus, lokale Speicherung ohne Wartezeit, zuverlässigere Wischgesten, Filter für abgeschlossene Prüfungen und den kompakten Termin-Hinweis. Beispiele sind separat vom Lerninhalt gespeichert und in beiden Lernrichtungen verfügbar.

Die letzte Korrektur nutzt beim Umdrehen nur eine echte Kartenfläche: zusammenklappen, Inhalt bei Breite null tauschen und ohne negative Skalierung wieder öffnen. So gibt es keine zweite gespiegelte Kopfzeile. Die Beispielkarte übernimmt genau Position und Grösse der Lernkarte und folgt Viewport-Änderungen. Wischhinweise und Rückgängig bleiben erhalten. Einzelheiten stehen in [Design und Verhalten](site-design-choice.md).

Für diese veröffentlichte Quelle waren am 25.11.2026 ESLint, TypeScript, alle 92 Tests und der Produktionsbuild erfolgreich. Zusätzliche lokale DOM-Prüfungen deckten die Animation während des Drehens, schnelle Richtungswechsel, Abbruch beim Kartenwechsel, Beispiele während einer Drehung, genaue Kartenkanten und Grössenänderungen sowie die bestehenden Lernabläufe ab. Ein echter iPhone-/WebKit-Sichttest war nicht verfügbar.

Versionierte Quellen, Bilder, Konfigurationen, Dokumentation und Tests sind vollständig übernommen. Lokale Abhängigkeiten, Build-Ausgaben, Laufzeitdaten und Zugangsdaten gehören nicht zum Quellstand. GitHub-Commits veröffentlichen die Sites-App nicht automatisch.
