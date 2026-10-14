import { useEffect } from 'react';
import {
  addItem,
  deleteDependency,
  deleteItem,
  indent,
  moveVertical,
  outdent,
  select,
  setCollapsed,
  startEditing,
} from '../store/actions';
import { buildDisplay } from '../store/analysis';
import { redo, setUi, undo, useStore } from '../store/projectStore';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Global keyboard shortcuts for the plan (ignored while typing in a field). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = useStore.getState();
      const { doc, ui } = state;
      if (!doc || ui.settingsOpen || ui.helpOpen) return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'z' && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'y' && !isTyping(e.target)) {
        e.preventDefault();
        redo();
        return;
      }
      if (isTyping(e.target)) return;

      const planMode = ui.view.mode === 'plan';
      const sel = ui.selectedId && doc.items[ui.selectedId] ? ui.selectedId : null;
      const rows = buildDisplay(doc, ui.view).rows;
      const idx = sel ? rows.findIndex((r) => r.id === sel) : -1;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault();
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          if (e.altKey && sel && planMode) {
            moveVertical(sel, dir);
            return;
          }
          const next = rows[Math.max(0, Math.min(rows.length - 1, idx < 0 ? 0 : idx + dir))];
          if (next) select(next.id);
          return;
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!sel || !planMode) return;
          e.preventDefault();
          const row = rows[idx];
          const item = doc.items[sel];
          if (e.key === 'ArrowRight') {
            if (row?.hasChildren && item.collapsed) setCollapsed(sel, false);
            else if (row?.hasChildren) select(rows[idx + 1]?.id ?? sel);
          } else if (row?.hasChildren && !item.collapsed) {
            setCollapsed(sel, true);
          } else if (item.parentId) {
            select(item.parentId);
          }
          return;
        }
        case 'Enter':
          if (!planMode) return;
          e.preventDefault();
          addItem({ relativeTo: sel, asChild: ctrl && !!sel });
          return;
        case 'F2':
          if (sel) {
            e.preventDefault();
            startEditing(sel);
          }
          return;
        case 'Tab':
          if (!sel || !planMode) return;
          e.preventDefault();
          if (e.shiftKey) outdent(sel);
          else indent(sel);
          return;
        case 'Delete':
        case 'Backspace':
          if (ui.selectedDepId && doc.dependencies[ui.selectedDepId]) {
            e.preventDefault();
            deleteDependency(ui.selectedDepId);
          } else if (sel && planMode) {
            e.preventDefault();
            deleteItem(sel);
          }
          return;
        case 'Escape':
          setUi({ selectedDepId: null, selectedId: null });
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
