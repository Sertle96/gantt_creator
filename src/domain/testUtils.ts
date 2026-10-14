import { createProject } from './factory';
import type { Dependency, Item, ProjectDoc, Side } from './types';

let counter = 0;

export function item(id: string, start: string, end: string, extra: Partial<Item> = {}): Item {
  counter++;
  return {
    id,
    parentId: null,
    order: `a0${String(counter).padStart(4, '0')}x`,
    name: id,
    kind: 'task',
    start,
    end,
    assigneeIds: [],
    progress: 0,
    status: 'open',
    updatedAt: '',
    ...extra,
  };
}

export function link(
  id: string,
  fromId: string,
  toId: string,
  extra: Partial<Dependency> & { type?: `${'F' | 'S'}${'S' | 'F'}` } = {},
): Dependency {
  const { type = 'FS', ...rest } = extra;
  const fromSide: Side = type[0] === 'F' ? 'end' : 'start';
  const toSide: Side = type[1] === 'S' ? 'start' : 'end';
  return { id, fromId, toId, fromSide, toSide, hard: true, lag: 0, updatedAt: '', ...rest };
}

export function makeDoc(items: Item[], deps: Dependency[] = []): ProjectDoc {
  const doc = createProject('Test', ['Phase', 'Task'], '2026-01-05');
  return {
    ...doc,
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    dependencies: Object.fromEntries(deps.map((d) => [d.id, d])),
  };
}
