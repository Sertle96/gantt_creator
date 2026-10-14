import { memo, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toDay, todayISO } from '../../domain/dates';
import type { Dependency, Item, Side } from '../../domain/types';
import {
  addDependency,
  assignPerson,
  cancelDrag,
  finishDrag,
  previewDrag,
  select,
  selectDependency,
  type DragKind,
} from '../../store/actions';
import type { DisplayModel } from '../../store/analysis';
import { useStore } from '../../store/projectStore';
import { hasPerson, PERSON_MIME } from '../common/personDrag';
import { DependencyLayer } from './DependencyLayer';
import { barGeom, itemColor, MILESTONE_R, type BarGeom } from './geometry';
import { LinkPopover } from './LinkPopover';
import { ROW_H, TIERS, ticks, type Scale } from './scale';

interface TimelineBodyProps {
  model: DisplayModel;
  scale: Scale;
  rowsFrom: number;
  rowsTo: number;
  fromX: number;
  toX: number;
  height: number;
}

interface LinkDrag {
  fromId: string;
  fromSide: Side;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  targetId: string | null;
  targetSide: Side;
}

const DRAG_THRESHOLD = 3;
const EDGE = 7;

export function TimelineBody({
  model,
  scale,
  rowsFrom,
  rowsTo,
  fromX,
  toX,
  height,
}: TimelineBodyProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectedId = useStore((s) => s.ui.selectedId);
  const selectedDepId = useStore((s) => s.ui.selectedDepId);
  const showCritical = useStore((s) => s.ui.showCritical);
  const view = useStore((s) => s.ui.view);
  const [linking, setLinking] = useState<LinkDrag | null>(null);
  const [dropRow, setDropRow] = useState<number | null>(null);
  const [depMenu, setDepMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const { doc, analysis, rows, rowIndex, person } = model;
  const critical = showCritical ? analysis.critical() : null;

  const geomCache = new Map<string, BarGeom>();
  const geom = (id: string): BarGeom | null => {
    let g = geomCache.get(id);
    if (g) return g;
    const row = rowIndex.get(id);
    const item = doc.items[id];
    if (row === undefined || !item) return null;
    g = barGeom(item, (analysis.tree.children.get(id)?.length ?? 0) > 0, row, scale);
    geomCache.set(id, g);
    return g;
  };

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const geomRef = useRef(geom);
  geomRef.current = geom;

  const startBarDrag = useCallback(
    (e: ReactPointerEvent, id: string, kind: DragKind) => {
      const startX = e.clientX;
      let delta = 0;
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        if (!moved && Math.abs(dx) < DRAG_THRESHOLD) return;
        moved = true;
        document.body.style.cursor = kind === 'move' ? 'grabbing' : 'ew-resize';
        const next = Math.round(dx / scale.ppd);
        if (next !== delta) {
          delta = next;
          previewDrag(kind, id, delta);
        }
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          moved = false;
          delta = 0;
          cancelDrag();
          cleanup();
        }
      };
      const onUp = () => {
        cleanup();
        if (moved) finishDrag(kind, id, delta);
        else select(id);
      };
      const cleanup = () => {
        document.body.style.cursor = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
    },
    [scale.ppd],
  );

  const startLinkDrag = useCallback((e: ReactPointerEvent, fromId: string, fromSide: Side) => {
    const g = geomRef.current(fromId);
    if (!g) return;
    const x1 = fromSide === 'end' ? g.ax2 : g.ax1;
    const p = localPoint(e);
    let state: LinkDrag = {
      fromId,
      fromSide,
      x1,
      y1: g.y,
      x2: p.x,
      y2: p.y,
      targetId: null,
      targetSide: 'start',
    };
    setLinking(state);
    const onMove = (ev: PointerEvent) => {
      const q = localPoint(ev);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-bar-id]');
      const targetId = el?.getAttribute('data-bar-id') ?? null;
      let targetSide: Side = 'start';
      if (targetId) {
        const tg = geomRef.current(targetId);
        if (tg) targetSide = q.x < (tg.x1 + tg.x2) / 2 ? 'start' : 'end';
      }
      state = {
        ...state,
        x2: q.x,
        y2: q.y,
        targetId: targetId === fromId ? null : targetId,
        targetSide,
      };
      setLinking(state);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLinking(null);
      if (state.targetId)
        addDependency(state.fromId, state.fromSide, state.targetId, state.targetSide);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('[data-dep-id]')) return;
    const handle = target.closest('[data-link-side]');
    const bar = target.closest('[data-bar-id]');
    if (handle && bar) {
      e.preventDefault();
      startLinkDrag(
        e,
        bar.getAttribute('data-bar-id')!,
        handle.getAttribute('data-link-side') as Side,
      );
      return;
    }
    if (bar) {
      e.preventDefault();
      const kind = (target.closest('[data-drag]')?.getAttribute('data-drag') ?? 'move') as DragKind;
      startBarDrag(e, bar.getAttribute('data-bar-id')!, kind);
      return;
    }
    const row = Math.floor(localPoint(e).y / ROW_H);
    select(rows[row]?.id ?? null);
    selectDependency(null);
  };

  const openDepMenu = useCallback((dep: Dependency, x: number, y: number) => {
    selectDependency(dep.id);
    setDepMenu({ id: dep.id, x, y });
  }, []);

  // Background: weekends, grid lines, today.
  const bottomUnit = TIERS[scale.zoom][1];
  const topUnit = TIERS[scale.zoom][0];
  const showOffDays = scale.zoom === 'day' || scale.zoom === 'week';
  const offDays: number[] = [];
  if (showOffDays) {
    for (let d = scale.dayAt(Math.max(0, fromX)); d <= scale.dayAt(toX) + 1; d++) {
      if (!analysis.cal.isWorkday(d)) offDays.push(d);
    }
  }
  const noLabel = () => '';
  const minorLines = scale.zoom === 'day' ? [] : ticks(scale, bottomUnit, fromX, toX, noLabel);
  const majorLines = ticks(scale, topUnit, fromX, toX, noLabel);
  const today = toDay(todayISO());
  const todayX = scale.x(today) + scale.ppd / 2;

  const visible = rows.slice(rowsFrom, rowsTo);
  const selectedRow = selectedId ? rowIndex.get(selectedId) : undefined;
  const ownColor = person && view.mode === 'person' ? doc.people[view.personId]?.color : undefined;

  return (
    <>
      <svg
        ref={svgRef}
        width={scale.width}
        height={height}
        className={`block select-none ${linking ? 'linking' : ''}`}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => {
          if (!hasPerson(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropRow(Math.floor(localPoint(e).y / ROW_H));
        }}
        onDragLeave={() => setDropRow(null)}
        onDrop={(e) => {
          const personId = e.dataTransfer.getData(PERSON_MIME);
          const row = rows[Math.floor(localPoint(e).y / ROW_H)];
          setDropRow(null);
          if (personId && row) {
            e.preventDefault();
            assignPerson(row.id, personId);
            select(row.id);
          }
        }}
      >
        <defs>
          {(['link', 'link-soft', 'critical', 'accent'] as const).map((k) => (
            <marker
              key={k}
              id={`arrow-${k}`}
              viewBox="0 0 10 10"
              refX={9}
              refY={5}
              markerUnits="userSpaceOnUse"
              markerWidth={9}
              markerHeight={9}
              orient="auto-start-reverse"
            >
              <path
                d="M0,1 L10,5 L0,9 z"
                style={{ fill: k === 'accent' ? 'rgb(var(--accent))' : `var(--${k})` }}
              />
            </marker>
          ))}
        </defs>

        {offDays.map((d) => (
          <rect
            key={d}
            x={scale.x(d)}
            y={0}
            width={scale.ppd}
            height={height}
            fill="var(--weekend)"
          />
        ))}
        {minorLines.map((tk) => (
          <line
            key={`m${tk.day}`}
            x1={tk.x}
            x2={tk.x}
            y1={0}
            y2={height}
            stroke="var(--grid-line)"
            strokeOpacity={0.5}
          />
        ))}
        {majorLines.map((tk) => (
          <line
            key={`M${tk.day}`}
            x1={tk.x}
            x2={tk.x}
            y1={0}
            y2={height}
            stroke="var(--grid-line)"
          />
        ))}
        {selectedRow !== undefined && (
          <rect
            x={0}
            y={selectedRow * ROW_H}
            width={scale.width}
            height={ROW_H}
            fill="var(--row-selected)"
          />
        )}
        {dropRow !== null && rows[dropRow] && (
          <rect
            x={0}
            y={dropRow * ROW_H}
            width={scale.width}
            height={ROW_H}
            fill="rgb(var(--accent) / 0.12)"
            stroke="rgb(var(--accent))"
            strokeDasharray="4 3"
          />
        )}
        <line
          x1={todayX}
          x2={todayX}
          y1={0}
          y2={height}
          stroke="var(--today)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        <DependencyLayer
          model={model}
          geom={geom}
          rowsFrom={rowsFrom}
          rowsTo={rowsTo}
          critical={critical?.deps ?? null}
          selectedDepId={selectedDepId}
          onOpenMenu={openDepMenu}
          part="lines"
        />

        {visible.map((row) => {
          const item = doc.items[row.id];
          const g = geom(row.id);
          if (!item || !g) return null;
          const isContext = row.role === 'context';
          const dim = (critical && !critical.items.has(row.id)) || isContext;
          return (
            <BarView
              key={row.id}
              item={item}
              g={g}
              color={
                isContext
                  ? '#94a3b8'
                  : critical?.items.has(row.id)
                    ? 'var(--critical)'
                    : ((ownColor && row.role === 'own' ? ownColor : undefined) ??
                      itemColor(doc, row.id) ??
                      '')
              }
              dim={!!dim}
              selected={row.id === selectedId}
              linkTarget={linking?.targetId === row.id}
              overrun={analysis.overruns.get(row.id) ?? 0}
            />
          );
        })}

        <DependencyLayer
          model={model}
          geom={geom}
          rowsFrom={rowsFrom}
          rowsTo={rowsTo}
          critical={critical?.deps ?? null}
          selectedDepId={selectedDepId}
          onOpenMenu={openDepMenu}
          part="toggles"
        />

        {linking && (
          <g pointerEvents="none">
            <path
              d={`M${linking.x1},${linking.y1}L${linking.x2},${linking.y2}`}
              stroke="rgb(var(--accent))"
              strokeWidth={1.75}
              strokeDasharray="5 4"
              fill="none"
              markerEnd="url(#arrow-accent)"
            />
            {linking.targetId &&
              (() => {
                const tg = geom(linking.targetId);
                if (!tg) return null;
                const x = linking.targetSide === 'start' ? tg.ax1 : tg.ax2;
                return (
                  <circle
                    cx={x}
                    cy={tg.y}
                    r={6}
                    fill="rgb(var(--accent))"
                    fillOpacity={0.35}
                    stroke="rgb(var(--accent))"
                  />
                );
              })()}
          </g>
        )}
      </svg>
      {depMenu && doc.dependencies[depMenu.id] && (
        <LinkPopover
          dep={doc.dependencies[depMenu.id]}
          x={depMenu.x}
          y={depMenu.y}
          onClose={() => setDepMenu(null)}
        />
      )}
    </>
  );
}

interface BarViewProps {
  item: Item;
  g: BarGeom;
  color: string;
  dim: boolean;
  selected: boolean;
  linkTarget: boolean;
  overrun: number;
}

const BarView = memo(function BarView({
  item,
  g,
  color,
  dim,
  selected,
  linkTarget,
  overrun,
}: BarViewProps) {
  const { t } = useTranslation();
  const opacity = dim ? 0.4 : 1;
  const stroke = selected ? 'rgb(var(--accent))' : linkTarget ? 'rgb(var(--accent))' : 'none';
  const label = (x: number, extra?: string, tone?: string) => (
    <text x={x} y={g.y + 4} fontSize={11.5} fill={tone ?? 'rgb(var(--muted))'} pointerEvents="none">
      {item.name}
      {extra && <tspan fill="var(--critical)" fontWeight={600}>{`  ${extra}`}</tspan>}
    </text>
  );
  const handles = (
    <>
      <circle
        className="link-handle"
        data-link-side="start"
        cx={g.ax1 - 8}
        cy={g.y}
        r={4.5}
        fill="rgb(var(--surface))"
        stroke="rgb(var(--accent))"
        strokeWidth={1.5}
        style={{ cursor: 'crosshair' }}
      />
      <circle
        className="link-handle"
        data-link-side="end"
        cx={g.ax2 + 8}
        cy={g.y}
        r={4.5}
        fill="rgb(var(--surface))"
        stroke="rgb(var(--accent))"
        strokeWidth={1.5}
        style={{ cursor: 'crosshair' }}
      />
    </>
  );
  const groupClass = `bar-group ${linkTarget ? 'is-link-target' : ''}`;

  if (g.shape === 'milestone') {
    const r = MILESTONE_R;
    return (
      <g className={groupClass} data-bar-id={item.id} opacity={opacity} style={{ cursor: 'grab' }}>
        <rect
          x={g.x1 - r - 4}
          y={g.y - r - 4}
          width={2 * r + 8}
          height={2 * r + 8}
          fill="transparent"
        />
        <path
          d={`M${g.x1},${g.y - r}L${g.x1 + r},${g.y}L${g.x1},${g.y + r}L${g.x1 - r},${g.y}Z`}
          fill={color || 'var(--bar-summary)'}
          stroke={stroke}
          strokeWidth={2}
        />
        {handles}
        {label(g.x2 + 18)}
      </g>
    );
  }

  if (g.shape === 'deadline') {
    const top = g.y - 11;
    return (
      <g className={groupClass} data-bar-id={item.id} opacity={opacity} style={{ cursor: 'grab' }}>
        <rect x={g.x1 - 6} y={top - 2} width={20} height={26} fill="transparent" />
        <line x1={g.x1} x2={g.x1} y1={top} y2={g.y + 11} stroke="var(--critical)" strokeWidth={2} />
        <path
          d={`M${g.x1},${top}L${g.x1 + 11},${top + 4}L${g.x1},${top + 8}Z`}
          fill="var(--critical)"
          stroke={stroke}
          strokeWidth={1.5}
        />
        {handles}
        {label(g.x1 + 18, overrun ? `−${t('common.workdays', { count: overrun })}` : undefined)}
      </g>
    );
  }

  const w = g.x2 - g.x1;
  if (g.shape === 'summary') {
    const y = g.y - 5;
    return (
      <g className={groupClass} data-bar-id={item.id} opacity={opacity} style={{ cursor: 'grab' }}>
        <rect x={g.x1} y={g.y - 9} width={w} height={18} fill="transparent" />
        <rect
          x={g.x1}
          y={y}
          width={w}
          height={8}
          rx={1.5}
          fill={color || 'var(--bar-summary)'}
          stroke={stroke}
          strokeWidth={2}
        />
        <path
          d={`M${g.x1},${y + 8}l0,6l6,-6z M${g.x2},${y + 8}l0,6l-6,-6z`}
          fill={color || 'var(--bar-summary)'}
        />
        {handles}
        {label(g.x2 + 18, undefined, 'rgb(var(--text))')}
      </g>
    );
  }

  const fill = color || 'var(--bar)';
  const progressW = (w * Math.max(0, Math.min(100, item.progress))) / 100;
  return (
    <g className={groupClass} data-bar-id={item.id} opacity={opacity} style={{ cursor: 'grab' }}>
      <rect
        x={g.x1}
        y={g.y - 9}
        width={w}
        height={18}
        rx={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {progressW > 0 && (
        <rect
          x={g.x1}
          y={g.y - 9}
          width={progressW}
          height={18}
          rx={4}
          fill="black"
          fillOpacity={0.22}
          pointerEvents="none"
        />
      )}
      {item.status === 'done' && (
        <path
          d={`M${g.x1 + 6},${g.y}l3,3l6,-6`}
          stroke="white"
          strokeWidth={2}
          fill="none"
          pointerEvents="none"
        />
      )}
      {w >= 14 && (
        <>
          <rect
            data-drag="resize-start"
            x={g.x1}
            y={g.y - 9}
            width={EDGE}
            height={18}
            fill="transparent"
            style={{ cursor: 'ew-resize' }}
          />
          <rect
            data-drag="resize-end"
            x={g.x2 - EDGE}
            y={g.y - 9}
            width={EDGE}
            height={18}
            fill="transparent"
            style={{ cursor: 'ew-resize' }}
          />
        </>
      )}
      {handles}
      {label(g.x2 + 18)}
    </g>
  );
});
