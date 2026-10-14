import { describe, expect, it } from 'vitest';
import { validateLink } from './dependencies';
import { deadlineViolations, resizeByDays, schedule, shiftByDays } from './scheduling';
import { item, link, makeDoc } from './testUtils';

const NOW = '2026-01-01T00:00:00.000Z';

describe('schedule – push mode', () => {
  it('pushes a finish-to-start successor behind its predecessor', () => {
    const doc = makeDoc(
      [item('a', '2026-01-05', '2026-01-09'), item('b', '2026-01-07', '2026-01-08')],
      [link('l', 'a', 'b')],
    );
    const out = schedule(doc);
    expect(out.items.b.start).toBe('2026-01-12'); // next Monday
    expect(out.items.b.end).toBe('2026-01-13'); // keeps 2 working days
  });

  it('does not pull successors earlier', () => {
    const doc = makeDoc(
      [item('a', '2026-01-05', '2026-01-06'), item('b', '2026-01-19', '2026-01-20')],
      [link('l', 'a', 'b')],
    );
    expect(schedule(doc).items.b.start).toBe('2026-01-19');
  });

  it('ignores soft links', () => {
    const doc = makeDoc(
      [item('a', '2026-01-05', '2026-01-09'), item('b', '2026-01-05', '2026-01-05')],
      [link('l', 'a', 'b', { hard: false })],
    );
    expect(schedule(doc)).toBe(doc);
  });

  it('applies lag in working days and handles SS / FF', () => {
    const doc = makeDoc(
      [
        item('a', '2026-01-05', '2026-01-09'),
        item('b', '2026-01-05', '2026-01-05'),
        item('c', '2026-01-05', '2026-01-06'),
      ],
      [link('l1', 'a', 'b', { type: 'SS', lag: 2 }), link('l2', 'a', 'c', { type: 'FF' })],
    );
    const out = schedule(doc);
    expect(out.items.b.start).toBe('2026-01-07');
    expect(out.items.c.end).toBe('2026-01-09');
    expect(out.items.c.start).toBe('2026-01-08');
  });

  it('lets a milestone sit on the finish day of its predecessor', () => {
    const doc = makeDoc(
      [
        item('a', '2026-01-05', '2026-01-09'),
        item('m', '2026-01-05', '2026-01-05', { kind: 'milestone' }),
        item('b', '2026-01-05', '2026-01-05'),
      ],
      [link('l1', 'a', 'm'), link('l2', 'm', 'b')],
    );
    const out = schedule(doc);
    expect(out.items.m.end).toBe('2026-01-09');
    expect(out.items.b.start).toBe('2026-01-12');
  });

  it('moves the whole subtree when a parent is a successor and rolls up dates', () => {
    const doc = makeDoc(
      [
        item('a', '2026-01-05', '2026-01-09'),
        item('p', '2026-01-05', '2026-01-05'),
        item('c1', '2026-01-05', '2026-01-06', { parentId: 'p' }),
        item('c2', '2026-01-07', '2026-01-08', { parentId: 'p' }),
      ],
      [link('l', 'a', 'p')],
    );
    const out = schedule(doc);
    expect(out.items.c1.start).toBe('2026-01-12');
    expect(out.items.c2.start).toBe('2026-01-14');
    expect(out.items.p.start).toBe('2026-01-12');
    expect(out.items.p.end).toBe('2026-01-15');
  });

  it('never moves deadlines and reports overruns', () => {
    const doc = makeDoc(
      [
        item('a', '2026-01-05', '2026-01-09'),
        item('d', '2026-01-07', '2026-01-07', { kind: 'deadline' }),
      ],
      [link('l', 'a', 'd')],
    );
    const out = schedule(doc);
    expect(out.items.d.end).toBe('2026-01-07');
    expect(deadlineViolations(out)).toEqual([{ depId: 'l', deadlineId: 'd', overrun: 2 }]);
  });

  it('propagates through chains', () => {
    const doc = makeDoc(
      [
        item('a', '2026-01-05', '2026-01-09'),
        item('b', '2026-01-05', '2026-01-06'),
        item('c', '2026-01-05', '2026-01-05'),
      ],
      [link('l1', 'b', 'c'), link('l2', 'a', 'b')],
    );
    const out = schedule(doc);
    expect(out.items.b.start).toBe('2026-01-12');
    expect(out.items.c.start).toBe('2026-01-14');
  });
});

describe('schedule – keepGap mode', () => {
  it('drags successors along by the same working-day delta', () => {
    let doc = makeDoc(
      [item('a', '2026-01-05', '2026-01-06'), item('b', '2026-01-12', '2026-01-13')],
      [link('l', 'a', 'b')],
    );
    doc = { ...doc, project: { ...doc.project, scheduleMode: 'keepGap' } };
    const moved = shiftByDays(doc, 'a', 1, NOW); // one working day later
    const out = schedule(moved, { movedIds: ['a'], prev: doc });
    expect(out.items.a.start).toBe('2026-01-06');
    expect(out.items.b.start).toBe('2026-01-13');
  });
});

describe('manual edits', () => {
  it('shifts tasks by working days, snapping weekends forward', () => {
    const doc = makeDoc([item('a', '2026-01-08', '2026-01-09')]); // Thu–Fri
    const out = shiftByDays(doc, 'a', 2, NOW); // drop on Saturday
    expect(out.items.a.start).toBe('2026-01-12');
    expect(out.items.a.end).toBe('2026-01-13');
  });

  it('resizes the end of a task but never before its start', () => {
    const doc = makeDoc([item('a', '2026-01-05', '2026-01-07')]);
    expect(resizeByDays(doc, 'a', 'end', 2, NOW).items.a.end).toBe('2026-01-09');
    expect(resizeByDays(doc, 'a', 'end', -10, NOW).items.a.end).toBe('2026-01-05');
  });
});

describe('validateLink', () => {
  const doc = makeDoc(
    [
      item('a', '2026-01-05', '2026-01-09'),
      item('b', '2026-01-05', '2026-01-09'),
      item('p', '2026-01-05', '2026-01-09'),
      item('c', '2026-01-05', '2026-01-09', { parentId: 'p' }),
    ],
    [link('l1', 'a', 'b')],
  );
  const fs = { fromSide: 'end', toSide: 'start', hard: true } as const;

  it('rejects self links, duplicates and cycles', () => {
    expect(validateLink(doc, { ...fs, fromId: 'a', toId: 'a' })).toBe('self');
    expect(validateLink(doc, { ...fs, fromId: 'b', toId: 'a' })).toBe('duplicate');
    expect(validateLink(doc, { ...fs, fromId: 'p', toId: 'c' })).toBe('cycle');
    expect(validateLink(doc, { ...fs, fromId: 'c', toId: 'p' })).toBe('cycle');
  });

  it('detects cycles through parents', () => {
    const d2 = makeDoc(Object.values(doc.items), [link('l1', 'p', 'b')]);
    expect(validateLink(d2, { ...fs, fromId: 'b', toId: 'c' })).toBe('cycle');
    expect(validateLink(d2, { ...fs, fromId: 'b', toId: 'c', hard: false })).toBeNull();
    expect(validateLink(d2, { ...fs, fromId: 'a', toId: 'c' })).toBeNull();
  });
});
