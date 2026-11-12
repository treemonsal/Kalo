# Kalo: kompakte Oberfläche und Freunde

Auftrag aus dem Nutzertest: dunkles Logo, kein erklärender Text in der Weiterlernen Kachel, kein permanenter Speicherhaken. Serienfortschritt nur als erlöschende und aufleuchtende Flamme mit hochrollender Zahl. Fällige Karten deutlich hervorheben. Symbolleiste kompakter und tiefer, Home und Profil gemeinsam links, Plus rechts separat. Name genau unter dem Bild; Profilbearbeitung zentral über den Stift oben rechts. Mehrere Freunde, bestehende Partnerschaften erhalten. Profilkennzahlen nur als Symbol und Zahl. Profilsymbol mit gerader Unterkante. Statistik ohne Vorwochenzahl, Erläuterungstexte und Verlaufssatz; Tagesziel direkt an der gestrichelten Linie. ChatGPT und Import als kleine Werkzeuge im Seteditor. Kopfzeile scrollt mit dem Dokument aus dem Bild und bleibt nicht fixiert.

Zusatzauftrag: Erklären aus einer Karte nutzt ausschliesslich diese Karte in einem von unten kommenden, wegwischbaren Fenster. Übergabe an den bestehenden ChatGPT Chat, ohne Auswahl mehrerer Karten und ohne separat abgerechnete API.

Arbeitsteilung: Freunde nur in lib/social.ts, lib/service.ts und Backendtests. Oberfläche und Clienttypen separat. Abschluss mit Tests für neue Freundschaften, Migration, Löschung und Kontentrennung sowie unabhängiger Codeprüfung. Bestehende öffentliche Site und Daten beibehalten, GitLab aktualisieren und direkt veröffentlichen.

Das erwähnte Referenzbild ist in diesem Chat nicht sichtbar. Anordnung und Verhalten folgen der beschriebenen Referenz. Echte Handyprüfung bleibt von einer verfügbaren Browsersteuerung abhängig.

## Prüfung

66 Tests, Typprüfung und Lint. Zusätzlich lokale Headless Chromium Prüfung mit synthetischen Testkonten: 393 × 852, 320 × 568 und Desktop 1280 × 900. Name innerhalb eines Pixels unter dem Bild zentriert, keine horizontalen Überläufe, Kopfzeile scrollt aus dem Bild. Profilname speichern und Freunde entfernen wurden gegen die lokale D1 Laufzeit geprüft. Verzögerte Antworten überschreiben weder den Namen noch eine neuere Freundesliste.

Einzelkarten Auftrag enthält nur die sichtbare Karte. Tastaturbefehle im Hintergrund sind bei geöffnetem Dialog gesperrt. Wegwischen, abgebrochener kurzer Zug und Escape geprüft. Serienflamme wechselt von erloschen zu aktiv, Zahl von 2 zu 3; reduzierte Bewegung zeigt den neuen Stand ohne Rollanimation. Browserfehler wurden nicht beobachtet. Echte Geräte und der authentifizierte ChatGPT Chat wurden nicht ferngesteuert.

Unabhängige Codeprüfung für atomare Freundschaften, Polling und die neuen Dialoge abgeschlossen; drei gefundene Randfälle korrigiert und gezielt nachgeprüft. Frühere lokale Testzeilen werden nach der Prüfung wiederhergestellt. Produktionsdaten werden durch die Prüfung nicht geändert.
