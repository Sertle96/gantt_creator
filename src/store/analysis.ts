import { useMemo } from 'react';
import { WorkCalendar } from '../domain/calendar';
import { criticalPath, type CriticalPath } from '../domain/criticalPath';
import { personPlan, type PersonPlan } from '../domain/personView';
import { computeBounds, deadlineViolations, type Bound } from '../domain/scheduling';
import { buildTree, flattenTree, type Tree, type TreeRow } from '../domain/tree';
import type { ProjectDoc } from '../domain/types';
import { useStore, type View } from './projectStore';

export interface Analysis {
  tree: Tree;
  cal: WorkCalendar;
  bounds: Map<string, Bound>;
  wbs: Map<string, string>;
  depth: Map<string, number>;
  /** Overrun in working days per deadline id. */
  overruns: Map<string, number>;
  critical: () => CriticalPath;
}

const cache = new WeakMap<ProjectDoc, Analysis>();

/** Derived data per document object; cached because documents are immutable. */
export function analyze(doc: ProjectDoc): Analysis {
  const hit = cache.get(doc);
  if (hit) return hit;
  const tree = buildTree(doc.items);
  const cal = new WorkCalendar(doc.project.calendar);
  const bounds = computeBounds(doc, cal, tree);
  const all = flattenTree(tree, true);
  const overruns = new Map<string, number>();
  for (const v of deadlineViolations(doc, bounds)) {
    overruns.set(v.deadlineId, Math.max(overruns.get(v.deadlineId) ?? 0, v.overrun));
  }
  let cp: CriticalPath | null = null;
  const result: Analysis = {
    tree,
    cal,
    bounds,
    wbs: new Map(all.map((r) => [r.id, r.wbs])),
    depth: new Map(all.map((r) => [r.id, r.depth])),
    overruns,
    critical: () => (cp ??= criticalPath(doc, bounds, tree)),
  };
  cache.set(doc, result);
  return result;
}

export interface DisplayRow extends TreeRow {
  role?: 'own' | 'context';
}

export interface DisplayModel {
  doc: ProjectDoc;
  analysis: Analysis;
  rows: DisplayRow[];
  rowIndex: Map<string, number>;
  person: PersonPlan | null;
}

const planCache = new WeakMap<ProjectDoc, Map<string, PersonPlan>>();

function cachedPersonPlan(doc: ProjectDoc, personId: string): PersonPlan {
  let byPerson = planCache.get(doc);
  if (!byPerson) planCache.set(doc, (byPerson = new Map()));
  let plan = byPerson.get(personId);
  if (!plan) byPerson.set(personId, (plan = personPlan(doc, personId)));
  return plan;
}

export function buildDisplay(doc: ProjectDoc, view: View): DisplayModel {
  const analysis = analyze(doc);
  let rows: DisplayRow[];
  let person: PersonPlan | null = null;
  if (view.mode === 'person') {
    person = cachedPersonPlan(doc, view.personId);
    rows = person.rows.map((r) => ({
      id: r.id,
      depth: 0,
      wbs: analysis.wbs.get(r.id) ?? '',
      hasChildren: (analysis.tree.children.get(r.id)?.length ?? 0) > 0,
      role: r.role,
    }));
  } else {
    rows = flattenTree(analysis.tree);
  }
  return { doc, analysis, rows, rowIndex: new Map(rows.map((r, i) => [r.id, i])), person };
}

/** Document to render (drag preview wins) plus derived rows for the current view. */
export function useDisplay(): DisplayModel | null {
  const doc = useStore((s) => s.preview ?? s.doc);
  const view = useStore((s) => s.ui.view);
  return useMemo(() => (doc ? buildDisplay(doc, view) : null), [doc, view]);
}
