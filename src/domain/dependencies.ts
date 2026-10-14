import { buildTree, descendantIds, type Tree } from './tree';
import type { Dependency, ProjectDoc } from './types';

export type LinkError = 'self' | 'duplicate' | 'cycle' | 'missing';

/**
 * Influence graph: an edge X → Y means "moving X can move Y".
 * - a hard link P → S influences S and every descendant of S (they move with S)
 * - a child influences its parent (roll-up of dates)
 * A cycle in this graph means scheduling could never settle.
 */
function influenceGraph(tree: Tree, deps: Dependency[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const edge = (a: string, b: string) => {
    let set = graph.get(a);
    if (!set) graph.set(a, (set = new Set()));
    set.add(b);
  };
  for (const item of Object.values(tree.items)) {
    if (item.parentId && tree.items[item.parentId]) edge(item.id, item.parentId);
  }
  for (const dep of deps) {
    if (!dep.hard) continue;
    edge(dep.fromId, dep.toId);
    for (const d of descendantIds(tree, dep.toId)) edge(dep.fromId, d);
  }
  return graph;
}

function hasCycle(graph: Map<string, Set<string>>): boolean {
  const state = new Map<string, 1 | 2>();
  for (const start of graph.keys()) {
    if (state.has(start)) continue;
    const stack: Array<[string, Iterator<string>]> = [
      [start, (graph.get(start) ?? new Set()).values()],
    ];
    state.set(start, 1);
    while (stack.length) {
      const [node, it] = stack[stack.length - 1];
      const next = it.next();
      if (next.done) {
        state.set(node, 2);
        stack.pop();
        continue;
      }
      const s = state.get(next.value);
      if (s === 1) return true;
      if (s === undefined) {
        state.set(next.value, 1);
        stack.push([next.value, (graph.get(next.value) ?? new Set()).values()]);
      }
    }
  }
  return false;
}

/** Checks whether `candidate` (new or changed link) can be applied to the document. */
export function validateLink(
  doc: ProjectDoc,
  candidate: Pick<Dependency, 'fromId' | 'toId' | 'fromSide' | 'toSide' | 'hard'> & { id?: string },
): LinkError | null {
  if (!doc.items[candidate.fromId] || !doc.items[candidate.toId]) return 'missing';
  if (candidate.fromId === candidate.toId) return 'self';
  const others = Object.values(doc.dependencies).filter((d) => d.id !== candidate.id);
  const duplicate = others.some(
    (d) =>
      (d.fromId === candidate.fromId && d.toId === candidate.toId) ||
      (d.fromId === candidate.toId && d.toId === candidate.fromId),
  );
  if (duplicate) return 'duplicate';
  if (!candidate.hard) return null;
  const tree = buildTree(doc.items);
  const probe: Dependency = { lag: 0, updatedAt: '', id: '__probe__', ...candidate };
  return hasCycle(influenceGraph(tree, [...others, probe])) ? 'cycle' : null;
}

export function linksOf(doc: ProjectDoc, itemId: string) {
  const deps = Object.values(doc.dependencies);
  return {
    incoming: deps.filter((d) => d.toId === itemId),
    outgoing: deps.filter((d) => d.fromId === itemId),
  };
}
