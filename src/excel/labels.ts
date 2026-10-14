import type { ItemKind, LinkType } from '../domain/types';

export type ExcelLang = 'de' | 'en';

/** Texts written into workbooks. The importer accepts the headers of every language. */
export interface ExcelLabels {
  guideSheet: string;
  nr: string;
  level: (n: number) => string;
  start: string;
  end: string;
  duration: string;
  people: string;
  type: string;
  predecessors: string;
  kinds: Record<ItemKind, string>;
  /** Link codes written after the predecessor number. */
  links: Record<LinkType, string>;
  dateFormat: string;
  week: string;
  weekdays: string[];
  months: string[];
  guideTitle: string;
  guide: string[];
  example: string;
  exampleRows: string[][];
}

/** Sheet holding the plan; its name is the same in every language. */
export const PLAN_SHEET = 'Plan';

export const LABELS: Record<ExcelLang, ExcelLabels> = {
  de: {
    guideSheet: 'Anleitung',
    nr: 'Nr.',
    level: (n) => `Ebene ${n}`,
    start: 'Start',
    end: 'Ende',
    duration: 'Dauer (AT)',
    people: 'Personen',
    type: 'Typ',
    predecessors: 'Vorgänger',
    kinds: { task: 'Aufgabe', milestone: 'Meilenstein', deadline: 'Deadline' },
    links: { FS: 'EA', SS: 'AA', FF: 'EE', SF: 'AE' },
    dateFormat: 'DD.MM.YYYY',
    week: 'KW',
    weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    months: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
    guideTitle: 'So füllst du die Vorlage aus',
    guide: [
      'Jede Zeile im Blatt „Plan“ ist ein Element. Die Reihenfolge der Zeilen ist die Reihenfolge im Plan.',
      'Der Name steht in der Spalte seiner Ebene: Phasen in „Ebene 1“, deren Unterelemente in „Ebene 2“ usw. Pro Zeile genau eine Ebenen-Zelle füllen.',
      'Ein Element gehört zur letzten Zeile darüber, die eine Ebene höher steht. Ebenen dürfen nicht übersprungen werden.',
      '„Nr.“ ist optional. Leer lassen, dann wird die Nummer automatisch vergeben (1, 1.1, 1.2 …). Ein eingetragener Wert dient nur als Bezug für „Vorgänger“.',
      'Start und Ende als Datum (z. B. 14.10.2026). Fehlt das Ende, gilt „Dauer (AT)“ in Arbeitstagen ab Start, sonst 5 Arbeitstage. Ende mit Dauer ohne Start: die Aufgabe endet an diesem Datum.',
      'Nur ein Ende-Datum (ohne Start und Dauer) oder Dauer 0 ergibt automatisch einen Meilenstein – er liegt als Raute genau auf diesem Datum.',
      'Elemente mit Unterelementen: Ende, Dauer und Typ werden ignoriert – die Termine ergeben sich aus den Unterelementen.',
      'Personen durch Komma trennen. Unbekannte Namen werden als neue Personen angelegt.',
      'Typ: Aufgabe (Standard), Meilenstein oder Deadline.',
      'Vorgänger: Nummer des Vorgängers, z. B. „1.2“. Optional mit Art (EA = Ende→Anfang, AA, EE, AE) und Versatz in Arbeitstagen: „1.2 AA+2“. Mehrere mit „;“ trennen. „~1.2“ = weiche Abhängigkeit (verschiebt nicht).',
      'Spalten rechts von „Vorgänger“ (z. B. das Balkendiagramm im Export) werden beim Import ignoriert.',
    ],
    example: 'Beispiel',
    exampleRows: [
      ['Nr.', 'Ebene 1', 'Ebene 2', 'Start', 'Ende', 'Dauer (AT)', 'Personen', 'Typ', 'Vorgänger'],
      ['', 'Konzept', '', '', '', '', '', '', ''],
      ['', '', 'Analyse', '05.01.2026', '16.01.2026', '', 'Anna', '', ''],
      ['', '', 'Workshop', '', '', '3', 'Anna, Ben', '', '1.1'],
      ['', '', 'Freigabe', '', '', '', '', 'Meilenstein', '1.2'],
      ['', 'Go-live', '', '', '30.01.2026', '', '', '', ''],
    ],
  },
  en: {
    guideSheet: 'Instructions',
    nr: 'No.',
    level: (n) => `Level ${n}`,
    start: 'Start',
    end: 'End',
    duration: 'Duration (wd)',
    people: 'People',
    type: 'Type',
    predecessors: 'Predecessors',
    kinds: { task: 'Task', milestone: 'Milestone', deadline: 'Deadline' },
    links: { FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF' },
    dateFormat: 'YYYY-MM-DD',
    week: 'W',
    weekdays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    guideTitle: 'How to fill in the template',
    guide: [
      'Every row on the “Plan” sheet is one item. The row order is the order in the plan.',
      'Put the name in the column of its level: phases in “Level 1”, their children in “Level 2” and so on. Fill exactly one level cell per row.',
      'An item belongs to the last row above it that is one level higher. Levels must not be skipped.',
      '“No.” is optional. Leave it empty to number automatically (1, 1.1, 1.2 …). A value you enter is only used as a reference for “Predecessors”.',
      'Start and End as dates (e.g. 2026-10-14). Without an End, “Duration (wd)” in working days from the start applies, otherwise 5 working days. End and duration without a start: the task ends on that date.',
      'An End date alone (no Start, no Duration) or Duration 0 automatically makes a milestone – a diamond placed exactly on that date.',
      'Items with children: End, Duration and Type are ignored – their dates follow from the children.',
      'Separate people with commas. Unknown names are added as new people.',
      'Type: Task (default), Milestone or Deadline.',
      'Predecessors: number of the predecessor, e.g. “1.2”. Optionally with a type (FS, SS, FF, SF) and lag in working days: “1.2 SS+2”. Separate several with “;”. “~1.2” = soft link (does not move).',
      'Columns to the right of “Predecessors” (e.g. the bar chart of an export) are ignored on import.',
    ],
    example: 'Example',
    exampleRows: [
      [
        'No.',
        'Level 1',
        'Level 2',
        'Start',
        'End',
        'Duration (wd)',
        'People',
        'Type',
        'Predecessors',
      ],
      ['', 'Concept', '', '', '', '', '', '', ''],
      ['', '', 'Analysis', '2026-01-05', '2026-01-16', '', 'Anna', '', ''],
      ['', '', 'Workshop', '', '', '3', 'Anna, Ben', '', '1.1'],
      ['', '', 'Sign-off', '', '', '', '', 'Milestone', '1.2'],
      ['', 'Go-live', '', '', '2026-01-30', '', '', '', ''],
    ],
  },
};

const ALL = Object.values(LABELS);
const norm = (s: string) => s.trim().toLowerCase();

/** Header check: does `value` match the header `key` in any language? */
export function isHeader(
  value: string,
  key: 'nr' | 'start' | 'end' | 'duration' | 'people' | 'type' | 'predecessors',
): boolean {
  const v = norm(value);
  if (key === 'duration') return ALL.some((l) => v.startsWith(norm(l.duration).split(' ')[0]));
  return ALL.some((l) => norm(l[key]) === v);
}

/** Item kind from a type cell in any language; null when unknown. */
export function kindFromLabel(value: string): ItemKind | null {
  const v = norm(value);
  if (!v) return 'task';
  for (const l of ALL) {
    for (const [kind, label] of Object.entries(l.kinds)) {
      if (norm(label) === v) return kind as ItemKind;
    }
  }
  if (v === 'frist') return 'deadline';
  return null;
}

/** Link type from a code in any language (EA/AA/EE/AE or FS/SS/FF/SF). */
export function linkFromCode(code: string): LinkType | null {
  const c = code.toUpperCase();
  for (const l of ALL) {
    for (const [type, label] of Object.entries(l.links)) if (label === c) return type as LinkType;
  }
  return null;
}
