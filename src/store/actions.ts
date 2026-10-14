import i18n from '../i18n';
import { WorkCalendar } from '../domain/calendar';
import { toDay, toISO } from '../domain/dates';
import { validateLink, type LinkError } from '../domain/dependencies';
import { buildDependency, buildItem, buildPerson, initialsOf } from '../domain/factory';
import { resizeByDays, shiftByDays } from '../domain/scheduling';
import {
  buildTree,
  childrenOf,
  depthOf,
  descendantIds,
  hasChildren,
  isAncestor,
  levelName,
  orderKeyAt,
} from '../domain/tree';
import type {
  CalendarSettings,
  Dependency,
  Item,
  ItemKind,
  Person,
  ProjectDoc,
  ScheduleMode,
  Side,
} from '../domain/types';
import {
  applyDoc,
  commit,
  commitSilently,
  setPreview,
  setUi,
  showToast,
  useStore,
} from './projectStore';

const get = useStore.getState;
const now = () => new Date().toISOString();
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts) as string;

function currentDoc(): ProjectDoc | null {
  return get().doc;
}

export function levelLabel(doc: ProjectDoc, depth: number): string {
  return levelName(doc.project.levelNames, depth, (n) => t('settings.levelFallback', { n }));
}

// ---------------------------------------------------------------- selection

export function select(id: string | null) {
  setUi((ui) => ({
    selectedId: id,
    selectedDepId: null,
    editingId: ui.editingId === id ? ui.editingId : null,
  }));
}

export function selectDependency(id: string | null) {
  setUi({ selectedDepId: id });
}

export function startEditing(id: string | null) {
  setUi(id ? { editingId: id, selectedId: id } : { editingId: null });
}

// ---------------------------------------------------------------- items

export interface AddItemOptions {
  /** Create as last child of `relativeTo` instead of a sibling after it. */
  asChild?: boolean;
  relativeTo?: string | null;
  kind?: ItemKind;
  edit?: boolean;
}

export function addItem(opts: AddItemOptions = {}): string | null {
  const doc = currentDoc();
  if (!doc) return null;
  const rel = opts.relativeTo ? doc.items[opts.relativeTo] : undefined;
  const parentId = rel ? (opts.asChild ? rel.id : rel.parentId) : null;
  const tree = buildTree(doc.items);
  const siblings = childrenOf(tree, parentId);
  const afterId = rel && !opts.asChild ? rel.id : (siblings[siblings.length - 1]?.id ?? null);
  const depth = parentId ? depthOf(doc.items, parentId) + 1 : 0;
  const name = t('grid.newName', { level: levelLabel(doc, depth), n: siblings.length + 1 });
  const item = buildItem(doc, { parentId, afterId, name, kind: opts.kind });
  commit((d) => {
    d.items[item.id] = item;
    if (parentId && d.items[parentId]) d.items[parentId].collapsed = false;
  });
  setUi({
    selectedId: item.id,
    selectedDepId: null,
    editingId: opts.edit === false ? null : item.id,
  });
  return item.id;
}

export function renameItem(id: string, name: string) {
  const trimmed = name.trim();
  commit((d) => {
    if (d.items[id] && trimmed && d.items[id].name !== trimmed) {
      d.items[id].name = trimmed;
      d.items[id].updatedAt = now();
    }
  });
}

export function updateItem(
  id: string,
  patch: Partial<Pick<Item, 'name' | 'notes' | 'color' | 'status' | 'progress'>>,
) {
  commit((d) => {
    const item = d.items[id];
    if (!item) return;
    Object.assign(item, patch);
    if (patch.status === 'done') item.progress = 100;
    if (patch.progress === 100 && !patch.status) item.status = 'done';
    item.updatedAt = now();
  });
}

/**
 * Date edits from the grid or details panel. Changing the start moves the item (duration kept),
 * changing the end changes the duration. Clearing the start turns a task into a milestone.
 */
export function setItemDate(id: string, side: Side, value: string) {
  const doc = currentDoc();
  const item = doc?.items[id];
  if (!doc || !item) return;
  const tree = buildTree(doc.items);
  const isParent = hasChildren(tree, id);

  if (side === 'start' && !value) {
    if (!isParent && item.kind === 'task') setItemKind(id, 'milestone');
    return;
  }
  if (!value) return;
  const day = toDay(value);

  // Giving a milestone a start date turns it into a task ending on the milestone date.
  if (!isParent && item.kind === 'milestone' && side === 'start') {
    const end = Math.max(day, toDay(item.end));
    commit(
      (d) => {
        const it = d.items[id];
        it.kind = 'task';
        it.start = toISO(day);
        it.end = toISO(end);
        it.updatedAt = now();
      },
      [id],
    );
    return;
  }

  if (isParent || item.kind !== 'task') {
    const anchor = toDay(side === 'start' ? item.start : item.end);
    applyDoc(shiftByDays(doc, id, day - anchor, now()), [id]);
    return;
  }
  if (side === 'start') {
    applyDoc(shiftByDays(doc, id, day - toDay(item.start), now()), [id]);
  } else {
    applyDoc(resizeByDays(doc, id, 'end', day - toDay(item.end), now()), [id]);
  }
}

export function setDuration(id: string, workdays: number) {
  const doc = currentDoc();
  const item = doc?.items[id];
  if (!doc || !item || !Number.isFinite(workdays)) return;
  if (workdays <= 0) {
    if (item.kind === 'task') setItemKind(id, 'milestone');
    return;
  }
  const cal = new WorkCalendar(doc.project.calendar);
  const start = cal.snapForward(toDay(item.start));
  const end = cal.addWorkdays(start, Math.round(workdays) - 1);
  commit(
    (d) => {
      const it = d.items[id];
      if (item.kind !== 'task') it.kind = 'task';
      it.start = toISO(start);
      it.end = toISO(end);
      it.updatedAt = now();
    },
    [id],
  );
}

export function setItemKind(id: string, kind: ItemKind) {
  const doc = currentDoc();
  const item = doc?.items[id];
  if (!doc || !item || item.kind === kind) return;
  commit(
    (d) => {
      const it = d.items[id];
      it.kind = kind;
      // A point keeps the end date; a new task starts as one working day on that date.
      if (kind !== 'task') it.start = it.end;
      else {
        const cal = new WorkCalendar(doc.project.calendar);
        const day = toISO(cal.snapForward(toDay(it.end)));
        it.start = day;
        it.end = day;
      }
      it.updatedAt = now();
    },
    [id],
  );
}

export function deleteItem(id: string, confirmChildren = true): boolean {
  const doc = currentDoc();
  const item = doc?.items[id];
  if (!doc || !item) return false;
  const descendants = descendantIds(buildTree(doc.items), id);
  if (
    confirmChildren &&
    descendants.length &&
    !window.confirm(t('details.deleteConfirm', { name: item.name, count: descendants.length }))
  ) {
    return false;
  }
  const doomed = new Set([id, ...descendants]);
  const rows = visibleOrder(doc);
  const idx = rows.indexOf(id);
  const nextSelection =
    rows.slice(idx + 1).find((r) => !doomed.has(r)) ??
    rows
      .slice(0, idx)
      .reverse()
      .find((r) => !doomed.has(r)) ??
    null;
  commit((d) => {
    for (const x of doomed) delete d.items[x];
    for (const dep of Object.values(d.dependencies)) {
      if (doomed.has(dep.fromId) || doomed.has(dep.toId)) delete d.dependencies[dep.id];
    }
  });
  setUi({ selectedId: nextSelection, editingId: null, selectedDepId: null });
  return true;
}

function visibleOrder(doc: ProjectDoc): string[] {
  const tree = buildTree(doc.items);
  const out: string[] = [];
  const walk = (parentId: string | null) => {
    for (const c of childrenOf(tree, parentId)) {
      out.push(c.id);
      if (!c.collapsed) walk(c.id);
    }
  };
  walk(null);
  return out;
}

/** Moves an item to a new parent and position. Returns false when the move is invalid. */
export function moveItem(id: string, parentId: string | null, index: number): boolean {
  const doc = currentDoc();
  if (!doc?.items[id]) return false;
  if (parentId === id || (parentId && isAncestor(doc.items, id, parentId))) return false;
  const tree = buildTree(doc.items);
  const item = doc.items[id];
  if (item.parentId === parentId) {
    const current = childrenOf(tree, parentId).findIndex((s) => s.id === id);
    if (current === index) return false;
  }
  const order = orderKeyAt(tree, parentId, index, id);
  // A link between an item and its (new) ancestor is not allowed.
  const blocked = Object.values(doc.dependencies).some((dep) => {
    const other = dep.fromId === id ? dep.toId : dep.toId === id ? dep.fromId : null;
    if (!other) return false;
    let p = parentId;
    while (p) {
      if (p === other) return true;
      p = doc.items[p]?.parentId ?? null;
    }
    return false;
  });
  if (blocked) {
    showToast(t('link.error.cycle'), 'error');
    return false;
  }
  commit((d) => {
    d.items[id].parentId = parentId;
    d.items[id].order = order;
    d.items[id].updatedAt = now();
    if (parentId && d.items[parentId]) d.items[parentId].collapsed = false;
  });
  return true;
}

export function indent(id: string) {
  const doc = currentDoc();
  const item = doc?.items[id];
  if (!doc || !item) return;
  const siblings = childrenOf(buildTree(doc.items), item.parentId);
  const idx = siblings.findIndex((s) => s.id === id);
  if (idx <= 0) return;
  const newParent = siblings[idx - 1];
  moveItem(id, newParent.id, childrenOf(buildTree(doc.items), newParent.id).length);
}

export function outdent(id: string) {
  const doc = currentDoc();
  const item = doc?.items[id];
  if (!doc || !item?.parentId) return;
  const parent = doc.items[item.parentId];
  const siblings = childrenOf(buildTree(doc.items), parent.parentId);
  moveItem(id, parent.parentId, siblings.findIndex((s) => s.id === parent.id) + 1);
}

export function moveVertical(id: string, direction: -1 | 1) {
  const doc = currentDoc();
  const item = doc?.items[id];
  if (!doc || !item) return;
  const siblings = childrenOf(buildTree(doc.items), item.parentId);
  const idx = siblings.findIndex((s) => s.id === id);
  const target = idx + direction;
  if (target < 0 || target >= siblings.length) return;
  // Index is computed without the item itself.
  moveItem(id, item.parentId, target);
}

export function setCollapsed(id: string, collapsed: boolean) {
  commitSilently((d) => {
    if (d.items[id]) d.items[id].collapsed = collapsed;
  });
}

export function setAllCollapsed(collapsed: boolean) {
  const doc = currentDoc();
  if (!doc) return;
  const tree = buildTree(doc.items);
  const parents = Object.keys(doc.items).filter((id) => hasChildren(tree, id));
  commitSilently((d) => {
    for (const id of parents) if (d.items[id]) d.items[id].collapsed = collapsed;
  });
}

// ---------------------------------------------------------------- dragging in the timeline

export type DragKind = 'move' | 'resize-start' | 'resize-end';

function dragged(doc: ProjectDoc, kind: DragKind, id: string, deltaDays: number): ProjectDoc {
  if (kind === 'move') return shiftByDays(doc, id, deltaDays, now());
  return resizeByDays(doc, id, kind === 'resize-start' ? 'start' : 'end', deltaDays, now());
}

export function previewDrag(kind: DragKind, id: string, deltaDays: number) {
  const doc = currentDoc();
  if (!doc) return;
  setPreview(deltaDays ? dragged(doc, kind, id, deltaDays) : null, [id]);
}

export function finishDrag(kind: DragKind, id: string, deltaDays: number) {
  const doc = currentDoc();
  if (!doc) return;
  if (!deltaDays) {
    setPreview(null);
    return;
  }
  applyDoc(dragged(doc, kind, id, deltaDays), [id]);
}

export function cancelDrag() {
  setPreview(null);
}

// ---------------------------------------------------------------- dependencies

export function linkErrorMessage(error: LinkError): string {
  return t(`link.error.${error}`);
}

export function addDependency(fromId: string, fromSide: Side, toId: string, toSide: Side): boolean {
  const doc = currentDoc();
  if (!doc) return false;
  const dep = buildDependency(fromId, fromSide, toId, toSide, true);
  const error = validateLink(doc, dep);
  if (error) {
    showToast(linkErrorMessage(error), 'error');
    return false;
  }
  commit((d) => {
    d.dependencies[dep.id] = dep;
  });
  setUi({ selectedDepId: dep.id });
  return true;
}

export function updateDependency(
  id: string,
  patch: Partial<Pick<Dependency, 'hard' | 'lag' | 'fromSide' | 'toSide'>>,
): boolean {
  const doc = currentDoc();
  const dep = doc?.dependencies[id];
  if (!doc || !dep) return false;
  const next = { ...dep, ...patch };
  const error = validateLink(doc, next);
  if (error) {
    showToast(linkErrorMessage(error), 'error');
    return false;
  }
  commit((d) => {
    d.dependencies[id] = { ...next, updatedAt: now() };
  });
  return true;
}

export function toggleDependencyHard(id: string) {
  const dep = currentDoc()?.dependencies[id];
  if (dep) updateDependency(id, { hard: !dep.hard });
}

export function deleteDependency(id: string) {
  commit((d) => {
    delete d.dependencies[id];
  });
  if (get().ui.selectedDepId === id) setUi({ selectedDepId: null });
}

// ---------------------------------------------------------------- people

export function addPerson(name: string, email?: string): string | null {
  const doc = currentDoc();
  if (!doc || !name.trim()) return null;
  const person = buildPerson(
    name.trim(),
    Object.keys(doc.people).length,
    email?.trim() || undefined,
  );
  commit((d) => {
    d.people[person.id] = person;
  });
  return person.id;
}

export function updatePerson(
  id: string,
  patch: Partial<Pick<Person, 'name' | 'email' | 'color' | 'initials'>>,
) {
  commit((d) => {
    const p = d.people[id];
    if (!p) return;
    const renamed = patch.name !== undefined && patch.name !== p.name;
    Object.assign(p, patch);
    if (renamed && patch.initials === undefined) p.initials = initialsOf(p.name);
    p.updatedAt = now();
  });
}

export function removePerson(id: string) {
  commit((d) => {
    delete d.people[id];
    for (const item of Object.values(d.items)) {
      if (item.assigneeIds.includes(id))
        item.assigneeIds = item.assigneeIds.filter((a) => a !== id);
    }
  });
  const view = get().ui.view;
  if (view.mode === 'person' && view.personId === id) setUi({ view: { mode: 'plan' } });
}

export function assignPerson(itemId: string, personId: string) {
  commit((d) => {
    const item = d.items[itemId];
    if (!item || !d.people[personId] || item.assigneeIds.includes(personId)) return;
    item.assigneeIds.push(personId);
    item.updatedAt = now();
  });
}

export function unassignPerson(itemId: string, personId: string) {
  commit((d) => {
    const item = d.items[itemId];
    if (!item) return;
    item.assigneeIds = item.assigneeIds.filter((a) => a !== personId);
    item.updatedAt = now();
  });
}

// ---------------------------------------------------------------- project settings

export function renameProject(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  commit((d) => {
    d.project.name = trimmed;
  });
}

export function setProjectStart(date: string) {
  if (!date) return;
  commit((d) => {
    d.project.startDate = date;
  });
}

export function setLevelNames(names: string[]) {
  commit((d) => {
    d.project.levelNames = names;
  });
}

export function setCalendar(calendar: CalendarSettings) {
  commit((d) => {
    d.project.calendar = calendar;
  });
}

export function setScheduleMode(mode: ScheduleMode) {
  commit((d) => {
    d.project.scheduleMode = mode;
  });
}
