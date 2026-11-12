# Kalo: verlässliches Lernen und klare Bedienung

Freigegebener Umfang: Punkte 1 bis 4 aus dem Chat, getrennte Navigation und ein farblich passendes Logo. Partnerfreigabe und Push bleiben ausserhalb dieses Auftrags.

## Umsetzung

- [x] Statistik: Montag bis Sonntag in Zürich, Vorwoche als Kalenderwoche. Karten und Bonuspunkte getrennt beschriften; Tagesziel bleibt wie bisher ein Punkteziel.
- [x] Verbindungsabbrüche: Bewertungen, Rückgängig, Markierungen und Kartenposition vor dem Senden pro Konto lokal speichern. Nach Neuladen und Wiederverbindung in Reihenfolge übertragen. Anfragen über einen dauerhaften Zähler pro Browser serverseitig deduplizieren, Zeitpunkt erhalten, Konflikte sichtbar zur Prüfung behalten. Während einer nicht bestätigten Lernantwort bleibt der nächste Schritt gesperrt. Kein vollständiger Offlinebetrieb wird versprochen.
- [x] Home: eine Hauptaktion für Weiterlernen oder die nächste sinnvolle Runde. Tagesziel kompakt, fällige Sets und weitere Aufgaben nachgeordnet.
- [x] Profil: eigenes Bildmenü, Vorschau und verschiebbarer Ausschnitt mit Zoom vor dem Speichern; Entfernen unabhängig vom Namen.
- [x] Navigation: Home und Profil in einer gemeinsamen Glasfläche links, Plus separat rechts. Logo mit derselben blauen Akzentfarbe wie die Oberfläche.
- [x] Tests: Kalendergrenzen und Bonuspunkte, lokale Warteschlange nach Neustart, verlorene Serverantwort und doppelte Zustellung, Kontentrennung und Reihenfolge. Bestehende Tests und Typprüfung ausführen, bauen und bestehende öffentliche Site aktualisieren.

Technik: vorhandenes React, TypeScript und D1. Keine zusätzlichen Abhängigkeiten. Kein Datenschemawechsel und keine Veränderung vorhandener Sets. Vorheriger Stand bleibt im Git Verlauf und als Quellarchiv erhalten.

Prüfgrenzen: Browsersteuerung ist in dieser Sitzung nicht verfügbar. Keine Aussage über echte iPhone oder iPad Tests.

Der parallel erschienene GitLab Commit `8063cc54` wurde integriert. Sein Bildeditor wird weiterverwendet und um das direkte Bildmenü sowie Fehlerbehandlung beim Speichern ergänzt. Die zusätzlichen Änderungen an ChatGPT, Entwürfen, Rücknavigation, Editor und GitLab CI bleiben erhalten.

Prüfung: 52 Tests, Typprüfung und Lint erfolgreich. Die unabhängige Prüfung bestätigte die Korrekturen für alte Wiederholungsanfragen und rückwärts laufende Zeitanker. Build und Veröffentlichung folgen als letzter Schritt.
