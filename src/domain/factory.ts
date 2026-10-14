import { WorkCalendar } from './calendar';
import { toDay, toISO, todayISO } from './dates';
import { schedule } from './scheduling';
import { buildTree, orderKeyAt, childrenOf } from './tree';
import type { Dependency, Item, ItemKind, Person, ProjectDoc, ProjectMeta, Side } from './types';

export const newId = (): string => crypto.randomUUID();

export const PERSON_COLORS = [
  '#4f46e5',
  '#0891b2',
  '#059669',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#dc2626',
  '#65a30d',
  '#0d9488',
  '#9333ea',
];

export const ITEM_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#64748b',
];

export const DEFAULT_TASK_DAYS = 5;

export function createProject(
  name: string,
  levelNames: string[],
  startDate: string = todayISO(),
): ProjectDoc {
  const now = new Date().toISOString();
  const project: ProjectMeta = {
    id: newId(),
    name,
    startDate,
    levelNames,
    levelStyles: [],
    calendar: { workdays: [1, 2, 3, 4, 5], holidays: [] },
    scheduleMode: 'push',
    createdAt: now,
    updatedAt: now,
  };
  return { formatVersion: 1, project, items: {}, dependencies: {}, people: {} };
}

export interface NewItemInput {
  parentId: string | null;
  /** Insert after this sibling; appended at the end when omitted. */
  afterId?: string | null;
  name: string;
  kind?: ItemKind;
  start?: string;
  days?: number;
}

/** Builds a new item positioned in the tree with sensible default dates. */
export function buildItem(doc: ProjectDoc, input: NewItemInput): Item {
  const tree = buildTree(doc.items);
  const cal = new WorkCalendar(doc.project.calendar);
  const siblings = childrenOf(tree, input.parentId);
  const afterIndex = input.afterId ? siblings.findIndex((s) => s.id === input.afterId) : -1;
  const index = afterIndex >= 0 ? afterIndex + 1 : siblings.length;
  const after = afterIndex >= 0 ? siblings[afterIndex] : siblings[siblings.length - 1];
  const parent = input.parentId ? doc.items[input.parentId] : undefined;

  let startDay: number;
  if (input.start) startDay = toDay(input.start);
  else if (after) startDay = toDay(after.start);
  else if (parent) startDay = toDay(parent.start);
  else startDay = toDay(doc.project.startDate);
  startDay = cal.snapForward(startDay);

  const kind = input.kind ?? 'task';
  const days = input.days ?? DEFAULT_TASK_DAYS;
  const endDay = kind === 'task' ? cal.addWorkdays(startDay, Math.max(1, days) - 1) : startDay;

  return {
    id: newId(),
    parentId: input.parentId,
    order: orderKeyAt(tree, input.parentId, index),
    name: input.name,
    kind,
    start: toISO(startDay),
    end: toISO(endDay),
    assigneeIds: [],
    progress: 0,
    status: 'open',
    updatedAt: new Date().toISOString(),
  };
}

export function buildDependency(
  fromId: string,
  fromSide: Side,
  toId: string,
  toSide: Side,
  hard = true,
): Dependency {
  return {
    id: newId(),
    fromId,
    toId,
    fromSide,
    toSide,
    hard,
    lag: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function buildPerson(name: string, index: number, email?: string): Person {
  return {
    id: newId(),
    name,
    initials: initialsOf(name),
    color: PERSON_COLORS[index % PERSON_COLORS.length],
    email,
    updatedAt: new Date().toISOString(),
  };
}

export interface SampleTexts {
  projectName: string;
  levels: string[];
  people: string[];
  /** Nested outline: name, working days (0 = milestone, -1 = deadline), children. */
  outline: SampleNode[];
}

export interface SampleNode {
  key: string;
  name: string;
  days?: number;
  /** Calendar days after the project start (before links push it). */
  offset?: number;
  assignees?: number[];
  children?: SampleNode[];
}

/** Sample project; links refer to node keys as `[from, to, hard]` finish-to-start. */
export function buildSample(
  texts: SampleTexts,
  links: Array<[string, string, boolean]>,
): ProjectDoc {
  const cal = new WorkCalendar({ workdays: [1, 2, 3, 4, 5], holidays: [] });
  const start = toISO(cal.snapForward(toDay(todayISO()) - 14));
  let doc = createProject(texts.projectName, texts.levels, start);
  texts.people.forEach((name, i) => {
    const p = buildPerson(name, i);
    doc.people[p.id] = p;
  });
  const personIds = Object.keys(doc.people);
  const ids = new Map<string, string>();

  const add = (node: SampleNode, parentId: string | null) => {
    const kind: ItemKind = node.days === 0 ? 'milestone' : node.days === -1 ? 'deadline' : 'task';
    const item = buildItem(doc, {
      parentId,
      name: node.name,
      kind,
      days: node.days && node.days > 0 ? node.days : undefined,
      start: toISO(toDay(start) + (node.offset ?? 0)),
    });
    item.assigneeIds = (node.assignees ?? []).map((i) => personIds[i]).filter(Boolean);
    doc = { ...doc, items: { ...doc.items, [item.id]: item } };
    ids.set(node.key, item.id);
    node.children?.forEach((c) => add(c, item.id));
  };
  texts.outline.forEach((n) => add(n, null));

  for (const [from, to, hard] of links) {
    const dep = buildDependency(ids.get(from)!, 'end', ids.get(to)!, 'start', hard);
    doc.dependencies[dep.id] = dep;
  }
  return schedule(doc);
}
