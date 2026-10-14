import { WorkCalendar } from '../domain/calendar';
import { computeBounds } from '../domain/scheduling';
import { resolveStyle } from '../domain/styles';
import { buildTree, flattenTree } from '../domain/tree';
import {
  linkType,
  type Dependency,
  type ItemKind,
  type LinkType,
  type ProjectDoc,
} from '../domain/types';
import { linkFromCode, type ExcelLabels } from './labels';

/** One exported row, in outline order. */
export interface PlanRow {
  id: string;
  wbs: string;
  depth: number;
  name: string;
  kind: ItemKind;
  isParent: boolean;
  start: string;
  end: string;
  /** Working days (0 for milestones and deadlines). */
  days: number;
  people: string[];
  predecessors: string;
  color: string;
}

export function planRows(doc: ProjectDoc, labels: ExcelLabels): PlanRow[] {
  const tree = buildTree(doc.items);
  const cal = new WorkCalendar(doc.project.calendar);
  const bounds = computeBounds(doc, cal, tree);
  const flat = flattenTree(tree, true);
  const wbs = new Map(flat.map((r) => [r.id, r.wbs]));
  const incoming = new Map<string, Dependency[]>();
  for (const dep of Object.values(doc.dependencies)) {
    const list = incoming.get(dep.toId);
    if (list) list.push(dep);
    else incoming.set(dep.toId, [dep]);
  }

  return flat.map((r) => {
    const item = doc.items[r.id];
    const b = bounds.get(r.id);
    const deps = (incoming.get(r.id) ?? [])
      .filter((d) => wbs.has(d.fromId))
      .sort((a, b) => compareWbs(wbs.get(a.fromId)!, wbs.get(b.fromId)!));
    return {
      id: r.id,
      wbs: r.wbs,
      depth: r.depth,
      name: item.name,
      kind: item.kind,
      isParent: r.hasChildren,
      start: item.start,
      end: item.end,
      days: item.kind === 'task' || r.hasChildren ? (b?.w ?? 0) : 0,
      people: item.assigneeIds.map((id) => doc.people[id]?.name).filter((n): n is string => !!n),
      predecessors: deps
        .map((d) => formatPredecessor(wbs.get(d.fromId)!, linkType(d), d.lag, d.hard, labels))
        .join('; '),
      color: resolveStyle(doc.project, item, r.depth).color,
    };
  });
}

function compareWbs(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** `1.2`, `1.2 AA`, `1.2+3`, `~1.2 EE-1` (finish-to-start is the default and not written). */
export function formatPredecessor(
  key: string,
  type: LinkType,
  lag: number,
  hard: boolean,
  labels: ExcelLabels,
): string {
  let s = (hard ? '' : '~') + key;
  if (type !== 'FS') s += ` ${labels.links[type]}`;
  if (lag) s += lag > 0 ? `+${lag}` : `${lag}`;
  return s;
}

export interface PredecessorRef {
  key: string;
  type: LinkType;
  lag: number;
  hard: boolean;
}

/** Parses one predecessor token; null when it does not follow the syntax. */
export function parsePredecessor(token: string): PredecessorRef | null {
  let rest = token.trim();
  let hard = true;
  if (rest.startsWith('~')) {
    hard = false;
    rest = rest.slice(1).trim();
  }
  let lag = 0;
  const lagMatch = /([+-])\s*(\d+)\s*$/.exec(rest);
  if (lagMatch) {
    lag = Number(lagMatch[2]) * (lagMatch[1] === '-' ? -1 : 1);
    rest = rest.slice(0, lagMatch.index).trim();
  }
  let type: LinkType = 'FS';
  const codeMatch = /(?:\s+|(?<=\d))([a-z]{2})$/i.exec(rest);
  const code = codeMatch && linkFromCode(codeMatch[1]);
  if (codeMatch && code) {
    type = code;
    rest = rest.slice(0, codeMatch.index).trim();
  }
  if (!rest || /\s/.test(rest)) return null;
  return { key: rest, type, lag, hard };
}
