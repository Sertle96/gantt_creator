import type { ISODate } from './types';

const MS_PER_DAY = 86_400_000;

/** Day number since 1970-01-01 (UTC based, no time zone drift). */
export function toDay(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function toISO(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. Day 0 (1970-01-01) was a Thursday. */
export function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function todayISO(): ISODate {
  const n = new Date();
  return toISO(Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / MS_PER_DAY));
}

export function addDays(iso: ISODate, n: number): ISODate {
  return toISO(toDay(iso) + n);
}

export function isValidISO(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISO(toDay(value)) === value;
}

/** Date parts of a day number, month 0-based. */
export function parts(day: number): { year: number; month: number; date: number } {
  const d = new Date(day * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
}

export function dayFromParts(year: number, month: number, date = 1): number {
  return Math.round(Date.UTC(year, month, date) / MS_PER_DAY);
}

/** ISO-8601 week number. */
export function isoWeek(day: number): number {
  const wd = weekday(day) || 7;
  const thursday = day + 4 - wd;
  const { year } = parts(thursday);
  return Math.floor((thursday - dayFromParts(year, 0, 1)) / 7) + 1;
}

export function mondayOf(day: number): number {
  return day - ((weekday(day) + 6) % 7);
}
