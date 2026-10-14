import { dayFromParts, isoWeek, mondayOf, parts } from '../../domain/dates';
import type { FixedZoom } from '../../store/projectStore';
import { formatDay } from '../common/format';

export const ROW_H = 34;
export const HEADER_H = 52;
export const TIER_H = HEADER_H / 2;

export const PX_PER_DAY: Record<FixedZoom, number> = {
  day: 34,
  week: 15,
  month: 4.2,
  quarter: 1.5,
};

/** Header granularity that fits a given day width (used for custom ranges). */
export function tierFor(ppd: number): FixedZoom {
  if (ppd >= 22) return 'day';
  if (ppd >= 7) return 'week';
  if (ppd >= 2.4) return 'month';
  return 'quarter';
}

export interface Scale {
  /** Header granularity. */
  zoom: FixedZoom;
  ppd: number;
  /** First rendered day. */
  origin: number;
  days: number;
  width: number;
  x: (day: number) => number;
  dayAt: (x: number) => number;
}

/** Timeline covering `[minDay, maxDay]` with generous padding, aligned to month starts. */
export function makeScale(
  zoom: FixedZoom,
  minDay: number,
  maxDay: number,
  ppd: number = PX_PER_DAY[zoom],
): Scale {
  const padBefore = zoom === 'day' ? 21 : zoom === 'week' ? 45 : 120;
  const padAfter = zoom === 'day' ? 60 : zoom === 'week' ? 150 : 400;
  const { year, month } = parts(minDay - padBefore);
  const origin =
    zoom === 'month' || zoom === 'quarter'
      ? dayFromParts(year, 0, 1)
      : dayFromParts(year, month, 1);
  const days = Math.max(maxDay + padAfter - origin, 60);
  return {
    zoom,
    ppd,
    origin,
    days,
    width: Math.ceil(days * ppd),
    x: (day) => (day - origin) * ppd,
    dayAt: (x) => Math.floor(x / ppd) + origin,
  };
}

export type Unit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export function unitStart(unit: Unit, day: number): number {
  if (unit === 'day') return day;
  if (unit === 'week') return mondayOf(day);
  const { year, month } = parts(day);
  if (unit === 'month') return dayFromParts(year, month, 1);
  if (unit === 'quarter') return dayFromParts(year, Math.floor(month / 3) * 3, 1);
  return dayFromParts(year, 0, 1);
}

export function unitNext(unit: Unit, start: number): number {
  if (unit === 'day') return start + 1;
  if (unit === 'week') return start + 7;
  const { year, month } = parts(start);
  if (unit === 'month') return dayFromParts(year, month + 1, 1);
  if (unit === 'quarter') return dayFromParts(year, month + 3, 1);
  return dayFromParts(year + 1, 0, 1);
}

export const TIERS: Record<FixedZoom, [Unit, Unit]> = {
  day: ['week', 'day'],
  week: ['month', 'week'],
  month: ['year', 'month'],
  quarter: ['year', 'quarter'],
};

export interface Tick {
  day: number;
  x: number;
  w: number;
  label: string;
  weekend?: boolean;
}

export function ticks(
  scale: Scale,
  unit: Unit,
  fromX: number,
  toX: number,
  label: (start: number, unit: Unit, width: number) => string,
): Tick[] {
  const out: Tick[] = [];
  let start = unitStart(unit, scale.dayAt(Math.max(0, fromX)));
  const endDay = scale.dayAt(toX) + 1;
  for (let guard = 0; start <= endDay && guard < 2000; guard++) {
    const next = unitNext(unit, start);
    const x = scale.x(start);
    out.push({ day: start, x, w: scale.x(next) - x, label: label(start, unit, scale.x(next) - x) });
    start = next;
  }
  return out;
}

/** Header label for one unit, shortened to the available width. */
export function tickLabel(
  start: number,
  unit: Unit,
  width: number,
  weekLabel: (w: number) => string,
): string {
  switch (unit) {
    case 'day':
      return width >= 30 ? formatDay(start, { day: 'numeric' }) : '';
    case 'week': {
      const wk = weekLabel(isoWeek(start));
      if (width >= 180)
        return `${wk} · ${formatDay(start, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      if (width >= 90) return `${wk} · ${formatDay(start, { day: 'numeric', month: 'numeric' })}`;
      return width >= 34 ? wk : '';
    }
    case 'month':
      if (width >= 110) return formatDay(start, { month: 'long', year: 'numeric' });
      if (width >= 34) return formatDay(start, { month: 'short' });
      return '';
    case 'quarter': {
      const q = Math.floor(parts(start).month / 3) + 1;
      return width >= 24 ? `Q${q}` : '';
    }
    case 'year':
      return formatDay(start, { year: 'numeric' });
  }
}
