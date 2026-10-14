import { toDay, weekday } from './dates';
import type { CalendarSettings } from './types';

/**
 * Working-day arithmetic. `index(day)` maps a calendar day to the number of working days
 * before it, which turns scheduling with weekends and holidays into plain integer math.
 */
export class WorkCalendar {
  private readonly weekly: boolean[];
  private readonly perWeek: number;
  /** prefix[k] = working days among the first k days of a week block starting on day 0 (a Thursday). */
  private readonly prefix: number[];
  private readonly holidays: number[];
  private readonly holidaysBelowZero: number;

  constructor(settings: CalendarSettings) {
    const set = new Set(settings.workdays);
    if (set.size === 0) for (let i = 0; i < 7; i++) set.add(i);
    this.weekly = Array.from({ length: 7 }, (_, i) => set.has(i));
    this.perWeek = set.size;
    this.prefix = [0];
    for (let k = 0; k < 7; k++)
      this.prefix.push(this.prefix[k] + (this.weekly[weekday(k)] ? 1 : 0));
    this.holidays = [...new Set(settings.holidays.map(toDay))]
      .filter((d) => this.weekly[weekday(d)])
      .sort((a, b) => a - b);
    this.holidaysBelowZero = this.countHolidaysBelow(0);
  }

  isWorkday(day: number): boolean {
    return this.weekly[weekday(day)] && !this.isHoliday(day);
  }

  /** Number of working days in [0, day) (negative for days before the epoch). */
  index(day: number): number {
    const q = Math.floor(day / 7);
    const r = day - q * 7;
    const weekly = q * this.perWeek + this.prefix[r];
    return weekly - (this.countHolidaysBelow(day) - this.holidaysBelowZero);
  }

  /** The working day with the given index. */
  dayOf(i: number): number {
    const estimate = Math.floor((i * 7) / this.perWeek);
    let lo = estimate - 14;
    let step = 64;
    while (this.index(lo + 1) > i) {
      lo -= step;
      step *= 2;
    }
    let hi = estimate + 14;
    step = 64;
    while (this.index(hi + 1) <= i) {
      hi += step;
      step *= 2;
    }
    // smallest d with index(d + 1) > i
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.index(mid + 1) > i) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  snapForward(day: number): number {
    return this.dayOf(this.index(day));
  }

  snapBackward(day: number): number {
    return this.dayOf(this.index(day + 1) - 1);
  }

  /** Inclusive count of working days between two days. */
  countWorkdays(startDay: number, endDay: number): number {
    return this.index(endDay + 1) - this.index(startDay);
  }

  addWorkdays(day: number, n: number): number {
    return this.dayOf(this.index(this.snapForward(day)) + n);
  }

  private isHoliday(day: number): boolean {
    const i = this.lowerBound(day);
    return i < this.holidays.length && this.holidays[i] === day;
  }

  private countHolidaysBelow(day: number): number {
    return this.lowerBound(day);
  }

  private lowerBound(day: number): number {
    let lo = 0;
    let hi = this.holidays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.holidays[mid] < day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
