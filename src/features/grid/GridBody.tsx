import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { levelStyle } from '../../domain/styles';
import { ancestors } from '../../domain/tree';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { assignPerson, insertItemAt, levelLabel, moveItem, select } from '../../store/actions';
import type { DisplayModel, DisplayRow } from '../../store/analysis';
import { useStore } from '../../store/projectStore';
import { legible } from '../common/color';
import { hasPerson, PERSON_MIME } from '../common/personDrag';
import { ROW_H } from '../gantt/scale';
import { COL_WIDTH, HANDLE_W, INDENT, type ColumnLayout } from './columns';
import { GridRow } from './GridRow';
import { placementAt, rootPlacement } from './insertion';

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
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const selectedId = useStore((s) => s.ui.selectedId);
  const editingId = useStore((s) => s.ui.editingId);
  const showCritical = useStore((s) => s.ui.showCritical);
  const dark = useStore((s) => s.ui.dark);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [dropRow, setDropRow] = useState<number | null>(null);
  const [hoverGap, setHoverGap] = useState<number | null>(null);
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

  // Hovering a row boundary reveals a "+" line to insert a new item right there.
  const onMouseMove = (e: ReactMouseEvent) => {
    if (personMode || projection) return;
    const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
    const y = e.clientY - top;
    const k = Math.round(y / ROW_H);
    const gap = Math.abs(y - k * ROW_H) <= 6 && k >= 1 && k <= rows.length ? k : null;
    if (gap !== hoverGap) setHoverGap(gap);
  };
  const insertPlacement = hoverGap !== null ? placementAt(doc, rows, hoverGap) : null;
  const indentLeft = HANDLE_W + (layout.showWbs ? COL_WIDTH.wbs : 0) + 6;
  const root = rootPlacement(doc);

  return (
    <div
      ref={bodyRef}
      className="relative"
      style={{ height }}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHoverGap(null)}
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
            levelColor={legible(levelStyle(doc.project, row.depth).color, dark)}
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
      {insertPlacement && hoverGap !== null && !projection && (
        <button
          className="group/insert absolute left-0 right-0 z-10 h-3 cursor-pointer"
          style={{ top: hoverGap * ROW_H - 6 }}
          title={t('grid.insertHere', { level: levelLabel(doc, insertPlacement.depth) })}
          aria-label={t('grid.insertHere', { level: levelLabel(doc, insertPlacement.depth) })}
          onClick={() => {
            setHoverGap(null);
            insertItemAt(insertPlacement.parentId, insertPlacement.index);
          }}
        >
          <span
            className="absolute right-2 top-[5px] h-0.5 rounded bg-accent/70"
            style={{ left: indentLeft + insertPlacement.depth * INDENT }}
          />
          <span
            className="absolute top-[-3px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-accent-fg shadow"
            style={{ left: Math.max(2, indentLeft + insertPlacement.depth * INDENT - 22) }}
          >
            <Plus size={12} strokeWidth={3} />
          </span>
        </button>
      )}
      {!personMode && rows.length > 0 && (
        <button
          className="absolute left-0 right-0 flex items-center gap-1.5 text-[12px] text-muted hover:bg-surface-2/70 hover:text-accent"
          style={{ top: rows.length * ROW_H, height: ROW_H, paddingLeft: indentLeft }}
          onClick={() => insertItemAt(null, root.index)}
        >
          <Plus size={14} /> {t('grid.addRoot', { level: levelLabel(doc, 0) })}
        </button>
      )}
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
