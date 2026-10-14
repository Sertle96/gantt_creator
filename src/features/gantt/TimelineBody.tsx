import { memo, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toDay, toISO, todayISO } from '../../domain/dates';
import { hasOwnStyle, resolveStyle } from '../../domain/styles';
import type {
  BarFill,
  Dependency,
  Item,
  LabelPosition,
  ProjectDoc,
  Side,
} from '../../domain/types';
import {
  insertItemAt,
  levelLabel,
  addDependency,
  assignPerson,
  cancelDrag,
  finishDrag,
  previewDrag,
  select,
  selectDependency,
  type DragKind,
} from '../../store/actions';
import type { DisplayModel, DisplayRow } from '../../store/analysis';
import { useStore } from '../../store/projectStore';
import { legible } from '../common/color';
import { hasPerson, PERSON_MIME } from '../common/personDrag';
import { DependencyLayer } from './DependencyLayer';
import { barGeom, MILESTONE_R, type BarGeom } from './geometry';
import { placementAt, rootPlacement } from '../grid/insertion';
import { LinkPopover } from './LinkPopover';
import { StylePopover } from './StylePopover';
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

/** Preview / range of a bar being drawn: `gap` is the insert position, `root` the bottom lane. */
interface Draw {
  gap: number | 'root';
  from: number;
  to: number;
  active: boolean;
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
  const dark = useStore((s) => s.ui.dark);
  const [linking, setLinking] = useState<LinkDrag | null>(null);
  const [dropRow, setDropRow] = useState<number | null>(null);
  const [styleMenu, setStyleMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [draw, setDraw] = useState<Draw | null>(null);
  const drawing = useRef(false);
  const [depMenu, setDepMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const { doc, analysis, rows, rowIndex, person } = model;
  const canDraw = !person;
  /** Insert gap nearest to `y`; below the last row is the lane for new top-level items. */
  const gapAt = (y: number): number | 'root' =>
    y > rows.length * ROW_H ? 'root' : Math.max(0, Math.min(rows.length, Math.round(y / ROW_H)));
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
    const start = localPoint(e);
    if (!canDraw) {
      selectAt(start.y);
      return;
    }
    // Empty space: a click selects the row, a drag draws a new bar.
    e.preventDefault();
    const gap = gapAt(start.y);
    const fromDay = scale.dayAt(start.x);
    let moved = false;
    let toDay = fromDay;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - e.clientX) < DRAG_THRESHOLD) return;
      moved = true;
      drawing.current = true;
      toDay = scale.dayAt(localPoint(ev).x);
      setDraw({ gap, from: fromDay, to: toDay, active: true });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      drawing.current = false;
      setDraw(null);
      if (!moved) {
        selectAt(start.y);
        return;
      }
      const place = gap === 'root' ? rootPlacement(doc) : placementAt(doc, rows, gap);
      insertItemAt(place.parentId, place.index, {
        start: toISO(Math.min(fromDay, toDay)),
        end: toISO(Math.max(fromDay, toDay)),
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!canDraw || drawing.current || linking || e.buttons) return;
    const target = e.target as Element;
    if (target.closest('[data-bar-id],[data-dep-id]')) {
      if (draw) setDraw(null);
      return;
    }
    const p = localPoint(e);
    const gap = gapAt(p.y);
    const day = scale.dayAt(p.x);
    if (draw?.gap !== gap || draw.from !== day) setDraw({ gap, from: day, to: day, active: false });
  };

  function selectAt(y: number) {
    select(rows[Math.floor(y / ROW_H)]?.id ?? null);
    selectDependency(null);
  }

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

  const bars = visible.flatMap((row) => {
    const item = doc.items[row.id];
    const g = geom(row.id);
    if (!item || !g) return [];
    const style = resolveStyle(doc.project, item, analysis.depth.get(row.id) ?? 0);
    const isContext = row.role === 'context';
    if (isContext) style.color = '#94a3b8';
    else if (critical?.items.has(row.id)) style.color = 'var(--critical)';
    else if (ownColor && row.role === 'own' && !hasOwnStyle(item)) style.color = ownColor;
    else if (g.shape === 'deadline' && !hasOwnStyle(item)) style.color = 'var(--critical)';
    style.color = legible(style.color, dark);
    const dim = !!(critical && !critical.items.has(row.id)) || isContext;
    return [{ row, item, g, style, dim }];
  });
  const stripeColors = [
    ...new Set(bars.filter((b) => b.style.fill === 'striped').map((b) => b.style.color)),
  ];

  return (
    <>
      <svg
        ref={svgRef}
        width={scale.width}
        height={height}
        className={`block select-none ${linking ? 'linking' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => !drawing.current && setDraw(null)}
        style={{ cursor: draw ? 'crosshair' : undefined }}
        onContextMenu={(e) => {
          e.preventDefault();
          const bar = (e.target as Element).closest('[data-bar-id]');
          if (!bar) return;
          const id = bar.getAttribute('data-bar-id')!;
          select(id);
          setStyleMenu({ id, x: e.clientX, y: e.clientY });
        }}
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
          {stripeColors.map((c) => (
            <pattern
              key={c}
              id={stripeId(c)}
              width={7}
              height={7}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={7} height={7} fill={c} fillOpacity={0.22} />
              <rect width={3} height={7} fill={c} />
            </pattern>
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

        {bars.map(({ row, item, g, style, dim }) => (
          <BarView
            key={row.id}
            item={item}
            g={g}
            color={style.color}
            fill={style.fill}
            labelPos={style.label}
            dim={dim}
            selected={row.id === selectedId}
            linkTarget={linking?.targetId === row.id}
            overrun={analysis.overruns.get(row.id) ?? 0}
          />
        ))}

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

        {draw && <DrawPreview draw={draw} doc={doc} rows={rows} scale={scale} />}

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
      {styleMenu && doc.items[styleMenu.id] && (
        <StylePopover
          itemId={styleMenu.id}
          x={styleMenu.x}
          y={styleMenu.y}
          onClose={() => setStyleMenu(null)}
        />
      )}
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
  fill: BarFill;
  labelPos: LabelPosition;
  dim: boolean;
  selected: boolean;
  linkTarget: boolean;
  overrun: number;
}

const stripeId = (color: string) => `stripes-${color.replace(/[^a-z0-9]/gi, '')}`;

function paint(fill: BarFill, color: string) {
  switch (fill) {
    case 'soft':
      return { fill: color, fillOpacity: 0.28, stroke: color, strokeWidth: 1.25 };
    case 'outline':
      return { fill: 'rgb(var(--surface))', fillOpacity: 1, stroke: color, strokeWidth: 1.75 };
    case 'striped':
      return { fill: `url(#${stripeId(color)})`, fillOpacity: 1, stroke: color, strokeWidth: 1.25 };
    default:
      return { fill: color, fillOpacity: 1, stroke: 'none', strokeWidth: 0 };
  }
}

const CHAR_W = 6.4;

const BarView = memo(function BarView({
  item,
  g,
  color,
  fill,
  labelPos,
  dim,
  selected,
  linkTarget,
  overrun,
}: BarViewProps) {
  const { t } = useTranslation();
  const highlight = selected || linkTarget;
  const p = paint(fill, color);
  const extra = overrun ? `−${t('common.workdays', { count: overrun })}` : undefined;

  const outside = (x: number, tone = 'rgb(var(--muted))') =>
    labelPos === 'none' && !extra ? null : (
      <text x={x} y={g.y + 4} fontSize={11.5} fill={tone} pointerEvents="none">
        {labelPos !== 'none' && item.name}
        {extra && <tspan fill="var(--critical)" fontWeight={600}>{`  ${extra}`}</tspan>}
      </text>
    );
  const handles = (['start', 'end'] as const).map((side) => (
    <circle
      key={side}
      className="link-handle"
      data-link-side={side}
      cx={side === 'start' ? g.ax1 - 8 : g.ax2 + 8}
      cy={g.y}
      r={4.5}
      fill="rgb(var(--surface))"
      stroke="rgb(var(--accent))"
      strokeWidth={1.5}
      style={{ cursor: 'crosshair' }}
    />
  ));
  const groupProps = {
    className: `bar-group ${linkTarget ? 'is-link-target' : ''}`,
    'data-bar-id': item.id,
    opacity: dim ? 0.4 : 1,
    style: { cursor: 'grab' },
  };
  const ring = { fill: 'none', stroke: 'rgb(var(--accent))', strokeWidth: 2 };

  if (g.shape === 'milestone') {
    const r = MILESTONE_R;
    const diamond = (k: number) =>
      `M${g.x1},${g.y - k}L${g.x1 + k},${g.y}L${g.x1},${g.y + k}L${g.x1 - k},${g.y}Z`;
    return (
      <g {...groupProps}>
        <rect
          x={g.x1 - r - 4}
          y={g.y - r - 4}
          width={2 * r + 8}
          height={2 * r + 8}
          fill="transparent"
        />
        {highlight && <path d={diamond(r + 3)} {...ring} />}
        <path d={diamond(r)} {...p} strokeWidth={fill === 'solid' ? 0 : 1.5} />
        {handles}
        {outside(g.x2 + 18)}
      </g>
    );
  }

  if (g.shape === 'deadline') {
    const top = g.y - 11;
    return (
      <g {...groupProps}>
        <rect x={g.x1 - 6} y={top - 2} width={20} height={26} fill="transparent" />
        {highlight && <rect x={g.x1 - 4} y={top - 3} width={19} height={28} rx={3} {...ring} />}
        <line x1={g.x1} x2={g.x1} y1={top} y2={g.y + 11} stroke={color} strokeWidth={2} />
        <path d={`M${g.x1},${top}L${g.x1 + 11},${top + 4}L${g.x1},${top + 8}Z`} {...p} />
        {handles}
        {outside(g.x1 + 18)}
      </g>
    );
  }

  const w = g.x2 - g.x1;
  if (g.shape === 'summary') {
    const y = g.y - 5;
    return (
      <g {...groupProps}>
        <rect x={g.x1} y={g.y - 9} width={w} height={18} fill="transparent" />
        {highlight && <rect x={g.x1 - 3} y={y - 3} width={w + 6} height={14} rx={3} {...ring} />}
        <rect x={g.x1} y={y} width={w} height={8} rx={1.5} {...p} />
        <path d={`M${g.x1},${y + 8}l0,6l6,-6z M${g.x2},${y + 8}l0,6l-6,-6z`} fill={color} />
        {handles}
        {outside(g.x2 + 18, 'rgb(var(--text))')}
      </g>
    );
  }

  const progressW = (w * Math.max(0, Math.min(100, item.progress))) / 100;
  const maxChars = Math.floor((w - 12) / CHAR_W);
  const inside = labelPos === 'inside' && maxChars >= 3;
  const insideText =
    item.name.length > maxChars ? `${item.name.slice(0, Math.max(1, maxChars - 1))}…` : item.name;
  const onBar = fill === 'solid' ? 'white' : 'rgb(var(--text))';
  return (
    <g {...groupProps}>
      {highlight && <rect x={g.x1 - 3} y={g.y - 12} width={w + 6} height={24} rx={6} {...ring} />}
      <rect x={g.x1} y={g.y - 9} width={w} height={18} rx={4} {...p} />
      {progressW > 0 && (
        <rect
          x={g.x1}
          y={g.y - 9}
          width={progressW}
          height={18}
          rx={4}
          fill={fill === 'solid' ? 'black' : color}
          fillOpacity={fill === 'solid' ? 0.22 : 0.35}
          pointerEvents="none"
        />
      )}
      {item.status === 'done' && !inside && (
        <path
          d={`M${g.x1 + 6},${g.y}l3,3l6,-6`}
          stroke={onBar}
          strokeWidth={2}
          fill="none"
          pointerEvents="none"
        />
      )}
      {inside && (
        <text
          x={g.x1 + 6}
          y={g.y + 4}
          fontSize={11.5}
          fontWeight={500}
          fill={onBar}
          pointerEvents="none"
        >
          {insideText}
        </text>
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
      {(!inside || extra) && outside(g.x2 + 18)}
    </g>
  );
});

interface DrawPreviewProps {
  draw: Draw;
  doc: ProjectDoc;
  rows: DisplayRow[];
  scale: Scale;
}

/** Dashed ghost bar where a new item would be inserted, labelled with its level. */
function DrawPreview({ draw, doc, rows, scale }: DrawPreviewProps) {
  const { t } = useTranslation();
  const from = Math.min(draw.from, draw.to);
  const to = Math.max(draw.from, draw.to);
  const x1 = scale.x(from);
  const x2 = Math.max(x1 + 6, scale.x(to + 1));
  const lane = draw.gap === 'root';
  const y = lane ? rows.length * ROW_H + ROW_H / 2 : (draw.gap as number) * ROW_H;
  const h = lane ? 18 : 12;
  const place = lane ? rootPlacement(doc) : placementAt(doc, rows, draw.gap as number);
  const label = `+ ${levelLabel(doc, place.depth)}`;
  return (
    <g pointerEvents="none">
      {!lane && (
        <line
          x1={0}
          x2={scale.width}
          y1={y}
          y2={y}
          stroke="rgb(var(--accent))"
          strokeOpacity={draw.active ? 0.6 : 0.25}
          strokeDasharray="4 4"
        />
      )}
      <rect
        x={x1}
        y={y - h / 2}
        width={x2 - x1}
        height={h}
        rx={4}
        fill="rgb(var(--accent))"
        fillOpacity={draw.active ? 0.3 : 0.12}
        stroke="rgb(var(--accent))"
        strokeDasharray={draw.active ? undefined : '4 3'}
        strokeWidth={1.5}
      />
      <text x={x2 + 8} y={y + 4} fontSize={11.5} fontWeight={600} fill="rgb(var(--accent))">
        {label}
        {!draw.active && (
          <tspan fontWeight={400} fill="rgb(var(--muted))">{`  ${t('grid.drawHint')}`}</tspan>
        )}
      </text>
    </g>
  );
}
