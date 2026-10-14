import { computeBounds, type Bound } from './scheduling';
import { buildTree, leafIds, type Tree } from './tree';
import type { ProjectDoc, Side } from './types';

export interface CriticalPath {
  /** Leaf and parent items on the critical path. */
  items: Set<string>;
  /** Hard links that are tight and connect critical items. */
  deps: Set<string>;
  /** Total float per leaf in working days (negative = behind a deadline). */
  float: Map<string, number>;
}

interface Edge {
  to: string;
  fromSide: Side;
  toSide: Side;
  lag: number;
}

/**
 * Critical path method on the current plan: backward pass over leaves using hard links
 * (links on parents are expanded to their leaves, which move rigidly with the parent).
 * Leaves without successors must finish by the project end; deadlines finish by their date.
 */
export function criticalPath(
  doc: ProjectDoc,
  bounds: Map<string, Bound> = computeBounds(doc),
  tree: Tree = buildTree(doc.items),
): CriticalPath {
  const leaves = Object.keys(doc.items).filter((id) => leafIds(tree, id)[0] === id);
  const isDeadline = (id: string) => doc.items[id].kind === 'deadline';

  const edges = new Map<string, Edge[]>();
  const indegree = new Map<string, number>(leaves.map((l) => [l, 0]));
  const hard = Object.values(doc.dependencies).filter(
    (d) => d.hard && doc.items[d.fromId] && doc.items[d.toId],
  );
  for (const dep of hard) {
    const target = bounds.get(dep.toId)!;
    for (const from of leafIds(tree, dep.fromId)) {
      for (const to of leafIds(tree, dep.toId)) {
        const leaf = bounds.get(to)!;
        const offset = dep.toSide === 'start' ? leaf.s - target.s : -(target.e - leaf.e);
        const list = edges.get(from) ?? [];
        list.push({ to, fromSide: dep.fromSide, toSide: dep.toSide, lag: dep.lag + offset });
        edges.set(from, list);
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }
  }

  // Kahn topological order (links are cycle-free by validation; leftovers appended defensively).
  const order: string[] = [];
  const queue = leaves.filter((l) => indegree.get(l) === 0);
  const seen = new Set<string>();
  while (queue.length) {
    const n = queue.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    order.push(n);
    for (const e of edges.get(n) ?? []) {
      const d = (indegree.get(e.to) ?? 1) - 1;
      indegree.set(e.to, d);
      if (d === 0) queue.push(e.to);
    }
  }
  for (const l of leaves) if (!seen.has(l)) order.push(l);

  const regular = leaves.filter((l) => !isDeadline(l));
  const projectEnd = Math.max(...(regular.length ? regular : leaves).map((l) => bounds.get(l)!.e));

  const lateFinish = new Map<string, number>();
  for (const l of leaves) {
    lateFinish.set(l, isDeadline(l) ? bounds.get(l)!.e : projectEnd);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    const w = bounds.get(n)!.w;
    let lf = lateFinish.get(n)!;
    for (const e of edges.get(n) ?? []) {
      const tLf = lateFinish.get(e.to)!;
      const tLate = e.toSide === 'start' ? tLf - bounds.get(e.to)!.w : tLf;
      const cand = e.fromSide === 'end' ? tLate - e.lag : tLate - e.lag + w;
      lf = Math.min(lf, cand);
    }
    lateFinish.set(n, lf);
  }

  const float = new Map<string, number>();
  const items = new Set<string>();
  for (const l of leaves) {
    const f = lateFinish.get(l)! - bounds.get(l)!.e;
    float.set(l, f);
    if (f <= 0 && !isDeadline(l)) items.add(l);
  }
  for (const l of [...items]) {
    let p = doc.items[l].parentId;
    while (p && doc.items[p] && !items.has(p)) {
      items.add(p);
      p = doc.items[p].parentId;
    }
  }

  const deps = new Set<string>();
  for (const dep of hard) {
    const fromCritical = items.has(dep.fromId);
    const toCritical = items.has(dep.toId) || isDeadline(dep.toId);
    if (!fromCritical || !toCritical) continue;
    const src = bounds.get(dep.fromId)!;
    const tgt = bounds.get(dep.toId)!;
    const req = (dep.fromSide === 'end' ? src.e : src.s) + dep.lag;
    const cur = dep.toSide === 'start' ? tgt.s : tgt.e;
    if (cur - req <= 0) deps.add(dep.id);
  }

  return { items, deps, float };
}
