import { describe, expect, it } from 'vitest';
import { parseProjectDoc } from '../persistence/jsonTransfer';
import { currentOutlineLevel } from '../store/actions';
import { hasOwnStyle, LEVEL_PALETTE, levelStyle, resolveStyle } from './styles';
import { item, makeDoc } from './testUtils';

describe('styles', () => {
  const doc = makeDoc([item('a', '2026-01-05', '2026-01-05')]);
  const project = { ...doc.project, levelStyles: [{ color: '#111111', fill: 'outline' as const }] };

  it('uses level styles with palette defaults', () => {
    expect(levelStyle(project, 0)).toEqual({ color: '#111111', fill: 'outline', label: 'right' });
    expect(levelStyle(project, 1)).toEqual({
      color: LEVEL_PALETTE[1],
      fill: 'solid',
      label: 'right',
    });
  });

  it('prefers the item style over its level', () => {
    const own = {
      ...doc.items.a,
      style: { color: '#222222', fill: 'striped' as const, label: 'none' as const },
    };
    expect(hasOwnStyle(doc.items.a)).toBe(false);
    expect(hasOwnStyle(own)).toBe(true);
    expect(resolveStyle(project, own, 0)).toEqual({
      color: '#222222',
      fill: 'striped',
      label: 'none',
    });
    expect(resolveStyle(project, doc.items.a, 0).color).toBe('#111111');
  });

  it('migrates the old item colour into an individual style', () => {
    const raw = JSON.parse(JSON.stringify(doc));
    raw.items.a.color = '#abcdef';
    delete raw.project.levelStyles;
    const parsed = parseProjectDoc(raw);
    expect(parsed.items.a.style).toEqual({ color: '#abcdef' });
    expect('color' in parsed.items.a).toBe(false);
    expect(parsed.project.levelStyles).toEqual([]);
  });
});

describe('currentOutlineLevel', () => {
  const tree = (collapsed: Record<string, boolean>) =>
    makeDoc([
      item('p', '2026-01-05', '2026-01-05', { collapsed: collapsed.p }),
      item('w', '2026-01-05', '2026-01-05', { parentId: 'p', collapsed: collapsed.w }),
      item('t', '2026-01-05', '2026-01-05', { parentId: 'w' }),
      item('q', '2026-01-05', '2026-01-05', { collapsed: collapsed.q }),
      item('x', '2026-01-05', '2026-01-05', { parentId: 'q' }),
    ]);

  it('recognises uniform levels and mixed states', () => {
    expect(currentOutlineLevel(tree({}))).toBeNull();
    expect(currentOutlineLevel(tree({ p: true, q: true }))).toBe(1);
    expect(currentOutlineLevel(tree({ p: true, q: true, w: true }))).toBe(1);
    expect(currentOutlineLevel(tree({ w: true }))).toBe(2);
    expect(currentOutlineLevel(tree({ p: true }))).toBeUndefined();
  });
});
