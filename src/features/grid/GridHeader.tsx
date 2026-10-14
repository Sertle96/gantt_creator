import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setAllCollapsed } from '../../store/actions';
import { HEADER_H } from '../gantt/scale';
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
    <div
      className="flex items-end border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted"
      style={{ height: HEADER_H }}
    >
      <div style={{ width: HANDLE_W }} />
      {layout.showWbs && (
        <div className="px-1.5 pb-2" style={{ width: COL_WIDTH.wbs }}>
          {labels.wbs}
        </div>
      )}
      <div className="flex items-center gap-1 pb-1 pl-1.5" style={{ width: layout.nameWidth }}>
        <span className="pb-1">{t('grid.name')}</span>
        {!personMode && (
          <span className="ml-auto mr-1 flex">
            <button
              className="btn-icon h-6 w-6"
              title={t('grid.collapse')}
              onClick={() => setAllCollapsed(true)}
            >
              <ChevronsDownUp size={13} />
            </button>
            <button
              className="btn-icon h-6 w-6"
              title={t('grid.expand')}
              onClick={() => setAllCollapsed(false)}
            >
              <ChevronsUpDown size={13} />
            </button>
          </span>
        )}
      </div>
      {layout.right.map((k) => (
        <div key={k} className="px-1.5 pb-2" style={{ width: COL_WIDTH[k] }}>
          {labels[k]}
        </div>
      ))}
    </div>
  );
}
