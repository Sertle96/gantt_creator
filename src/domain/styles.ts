import type { BarFill, BarStyle, Item, LabelPosition, ProjectMeta } from './types';

/** Default colour per hierarchy depth (cycles for deeper levels). */
export const LEVEL_PALETTE = [
  '#003c73',
  '#1f6fb2',
  '#3f9fd6',
  '#e8963a',
  '#6c7a89',
  '#0f8b8d',
  '#8e6fc1',
];

export const BAR_FILLS: BarFill[] = ['solid', 'soft', 'outline', 'striped'];
export const LABEL_POSITIONS: LabelPosition[] = ['right', 'inside', 'none'];

export type ResolvedStyle = Required<BarStyle>;

export function levelStyle(project: ProjectMeta, depth: number): ResolvedStyle {
  const own = project.levelStyles?.[depth] ?? {};
  return {
    color: own.color || LEVEL_PALETTE[depth % LEVEL_PALETTE.length],
    fill: own.fill ?? 'solid',
    label: own.label ?? 'right',
  };
}

/** Effective style: the item's own style if it has one, otherwise its level's style. */
export function resolveStyle(project: ProjectMeta, item: Item, depth: number): ResolvedStyle {
  const base = levelStyle(project, depth);
  if (!hasOwnStyle(item)) return base;
  return {
    color: item.style!.color || base.color,
    fill: item.style!.fill ?? base.fill,
    label: item.style!.label ?? base.label,
  };
}

export function hasOwnStyle(item: Item): boolean {
  return !!item.style && Object.values(item.style).some((v) => v !== undefined);
}
