import { WorkCalendar } from '../domain/calendar';
import { isValidISO, toDay, toISO } from '../domain/dates';
import { validateLink } from '../domain/dependencies';
import { buildDependency, buildItem, buildPerson } from '../domain/factory';
import { schedule } from '../domain/scheduling';
import {
  sidesOf,
  type ISODate,
  type ItemKind,
  type LinkType,
  type ProjectDoc,
} from '../domain/types';
import { kindFromLabel } from './labels';
import { parsePredecessor } from './planRows';

export type CellValue = string | number | boolean | Date | null;

/** One data row of the plan sheet, exactly as found in the template columns. */
export interface RawRow {
  /** Excel row number (1-based, header is row 1). */
  row: number;
  nr: string;
  /** Name cells of the level columns, left to right. */
  levels: string[];
  start: CellValue;
  end: CellValue;
  duration: CellValue;
  people: string;
  type: string;
  predecessors: string;
}

export type ImportErrorCode =
  | 'notTemplate'
  | 'empty'
  | 'noName'
  | 'multipleNames'
  | 'levelJump'
  | 'badDate'
  | 'endBeforeStart'
  | 'badDuration'
  | 'badType'
  | 'badPredecessor'
  | 'unknownPredecessor'
  | 'duplicateKey'
  | 'selfLink'
  | 'duplicateLink'
  | 'cycle';

export interface RowError {
  /** Excel row number; 0 for problems with the whole file. */
  row: number;
  code: ImportErrorCode;
  params?: Record<string, string | number>;
}

export interface PlanNode {
  row: number;
  /** 0-based hierarchy level. */
  level: number;
  /** Index of the parent node, null for top-level items. */
  parent: number | null;
  name: string;
  kind: ItemKind;
  start?: ISODate;
  /** Only for leaf tasks. */
  end?: ISODate;
  /** Working days; only for leaf tasks lacking a start or an end (counted back from the end). */
  days?: number;
  people: string[];
}

export interface PlanLink {
  row: number;
  /** Node indexes. */
  from: number;
  to: number;
  type: LinkType;
  lag: number;
  hard: boolean;
  ref: string;
}

/** Validated plan, independent of the project it is imported into. */
export interface ParsedPlan {
  nodes: PlanNode[];
  links: PlanLink[];
}

export type ParseResult = { ok: true; plan: ParsedPlan } | { ok: false; errors: RowError[] };

const MS_PER_DAY = 86_400_000;
/** Excel serial number of 1970-01-01. */
const EXCEL_EPOCH = 25569;

/** ISO date from a cell; null when empty, undefined when not a date. */
export function parseDate(value: CellValue): ISODate | null | undefined {
  if (value === null || value === '') return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? undefined : toISO(Math.floor(t / MS_PER_DAY + 1e-6));
  }
  if (typeof value === 'number') {
    return value > 0 && value < 2958466 ? toISO(Math.floor(value) - EXCEL_EPOCH) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (!s) return null;
  const pad = (n: string) => n.padStart(2, '0');
  let iso: string | null = null;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (de) iso = `${de[3].length === 2 ? `20${de[3]}` : de[3]}-${pad(de[2])}-${pad(de[1])}`;
  const intl = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (intl) iso = `${intl[1]}-${pad(intl[2])}-${pad(intl[3])}`;
  return iso && isValidISO(iso) ? iso : undefined;
}

/** Working days from a cell; null when empty, undefined when invalid. */
function parseDuration(value: CellValue): number | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const m = /^(\d+)\s*[a-zäöü.]*$/i.exec(value.trim());
  return m ? Number(m[1]) : value.trim() ? undefined : null;
}

const text = (v: CellValue): string =>
  v instanceof Date ? (parseDate(v) ?? '') : v === null ? '' : String(v).trim();

export function parsePlan(rows: RawRow[]): ParseResult {
  const errors: RowError[] = [];
  const nodes: PlanNode[] = [];
  const keys = new Map<string, number>();
  const wbs: string[] = [];
  const childCount: number[] = [];
  let rootCount = 0;
  /** stack[level] = index of the last node seen on that level. */
  const stack: number[] = [];
  const pendingLinks: Array<{ node: number; text: string; row: number }> = [];

  for (const raw of rows) {
    const err = (code: ImportErrorCode, params?: RowError['params']) =>
      errors.push({ row: raw.row, code, params });
    const filled = raw.levels.flatMap((v, i) => (v.trim() ? [i] : []));
    if (filled.length === 0) {
      err('noName');
      continue;
    }
    if (filled.length > 1) {
      err('multipleNames');
      continue;
    }
    const level = filled[0];
    if (level > stack.length) {
      err('levelJump', { level: level + 1, parent: level });
      continue;
    }
    const parent = level > 0 ? stack[level - 1] : null;
    const index = nodes.length;
    stack.length = level;
    stack[level] = index;
    childCount[index] = 0;
    wbs[index] = parent === null ? String(++rootCount) : `${wbs[parent]}.${++childCount[parent]}`;

    const key = raw.nr.trim() || wbs[index];
    if (keys.has(key)) err('duplicateKey', { key });
    else keys.set(key, index);

    let kind = kindFromLabel(raw.type);
    if (!kind) {
      err('badType', { value: raw.type });
      kind = 'task';
    }
    const start = parseDate(raw.start);
    if (start === undefined) err('badDate', { field: 'start', value: text(raw.start) });
    const end = parseDate(raw.end);
    if (end === undefined) err('badDate', { field: 'end', value: text(raw.end) });
    const days = parseDuration(raw.duration);
    if (days === undefined) err('badDuration', { value: text(raw.duration) });
    // Without a type: duration 0, or an end date alone, marks a milestone on that date.
    if (!raw.type.trim() && (days === 0 || (!start && end && days === null))) kind = 'milestone';
    if (kind === 'task' && start && end && end < start) err('endBeforeStart');

    nodes.push({
      row: raw.row,
      level,
      parent,
      name: raw.levels[level].trim(),
      kind,
      start: (kind === 'task' ? start : (start ?? end)) || undefined,
      end: (kind === 'task' && end) || undefined,
      days: kind === 'task' && !(start && end) && days ? days : undefined,
      people: [
        ...new Set(
          raw.people
            .split(/[,;\n]/)
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      ],
    });
    if (raw.predecessors.trim())
      pendingLinks.push({ node: index, text: raw.predecessors, row: raw.row });
  }

  // Items with children take their dates from the children.
  for (const node of nodes) {
    if (node.parent === null) continue;
    const p = nodes[node.parent];
    p.kind = 'task';
    p.end = undefined;
    p.days = undefined;
  }

  const links: PlanLink[] = [];
  for (const pending of pendingLinks) {
    for (const token of pending.text.split(/[;,\n]/)) {
      if (!token.trim()) continue;
      const ref = parsePredecessor(token);
      if (!ref) {
        errors.push({ row: pending.row, code: 'badPredecessor', params: { value: token.trim() } });
        continue;
      }
      const from = keys.get(ref.key);
      if (from === undefined) {
        errors.push({ row: pending.row, code: 'unknownPredecessor', params: { ref: ref.key } });
        continue;
      }
      if (from === pending.node) {
        errors.push({ row: pending.row, code: 'selfLink', params: { ref: ref.key } });
        continue;
      }
      links.push({ row: pending.row, from, to: pending.node, ...ref, ref: ref.key });
    }
  }

  if (!errors.length && !nodes.length) errors.push({ row: 0, code: 'empty' });
  if (errors.length) return { ok: false, errors };

  const plan = { nodes, links };
  // Links that would create cycles only show up once the items exist.
  const probe = materialize(plan, blankDoc());
  if (probe.errors.length) return { ok: false, errors: probe.errors };
  return { ok: true, plan };
}

function blankDoc(): ProjectDoc {
  return {
    formatVersion: 1,
    project: {
      id: 'probe',
      name: '',
      startDate: '2026-01-05',
      levelNames: [],
      levelStyles: [],
      calendar: { workdays: [1, 2, 3, 4, 5], holidays: [] },
      scheduleMode: 'push',
      createdAt: '',
      updatedAt: '',
    },
    items: {},
    dependencies: {},
    people: {},
  };
}

export interface Materialized {
  doc: ProjectDoc;
  errors: RowError[];
  /** People that did not exist in `base` yet. */
  newPeople: number;
}

/**
 * Builds the items, links and people of `plan` on top of `base` (its items and links are
 * dropped; project settings and people are kept). People are matched by name.
 */
export function materialize(plan: ParsedPlan, base: ProjectDoc): Materialized {
  const doc: ProjectDoc = { ...base, items: {}, dependencies: {}, people: { ...base.people } };
  const byName = new Map(Object.values(doc.people).map((p) => [p.name.trim().toLowerCase(), p.id]));
  let newPeople = 0;
  const personId = (name: string) => {
    const key = name.toLowerCase();
    let id = byName.get(key);
    if (!id) {
      const person = buildPerson(name, Object.keys(doc.people).length);
      doc.people[person.id] = person;
      byName.set(key, (id = person.id));
      newPeople++;
    }
    return id;
  };

  const cal = new WorkCalendar(doc.project.calendar);
  const ids: string[] = [];
  for (const node of plan.nodes) {
    // End and duration without a start: the task ends on that date.
    const start =
      !node.start && node.end && node.days
        ? toISO(cal.addWorkdays(cal.snapBackward(toDay(node.end)), 1 - node.days))
        : node.start;
    const item = buildItem(doc, {
      parentId: node.parent === null ? null : ids[node.parent],
      name: node.name,
      kind: node.kind,
      start,
      end: node.end,
      days: node.days,
    });
    item.assigneeIds = [...new Set(node.people.map(personId))];
    doc.items[item.id] = item;
    ids.push(item.id);
  }

  const errors: RowError[] = [];
  for (const link of plan.links) {
    const { fromSide, toSide } = sidesOf(link.type);
    const dep = buildDependency(ids[link.from], fromSide, ids[link.to], toSide, link.hard);
    dep.lag = link.lag;
    const problem = validateLink(doc, dep);
    if (problem) {
      // Two items naming each other as predecessor is a cycle from the user's point of view.
      const mutual = Object.values(doc.dependencies).some(
        (d) => d.fromId === dep.toId && d.toId === dep.fromId,
      );
      errors.push({
        row: link.row,
        code: problem === 'cycle' || mutual ? 'cycle' : 'duplicateLink',
        params: { ref: link.ref },
      });
    } else {
      doc.dependencies[dep.id] = dep;
    }
  }
  return { doc: errors.length ? doc : schedule(doc), errors, newPeople };
}
