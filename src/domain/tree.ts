import { generateKeyBetween } from 'fractional-indexing';
import type { Item } from './types';

export interface Tree {
  items: Record<string, Item>;
  /** Children sorted by `order`; key `''` holds the roots. */
  children: Map<string, Item[]>;
}

const ROOT = '';

export function compareOrder(a: Item, b: Item): number {
  if (a.order < b.order) return -1;
  if (a.order > b.order) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildTree(items: Record<string, Item>): Tree {
  const children = new Map<string, Item[]>();
  for (const item of Object.values(items)) {
    // Orphans (parent missing) are treated as roots so nothing disappears.
    const key = item.parentId && items[item.parentId] ? item.parentId : ROOT;
    const list = children.get(key);
    if (list) list.push(item);
    else children.set(key, [item]);
  }
  for (const list of children.values()) list.sort(compareOrder);
  return { items, children };
}

export function childrenOf(tree: Tree, id: string | null): Item[] {
  return tree.children.get(id ?? ROOT) ?? [];
}

export function hasChildren(tree: Tree, id: string): boolean {
  return (tree.children.get(id)?.length ?? 0) > 0;
}

export function descendantIds(tree: Tree, id: string): string[] {
  const out: string[] = [];
  const stack = [...childrenOf(tree, id)];
  while (stack.length) {
    const item = stack.pop()!;
    out.push(item.id);
    stack.push(...childrenOf(tree, item.id));
  }
  return out;
}

/** Leaf descendants, or the item itself when it has no children. */
export function leafIds(tree: Tree, id: string): string[] {
  if (!hasChildren(tree, id)) return [id];
  return descendantIds(tree, id).filter((d) => !hasChildren(tree, d));
}

/** Ancestors from the root down to the direct parent. */
export function ancestors(items: Record<string, Item>, id: string): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  let cur = items[id]?.parentId;
  while (cur && items[cur] && !seen.has(cur)) {
    seen.add(cur);
    out.unshift(items[cur]);
    cur = items[cur].parentId;
  }
  return out;
}

export function depthOf(items: Record<string, Item>, id: string): number {
  return ancestors(items, id).length;
}

export function isAncestor(items: Record<string, Item>, ancestorId: string, id: string): boolean {
  return ancestors(items, id).some((a) => a.id === ancestorId);
}

export interface TreeRow {
  id: string;
  depth: number;
  /** Outline number like `1.2.3`. */
  wbs: string;
  hasChildren: boolean;
}

/** Depth-first rows; children of collapsed items are skipped unless `expandAll`. */
export function flattenTree(tree: Tree, expandAll = false): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number, prefix: string) => {
    childrenOf(tree, parentId).forEach((item, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const kids = hasChildren(tree, item.id);
      rows.push({ id: item.id, depth, wbs, hasChildren: kids });
      if (kids && (expandAll || !item.collapsed)) walk(item.id, depth + 1, wbs);
    });
  };
  walk(null, 0, '');
  return rows;
}

export function wbsMap(tree: Tree): Map<string, string> {
  return new Map(flattenTree(tree, true).map((r) => [r.id, r.wbs]));
}

/** Order key for inserting into `parentId` at `index` (among siblings without `excludeId`). */
export function orderKeyAt(
  tree: Tree,
  parentId: string | null,
  index: number,
  excludeId?: string,
): string {
  const siblings = childrenOf(tree, parentId).filter((s) => s.id !== excludeId);
  const i = Math.max(0, Math.min(index, siblings.length));
  const before = i > 0 ? siblings[i - 1].order : null;
  const after = i < siblings.length ? siblings[i].order : null;
  return safeKeyBetween(before, after);
}

function safeKeyBetween(a: string | null, b: string | null): string {
  try {
    return generateKeyBetween(a, b);
  } catch {
    // Equal or invalid neighbours (e.g. imported data) – append after `a`.
    return generateKeyBetween(a ?? b, null);
  }
}

export function levelName(
  levelNames: string[],
  depth: number,
  fallback: (n: number) => string,
): string {
  const name = levelNames[depth]?.trim();
  return name || fallback(depth + 1);
}
