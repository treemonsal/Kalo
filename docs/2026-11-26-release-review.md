# Prüfung des GitHub-Updates für Sites am 26.11.2026

Ausgang ist GitHub `treemonsal/Kalo`, `main` bei `3f41100cb1ada0808581a79d29d63b30c53bd274`, einschliesslich der drei Änderungen seit der vollständigen Sites-Übergabe `1c8e20749fbcf3a887d611d9fcaa2696b9bb153f`. Alle versionierten Dateien werden auf die Site übernommen; Hosting-ID, Datenbank und MCP bleiben erhalten. GitHub bleibt die einzige Arbeitsgrundlage.

Die Änderungen sind insgesamt sinnvoll: gemischte fällige Wiederholungen, Tagespensum bis zur Prüfung, Einstieg mit Beispielset, einheitliche Lernansichten, gemeinsame Beispiele-/Wörterbuch-Hilfe mit Lückentext-Karten, kleinere Profilbild-Antworten und Prüfungen für schmale Bildschirme. Die bisherige Designwahl, Beispiele, unterbrochene Runden, lokale Speicherung ohne Warten auf das Netz und die einzelne sichtbare Fläche beim Kartendrehen sind erhalten. Der GitHub-Prüflauf des Ausgangsstands war erfolgreich, einschliesslich seiner sechs Chromium-Szenarien.

## Vor der Veröffentlichung behobene Fehler

- **Grosse gemischte Runden:** Mehrere Sets konnten zusammen mehr als die im gespeicherten Rundenformat zulässigen 400 Karten erzeugen. Doppelte Set-IDs duplizierten die Fragen zusätzlich. IDs werden jetzt bereinigt und eine Runde auf 400 gemischte Karten begrenzt; die übrigen fälligen Karten bleiben unverändert für die nächste Runde verfügbar. Ein Test mit 500 fälligen Karten prüft auch Laden und anschliessendes Bewerten.
- **Hilfe im falschen Set:** Die Beispiele-Hilfe verwendete in gemischten Wiederholungen immer das erste Set der Runde. Dadurch schlug der Wörterbuchabruf für andere Sets fehl; eine neue Lückentext-Karte konnte im falschen Set landen. Die sichtbare Frage übergibt jetzt ihr tatsächliches Set, auch wenn noch das Ergebnis der vorherigen Frage angezeigt wird.
- **Vorhandene Profilbilder:** Veröffentlichte Konten speichern Bilder teilweise noch direkt als JPEG-Daten-URL. Die neue Umsetzung behandelte diesen Wert wie eine Bild-ID und erzeugte eine ungültige Adresse. Diese alten Bilder bleiben nun sichtbar; beim Ersetzen wird das neue Verfahren mit eigener Bild-Adresse verwendet. Ein API-Test prüft Laden, Namensänderung und Ersetzen eines alten Bildes.
- **Unterbrochene Wisch-Demo:** Eine Berührung brach die Animation ab, entfernte aber ihre Markierung nicht. Der darunterliegende Fragetext konnte dadurch weiterhin ausgeblendet bleiben. Der Wechsel aus dem Demo-Zustand räumt die Markierung jetzt auf.

## Validierung

Lokal erfolgreich: ESLint, TypeScript, alle 103 Tests und Produktionsbuild. Die beiden neuen Backend-Regressionen wurden zuerst am unveränderten GitHub-Code reproduziert und nach der Korrektur erfolgreich ausgeführt. Eine zusätzliche DOM-Prüfung bestätigt den richtigen Wörterbuch-/Speicher-Zielort, die gemessenen Kanten der Beispielkarte und das Aufräumen einer unterbrochenen Demo.

Die bestehenden GitHub-Browserprüfungen werden um gemischte Wiederholungen samt Hilfe/Kartenspeicherung und die Unterbrechung der Wisch-Demo ergänzt. Der lokale verwaltete Rechner stellt keinen unterstützten Browser-Vorschaupfad bereit; hier wurde kein Browser installiert oder Vorschau-Server gestartet. Die Browserläufe erfolgen in der bestehenden GitHub-CI. Ein echter iPhone-/WebKit-Sichttest ist damit nicht abgedeckt.
