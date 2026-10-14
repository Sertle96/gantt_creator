import { isValidISO, todayISO } from '../domain/dates';
import { BAR_FILLS, LABEL_POSITIONS } from '../domain/styles';
import type {
  BarFill,
  BarStyle,
  Dependency,
  Item,
  LabelPosition,
  Person,
  ProjectDoc,
} from '../domain/types';

export class ImportError extends Error {}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const date = (v: unknown, fallback: string): string => (isValidISO(v) ? v : fallback);
const COLOR = /^#[0-9a-f]{6}$/i;

function parseStyle(v: unknown): BarStyle | undefined {
  if (!isObject(v)) return undefined;
  const style: BarStyle = {};
  if (typeof v.color === 'string' && COLOR.test(v.color)) style.color = v.color;
  if (BAR_FILLS.includes(v.fill as BarFill)) style.fill = v.fill as BarFill;
  if (LABEL_POSITIONS.includes(v.label as LabelPosition)) style.label = v.label as LabelPosition;
  return Object.keys(style).length ? style : undefined;
}

/**
 * Validates and normalises a stored or imported document. Unknown fields are kept so newer
 * versions of the app can round-trip through older ones; IDs are never changed.
 */
export function parseProjectDoc(input: unknown): ProjectDoc {
  if (!isObject(input) || !isObject(input.project)) throw new ImportError('not-a-project');
  if (input.formatVersion !== 1) throw new ImportError('unsupported-version');
  const p = input.project;
  const id = str(p.id);
  if (!id) throw new ImportError('not-a-project');
  const today = todayISO();
  const calendar = isObject(p.calendar) ? p.calendar : {};

  const items: Record<string, Item> = {};
  for (const [key, raw] of Object.entries(isObject(input.items) ? input.items : {})) {
    if (!isObject(raw)) continue;
    const start = date(raw.start, today);
    const kind = raw.kind === 'milestone' || raw.kind === 'deadline' ? raw.kind : 'task';
    // Older files stored a plain `color`; it becomes an individual style.
    const { color: legacyColor, ...rest } = raw;
    const style = parseStyle(raw.style) ?? parseStyle({ color: legacyColor });
    items[key] = {
      ...rest,
      style,
      id: key,
      parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
      order: str(raw.order, 'a0'),
      name: str(raw.name),
      kind,
      start,
      end: date(raw.end, start),
      assigneeIds: Array.isArray(raw.assigneeIds)
        ? raw.assigneeIds.filter((a) => typeof a === 'string')
        : [],
      progress: Math.max(0, Math.min(100, num(raw.progress))),
      status: raw.status === 'active' || raw.status === 'done' ? raw.status : 'open',
      updatedAt: str(raw.updatedAt),
    } as Item;
  }
  // Parents that do not exist turn into roots.
  for (const item of Object.values(items)) {
    if (item.parentId && !items[item.parentId]) item.parentId = null;
  }

  const dependencies: Record<string, Dependency> = {};
  for (const [key, raw] of Object.entries(isObject(input.dependencies) ? input.dependencies : {})) {
    if (!isObject(raw)) continue;
    const fromId = str(raw.fromId);
    const toId = str(raw.toId);
    if (!items[fromId] || !items[toId] || fromId === toId) continue;
    dependencies[key] = {
      ...raw,
      id: key,
      fromId,
      toId,
      fromSide: raw.fromSide === 'start' ? 'start' : 'end',
      toSide: raw.toSide === 'end' ? 'end' : 'start',
      hard: raw.hard !== false,
      lag: Math.round(num(raw.lag)),
      updatedAt: str(raw.updatedAt),
    } as Dependency;
  }

  const people: Record<string, Person> = {};
  for (const [key, raw] of Object.entries(isObject(input.people) ? input.people : {})) {
    if (!isObject(raw)) continue;
    people[key] = {
      ...raw,
      id: key,
      name: str(raw.name),
      initials: str(raw.initials, '?'),
      color: str(raw.color, '#64748b'),
      email: typeof raw.email === 'string' ? raw.email : undefined,
      updatedAt: str(raw.updatedAt),
    } as Person;
  }

  return {
    ...input,
    formatVersion: 1,
    project: {
      ...p,
      id,
      name: str(p.name, 'Projekt'),
      startDate: date(p.startDate, today),
      levelNames: Array.isArray(p.levelNames) ? p.levelNames.map((n) => str(n)) : [],
      levelStyles: Array.isArray(p.levelStyles)
        ? p.levelStyles.map((s) => parseStyle(s) ?? {})
        : [],
      calendar: {
        ...calendar,
        workdays: Array.isArray(calendar.workdays)
          ? calendar.workdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
          : [1, 2, 3, 4, 5],
        holidays: Array.isArray(calendar.holidays) ? calendar.holidays.filter(isValidISO) : [],
      },
      scheduleMode: p.scheduleMode === 'keepGap' ? 'keepGap' : 'push',
      createdAt: str(p.createdAt),
      updatedAt: str(p.updatedAt),
    },
    items,
    dependencies,
    people,
  } as ProjectDoc;
}

/** Stable, pretty JSON with sorted keys so exports diff cleanly. */
export function serializeProjectDoc(doc: ProjectDoc): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (isObject(v)) {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .filter((k) => v[k] !== undefined)
          .map((k) => [k, sort(v[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(doc), null, 2) + '\n';
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'projekt';
}
