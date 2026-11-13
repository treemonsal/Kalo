# Anforderungsprüfung am 13.11.2026

Die letzte konkrete Anweisung hat Vorrang: Home und Profil gemeinsam links, Plus separat rechts; fällige Karten ruhig mit grosser oranger Zahl. Frühere Wünsche nach einer ChatGPT Taste in der Mitte oder einer stärkeren Alarmfläche wurden dadurch ersetzt.

Referenz der Prüfung: Funktionsstand V22, Sites Quellcommit `b4add9c5bc252611136987e958c5a4f28de6201c`, GitLab main `f918fa901fb5373731356a1df840d15d4adc7d60`. Alle 111 Quelldateien und Dateimodi sind identisch, der lokale Arbeitsstand ist sauber. Diese Nachprüfung ergänzt ausschliesslich Dokumentation, keine neue Oberfläche oder Lernlogik.

## Konkrete Anforderungen

| Anforderung | Stand | Nachweis |
| --- | --- | --- |
| Logo dunkelblau passend zur Marke | Umgesetzt | `app/globals.css`, `brand-mark` mit `#161a3b` |
| Keine wechselnde Erklärung unter Weiterlernen | Umgesetzt | `home-view.tsx` rendert Titel und Fortschritt ohne `detail` |
| Permanenter Haken oben rechts entfernt | Umgesetzt | `app.tsx` zeigt Synchronisierung nur bei laufenden oder ausstehenden Aktionen |
| Serienpopup nur Flamme und hochrollende Tageszahl | Umgesetzt | `streak-celebration.tsx`, CSS für Erlöschen, Aufleuchten und Zahlwechsel; Browserprüfung inkl. reduzierter Bewegung |
| Fällige Karten minimalistischer mit grosser oranger Zahl | Umgesetzt | `home-view.tsx`, `due-alert` auf normaler Fläche, Zahl mit `--mark` |
| Kleine Symbolnavigation tiefer am Rand, echte Lücke vor Plus | Umgesetzt | `bottom-dock`: Home und Profil auf gemeinsamer Glasfläche, Plus separat, keine sichtbaren Wortlabels |
| Profilname genau unter Bild mittig | Umgesetzt | `profile-view.tsx`, `profile-title`; frühere Browsermessung innerhalb eines Pixels |
| Stift rechts vor Statistik; zentrale Profilbearbeitung | Umgesetzt | `app.tsx`, `profile-editor.tsx`: Name, Bild und Freunde |
| Mehrere Freunde statt einer einzelnen Person | Umgesetzt | `lib/social.ts` und `tests/friends.test.ts`, alte Partnerverbindung bleibt erhalten |
| Profilkennzahlen nur Set, Karten und Flamme mit Zahl | Umgesetzt | Drei Einträge in `profile-metrics`, keine zusätzliche Sitzen Kennzahl |
| Profilsymbol mit gerader Unterkante | Umgesetzt | `icons.tsx`, geschlossene Form mit gerader Abschlusslinie |
| Keine Vorwochenzahl oder offensichtlichen Statistikbeschreibungen | Umgesetzt | `stats-view.tsx`, Zielzahl direkt an gestrichelter Linie |
| Keine Wörter unter Statistikzahlen wie Karten oder Serie | Umgesetzt | `stat-tile` enthält Symbol und Wert; zugängliche Bezeichnungen bleiben als ARIA und Tooltip erhalten |
| ChatGPT und Import im Editor zurückhaltend rechts als Symbole | Umgesetzt | `editor-view.tsx`, `editor-tools` |
| Kopfzeile bleibt oben im Dokument und scrollt aus dem Bild | Umgesetzt | `topbar` ist relativ positioniert, nicht fixiert, kein Scrollfade |
| Neue Runde ohne Sicherheitsabfrage; alte Runde erhalten | Umgesetzt | `app.tsx` ohne Startbestätigung, `learning.ts` mit `pausedSessions` und `resumeSession`; Tests und Browserprüfung nach Neuladen |
| Erklärfenster nutzt genau die aktuelle Karte ohne Mehrfachauswahl | Umgesetzt | `card-explain-sheet.tsx`, `POST /api/explain` prüft den Besitz der gewählten Karte |
| Beide Begriffe im Fenster erklären statt nur die Rückseite zeigen | Für Wörterbucheinträge umgesetzt | Zwei unabhängige Bedeutungen und Beispiele aus Wiktionary; kurze Begriffe, Zeitlimit und sichere Textausgabe |
| Direkt im Popup frei mit ChatGPT erklären | Nicht umgesetzt | Es gibt keine direkte Modellausführung. Der bestehende Chat wird über kopierten Auftrag geöffnet. Keine zusätzliche kostenpflichtige API eingebaut. Lange Texte oder fehlende Wörterbucheinträge haben deshalb keine automatische Erklärung im Popup. |
| Erklärung nach unten wegwischen, Vollbild und klare Wischbewertung | Umgesetzt | `card-explain-sheet.tsx`, `card-viewer.tsx`, `flashcard.tsx`; Gesten und Hintergrundkürzel geprüft |
| Endliche Lernrunden, kleine Animation dazwischen, Fehler direkt rot und korrekt grün | Umgesetzt | `study-view.tsx`, `learning.ts`, maximal vier Runden pro Lerneinheit, weitere Übung ausdrücklich wählbar |
| Push Mitteilungen bei geschlossener App | Offen | Versandcode vorhanden; Laufzeitkonfiguration ist leer (Revision 0), keine verknüpften Sites Zeitpläne. Kein tatsächlicher Versand geprüft. |

## Prüfung und Grenzen

Am 13.11.2026 erneut ausgeführt: 73 Tests, TypeScript und ESLint, alles erfolgreich. Das ausgelieferte CSS stimmt mit dem geprüften Build überein, die Homepage liefert HTTP 200. Die zehn Browserprüfungen des unveränderten V22 Stands umfassen echte Wiktionary Antworten für improve und verbessern, Rundenwechsel, Neuladen, Kennzahlen, Gesten, 320 Pixel, Desktop, hellen Modus und reduzierte Bewegung. Weitere 14 Browserprüfungen wurden vor V21 ausgeführt. Diese Protokolle sind keine physische iPhone Prüfung und kein tatsächlich ausgeführtes ChatGPT Gespräch.

Der öffentliche Link aktiviert das persönliche Plugin nicht automatisch im gewünschten Chat. Die Bereitstellung des MCP Servers ist bestätigt; eine dort ausgeführte vollständige ChatGPT Lernsitzung wurde nicht kontrolliert. Ebenso ist die genaue visuelle Gleichheit zu Quizlet nicht belegt: Das erwähnte Referenzbild lag im Chat nicht vor. Gestaltung und Verhalten folgen den beschriebenen Anforderungen.

GitLab CI ist vorhanden, hat aber bisher keine Jobs ausgeführt: Pipeline 3063113469 war vor dem Jobstart fehlgeschlagen. Der Connector liefert keinen Fehlergrund. Lokale Testerfolge dürfen nicht als bestandene GitLab Pipeline dargestellt werden. Neue GitLab Commits veröffentlichen die Site nicht automatisch.

## Hinweise für Claude

Aktuelle gemeinsame Quelle ist `hahntim518/kalo` auf GitLab, Branch `main`. MR !1 enthält die Profil-, Freunde- und Oberflächenkorrekturen, MR !2 die gespeicherten Lernrunden, ruhigere Fälligkeiten und Wörterbucherklärungen. Die obigen umgesetzten Punkte sind bereits vorhanden. Für weitere Arbeit zunächst den neuesten `main` und lokale Änderungen abgleichen. Offene Integrationspunkte gezielt bearbeiten; die bereits vorhandenen Funktionen nicht erneut einbauen und den Wörterbuchaufruf nicht als ChatGPT Antwort bezeichnen.

Quellzugänge, Tokens, Laufzeitdaten und Profilbilder gehören nicht ins Repository. Die lokal verwendeten synthetischen Prüfkonten wurden nach den Browserprüfungen wieder durch die gesicherten Originalzeilen ersetzt. Für diese Nachprüfung wurden keine Produktionsdaten verändert.
