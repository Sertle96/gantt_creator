import { ancestors } from './tree';
import type { Dependency, ProjectDoc } from './types';

export type PersonRowRole = 'own' | 'context';

export interface PersonRow {
  id: string;
  role: PersonRowRole;
}

export interface PersonPlan {
  rows: PersonRow[];
  own: Set<string>;
  context: Set<string>;
  /** Links between visible rows. */
  deps: Dependency[];
}

const MAX_HOPS = 3;

/**
 * Items assigned to a person plus the context they depend on or influence:
 * predecessors and successors (also via parents), followed transitively over hard links
 * until another own item, a milestone/deadline or the hop limit is reached.
 */
export function personPlan(doc: ProjectDoc, personId: string): PersonPlan {
  const own = new Set(
    Object.values(doc.items)
      .filter((i) => i.assigneeIds.includes(personId))
      .map((i) => i.id),
  );
  const deps = Object.values(doc.dependencies).filter(
    (d) => doc.items[d.fromId] && doc.items[d.toId],
  );
  const incoming = new Map<string, Dependency[]>();
  const outgoing = new Map<string, Dependency[]>();
  for (const d of deps) {
    incoming.set(d.toId, [...(incoming.get(d.toId) ?? []), d]);
    outgoing.set(d.fromId, [...(outgoing.get(d.fromId) ?? []), d]);
  }

  const context = new Set<string>();
  const isStop = (id: string) => own.has(id) || doc.items[id].kind !== 'task';

  const walk = (direction: 'back' | 'forward') => {
    const index = direction === 'back' ? incoming : outgoing;
    const seen = new Set<string>();
    let frontier = [...own];
    for (let hop = 0; hop < MAX_HOPS && frontier.length; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        // Links on parents affect the item as well.
        const anchors = [id, ...ancestors(doc.items, id).map((a) => a.id)];
        for (const anchor of anchors) {
          for (const dep of index.get(anchor) ?? []) {
            const other = direction === 'back' ? dep.fromId : dep.toId;
            if (own.has(other) || seen.has(other)) continue;
            seen.add(other);
            context.add(other);
            if (dep.hard && !isStop(other)) next.push(other);
          }
        }
      }
      frontier = next;
    }
  };
  walk('back');
  walk('forward');

  const visible = new Set([...own, ...context]);
  const rows: PersonRow[] = [...visible]
    .map((id) => ({ id, role: (own.has(id) ? 'own' : 'context') as PersonRowRole }))
    .sort((a, b) => {
      const ia = doc.items[a.id];
      const ib = doc.items[b.id];
      return ia.start.localeCompare(ib.start) || ia.end.localeCompare(ib.end) || ia.name.localeCompare(ib.name);
    });

  return {
    rows,
    own,
    context,
    deps: deps.filter((d) => visible.has(d.fromId) && visible.has(d.toId)),
  };
}
