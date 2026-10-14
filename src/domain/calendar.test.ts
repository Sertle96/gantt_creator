import { describe, expect, it } from 'vitest';
import { WorkCalendar } from './calendar';
import { isoWeek, toDay, toISO, weekday } from './dates';

const cal = new WorkCalendar({ workdays: [1, 2, 3, 4, 5], holidays: [] });
const d = toDay;

describe('dates', () => {
  it('round-trips ISO dates and knows weekdays', () => {
    expect(toISO(d('2026-10-14'))).toBe('2026-10-14');
    expect(weekday(d('2026-10-14'))).toBe(3); // Wednesday
    expect(weekday(d('1969-12-31'))).toBe(3);
    expect(isoWeek(d('2026-01-01'))).toBe(1);
    expect(isoWeek(d('2026-12-31'))).toBe(53);
  });
});

describe('WorkCalendar', () => {
  it('counts working days and skips weekends', () => {
    expect(cal.countWorkdays(d('2026-10-12'), d('2026-10-16'))).toBe(5); // Mon–Fri
    expect(cal.countWorkdays(d('2026-10-16'), d('2026-10-19'))).toBe(2); // Fri–Mon
    expect(cal.isWorkday(d('2026-10-17'))).toBe(false);
  });

  it('maps index back to the working day', () => {
    for (let day = d('1969-11-01'); day < d('1970-03-01'); day++) {
      const back = cal.dayOf(cal.index(day));
      expect(back).toBe(cal.snapForward(day));
      expect(cal.isWorkday(back)).toBe(true);
      expect(back).toBeGreaterThanOrEqual(day);
    }
  });

  it('adds working days across weekends', () => {
    expect(toISO(cal.addWorkdays(d('2026-10-16'), 1))).toBe('2026-10-19');
    expect(toISO(cal.addWorkdays(d('2026-10-17'), 0))).toBe('2026-10-19');
    expect(toISO(cal.addWorkdays(d('2026-10-19'), -1))).toBe('2026-10-16');
    expect(toISO(cal.snapBackward(d('2026-10-18')))).toBe('2026-10-16');
  });

  it('respects holidays', () => {
    const c = new WorkCalendar({
      workdays: [1, 2, 3, 4, 5],
      holidays: ['2026-10-19', '2026-10-17'],
    });
    expect(c.isWorkday(d('2026-10-19'))).toBe(false);
    expect(toISO(c.addWorkdays(d('2026-10-16'), 1))).toBe('2026-10-20');
    expect(c.countWorkdays(d('2026-10-12'), d('2026-10-23'))).toBe(9);
  });

  it('falls back to all days when no workdays are configured', () => {
    const c = new WorkCalendar({ workdays: [], holidays: [] });
    expect(c.countWorkdays(d('2026-10-12'), d('2026-10-18'))).toBe(7);
  });
});
