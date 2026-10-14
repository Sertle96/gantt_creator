export const HANDLE_W = 22;
export const INDENT = 18;
export const NAME_MIN = 170;
export const GRID_MIN = 260;
export const GRID_MAX = 1100;

export type ColKey = 'wbs' | 'start' | 'end' | 'duration' | 'people';

export const COL_WIDTH: Record<ColKey, number> = {
  wbs: 58,
  start: 100,
  end: 100,
  duration: 66,
  people: 78,
};

/** Columns that fit beside the name, dropped from the end of this list first. */
const PRIORITY: ColKey[] = ['start', 'end', 'duration', 'people', 'wbs'];
const DISPLAY_ORDER: ColKey[] = ['start', 'end', 'duration', 'people'];

export interface ColumnLayout {
  showWbs: boolean;
  nameWidth: number;
  /** Columns right of the name in display order. */
  right: ColKey[];
}

export function layoutColumns(gridWidth: number): ColumnLayout {
  let available = gridWidth - HANDLE_W - NAME_MIN;
  const chosen = new Set<ColKey>();
  for (const key of PRIORITY) {
    if (COL_WIDTH[key] <= available) {
      chosen.add(key);
      available -= COL_WIDTH[key];
    }
  }
  const right = DISPLAY_ORDER.filter((k) => chosen.has(k));
  const used =
    HANDLE_W +
    (chosen.has('wbs') ? COL_WIDTH.wbs : 0) +
    right.reduce((s, k) => s + COL_WIDTH[k], 0);
  return { showWbs: chosen.has('wbs'), nameWidth: gridWidth - used, right };
}
