import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildPerson, buildSample, createProject } from '../domain/factory';
import { buildTree, flattenTree } from '../domain/tree';
import { linkType, type ProjectDoc } from '../domain/types';
import { materialize, parsePlan } from './importRows';
import { LABELS } from './labels';
import {
  buildExportWorkbook,
  buildTemplateWorkbook,
  periodsFor,
  readPlanWorkbook,
} from './workbook';

function sample(): ProjectDoc {
  const doc = buildSample(
    {
      projectName: 'Sample',
      levels: ['Phase', 'Workstream', 'Task'],
      people: ['Anna Berger', 'Ben Kraus'],
      outline: [
        {
          key: 'p1',
          name: 'Konzept',
          children: [
            { key: 'a', name: 'Analyse', days: 5, assignees: [0] },
            { key: 'b', name: 'Workshop', days: 3, assignees: [0, 1] },
            { key: 'm', name: 'Freigabe', days: 0 },
          ],
        },
        {
          key: 'p2',
          name: 'Umsetzung',
          children: [
            {
              key: 'w',
              name: 'Frontend',
              children: [{ key: 'c', name: 'Seiten', days: 10, assignees: [1] }],
            },
            { key: 'd', name: 'Abgabe', days: -1, offset: 60 },
          ],
        },
      ],
    },
    [
      ['a', 'b', true],
      ['b', 'm', true],
      ['m', 'c', false],
    ],
  );
  return doc;
}

async function roundTrip(wb: ExcelJS.Workbook) {
  const buffer = await wb.xlsx.writeBuffer();
  return readPlanWorkbook(buffer as ArrayBuffer);
}

/** Comparable view of a project: outline with dates, people and links by number. */
function snapshot(doc: ProjectDoc) {
  const rows = flattenTree(buildTree(doc.items), true);
  const wbs = new Map(rows.map((r) => [r.id, r.wbs]));
  return {
    items: rows.map((r) => {
      const i = doc.items[r.id];
      const people = i.assigneeIds.map((id) => doc.people[id].name).sort();
      return `${r.wbs} ${i.name} ${i.kind} ${i.start}..${i.end} [${people.join(',')}]`;
    }),
    links: Object.values(doc.dependencies)
      .map((d) => `${wbs.get(d.fromId)}→${wbs.get(d.toId)} ${linkType(d)} ${d.lag} ${d.hard}`)
      .sort(),
  };
}

describe('Excel export / import', () => {
  it('re-imports an exported project unchanged', async () => {
    const doc = sample();
    const read = await roundTrip(buildExportWorkbook(doc, LABELS.de));
    if (!read.ok) throw new Error(JSON.stringify(read.errors));
    const parsed = parsePlan(read.rows);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const back = materialize(parsed.plan, createProject('Back', [], doc.project.startDate)).doc;
    expect(snapshot(back)).toEqual(snapshot(doc));
  });

  it('reads English exports as well', async () => {
    const read = await roundTrip(buildExportWorkbook(sample(), LABELS.en));
    expect(read.ok).toBe(true);
    if (read.ok) expect(parsePlan(read.rows).ok).toBe(true);
  });

  it('writes the plan columns and colours bars in the chart area', async () => {
    const doc = sample();
    const wb = buildExportWorkbook(doc, LABELS.de);
    const ws = wb.getWorksheet('Plan')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1, 15);
    expect(header).toEqual([
      'Nr.',
      'Ebene 1 · Phase',
      'Ebene 2 · Workstream',
      'Ebene 3 · Task',
      'Ebene 4',
      'Ebene 5',
      'Ebene 6',
      'Start',
      'Ende',
      'Dauer (AT)',
      'Personen',
      'Typ',
      'Vorgänger',
      undefined,
    ]);
    expect(ws.getCell('A3').value).toBe('1.1');
    expect(ws.getCell('C3').value).toBe('Analyse');
    expect(ws.getCell('K4').value).toBe('Anna Berger, Ben Kraus');
    expect(ws.getCell('M4').value).toBe('1.1');
    expect(ws.getCell('M8').value).toBe('~1.3');
    // Gantt area starts after one spacer column; "Analyse" is filled in its first period.
    const fill = ws.getCell(3, 15).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBeTruthy();
    // Milestone "Freigabe" (row 5) is a diamond in exactly one period column.
    const marks = (ws.getRow(5).values as unknown[]).filter((v) => v === '◆');
    expect(marks).toHaveLength(1);
    expect(wb.getWorksheet('Anleitung')).toBeTruthy();
  });

  it('reads an empty template as an empty plan', async () => {
    const read = await roundTrip(buildTemplateWorkbook(['Phase', 'Task'], LABELS.de));
    expect(read).toEqual({ ok: true, rows: [] });
    if (read.ok)
      expect(parsePlan(read.rows)).toEqual({ ok: false, errors: [{ row: 0, code: 'empty' }] });
  });

  it('reads a filled template', async () => {
    const wb = buildTemplateWorkbook([], LABELS.de);
    const ws = wb.getWorksheet('Plan')!;
    ws.getCell('B2').value = 'Phase A';
    ws.getCell('C3').value = 'Aufgabe 1';
    ws.getCell('H3').value = new Date(Date.UTC(2026, 0, 5));
    ws.getCell('J3').value = 3;
    ws.getCell('K3').value = 'Anna';
    ws.getCell('C4').value = 'Abnahme';
    ws.getCell('L4').value = 'Meilenstein';
    ws.getCell('M4').value = '1.1';
    const read = await roundTrip(wb);
    if (!read.ok) throw new Error('read failed');
    const parsed = parsePlan(read.rows);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const doc = materialize(parsed.plan, createProject('T', [], '2026-01-05')).doc;
    expect(snapshot(doc).items).toEqual([
      '1 Phase A task 2026-01-05..2026-01-07 []',
      '1.1 Aufgabe 1 task 2026-01-05..2026-01-07 [Anna]',
      '1.2 Abnahme milestone 2026-01-07..2026-01-07 []',
    ]);
  });

  it('rejects files that do not follow the template', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plan');
    ws.addRow(['Name', 'Start', 'Ende']);
    ws.addRow(['A', '2026-01-05', '2026-01-09']);
    expect(await roundTrip(wb)).toEqual({ ok: false, errors: [{ row: 0, code: 'notTemplate' }] });
    expect(await readPlanWorkbook(new ArrayBuffer(8))).toEqual({
      ok: false,
      errors: [{ row: 0, code: 'notTemplate' }],
    });
  });

  it('keeps people who exist only in the project', () => {
    const base = createProject('B', [], '2026-01-05');
    const p = buildPerson('Solo', 0);
    base.people[p.id] = p;
    const parsed = parsePlan([
      {
        row: 2,
        nr: '',
        levels: ['A'],
        start: null,
        end: null,
        duration: null,
        people: '',
        type: '',
        predecessors: '',
      },
    ]);
    if (!parsed.ok) throw new Error('parse failed');
    expect(materialize(parsed.plan, base).doc.people[p.id]).toBeTruthy();
  });
});

describe('periodsFor', () => {
  it('picks days, weeks or months by project length', () => {
    expect(periodsFor(0, 30, LABELS.de)).toHaveLength(31);
    const weeks = periodsFor(0, 200, LABELS.de);
    expect(weeks[0].to - weeks[0].from).toBe(6);
    expect(weeks[0].label).toMatch(/^KW \d+ · /);
    const months = periodsFor(20454, 20454 + 800, LABELS.en);
    expect(months[0].label).toBe('Jan 26');
  });
});
