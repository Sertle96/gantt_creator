import { WorkCalendar } from './calendar';
import { toDay, toISO } from './dates';
import { buildTree, childrenOf, hasChildren, leafIds, type Tree } from './tree';
import type { Dependency, Item, ProjectDoc } from './types';

/**
 * Item position in working-day index space: `s` = index of the first working day,
 * `e` = index after the last working day (exclusive boundary), `w` = working days.
 * Milestones and deadlines are points (`s === e`, boundary at the end of their day).
 */
export interface Bound {
  s: number;
  e: number;
  w: number;
}

export function leafBound(item: Item, cal: WorkCalendar): Bound {
  if (item.kind === 'task') {
    const sd = toDay(item.start);
    const ed = Math.max(sd, toDay(item.end));
    const s = cal.index(sd);
    const w = Math.max(1, cal.index(ed + 1) - s);
    return { s, e: s + w, w };
  }
  const b = cal.index(toDay(item.end) + 1);
  return { s: b, e: b, w: 0 };
}

export function aggregate(bounds: Bound[]): Bound | null {
  if (!bounds.length) return null;
  let s = Infinity;
  let e = -Infinity;
  for (const b of bounds) {
    s = Math.min(s, b.s);
    e = Math.max(e, b.e);
  }
  return { s, e, w: e - s };
}

/** Bounds of all items (leaves directly, parents aggregated over their children). */
export function computeBounds(
  doc: ProjectDoc,
  cal?: WorkCalendar,
  tree?: Tree,
): Map<string, Bound> {
  const c = cal ?? new WorkCalendar(doc.project.calendar);
  const t = tree ?? buildTree(doc.items);
  const out = new Map<string, Bound>();
  const visit = (item: Item): Bound => {
    const kids = childrenOf(t, item.id);
    const b = kids.length ? aggregate(kids.map(visit))! : leafBound(item, c);
    out.set(item.id, b);
    return b;
  };
  childrenOf(t, null).forEach(visit);
  return out;
}

/** Writes an index-space bound back to a leaf's ISO dates. */
function applyBound(item: Item, b: Bound, cal: WorkCalendar): Pick<Item, 'start' | 'end'> {
  if (item.kind === 'task') {
    return { start: toISO(cal.dayOf(b.s)), end: toISO(cal.dayOf(b.s + b.w - 1)) };
  }
  const day = toISO(cal.dayOf(b.e - 1));
  return { start: day, end: day };
}

export interface ScheduleOptions {
  /** Items the user changed directly; `keepGap` drags their successors along. */
  movedIds?: string[];
  /** Document before the user change (needed together with `movedIds`). */
  prev?: ProjectDoc;
  now?: string;
}

export interface DeadlineViolation {
  depId: string;
  deadlineId: string;
  /** Working days the predecessor overshoots the deadline. */
  overrun: number;
}

/**
 * Resolves hard links (a successor never starts/finishes before its constraint), rolls up
 * parent dates and normalises leaf dates. Deadlines are fixed and never moved by links.
 */
export function schedule(doc: ProjectDoc, opts: ScheduleOptions = {}): ProjectDoc {
  const cal = new WorkCalendar(doc.project.calendar);
  const tree = buildTree(doc.items);
  const now = opts.now ?? new Date().toISOString();

  const leaves = new Map<string, Bound>();
  const original = new Map<string, Bound>();
  for (const item of Object.values(doc.items)) {
    if (hasChildren(tree, item.id)) continue;
    const b = leafBound(item, cal);
    leaves.set(item.id, b);
    original.set(item.id, { ...b });
  }

  const leafCache = new Map<string, string[]>();
  const leavesOf = (id: string) => {
    let l = leafCache.get(id);
    if (!l) leafCache.set(id, (l = leafIds(tree, id)));
    return l;
  };
  const isFixed = (id: string) => doc.items[id]?.kind === 'deadline';
  const boundOf = (id: string, movableOnly: boolean): Bound | null =>
    aggregate(
      leavesOf(id)
        .filter((l) => !movableOnly || !isFixed(l))
        .map((l) => leaves.get(l)!),
    );
  const shift = (id: string, delta: number) => {
    for (const l of leavesOf(id)) {
      if (isFixed(l)) continue;
      const b = leaves.get(l)!;
      b.s += delta;
      b.e += delta;
    }
  };

  const hard = Object.values(doc.dependencies).filter(
    (d) => d.hard && doc.items[d.fromId] && doc.items[d.toId],
  );

  if (doc.project.scheduleMode === 'keepGap' && opts.movedIds?.length && opts.prev) {
    propagateKeepGap(doc, opts.prev, opts.movedIds, hard, tree, cal, shift);
  }

  // Push: shift targets forward until every hard constraint holds.
  for (let iter = 0; iter < 10_000; iter++) {
    let changed = false;
    for (const dep of hard) {
      if (isFixed(dep.toId)) continue;
      const src = boundOf(dep.fromId, false);
      const tgt = boundOf(dep.toId, true);
      if (!src || !tgt) continue;
      const req = (dep.fromSide === 'end' ? src.e : src.s) + dep.lag;
      const cur = dep.toSide === 'start' ? tgt.s : tgt.e;
      if (cur < req) {
        shift(dep.toId, req - cur);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const items: Record<string, Item> = { ...doc.items };
  let dirty = false;
  const set = (id: string, patch: Partial<Item>) => {
    const cur = items[id];
    const keys = Object.keys(patch) as (keyof Item)[];
    if (keys.every((k) => cur[k] === patch[k])) return;
    items[id] = { ...cur, ...patch, updatedAt: now };
    dirty = true;
  };

  for (const [id, b] of leaves) {
    const item = items[id];
    const o = original.get(id)!;
    if (b.s !== o.s || b.e !== o.e) set(id, applyBound(item, b, cal));
    else if (item.kind !== 'task' && item.start !== item.end) set(id, { start: item.end });
    else if (item.kind === 'task' && item.end < item.start) set(id, { end: item.start });
  }

  // Roll-up in post-order so parents see their children's final dates.
  const rollup = (parentId: string | null) => {
    for (const child of childrenOf(tree, parentId)) {
      if (!hasChildren(tree, child.id)) continue;
      rollup(child.id);
      const kids = childrenOf(tree, child.id).map((k) => items[k.id]);
      const start = kids.reduce((m, k) => (k.start < m ? k.start : m), kids[0].start);
      const end = kids.reduce((m, k) => (k.end > m ? k.end : m), kids[0].end);
      set(child.id, { start, end });
    }
  };
  rollup(null);

  return dirty ? { ...doc, items } : doc;
}

function propagateKeepGap(
  doc: ProjectDoc,
  prev: ProjectDoc,
  movedIds: string[],
  hard: Dependency[],
  tree: Tree,
  cal: WorkCalendar,
  shift: (id: string, delta: number) => void,
) {
  const before = computeBounds(prev, cal);
  const after = computeBounds(doc, cal, tree);
  const outgoing = new Map<string, Dependency[]>();
  for (const d of hard) outgoing.set(d.fromId, [...(outgoing.get(d.fromId) ?? []), d]);

  const visited = new Set<string>();
  const queue: Array<{ id: string; ds: number; de: number }> = [];
  const enqueue = (id: string, ds: number, de: number, withDescendants: boolean) => {
    if (visited.has(id)) return;
    visited.add(id);
    queue.push({ id, ds, de });
    if (withDescendants) {
      for (const l of leafIds(tree, id)) if (l !== id) enqueue(l, ds, de, false);
    }
  };
  for (const id of movedIds) {
    const a = before.get(id);
    const b = after.get(id);
    if (!a || !b) continue;
    const ds = b.s - a.s;
    const de = b.e - a.e;
    enqueue(id, ds, de, ds === de);
  }
  while (queue.length) {
    const src = queue.shift()!;
    for (const dep of outgoing.get(src.id) ?? []) {
      const delta = dep.fromSide === 'end' ? src.de : src.ds;
      if (delta === 0 || visited.has(dep.toId) || doc.items[dep.toId].kind === 'deadline') continue;
      shift(dep.toId, delta);
      enqueue(dep.toId, delta, delta, true);
    }
  }
}

/** Hard links whose predecessor overshoots a deadline. */
export function deadlineViolations(
  doc: ProjectDoc,
  bounds: Map<string, Bound> = computeBounds(doc),
): DeadlineViolation[] {
  const out: DeadlineViolation[] = [];
  for (const dep of Object.values(doc.dependencies)) {
    if (!dep.hard || doc.items[dep.toId]?.kind !== 'deadline') continue;
    const src = bounds.get(dep.fromId);
    const tgt = bounds.get(dep.toId);
    if (!src || !tgt) continue;
    const req = (dep.fromSide === 'end' ? src.e : src.s) + dep.lag;
    const cur = dep.toSide === 'start' ? tgt.s : tgt.e;
    if (cur < req) out.push({ depId: dep.id, deadlineId: dep.toId, overrun: req - cur });
  }
  return out;
}

/** Index-space shift of an item (and its subtree) by a calendar-day drag distance. */
export function shiftByDays(
  doc: ProjectDoc,
  id: string,
  deltaDays: number,
  now: string,
): ProjectDoc {
  const item = doc.items[id];
  if (!item || deltaDays === 0) return doc;
  const cal = new WorkCalendar(doc.project.calendar);
  const tree = buildTree(doc.items);
  const leavesList = leafIds(tree, id);
  const isLeaf = leavesList.length === 1 && leavesList[0] === id;

  const items = { ...doc.items };
  if (isLeaf && item.kind === 'deadline') {
    const d = toISO(toDay(item.end) + deltaDays);
    items[id] = { ...item, start: d, end: d, updatedAt: now };
    return { ...doc, items };
  }
  const anchor = isLeaf && item.kind === 'milestone' ? toDay(item.end) + 1 : toDay(item.start);
  const delta = cal.index(anchor + deltaDays) - cal.index(anchor);
  if (delta === 0) return doc;
  for (const l of leavesList) {
    const leaf = items[l];
    const b = leafBound(leaf, cal);
    items[l] = {
      ...leaf,
      ...applyBound(leaf, { s: b.s + delta, e: b.e + delta, w: b.w }, cal),
      updatedAt: now,
    };
  }
  return { ...doc, items };
}

/** Resizes a leaf task by dragging one of its edges. */
export function resizeByDays(
  doc: ProjectDoc,
  id: string,
  side: 'start' | 'end',
  deltaDays: number,
  now: string,
): ProjectDoc {
  const item = doc.items[id];
  if (!item || item.kind !== 'task' || deltaDays === 0) return doc;
  const cal = new WorkCalendar(doc.project.calendar);
  const sd = toDay(item.start);
  const ed = toDay(item.end);
  let start = sd;
  let end = ed;
  if (side === 'end') end = Math.max(sd, cal.snapBackward(ed + deltaDays));
  else start = Math.min(ed, cal.snapForward(sd + deltaDays));
  if (start === sd && end === ed) return doc;
  return {
    ...doc,
    items: {
      ...doc.items,
      [id]: { ...item, start: toISO(start), end: toISO(end), updatedAt: now },
    },
  };
}
