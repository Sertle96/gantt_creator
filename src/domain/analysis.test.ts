import { describe, expect, it } from 'vitest';
import { criticalPath } from './criticalPath';
import { personPlan } from './personView';
import { schedule } from './scheduling';
import { buildTree, flattenTree, orderKeyAt } from './tree';
import { item, link, makeDoc } from './testUtils';

describe('criticalPath', () => {
  // a(5) → b(2) → d(1);  a → c(1) → d   ⇒ a, b, d critical; c has 1 day float
  const doc = schedule(
    makeDoc(
      [
        item('a', '2026-01-05', '2026-01-09'),
        item('b', '2026-01-05', '2026-01-06'),
        item('c', '2026-01-05', '2026-01-05'),
        item('d', '2026-01-05', '2026-01-05'),
      ],
      [link('ab', 'a', 'b'), link('ac', 'a', 'c'), link('bd', 'b', 'd'), link('cd', 'c', 'd')],
    ),
  );

  it('finds the longest chain', () => {
    const cp = criticalPath(doc);
    expect([...cp.items].sort()).toEqual(['a', 'b', 'd']);
    expect(cp.float.get('c')).toBe(1);
    expect([...cp.deps].sort()).toEqual(['ab', 'bd']);
  });

  it('marks parents of critical leaves', () => {
    const withParent = schedule(
      makeDoc([
        item('p', '2026-01-05', '2026-01-05'),
        item('x', '2026-01-05', '2026-01-09', { parentId: 'p' }),
        item('y', '2026-01-05', '2026-01-06', { parentId: 'p' }),
      ]),
    );
    const cp = criticalPath(withParent);
    expect(cp.items.has('x')).toBe(true);
    expect(cp.items.has('p')).toBe(true);
    expect(cp.items.has('y')).toBe(false);
  });

  it('uses deadlines as targets and reports negative float', () => {
    const d = schedule(
      makeDoc(
        [
          item('a', '2026-01-05', '2026-01-09'),
          item('late', '2026-01-05', '2026-01-30'),
          item('dl', '2026-01-07', '2026-01-07', { kind: 'deadline' }),
        ],
        [link('l', 'a', 'dl')],
      ),
    );
    const cp = criticalPath(d);
    expect(cp.float.get('a')).toBe(-2);
    expect(cp.items.has('a')).toBe(true);
  });
});

describe('personPlan', () => {
  const doc = makeDoc(
    [
      item('p1', '2026-01-05', '2026-01-09'),
      item('mine', '2026-01-12', '2026-01-14', { assigneeIds: ['me'] }),
      item('next', '2026-01-15', '2026-01-16'),
      item('ms', '2026-01-16', '2026-01-16', { kind: 'milestone' }),
      item('after', '2026-01-19', '2026-01-20'),
      item('assoc', '2026-01-05', '2026-01-05'),
      item('unrelated', '2026-01-05', '2026-01-05'),
    ],
    [
      link('a', 'p1', 'mine'),
      link('b', 'mine', 'next'),
      link('c', 'next', 'ms'),
      link('d', 'ms', 'after'),
      link('e', 'assoc', 'mine', { hard: false }),
    ],
  );

  it('collects own items and their dependency context', () => {
    const plan = personPlan(doc, 'me');
    expect([...plan.own]).toEqual(['mine']);
    expect([...plan.context].sort()).toEqual(['assoc', 'ms', 'next', 'p1']);
    expect(plan.rows.map((r) => r.id)).not.toContain('unrelated');
    expect(plan.rows.map((r) => r.id)).not.toContain('after'); // stops at the milestone
  });

  it('includes links attached to parents', () => {
    const d = makeDoc(
      [
        item('before', '2026-01-05', '2026-01-05'),
        item('phase', '2026-01-06', '2026-01-09'),
        item('t', '2026-01-06', '2026-01-09', { parentId: 'phase', assigneeIds: ['me'] }),
      ],
      [link('l', 'before', 'phase')],
    );
    expect([...personPlan(d, 'me').context]).toEqual(['before']);
  });
});

describe('tree', () => {
  const doc = makeDoc([
    item('a', '2026-01-05', '2026-01-05'),
    item('a1', '2026-01-05', '2026-01-05', { parentId: 'a' }),
    item('a2', '2026-01-05', '2026-01-05', { parentId: 'a', collapsed: true }),
    item('a2x', '2026-01-05', '2026-01-05', { parentId: 'a2' }),
    item('b', '2026-01-05', '2026-01-05'),
  ]);

  it('flattens with outline numbers and respects collapsed nodes', () => {
    const rows = flattenTree(buildTree(doc.items));
    expect(rows.map((r) => `${r.wbs}:${r.id}`)).toEqual(['1:a', '1.1:a1', '1.2:a2', '2:b']);
    expect(flattenTree(buildTree(doc.items), true)).toHaveLength(5);
  });

  it('creates order keys between siblings', () => {
    const tree = buildTree(doc.items);
    const key = orderKeyAt(tree, 'a', 1);
    expect(key > doc.items.a1.order && key < doc.items.a2.order).toBe(true);
  });
});
