# Designauswahl auf der Site

Die Site übernimmt den Stand von GitLab `main`, Commit `22a1459696d874df893ac620e846f25d7ad6a9ca`.

Eigene Ergänzungen, die beim nächsten Quellenabgleich erhalten bleiben sollen:

Diese zuvor nur im Sites-Quellrepo gespeicherten Ergänzungen werden mit der [Übergabe vom 18.11.2026](2026-11-18-sites-handoff.md) in das gemeinsame GitLab-Repo zurückgeführt.

- Unter Profil → Einstellungen → Darstellung lässt sich zwischen «Neu» und «Bisherig» wechseln. «Bisherig» stellt Farben, Schrift und das App-Logo der vorher veröffentlichten Version 23 wieder her.
- `lib/design.ts` definiert die Auswahl. Der Cookie `kalo-design` speichert sie für dieses Gerät; Server und Client lesen denselben Wert. Das Farbschema Hell/Dunkel/System bleibt unabhängig davon.
- `app/classic-design.css` enthält ausschliesslich die geänderten Deklarationen des alten Designs, mit `data-design="classic"` begrenzt. Neue Lernfunktionen und Datenformate bleiben in beiden Designs gleich.
- Ein erneuter Aufruf der bereits geöffneten Seite scrollt sanft nach oben; reduzierte Bewegung wird berücksichtigt. Die Kopfzeile bleibt am Dokumentanfang.
- Der Kartenmodus öffnet direkt als Vollbilddialog. Die Seite dahinter bleibt gegen Scrollen gesperrt; beim Verlassen werden Stil und Position wiederhergestellt. Lange Kartentexte und das Ergebnis behalten ihre eigenen Lesebereiche.
- Das neue Design nutzt das Espresso-/Nussbraun-Logo aus `public/kalo-brown-*.png`, einschliesslich Favicon, Home-Bildschirm-Icon und eigenem Manifest. Die bisherige Designwahl behält ihre vorherigen Symbole.
- Die beiden Wischbewertungen sind farbige Texte mit grossen Tippflächen, ohne Hintergrund oder Rahmen. Wischgesten erkennen kurze diagonale Bewegungen, nutzen die tatsächliche Loslassposition und funktionieren auch bei reduzierter Bewegung. Abgebrochene Gesten setzen die Karte zurück; lange Kartentexte bleiben lesbar.
- Antworten, Bewertungen, Rücknahmen, Markierungen und Kartenpositionen werden zuerst im lokalen Journal gesichert. Die Oberfläche wartet beim Weiterlernen nicht auf die Serverantwort. Bestätigte Serverstände werden mit offenen lokalen Aktionen zusammengeführt; Anfrage-IDs und Sequenzen verhindern doppelte Bewertungen. Derselbe Zufallsstartwert hält die Rundenreihenfolge auf Gerät und Server gleich. Änderungen an Sets und neue Sitzungen warten weiterhin auf den Abgleich.
- Eingaben und aufgedeckte Antworten bleiben beim Unterbrechen einer Frage auf diesem Gerät erhalten. «Weiter» unterstützt zusätzlich Eingabe, Leertaste und Pfeil rechts.

Der vorherige Quellstand ist im Git-Verlauf unter `7686246e7f552b92ee1ea4b6c3d7ceb3d6f8df14` erhalten. Für die Designwahl ist kein Rollback der Lernlogik oder der Daten nötig.
