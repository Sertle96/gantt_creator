import { toDay } from '../../domain/dates';
import type { Item, ProjectDoc, Side } from '../../domain/types';
import { ROW_H, type Scale } from './scale';

export type Shape = 'task' | 'summary' | 'milestone' | 'deadline';

export interface BarGeom {
  id: string;
  row: number;
  shape: Shape;
  x1: number;
  x2: number;
  /** Vertical centre of the row. */
  y: number;
  /** Anchor x for links attached to the start / end. */
  ax1: number;
  ax2: number;
}

export const MILESTONE_R = 8;

export function shapeOf(item: Item, isParent: boolean): Shape {
  if (isParent) return 'summary';
  return item.kind;
}

export function barGeom(item: Item, isParent: boolean, row: number, scale: Scale): BarGeom {
  const shape = shapeOf(item, isParent);
  const y = row * ROW_H + ROW_H / 2;
  const sd = toDay(item.start);
  const ed = toDay(item.end);
  if (shape === 'milestone') {
    const cx = scale.x(ed) + scale.ppd / 2;
    return {
      id: item.id,
      row,
      shape,
      x1: cx,
      x2: cx,
      y,
      ax1: cx - MILESTONE_R,
      ax2: cx + MILESTONE_R,
    };
  }
  if (shape === 'deadline') {
    const x = scale.x(ed + 1);
    return { id: item.id, row, shape, x1: x, x2: x, y, ax1: x, ax2: x };
  }
  const x1 = scale.x(sd);
  const x2 = Math.max(x1 + 3, scale.x(ed + 1));
  return { id: item.id, row, shape, x1, x2, y, ax1: x1, ax2: x2 };
}

const GAP = 10;

export interface LinkRoute {
  d: string;
  mid: { x: number; y: number };
}

/**
 * Orthogonal route from a bar side to another bar side. `fromSide` end leaves to the right,
 * start leaves to the left; `toSide` start is entered from the left, end from the right.
 */
export function linkRoute(from: BarGeom, fromSide: Side, to: BarGeom, toSide: Side): LinkRoute {
  const x1 = fromSide === 'end' ? from.ax2 : from.ax1;
  const x2 = toSide === 'start' ? to.ax1 : to.ax2;
  const y1 = from.y;
  const y2 = to.y;
  const d1 = fromSide === 'end' ? 1 : -1;
  const d2 = toSide === 'start' ? 1 : -1;
  const x1o = x1 + d1 * GAP;
  const x2o = x2 - d2 * GAP;

  if (y1 === y2 && d1 === d2 && (d1 === 1 ? x2 >= x1 : x2 <= x1)) {
    return { d: `M${x1},${y1}H${x2}`, mid: { x: (x1 + x2) / 2, y: y1 } };
  }
  if (d1 === d2 && (d1 === 1 ? x2o >= x1o : x2o <= x1o)) {
    return {
      d: `M${x1},${y1}H${x1o}V${y2}H${x2}`,
      mid: { x: x1o, y: (y1 + y2) / 2 },
    };
  }
  const ym = y1 + (y2 < y1 ? -ROW_H / 2 : ROW_H / 2);
  return {
    d: `M${x1},${y1}H${x1o}V${ym}H${x2o}V${y2}H${x2}`,
    mid: { x: (x1o + x2o) / 2, y: ym },
  };
}

/** Colour of an item: own colour, else inherited from the closest coloured ancestor. */
export function itemColor(doc: ProjectDoc, id: string): string | undefined {
  let cur: Item | undefined = doc.items[id];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.color) return cur.color;
    seen.add(cur.id);
    cur = cur.parentId ? doc.items[cur.parentId] : undefined;
  }
  return undefined;
}
