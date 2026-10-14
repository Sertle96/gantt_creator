import ExcelJS from 'exceljs';
import { isoWeek, mondayOf, parts, toDay, todayISO, weekday } from '../domain/dates';
import type { ProjectDoc } from '../domain/types';
import type { CellValue, RawRow, RowError } from './importRows';
import { PLAN_SHEET, isHeader, type ExcelLabels } from './labels';
import { planRows, type PlanRow } from './planRows';

const MS_PER_DAY = 86_400_000;
/** Minimum number of level columns, so the template has room to grow. */
export const MIN_LEVELS = 6;
/** Rows prepared with formats and the type dropdown in an empty template. */
const TEMPLATE_ROWS = 500;

const NAVY = 'FF003C73';
const CORAL = 'FFFC4940';
const WHITE = 'FFFFFFFF';
const BORDER = 'FFD5DCE4';
const TOP_LEVEL_FILL = 'FFEEF3F8';
const WEEKEND_FILL = 'FFF1F3F5';

interface Layout {
  levels: number;
  nr: number;
  start: number;
  end: number;
  duration: number;
  people: number;
  type: number;
  predecessors: number;
  gantt: number;
}

function layoutFor(levels: number): Layout {
  const start = 2 + levels;
  return {
    levels,
    nr: 1,
    start,
    end: start + 1,
    duration: start + 2,
    people: start + 3,
    type: start + 4,
    predecessors: start + 5,
    gantt: start + 7,
  };
}

const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});
const thin = { style: 'thin', color: { argb: BORDER } } as const;

function argb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `FF${m[1].toUpperCase()}` : NAVY;
}

const dateOf = (iso: string) => new Date(toDay(iso) * MS_PER_DAY);

// ---------------------------------------------------------------- plan sheet

function addPlanSheet(
  wb: ExcelJS.Workbook,
  labels: ExcelLabels,
  levelNames: string[],
  layout: Layout,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(PLAN_SHEET, {
    views: [{ state: 'frozen', xSplit: 1 + layout.levels, ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const header = ws.getRow(1);
  header.height = 96;
  const head = (col: number, value: string, rotate = false) => {
    const cell = header.getCell(col);
    cell.value = value;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = solid(NAVY);
    cell.border = { right: { style: 'thin', color: { argb: WHITE } } };
    cell.alignment = rotate
      ? { textRotation: 90, vertical: 'bottom', horizontal: 'center' }
      : { vertical: 'bottom', wrapText: true };
  };

  head(layout.nr, labels.nr);
  ws.getColumn(layout.nr).width = 9;
  ws.getColumn(layout.nr).numFmt = '@';
  for (let i = 0; i < layout.levels; i++) {
    const name = levelNames[i]?.trim();
    const last = i === layout.levels - 1;
    head(2 + i, name ? `${labels.level(i + 1)} · ${name}` : labels.level(i + 1), !last);
    // Narrow level columns: a name runs over the empty cells to its right.
    ws.getColumn(2 + i).width = last ? 38 : 4;
  }
  head(layout.start, labels.start);
  head(layout.end, labels.end);
  head(layout.duration, labels.duration);
  head(layout.people, labels.people);
  head(layout.type, labels.type);
  head(layout.predecessors, labels.predecessors);
  ws.getColumn(layout.start).width = 12;
  ws.getColumn(layout.end).width = 12;
  ws.getColumn(layout.start).numFmt = labels.dateFormat;
  ws.getColumn(layout.end).numFmt = labels.dateFormat;
  ws.getColumn(layout.duration).width = 9;
  ws.getColumn(layout.people).width = 22;
  ws.getColumn(layout.type).width = 13;
  ws.getColumn(layout.predecessors).width = 16;
  ws.getColumn(layout.predecessors).numFmt = '@';
  ws.getColumn(layout.predecessors + 1).width = 2;
  return ws;
}

function addTypeDropdown(ws: ExcelJS.Worksheet, layout: Layout, labels: ExcelLabels, rows: number) {
  const list = `"${Object.values(labels.kinds).join(',')}"`;
  for (let r = 2; r <= rows + 1; r++) {
    ws.getCell(r, layout.type).dataValidation = {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      formulae: [list],
    };
  }
}

function writeRow(
  ws: ExcelJS.Worksheet,
  layout: Layout,
  labels: ExcelLabels,
  r: number,
  row: PlanRow,
) {
  const excelRow = ws.getRow(r);
  excelRow.getCell(layout.nr).value = row.wbs;
  const name = excelRow.getCell(2 + row.depth);
  name.value = row.name;
  if (row.isParent) name.font = { bold: true };
  excelRow.getCell(layout.start).value = dateOf(row.start);
  excelRow.getCell(layout.end).value = dateOf(row.end);
  excelRow.getCell(layout.duration).value = row.days;
  excelRow.getCell(layout.people).value = row.people.join(', ');
  excelRow.getCell(layout.type).value = row.isParent ? '' : labels.kinds[row.kind];
  excelRow.getCell(layout.predecessors).value = row.predecessors;
  for (let c = 1; c <= layout.predecessors; c++) {
    const cell = excelRow.getCell(c);
    cell.border = { bottom: thin };
    if (row.depth === 0) cell.fill = solid(TOP_LEVEL_FILL);
  }
}

// ---------------------------------------------------------------- gantt cells

interface Period {
  from: number;
  to: number;
  label: string;
  weekend: boolean;
}

const dd = (n: number) => String(n).padStart(2, '0');

/** Day columns for short projects, weeks up to two years, months beyond. */
export function periodsFor(first: number, last: number, labels: ExcelLabels): Period[] {
  const out: Period[] = [];
  const span = last - first + 1;
  if (span <= 92) {
    for (let d = first; d <= last; d++) {
      const p = parts(d);
      const wd = weekday(d);
      out.push({
        from: d,
        to: d,
        label: `${labels.weekdays[wd]} ${dd(p.date)}.${dd(p.month + 1)}.`,
        weekend: wd === 0 || wd === 6,
      });
    }
  } else if (span <= 735) {
    for (let d = mondayOf(first); d <= last; d += 7) {
      const p = parts(d);
      out.push({
        from: d,
        to: d + 6,
        label: `${labels.week} ${isoWeek(d)} · ${dd(p.date)}.${dd(p.month + 1)}.`,
        weekend: false,
      });
    }
  } else {
    let { year, month } = parts(first);
    for (;;) {
      const from = Math.round(Date.UTC(year, month, 1) / MS_PER_DAY);
      if (from > last) break;
      const to = Math.round(Date.UTC(year, month + 1, 1) / MS_PER_DAY) - 1;
      out.push({
        from,
        to,
        label: `${labels.months[month]} ${String(year).slice(2)}`,
        weekend: false,
      });
      if (++month === 12) {
        month = 0;
        year++;
      }
    }
  }
  return out;
}

function writeGantt(ws: ExcelJS.Worksheet, layout: Layout, labels: ExcelLabels, rows: PlanRow[]) {
  if (!rows.length) return;
  const first = Math.min(...rows.map((r) => toDay(r.start)));
  const last = Math.max(...rows.map((r) => toDay(r.end)));
  const periods = periodsFor(first, last, labels);
  const today = toDay(todayISO());
  const width =
    periods[0].from === periods[0].to ? 3.2 : periods[0].to - periods[0].from === 6 ? 3.6 : 4.6;

  periods.forEach((p, i) => {
    const col = layout.gantt + i;
    ws.getColumn(col).width = width;
    const cell = ws.getCell(1, col);
    cell.value = p.label;
    cell.font = { size: 9, color: { argb: WHITE } };
    cell.fill = solid(p.from <= today && today <= p.to ? CORAL : NAVY);
    cell.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center' };
  });

  rows.forEach((row, r) => {
    const s = toDay(row.start);
    const e = toDay(row.end);
    const color = argb(row.color);
    const point = !row.isParent && row.kind !== 'task';
    periods.forEach((p, i) => {
      const cell = ws.getCell(r + 2, layout.gantt + i);
      const hit = s <= p.to && e >= p.from;
      if (hit && point) {
        cell.value = row.kind === 'milestone' ? '◆' : '▼';
        cell.font = { color: { argb: row.kind === 'deadline' ? CORAL : color }, bold: true };
        cell.alignment = { horizontal: 'center' };
      } else if (hit) {
        cell.fill = solid(color);
      } else if (p.weekend) {
        cell.fill = solid(WEEKEND_FILL);
      }
      cell.border = { bottom: thin };
    });
  });
}

// ---------------------------------------------------------------- guide sheet

function addGuideSheet(wb: ExcelJS.Workbook, labels: ExcelLabels) {
  const ws = wb.addWorksheet(labels.guideSheet);
  const widths = [8, 14, 14, 12, 12, 13, 16, 13, 13];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const lastCol = widths.length;
  const totalWidth = widths.reduce((a, b) => a + b, 0);

  const title = ws.getCell(1, 1);
  title.value = labels.guideTitle;
  title.font = { bold: true, size: 14, color: { argb: NAVY } };
  let r = 3;
  for (const line of labels.guide) {
    ws.mergeCells(r, 1, r, lastCol);
    const cell = ws.getCell(r, 1);
    cell.value = `•  ${line}`;
    cell.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = 15 * Math.ceil((line.length + 3) / (totalWidth * 1.05));
    r++;
  }
  r++;
  ws.getCell(r, 1).value = labels.example;
  ws.getCell(r, 1).font = { bold: true, color: { argb: NAVY } };
  r++;
  labels.exampleRows.forEach((values, i) => {
    values.forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = v;
      cell.border = { bottom: thin };
      if (i === 0) {
        cell.font = { bold: true, color: { argb: WHITE } };
        cell.fill = solid(NAVY);
      } else if (c === 1 && v) {
        cell.font = { bold: true };
      }
    });
    r++;
  });
}

// ---------------------------------------------------------------- public API

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gantt Creator';
  wb.created = new Date();
  return wb;
}

/** Plan in template layout plus a bar chart in cells; re-importable as it is. */
export function buildExportWorkbook(doc: ProjectDoc, labels: ExcelLabels): ExcelJS.Workbook {
  const rows = planRows(doc, labels);
  const depth = rows.reduce((m, r) => Math.max(m, r.depth + 1), 0);
  const layout = layoutFor(Math.max(MIN_LEVELS, depth));
  const wb = newWorkbook();
  const ws = addPlanSheet(wb, labels, doc.project.levelNames, layout);
  rows.forEach((row, i) => writeRow(ws, layout, labels, i + 2, row));
  addTypeDropdown(ws, layout, labels, rows.length + 100);
  writeGantt(ws, layout, labels, rows);
  addGuideSheet(wb, labels);
  return wb;
}

/** Empty plan sheet with formats and dropdowns, plus instructions. */
export function buildTemplateWorkbook(levelNames: string[], labels: ExcelLabels): ExcelJS.Workbook {
  const layout = layoutFor(Math.max(MIN_LEVELS, levelNames.length));
  const wb = newWorkbook();
  const ws = addPlanSheet(wb, labels, levelNames, layout);
  addTypeDropdown(ws, layout, labels, TEMPLATE_ROWS);
  addGuideSheet(wb, labels);
  return wb;
}

function cellValue(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v;
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('formula' in v || 'sharedFormula' in v)
    return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  if ('text' in v) return String(v.text);
  return null;
}

function cellText(v: ExcelJS.CellValue): string {
  const value = cellValue(v);
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export type ReadResult = { ok: true; rows: RawRow[] } | { ok: false; errors: RowError[] };

/** Reads the plan sheet of a workbook in template layout; nothing is guessed. */
export async function readPlanWorkbook(data: ArrayBuffer): Promise<ReadResult> {
  const notTemplate: ReadResult = { ok: false, errors: [{ row: 0, code: 'notTemplate' }] };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return notTemplate;
  }
  const ws = wb.getWorksheet(PLAN_SHEET) ?? wb.worksheets[0];
  if (!ws) return notTemplate;
  const header = ws.getRow(1);
  const at = (col: number) => cellText(header.getCell(col).value);
  if (!isHeader(at(1), 'nr')) return notTemplate;
  let start = 0;
  for (let c = 3; c <= header.cellCount; c++) {
    if (isHeader(at(c), 'start')) {
      start = c;
      break;
    }
  }
  if (!start) return notTemplate;
  const layout = layoutFor(start - 2);
  const expected = ['end', 'duration', 'people', 'type', 'predecessors'] as const;
  if (expected.some((key) => !isHeader(at(layout[key]), key))) return notTemplate;

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (col: number) => cellValue(row.getCell(col).value);
    const txt = (col: number) => cellText(row.getCell(col).value);
    const raw: RawRow = {
      row: r,
      nr: txt(layout.nr),
      levels: Array.from({ length: layout.levels }, (_, i) => txt(2 + i)),
      start: get(layout.start),
      end: get(layout.end),
      duration: get(layout.duration),
      people: txt(layout.people),
      type: txt(layout.type),
      predecessors: txt(layout.predecessors),
    };
    const blank =
      !raw.nr &&
      raw.levels.every((v) => !v) &&
      [raw.start, raw.end, raw.duration].every((v) => v === null || v === '') &&
      !raw.people &&
      !raw.type &&
      !raw.predecessors;
    if (!blank) rows.push(raw);
  }
  return { ok: true, rows };
}
