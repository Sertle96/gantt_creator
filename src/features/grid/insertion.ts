import { buildTree, childrenOf } from '../../domain/tree';
import type { ProjectDoc } from '../../domain/types';
import type { DisplayRow } from '../../store/analysis';

export interface Placement {
  parentId: string | null;
  index: number;
  depth: number;
}

/**
 * Where a new item goes when inserted into the gap above row `gap` (0 = before the first row,
 * `rows.length` = after the last row). Right below an expanded parent it becomes the parent's
 * first child, otherwise it becomes the next sibling of the row above the gap.
 */
export function placementAt(doc: ProjectDoc, rows: DisplayRow[], gap: number): Placement {
  const tree = buildTree(doc.items);
  const prev = gap > 0 ? rows[gap - 1] : undefined;
  const next = rows[gap];
  if (!prev) {
    return {
      parentId: next ? (doc.items[next.id]?.parentId ?? null) : null,
      index: 0,
      depth: next?.depth ?? 0,
    };
  }
  if (next && next.depth > prev.depth)
    return { parentId: prev.id, index: 0, depth: prev.depth + 1 };
  const parentId = doc.items[prev.id]?.parentId ?? null;
  const index = childrenOf(tree, parentId).findIndex((s) => s.id === prev.id) + 1;
  return { parentId, index, depth: prev.depth };
}

/** Appending a new top-level item. */
export function rootPlacement(doc: ProjectDoc): Placement {
  return { parentId: null, index: childrenOf(buildTree(doc.items), null).length, depth: 0 };
}
