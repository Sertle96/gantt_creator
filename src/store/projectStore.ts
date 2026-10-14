import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { schedule } from '../domain/scheduling';
import type { ISODate, ProjectDoc } from '../domain/types';
import type { ProjectSummary } from '../persistence/repository';

export type FixedZoom = 'day' | 'week' | 'month' | 'quarter';
/** `custom` fits the chosen `range` into the visible timeline width. */
export type Zoom = FixedZoom | 'custom';
export interface DateRange {
  from: ISODate;
  to: ISODate;
}
export type PersonLayout = 'gantt' | 'agenda';
export type View = { mode: 'plan' } | { mode: 'person'; personId: string; layout: PersonLayout };
export type Panel = 'details' | 'team' | null;
export type Theme = 'system' | 'light' | 'dark';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

export interface UiState {
  selectedId: string | null;
  selectedDepId: string | null;
  editingId: string | null;
  view: View;
  zoom: Zoom;
  range: DateRange | null;
  showCritical: boolean;
  panel: Panel;
  settingsOpen: boolean;
  helpOpen: boolean;
  gridWidth: number;
  theme: Theme;
  toast: Toast | null;
  /** Request for the timeline to scroll a day into view; nonce makes repeats observable. */
  scrollRequest: { day: number; nonce: number } | null;
}

export interface State {
  ready: boolean;
  projects: ProjectSummary[];
  doc: ProjectDoc | null;
  /** Transient document shown while dragging; never saved. */
  preview: ProjectDoc | null;
  past: ProjectDoc[];
  future: ProjectDoc[];
  ui: UiState;
}

const PREFS_KEY = 'gantt-creator.prefs';
const HISTORY_LIMIT = 100;

type Prefs = Pick<UiState, 'zoom' | 'range' | 'showCritical' | 'gridWidth' | 'theme'>;

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

const prefs = loadPrefs();

export const useStore = create<State>(() => ({
  ready: false,
  projects: [],
  doc: null,
  preview: null,
  past: [],
  future: [],
  ui: {
    selectedId: null,
    selectedDepId: null,
    editingId: null,
    view: { mode: 'plan' },
    zoom: prefs.zoom === 'custom' && !prefs.range ? 'week' : (prefs.zoom ?? 'week'),
    range: prefs.range ?? null,
    showCritical: prefs.showCritical ?? false,
    panel: 'details',
    settingsOpen: false,
    helpOpen: false,
    gridWidth: prefs.gridWidth ?? 680,
    theme: prefs.theme ?? 'system',
    toast: null,
    scrollRequest: null,
  },
}));

const get = useStore.getState;
const set = useStore.setState;

useStore.subscribe((s, prev) => {
  if (s.ui === prev.ui) return;
  const { zoom, range, showCritical, gridWidth, theme } = s.ui;
  const prefs: Prefs = { zoom, range, showCritical, gridWidth, theme };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable
  }
});

export function setUi(patch: Partial<UiState> | ((ui: UiState) => Partial<UiState>)) {
  set((s) => ({ ui: { ...s.ui, ...(typeof patch === 'function' ? patch(s.ui) : patch) } }));
}

let toastCounter = 0;
export function showToast(message: string, tone: Toast['tone'] = 'info') {
  const id = ++toastCounter;
  setUi({ toast: { id, message, tone } });
  setTimeout(() => {
    if (get().ui.toast?.id === id) setUi({ toast: null });
  }, 4000);
}

/** Replaces the document as one undoable step, rescheduling dates. */
export function applyDoc(next: ProjectDoc, movedIds?: string[]) {
  const { doc: base, past } = get();
  if (!base || next === base) {
    set({ preview: null });
    return;
  }
  const now = new Date().toISOString();
  const scheduled = schedule(next, { movedIds, prev: base, now });
  set({
    doc: { ...scheduled, project: { ...scheduled.project, updatedAt: now } },
    preview: null,
    past: [...past.slice(-(HISTORY_LIMIT - 1)), base],
    future: [],
  });
}

/** Immer-based edit of the current document as one undoable step. */
export function commit(recipe: (draft: Draft<ProjectDoc>) => void, movedIds?: string[]) {
  const base = get().doc;
  if (!base) return;
  applyDoc(produce(base, recipe), movedIds);
}

/** Edit that is persisted but not part of the undo history (e.g. collapsing rows). */
export function commitSilently(recipe: (draft: Draft<ProjectDoc>) => void) {
  const base = get().doc;
  if (!base) return;
  const next = produce(base, recipe);
  if (next === base) return;
  const swap = (d: ProjectDoc) => produce(d, recipe);
  set((s) => ({ doc: next, past: s.past.map(swap), future: s.future.map(swap) }));
}

export function setPreview(next: ProjectDoc | null, movedIds?: string[]) {
  const base = get().doc;
  if (!base || !next || next === base) {
    if (get().preview) set({ preview: null });
    return;
  }
  set({ preview: schedule(next, { movedIds, prev: base }) });
}

export function undo() {
  const { past, doc, future } = get();
  if (!doc || !past.length) return;
  set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future] });
  fixSelection();
}

export function redo() {
  const { past, doc, future } = get();
  if (!doc || !future.length) return;
  set({ doc: future[0], past: [...past, doc], future: future.slice(1) });
  fixSelection();
}

function fixSelection() {
  const { doc, ui } = get();
  if (!doc) return;
  const patch: Partial<UiState> = {};
  if (ui.selectedId && !doc.items[ui.selectedId]) patch.selectedId = null;
  if (ui.selectedDepId && !doc.dependencies[ui.selectedDepId]) patch.selectedDepId = null;
  if (ui.editingId && !doc.items[ui.editingId]) patch.editingId = null;
  if (ui.view.mode === 'person' && !doc.people[ui.view.personId]) patch.view = { mode: 'plan' };
  if (Object.keys(patch).length) setUi(patch);
}

export function setDocWithoutHistory(doc: ProjectDoc | null) {
  set({ doc, preview: null, past: [], future: [] });
}

export function requestScroll(day: number) {
  setUi({ scrollRequest: { day, nonce: Date.now() } });
}
