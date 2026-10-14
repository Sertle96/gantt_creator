import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toDay, todayISO } from '../../domain/dates';
import { addItem } from '../../store/actions';
import { useDisplay } from '../../store/analysis';
import { setUi, useStore } from '../../store/projectStore';
import { TimelineBody } from '../gantt/TimelineBody';
import { TimelineHeader } from '../gantt/TimelineHeader';
import { HEADER_H, makeScale, ROW_H, tierFor } from '../gantt/scale';
import { GRID_MAX, GRID_MIN, layoutColumns } from '../grid/columns';
import { GridBody } from '../grid/GridBody';
import { GridHeader } from '../grid/GridHeader';

const OVERSCAN = 8;

/** One scroll container: sticky grid on the left, timeline on the right, sticky header on top. */
export function Planner() {
  const { t } = useTranslation();
  const model = useDisplay();
  const doc = useStore((s) => s.doc);
  const zoom = useStore((s) => s.ui.zoom);
  const range = useStore((s) => s.ui.range);
  const gridWidth = useStore((s) => s.ui.gridWidth);
  const scrollRequest = useStore((s) => s.ui.scrollRequest);
  const selectedId = useStore((s) => s.ui.selectedId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasModel = model !== null;
  const [viewport, setViewport] = useState({ top: 0, left: 0, width: 1200, height: 800 });
  const custom = zoom === 'custom' && range ? range : null;
  // Width the custom range is fitted into (0 when a fixed zoom is active).
  const fitWidth = custom ? Math.max(200, viewport.width - gridWidth - 16) : 0;

  // Scale follows the committed document so the origin does not jump while dragging.
  const scale = useMemo(() => {
    const items = doc ? Object.values(doc.items) : [];
    const today = toDay(todayISO());
    let min = Math.min(doc ? toDay(doc.project.startDate) : today, today);
    let max = today;
    for (const item of items) {
      min = Math.min(min, toDay(item.start));
      max = Math.max(max, toDay(item.end));
    }
    if (custom) {
      const from = toDay(custom.from);
      const to = Math.max(from, toDay(custom.to));
      const ppd = fitWidth / (to - from + 1);
      return makeScale(tierFor(ppd), Math.min(min, from), Math.max(max, to), ppd);
    }
    return makeScale(zoom === 'custom' ? 'week' : zoom, min, max);
  }, [doc, zoom, custom, fitWidth]);

  const layout = layoutColumns(gridWidth);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setViewport({
        top: el.scrollTop,
        left: el.scrollLeft,
        width: el.clientWidth,
        height: el.clientHeight,
      });
    update();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [hasModel]);

  // Scroll a requested day into view (today button, project open, zoom change).
  const scrollToDay = (day: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const visible = el.clientWidth - gridWidth;
    el.scrollLeft = Math.max(0, scale.x(day) - visible / 3);
  };
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  useEffect(() => {
    if (scrollRequest) scrollToDay(scrollRequest.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest]);

  // Keep the centre day when zooming; jump to today when a project opens.
  const projectId = doc?.project.id;
  const centerDay = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const visible = el.clientWidth - gridWidth;
      centerDay.current = scaleRef.current.dayAt(el.scrollLeft + visible / 3);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [gridWidth, hasModel]);
  // A custom range starts at the left edge; fixed zooms keep the day in focus.
  const alignView = (day: number) => {
    const el = scrollRef.current;
    if (custom && el) el.scrollLeft = scale.x(toDay(custom.from));
    else scrollToDay(day);
  };
  useLayoutEffect(() => {
    alignView(centerDay.current ?? toDay(todayISO()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, custom, fitWidth]);
  useLayoutEffect(() => {
    centerDay.current = null;
    alignView(toDay(todayISO()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Keep the selected row and its bar visible (keyboard navigation, clicks in the grid).
  useEffect(() => {
    const el = scrollRef.current;
    const idx = selectedId ? model?.rowIndex.get(selectedId) : undefined;
    const item = selectedId ? model?.doc.items[selectedId] : undefined;
    if (!el || idx === undefined || !item) return;
    const top = idx * ROW_H;
    const bodyHeight = el.clientHeight - HEADER_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + bodyHeight) el.scrollTop = top + ROW_H - bodyHeight;

    const x1 = scale.x(toDay(item.start));
    const x2 = scale.x(toDay(item.end) + 1);
    const left = el.scrollLeft;
    const right = left + el.clientWidth - gridWidth;
    if (x2 < left + 24 || x1 > right - 60) el.scrollLeft = Math.max(0, x1 - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!model) return null;

  const rowCount = model.rows.length;
  // Plan view reserves one extra lane at the bottom for adding new top-level items.
  const lanes = rowCount + (model.person ? 0 : 1);
  const bodyHeight = Math.max(lanes * ROW_H, viewport.height - HEADER_H);
  const rowsFrom = Math.max(0, Math.floor(viewport.top / ROW_H) - OVERSCAN);
  const rowsTo = Math.min(rowCount, Math.ceil((viewport.top + viewport.height) / ROW_H) + OVERSCAN);
  const fromX = viewport.left - 200;
  const toX = viewport.left + viewport.width - gridWidth + 200;

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = gridWidth;
    const onMove = (ev: PointerEvent) =>
      setUi({ gridWidth: Math.max(GRID_MIN, Math.min(GRID_MAX, start + ev.clientX - startX)) });
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div
        ref={scrollRef}
        className="scroll-thin relative min-h-0 min-w-0 flex-1 overflow-auto bg-surface"
        data-testid="planner"
      >
        <div
          className="relative"
          style={{ width: gridWidth + scale.width, height: HEADER_H + bodyHeight }}
        >
          <div
            className="sticky top-0 z-30 flex"
            style={{ width: gridWidth + scale.width, height: HEADER_H }}
          >
            <div
              className="sticky left-0 z-10 border-r border-border bg-surface"
              style={{ width: gridWidth }}
            >
              <GridHeader layout={layout} personMode={!!model.person} />
            </div>
            <TimelineHeader
              scale={scale}
              cal={model.analysis.cal}
              fromX={fromX}
              toX={toX}
              visibleX={viewport.left}
            />
          </div>

          <div className="flex">
            <div
              className="sticky left-0 z-20 border-r border-border bg-surface"
              style={{ width: gridWidth, height: bodyHeight }}
            >
              <GridBody
                model={model}
                layout={layout}
                rowsFrom={rowsFrom}
                rowsTo={rowsTo}
                height={bodyHeight}
              />
              {rowCount === 0 && !model.person && (
                <div className="absolute inset-x-0 top-8 flex flex-col items-center gap-3 text-muted">
                  <span>{t('grid.empty')}</span>
                  <button className="btn-primary" onClick={() => addItem()}>
                    {t('grid.emptyAction')}
                  </button>
                </div>
              )}
            </div>
            <TimelineBody
              model={model}
              scale={scale}
              rowsFrom={rowsFrom}
              rowsTo={rowsTo}
              fromX={fromX}
              toX={toX}
              height={bodyHeight}
            />
          </div>
        </div>
      </div>
      <div
        className="group absolute bottom-0 top-0 z-40 w-2 -translate-x-1 cursor-col-resize"
        style={{ left: gridWidth }}
        onPointerDown={startResize}
      >
        <div className="mx-auto h-full w-0.5 transition-colors group-hover:bg-accent" />
      </div>
    </div>
  );
}
