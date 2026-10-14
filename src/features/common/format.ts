import { locale } from '../../i18n';
import type { ISODate } from '../../domain/types';

const MS_PER_DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale() + JSON.stringify(opts);
  let f = formatters.get(key);
  if (!f)
    formatters.set(key, (f = new Intl.DateTimeFormat(locale(), { ...opts, timeZone: 'UTC' })));
  return f;
}

export function formatDay(day: number, opts: Intl.DateTimeFormatOptions): string {
  return formatter(opts).format(new Date(day * MS_PER_DAY));
}

export function formatISO(iso: ISODate, opts: Intl.DateTimeFormatOptions = SHORT): string {
  return formatter(opts).format(new Date(`${iso}T00:00:00Z`));
}

export const SHORT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
};
export const MEDIUM: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};
export const WEEKDAY_SHORT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
};
