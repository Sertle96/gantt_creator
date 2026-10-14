import {
  CalendarDays,
  CornerDownRight,
  Keyboard,
  List,
  Moon,
  PanelRight,
  Plus,
  Redo2,
  Settings,
  Sun,
  SunMoon,
  Undo2,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toDay, todayISO } from '../../domain/dates';
import { currentLanguage, setLanguage } from '../../i18n';
import { addItem } from '../../store/actions';
import {
  redo,
  requestScroll,
  setUi,
  undo,
  useStore,
  type Theme,
  type FixedZoom,
} from '../../store/projectStore';
import { ProjectMenu } from './ProjectMenu';
import { FitToProjectButton, RangePicker } from './RangePicker';

const ZOOMS: FixedZoom[] = ['day', 'week', 'month', 'quarter'];
const ZOOM_KEYS: Record<FixedZoom, string> = {
  day: 'toolbar.zoomDay',
  week: 'toolbar.zoomWeek',
  month: 'toolbar.zoomMonth',
  quarter: 'toolbar.zoomQuarter',
};
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

export function Toolbar() {
  const { t } = useTranslation();
  const ui = useStore((s) => s.ui);
  const people = useStore((s) => s.doc?.people);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const view = ui.view;
  const personList = Object.values(people ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  const ThemeIcon = ui.theme === 'light' ? Sun : ui.theme === 'dark' ? Moon : SunMoon;

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
      <img src="/favicon.svg" alt="" className="mx-1 h-6 w-6" />
      <ProjectMenu />
      <div className="mx-1 h-5 w-px bg-border" />

      {view.mode === 'plan' && (
        <>
          <button
            className="btn-primary"
            title={t('toolbar.newItemTitle')}
            onClick={() => addItem({ relativeTo: ui.selectedId })}
          >
            <Plus size={15} /> {t('toolbar.newItem')}
          </button>
          <button
            className="btn"
            title={t('toolbar.newChildTitle')}
            disabled={!ui.selectedId}
            onClick={() => addItem({ relativeTo: ui.selectedId, asChild: true })}
          >
            <CornerDownRight size={15} /> {t('toolbar.newChild')}
          </button>
          <div className="mx-1 h-5 w-px bg-border" />
        </>
      )}

      <div className="seg" role="group">
        <button
          aria-pressed={view.mode === 'plan'}
          onClick={() => setUi({ view: { mode: 'plan' } })}
        >
          {t('toolbar.plan')}
        </button>
      </div>
      <select
        className="input ml-1 h-8 w-auto max-w-[180px] py-0"
        value={view.mode === 'person' ? view.personId : ''}
        onChange={(e) =>
          setUi({
            view: e.target.value
              ? {
                  mode: 'person',
                  personId: e.target.value,
                  layout: view.mode === 'person' ? view.layout : 'gantt',
                }
              : { mode: 'plan' },
            selectedDepId: null,
          })
        }
        aria-label={t('toolbar.personPlan')}
      >
        <option value="">{t('toolbar.personPlan')}</option>
        {personList.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {view.mode === 'person' && (
        <div className="seg ml-1" role="group">
          <button
            aria-pressed={view.layout === 'gantt'}
            onClick={() => setUi({ view: { ...view, layout: 'gantt' } })}
            title={t('toolbar.gantt')}
          >
            <CalendarDays size={13} className="inline" /> {t('toolbar.gantt')}
          </button>
          <button
            aria-pressed={view.layout === 'agenda'}
            onClick={() => setUi({ view: { ...view, layout: 'agenda' } })}
            title={t('toolbar.agenda')}
          >
            <List size={13} className="inline" /> {t('toolbar.agenda')}
          </button>
        </div>
      )}

      <div className="flex-1" />

      <FitToProjectButton />
      <div className="seg" role="group" aria-label={t('toolbar.zoom')}>
        {ZOOMS.map((z) => (
          <button key={z} aria-pressed={ui.zoom === z} onClick={() => setUi({ zoom: z })}>
            {t(ZOOM_KEYS[z])}
          </button>
        ))}
      </div>
      <RangePicker />
      <button className="btn" onClick={() => requestScroll(toDay(todayISO()))}>
        {t('toolbar.today')}
      </button>
      <button
        className={`btn ${ui.showCritical ? 'bg-[var(--critical)]/10 text-[var(--critical)]' : ''}`}
        aria-pressed={ui.showCritical}
        onClick={() => setUi({ showCritical: !ui.showCritical })}
        title={t('toolbar.critical')}
      >
        <Zap size={15} /> <span className="hidden xl:inline">{t('toolbar.critical')}</span>
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button className="btn-icon" onClick={undo} disabled={!canUndo} title={t('toolbar.undo')}>
        <Undo2 size={16} />
      </button>
      <button className="btn-icon" onClick={redo} disabled={!canRedo} title={t('toolbar.redo')}>
        <Redo2 size={16} />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button
        className={`btn-icon ${ui.panel === 'team' ? 'bg-surface-2 text-text' : ''}`}
        onClick={() => setUi({ panel: ui.panel === 'team' ? null : 'team' })}
        title={t('toolbar.team')}
      >
        <Users size={16} />
      </button>
      <button
        className={`btn-icon ${ui.panel === 'details' ? 'bg-surface-2 text-text' : ''}`}
        onClick={() => setUi({ panel: ui.panel === 'details' ? null : 'details' })}
        title={t('details.title')}
      >
        <PanelRight size={16} />
      </button>
      <button
        className="btn-icon"
        onClick={() => setUi({ settingsOpen: true })}
        title={t('toolbar.settings')}
      >
        <Settings size={16} />
      </button>
      <button
        className="btn-icon"
        onClick={() => setUi({ helpOpen: true })}
        title={t('toolbar.help')}
      >
        <Keyboard size={16} />
      </button>
      <button
        className="btn-icon text-[11px] font-bold"
        onClick={() => setLanguage(currentLanguage() === 'de' ? 'en' : 'de')}
        title={t('toolbar.language')}
      >
        {currentLanguage().toUpperCase()}
      </button>
      <button
        className="btn-icon"
        onClick={() => setUi({ theme: NEXT_THEME[ui.theme] })}
        title={t('toolbar.theme')}
      >
        <ThemeIcon size={16} />
      </button>
    </header>
  );
}
