import i18n from '../i18n';
import { createProject } from '../domain/factory';
import { schedule } from '../domain/scheduling';
import type { ProjectDoc } from '../domain/types';
import { IndexedDbRepository } from '../persistence/indexedDbRepository';
import {
  ImportError,
  downloadText,
  parseProjectDoc,
  safeFileName,
  serializeProjectDoc,
} from '../persistence/jsonTransfer';
import { summarize, type ProjectRepository } from '../persistence/repository';
import { buildSampleProject } from './sample';
import { setDocWithoutHistory, setUi, showToast, useStore } from './projectStore';

const LAST_KEY = 'gantt-creator.lastProject';
const SAVE_DELAY = 400;
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts) as string;

let repo: ProjectRepository | null = null;
function repository(): ProjectRepository {
  repo ??= new IndexedDbRepository();
  return repo;
}

// ---------------------------------------------------------------- autosave

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending: ProjectDoc | null = null;
/** Last document known to be in storage, so opening a project does not write it back. */
let persisted: ProjectDoc | null = null;

async function flush() {
  clearTimeout(saveTimer);
  const doc = pending;
  pending = null;
  if (!doc) return;
  try {
    await repository().save(doc);
    persisted = doc;
    const summary = summarize(doc);
    useStore.setState((s) => ({
      projects: [summary, ...s.projects.filter((p) => p.id !== summary.id)],
    }));
  } catch (err) {
    console.error('Saving failed', err);
    showToast(String(err), 'error');
  }
}

useStore.subscribe((s, prev) => {
  if (!s.doc || s.doc === prev.doc || s.doc === persisted) return;
  pending = s.doc;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(), SAVE_DELAY);
});

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('beforeunload', () => void flush());
}

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // storage unavailable
  }
}

function show(doc: ProjectDoc) {
  setDocWithoutHistory(doc);
  remember(doc.project.id);
  setUi({ selectedId: null, selectedDepId: null, editingId: null, view: { mode: 'plan' } });
}

// ---------------------------------------------------------------- project lifecycle

export async function initProjects() {
  try {
    const projects = await repository().list();
    useStore.setState({ projects });
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_KEY);
    } catch {
      // storage unavailable
    }
    if (last && projects.some((p) => p.id === last)) await openProject(last);
  } catch (err) {
    console.error('Loading projects failed', err);
    showToast(String(err), 'error');
  } finally {
    useStore.setState({ ready: true });
  }
}

export async function openProject(id: string) {
  await flush();
  const doc = await repository().load(id);
  if (!doc) return;
  const scheduled = schedule(doc);
  persisted = scheduled === doc ? doc : null;
  show(scheduled);
}

export function closeProject() {
  void flush();
  setDocWithoutHistory(null);
  remember(null);
}

export async function newProject(name?: string) {
  await flush();
  const levels = i18n.t('defaults.levels', { returnObjects: true }) as string[];
  const doc = createProject(name?.trim() || t('projectMenu.newDefault'), levels);
  show(doc);
}

export async function newSampleProject() {
  await flush();
  show(buildSampleProject());
}

export async function deleteProject(id: string) {
  await flush();
  await repository().remove(id);
  useStore.setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  if (useStore.getState().doc?.project.id === id) closeProject();
}

export function exportProject() {
  const doc = useStore.getState().doc;
  if (!doc) return;
  downloadText(`${safeFileName(doc.project.name)}.gantt.json`, serializeProjectDoc(doc));
}

export async function importProjectFile(file: File) {
  try {
    const doc = parseProjectDoc(JSON.parse(await file.text()));
    const existing = useStore.getState().projects.find((p) => p.id === doc.project.id);
    if (existing && !window.confirm(t('projectMenu.importOverwrite', { name: existing.name })))
      return;
    await flush();
    show(schedule(doc));
  } catch (err) {
    console.error('Import failed', err);
    showToast(
      err instanceof ImportError || err instanceof SyntaxError
        ? t('projectMenu.importFailed')
        : String(err),
      'error',
    );
  }
}

export function pickAndImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void importProjectFile(file);
  };
  input.click();
}
