import { describe, expect, it } from 'vitest';
import { createProject } from '../domain/factory';
import { buildTree, flattenTree } from '../domain/tree';
import { linkType, type ProjectDoc } from '../domain/types';
import { materialize, parseDate, parsePlan, type RawRow } from './importRows';
import { LABELS } from './labels';
import { formatPredecessor, parsePredecessor } from './planRows';

let rowNo = 1;
function raw(levels: string[], extra: Partial<RawRow> = {}): RawRow {
  return {
    row: ++rowNo,
    nr: '',
    levels: [...levels, '', '', '', '', '', ''].slice(0, 6),
    start: null,
    end: null,
    duration: null,
    people: '',
    type: '',
    predecessors: '',
    ...extra,
  };
}

function imported(rows: RawRow[], base?: ProjectDoc): ProjectDoc {
  const result = parsePlan(rows);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return materialize(result.plan, base ?? createProject('Import', ['Phase'], '2026-01-05')).doc;
}

function outline(doc: ProjectDoc): string[] {
  return flattenTree(buildTree(doc.items), true).map((r) => `${r.wbs} ${doc.items[r.id].name}`);
}

const byName = (doc: ProjectDoc, name: string) =>
  Object.values(doc.items).find((i) => i.name === name)!;

function errorCodes(rows: RawRow[]): string[] {
  const result = parsePlan(rows);
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('parseDate', () => {
  it('reads Excel dates, serial numbers and German / ISO text', () => {
    expect(parseDate(new Date(Date.UTC(2026, 9, 14)))).toBe('2026-10-14');
    expect(parseDate(46309)).toBe('2026-10-14');
    expect(parseDate('14.10.2026')).toBe('2026-10-14');
    expect(parseDate('4.1.26')).toBe('2026-01-04');
    expect(parseDate('2026-10-14')).toBe('2026-10-14');
    expect(parseDate('')).toBeNull();
    expect(parseDate('31.02.2026')).toBeUndefined();
    expect(parseDate('morgen')).toBeUndefined();
  });
});

describe('predecessor syntax', () => {
  it('parses link types, lag and soft links', () => {
    expect(parsePredecessor('1.2')).toEqual({ key: '1.2', type: 'FS', lag: 0, hard: true });
    expect(parsePredecessor('1.2 AA')).toEqual({ key: '1.2', type: 'SS', lag: 0, hard: true });
    expect(parsePredecessor('1.3 ee+2')).toEqual({ key: '1.3', type: 'FF', lag: 2, hard: true });
    expect(parsePredecessor('~2.1 SF -1')).toEqual({
      key: '2.1',
      type: 'SF',
      lag: -1,
      hard: false,
    });
    expect(parsePredecessor('4EA')).toEqual({ key: '4', type: 'FS', lag: 0, hard: true });
    expect(parsePredecessor('1.2 XY')).toBeNull();
  });

  it('formats what it parses', () => {
    const text = formatPredecessor('1.2', 'SS', 3, false, LABELS.de);
    expect(text).toBe('~1.2 AA+3');
    expect(parsePredecessor(text)).toEqual({ key: '1.2', type: 'SS', lag: 3, hard: false });
  });
});

describe('parsePlan + materialize', () => {
  it('builds the hierarchy from the level columns', () => {
    const doc = imported([
      raw(['Konzept']),
      raw(['', 'Analyse'], { start: '05.01.2026', end: '09.01.2026' }),
      raw(['', '', 'Interviews'], { start: '05.01.2026', duration: 2 }),
      raw(['', 'Workshop'], { start: '12.01.2026', duration: 3 }),
      raw(['Umsetzung'], { start: '19.01.2026', duration: 5 }),
    ]);
    expect(outline(doc)).toEqual([
      '1 Konzept',
      '1.1 Analyse',
      '1.1.1 Interviews',
      '1.2 Workshop',
      '2 Umsetzung',
    ]);
    expect(byName(doc, 'Interviews').end).toBe('2026-01-06');
    // Durations are working days: Mon 12.01. + 3 wd → Wed 14.01.
    expect(byName(doc, 'Workshop').end).toBe('2026-01-14');
    // Parents roll up from their children.
    expect(byName(doc, 'Konzept').start).toBe('2026-01-05');
    expect(byName(doc, 'Konzept').end).toBe('2026-01-14');
  });

  it('reports skipped levels, missing and duplicate names with row numbers', () => {
    rowNo = 1;
    const result = parsePlan([
      raw(['Phase']),
      raw(['', '', 'Zu tief']),
      raw(['', '', '']),
      raw(['A', 'B']),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { row: 3, code: 'levelJump', params: { level: 3, parent: 2 } },
      { row: 4, code: 'noName', params: undefined },
      { row: 5, code: 'multipleNames', params: undefined },
    ]);
  });

  it('validates dates, durations and types', () => {
    expect(errorCodes([raw(['A'], { start: '32.13.2026' })])).toEqual(['badDate']);
    expect(errorCodes([raw(['A'], { start: '10.01.2026', end: '05.01.2026' })])).toEqual([
      'endBeforeStart',
    ]);
    expect(errorCodes([raw(['A'], { duration: 'lang' })])).toEqual(['badDuration']);
    expect(errorCodes([raw(['A'], { type: 'Irgendwas' })])).toEqual(['badType']);
    expect(errorCodes([])).toEqual(['empty']);
  });

  it('reads milestone and deadline types in both languages', () => {
    const doc = imported([
      raw(['Go-live'], { start: '2026-02-02', type: 'Meilenstein' }),
      raw(['Launch'], { start: '2026-02-03', type: 'milestone' }),
      raw(['Frist'], { end: '2026-02-06', type: 'Deadline' }),
      raw(['Null'], { start: '2026-02-04', duration: 0 }),
    ]);
    expect(byName(doc, 'Go-live').kind).toBe('milestone');
    expect(byName(doc, 'Launch').kind).toBe('milestone');
    expect(byName(doc, 'Frist').kind).toBe('deadline');
    expect(byName(doc, 'Frist').start).toBe('2026-02-06');
    expect(byName(doc, 'Null').kind).toBe('milestone');
  });

  it('turns an end date alone into a milestone on that date', () => {
    const doc = imported([
      raw(['Go-live'], { end: '30.01.2026' }),
      raw(['Explizit'], { end: '30.01.2026', type: 'Aufgabe' }),
      raw(['Rückwärts'], { end: '30.01.2026', duration: 5 }),
    ]);
    const goLive = byName(doc, 'Go-live');
    expect(goLive.kind).toBe('milestone');
    expect([goLive.start, goLive.end]).toEqual(['2026-01-30', '2026-01-30']);
    // An explicit type wins over the rule.
    expect(byName(doc, 'Explizit').kind).toBe('task');
    // End plus duration: the task ends on that date (5 wd back from Fri 30.01. = Mon 26.01.).
    const back = byName(doc, 'Rückwärts');
    expect([back.kind, back.start, back.end]).toEqual(['task', '2026-01-26', '2026-01-30']);
  });

  it('creates links from predecessor references', () => {
    const doc = imported([
      raw(['A'], { start: '2026-01-05', duration: 5 }),
      raw(['B'], { start: '2026-01-05', duration: 2, predecessors: '1' }),
      raw(['C'], { start: '2026-01-05', duration: 2, predecessors: '1 AA+1; ~2' }),
    ]);
    const deps = Object.values(doc.dependencies);
    expect(deps).toHaveLength(3);
    // Hard finish-to-start pushes B behind A.
    expect(byName(doc, 'B').start).toBe('2026-01-12');
    const ss = deps.find((d) => d.toId === byName(doc, 'C').id && d.hard)!;
    expect(linkType(ss)).toBe('SS');
    expect(ss.lag).toBe(1);
    expect(deps.filter((d) => !d.hard)).toHaveLength(1);
  });

  it('uses entered numbers as reference keys', () => {
    const doc = imported([
      raw(['A'], { nr: 'X1', start: '2026-01-05', duration: 5 }),
      raw(['B'], { start: '2026-01-05', duration: 1, predecessors: 'X1' }),
    ]);
    expect(byName(doc, 'B').start).toBe('2026-01-12');
  });

  it('rejects unknown, self, duplicate keys and cyclic links', () => {
    expect(errorCodes([raw(['A'], { predecessors: '9' })])).toEqual(['unknownPredecessor']);
    expect(errorCodes([raw(['A'], { predecessors: '1' })])).toEqual(['selfLink']);
    expect(errorCodes([raw(['A'], { nr: '7' }), raw(['B'], { nr: '7' })])).toEqual([
      'duplicateKey',
    ]);
    expect(
      errorCodes([raw(['A'], { predecessors: '2' }), raw(['B'], { predecessors: '1' })]),
    ).toEqual(['cycle']);
    expect(
      errorCodes([
        raw(['A'], { predecessors: '3' }),
        raw(['B'], { predecessors: '1' }),
        raw(['C'], { predecessors: '2' }),
      ]),
    ).toEqual(['cycle']);
    expect(errorCodes([raw(['A'], { predecessors: '1.x y' })])).toEqual(['badPredecessor']);
  });

  it('matches existing people by name and creates unknown ones', () => {
    const base = createProject('Import', ['Phase'], '2026-01-05');
    const anna = { id: 'p1', name: 'Anna Berger', initials: 'AB', color: '#000', updatedAt: '' };
    base.people[anna.id] = anna;
    const result = parsePlan([raw(['A'], { people: 'anna berger, Ben Neu; Ben Neu' })]);
    if (!result.ok) throw new Error('parse failed');
    const { doc, newPeople } = materialize(result.plan, base);
    expect(newPeople).toBe(1);
    const assignees = byName(doc, 'A').assigneeIds.map((id) => doc.people[id].name);
    expect(assignees).toEqual(['Anna Berger', 'Ben Neu']);
  });
});
