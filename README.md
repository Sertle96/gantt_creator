# Gantt Creator

Projektplanung per Drag & Drop im Browser: beliebig tiefe Hierarchien, Abhängigkeiten mit
Kettenglied (hart/weich), kritischer Pfad und persönliche Pläne pro Person. Oberfläche Deutsch/Englisch.

## Starten

```bash
npm install
npm run dev        # http://localhost:5173
```

Daten liegen lokal im Browser (IndexedDB). Über das Projektmenü lassen sich Projekte als JSON
exportieren und wieder importieren (Backup, Weitergabe).

## Bedienung in Kürze

| Aktion | So geht's |
| --- | --- |
| Element anlegen | `Enter` (Geschwister), `Strg+Enter` (Unterelement), Button „+ Element“ |
| Einfügen per Plus | Maus auf die Linie zwischen zwei Zeilen → „+“; unterste Zeile „Phase hinzufügen“ |
| Balken aufziehen | Im Gantt zwischen zwei Zeilen zeigt ein Vorschaubalken die Einfügestelle – ziehen legt ein neues Element mit diesem Zeitraum an |
| An Projektbreite anpassen | Knopf links neben Tag/Woche/Monat/Quartal |
| Ein-/Ausrücken | `Tab` / `Umschalt+Tab` – auch während der Namenseingabe; oder Zeilengriff seitlich ziehen |
| Umsortieren | Zeilengriff links ziehen |
| Verschieben / Dauer | Balken ziehen / Balkenränder ziehen (Snap auf Arbeitstage) |
| Abhängigkeit | Punkt am Balkenende auf einen anderen Balken ziehen (linke/rechte Hälfte = Anfang/Ende) |
| Hart ↔ weich | Kettenglied in der Pfeilmitte anklicken; Rechtsklick für Art (FS/SS/FF/SF), Verzug, Löschen |
| Ebenen ein-/ausklappen | Knöpfe über dem Grid: z. B. „Phase“ zeigt nur Phasen, „Alle“ klappt alles auf |
| Termine in der Tabelle | Start, Ende und Dauer direkt in den Zellen ändern (Dauer 0 = Meilenstein) |
| Person zuordnen | In die Zelle „Personen“ klicken und abhaken (auch neue Person anlegen) – oder Avatar auf Zeile ziehen |
| Balkenstil | Rechtsklick auf einen Balken: Farbe, Füllung, Beschriftung – danach individuell, „Zurücksetzen“ folgt wieder der Ebene |
| Zeitraum | „Zeitraum“ in der Toolbar: beliebiges Von–Bis oder Schnellauswahl, die Zeitleiste passt sich genau an |
| Persönlicher Plan | „Plan von …“ in der Toolbar – eigene Aufgaben farbig, Abhängigkeiten grau, Agenda nach Wochen |
| Ebenen benennen und gestalten | Einstellungen → Ebenen: Name und Stil (Farbe, Füllung, Beschriftung) je Ebene |

Elementarten: **Aufgabe** (Zeitraum), **Meilenstein** (ein Datum, wird von Abhängigkeiten verschoben –
entsteht automatisch, wenn nur ein Enddatum gesetzt ist) und **Deadline** (feste Frist, wird nie
verschoben, warnt bei Überschreitung). Elemente mit Unterelementen werden zu Sammelbalken.

Planungsverhalten (Einstellungen): *Nachfolger nur bei Konflikt verschieben* (Standard) oder *Abstände halten*.

## Entwicklung

```bash
npm test           # Unit-Tests der Planungslogik (Vitest)
npm run test:e2e   # End-to-End-Tests (Playwright, startet den Dev-Server selbst)
npm run typecheck
npm run lint
npm run build
```

Aufbau:

- `src/domain/` – reine Logik ohne UI: Arbeitskalender, Baum, Validierung von Verknüpfungen
  (Zyklen auch über die Hierarchie), Terminierung (push/keepGap), kritischer Pfad, persönlicher Plan
- `src/store/` – Zustand-Store mit Undo/Redo, Aktionen, Autosave, abgeleitete Daten
- `src/persistence/` – `ProjectRepository`-Schnittstelle, IndexedDB-Implementierung, JSON-Import/-Export
- `src/features/` – UI: Grid, Gantt (SVG), Details, Team, Einstellungen, persönliche Sicht
- `src/i18n/` – Texte DE/EN

Das Datenmodell ist normalisiert (UUIDs, `updatedAt` je Entität), damit später ein Team-Zugriff über
einen synchronisierten SharePoint-/OneDrive-Ordner als weiteres `ProjectRepository` ergänzt werden kann.

## Nächste Ausbaustufen

- Export von Meilensteinen/Deadlines/eigenen Aufgaben als `.ics` (Outlook)
- Baselines (Soll/Ist), Auslastung je Person
- Team-Zugriff über SharePoint-Ordner
- PDF/PNG-Export, Excel/MS-Project-Import
