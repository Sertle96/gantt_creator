import { useTranslation } from 'react-i18next';
import { levelStyle } from '../../domain/styles';
import {
  currentOutlineLevel,
  expandToLevel,
  levelLabel,
  maxOutlineDepth,
} from '../../store/actions';
import { useStore } from '../../store/projectStore';
import { HEADER_H, TIER_H } from '../gantt/scale';
import { COL_WIDTH, HANDLE_W, type ColumnLayout } from './columns';

export function GridHeader({ layout, personMode }: { layout: ColumnLayout; personMode: boolean }) {
  const { t } = useTranslation();
  const labels = {
    start: t('grid.start'),
    end: t('grid.end'),
    duration: t('grid.duration'),
    people: t('grid.people'),
    wbs: t('grid.wbs'),
  };
  return (
    <div className="flex flex-col border-b border-border" style={{ height: HEADER_H }}>
      <div className="flex items-center px-2" style={{ height: TIER_H }}>
        {!personMode && <LevelBar />}
      </div>
      <div
        className="flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted"
        style={{ height: TIER_H }}
      >
        <div style={{ width: HANDLE_W }} />
        {layout.showWbs && (
          <div className="px-1.5" style={{ width: COL_WIDTH.wbs }}>
            {labels.wbs}
          </div>
        )}
        <div className="pl-1.5" style={{ width: layout.nameWidth }}>
          {t('grid.name')}
        </div>
        {layout.right.map((k) => (
          <div key={k} className="px-1.5" style={{ width: COL_WIDTH[k] }}>
            {labels[k]}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One button per hierarchy level: show the outline down to that level, or everything. */
function LevelBar() {
  const { t } = useTranslation();
  const doc = useStore((s) => s.doc);
  if (!doc) return null;
  const depth = maxOutlineDepth(doc);
  if (depth < 2) return null;
  const active = currentOutlineLevel(doc);
  const levels = Array.from({ length: depth - 1 }, (_, i) => i + 1);

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
      <span className="mr-0.5 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {t('grid.levels')}
      </span>
      {levels.map((level) => {
        const name = levelLabel(doc, level - 1);
        const color = levelStyle(doc.project, level - 1).color;
        const pressed = active === level;
        return (
          <button
            key={level}
            aria-pressed={pressed}
            title={t('grid.showLevel', { level: name })}
            onClick={() => expandToLevel(level)}
            className={`flex h-[20px] max-w-[120px] shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] ${
              pressed
                ? 'border-accent bg-accent/10 font-semibold text-accent'
                : 'border-border text-muted hover:border-accent/50 hover:text-text'
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate">{name}</span>
          </button>
        );
      })}
      <button
        aria-pressed={active === null}
        title={t('grid.allTitle')}
        onClick={() => expandToLevel(null)}
        className={`h-[20px] shrink-0 rounded-full border px-2 text-[11px] ${
          active === null
            ? 'border-accent bg-accent/10 font-semibold text-accent'
            : 'border-border text-muted hover:border-accent/50 hover:text-text'
        }`}
      >
        {t('grid.all')}
      </button>
    </div>
  );
}
