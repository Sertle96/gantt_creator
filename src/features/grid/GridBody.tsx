import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { levelStyle } from '../../domain/styles';
import { ancestors } from '../../domain/tree';
import { assignPerson, levelLabel, moveItem, select } from '../../store/actions';
import type { DisplayModel, DisplayRow } from '../../store/analysis';
import { useStore } from '../../store/projectStore';
import { hasPerson, PERSON_MIME } from '../common/personDrag';
import { ROW_H } from '../gantt/scale';
import { COL_WIDTH, HANDLE_W, INDENT, type ColumnLayout } from './columns';
import { GridRow } from './GridRow';

interface GridBodyProps {
  model: DisplayModel;
  layout: ColumnLayout;
  rowsFrom: number;
  rowsTo: number;
  height: number;
}

interface Projection {
  /** Gap index in the full row list where the indicator is drawn. */
  gap: number;
  depth: number;
  parentId: string | null;
  index: number;
}

/**
 * Where a dragged row would land: the vertical gap picks the position, the horizontal offset
 * picks the depth within what the neighbouring rows allow (like outliners / Jira backlogs).
 */
function project(rows: DisplayRow[], dragIndex: number, rawGap: number, dx: number): Projection {
  const dragged = rows[dragIndex];
  let end = dragIndex + 1;
  while (end < rows.length && rows[end].depth > dragged.depth) end++;
  const gap = rawGap > dragIndex && rawGap <= end ? dragIndex : rawGap;
  const prevIndex = gap === dragIndex ? dragIndex - 1 : gap - 1;
  const prev = prevIndex >= 0 ? rows[prevIndex] : null;
  const next = gap === dragIndex ? rows[end] : rows[gap];
  const inSubtree = (i: number) => i >= dragIndex && i < end;

  const maxDepth = prev ? prev.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, dragged.depth + Math.round(dx / INDENT)));

  let parentIndex = -1;
  if (depth > 0) {
    for (let i = prevIndex; i >= 0; i--) {
      if (inSubtree(i)) continue;
      if (rows[i].depth === depth - 1) {
        parentIndex = i;
        break;
      }
    }
  }
  let index = 0;
  for (let i = parentIndex + 1; i <= prevIndex; i++) {
    if (!inSubtree(i) && rows[i].depth === depth) index++;
  }
  return { gap, depth, parentId: parentIndex >= 0 ? rows[parentIndex].id : null, index };
}

export function GridBody({ model, layout, rowsFrom, rowsTo, height }: GridBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const selectedId = useStore((s) => s.ui.selectedId);
  const editingId = useStore((s) => s.ui.editingId);
  const showCritical = useStore((s) => s.ui.showCritical);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [dropRow, setDropRow] = useState<number | null>(null);
  const { doc, analysis, rows } = model;
  const personMode = !!model.person;
  const critical = showCritical ? analysis.critical().items : null;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const onGripDown = useCallback((e: ReactPointerEvent, row: DisplayRow) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const dragIndex = rowsRef.current.findIndex((r) => r.id === row.id);
    let current: Projection | null = null;
    select(row.id);
    document.body.style.cursor = 'grabbing';
    const onMove = (ev: PointerEvent) => {
      const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
      const all = rowsRef.current;
      const gap = Math.max(0, Math.min(all.length, Math.round((ev.clientY - top) / ROW_H)));
      current = project(all, dragIndex, gap, ev.clientX - startX);
      setProjection(current);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setProjection(null);
      if (current) moveItem(row.id, current.parentId, current.index);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const rowAt = (clientY: number) => {
    const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
    return Math.floor((clientY - top) / ROW_H);
  };

  return (
    <div
      ref={bodyRef}
      className="relative"
      style={{ height }}
      onDragOver={(e) => {
        if (!hasPerson(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropRow(rowAt(e.clientY));
      }}
      onDragLeave={() => setDropRow(null)}
      onDrop={(e) => {
        const personId = e.dataTransfer.getData(PERSON_MIME);
        const row = rows[rowAt(e.clientY)];
        setDropRow(null);
        if (personId && row) {
          e.preventDefault();
          assignPerson(row.id, personId);
          select(row.id);
        }
      }}
    >
      {rows.slice(rowsFrom, rowsTo).map((row, i) => {
        const item = doc.items[row.id];
        if (!item) return null;
        const index = rowsFrom + i;
        const people = item.assigneeIds.map((id) => doc.people[id]).filter(Boolean);
        return (
          <GridRow
            key={row.id}
            row={row}
            index={index}
            item={item}
            layout={layout}
            people={people}
            levelLabel={levelLabel(doc, row.depth)}
            levelColor={levelStyle(doc.project, row.depth).color}
            breadcrumb={
              personMode
                ? ancestors(doc.items, row.id)
                    .map((a) => a.name)
                    .join(' › ')
                : ''
            }
            workdays={analysis.bounds.get(row.id)?.w ?? 0}
            selected={row.id === selectedId}
            editing={row.id === editingId}
            critical={critical?.has(row.id) ?? false}
            overrun={analysis.overruns.get(row.id) ?? 0}
            personMode={personMode}
            dropActive={dropRow === index}
            onGripDown={onGripDown}
          />
        );
      })}
      {projection && (
        <div
          className="pointer-events-none absolute right-2 z-10 h-0.5 rounded bg-accent"
          style={{
            top: projection.gap * ROW_H - 1,
            left: HANDLE_W + (layout.showWbs ? COL_WIDTH.wbs : 0) + 6 + projection.depth * INDENT,
          }}
        >
          <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full border-2 border-accent bg-surface" />
        </div>
      )}
    </div>
  );
}
