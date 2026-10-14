import {
  CalendarDays,
  CornerDownRight,
  Eye,
  List,
  LocateFixed,
  PanelRight,
  Plus,
  Redo2,
  Undo2,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toDay, todayISO } from '../../domain/dates';
import { addItem } from '../../store/actions';
import { redo, requestScroll, setUi, undo, useStore } from '../../store/projectStore';
import { MoreMenu } from './MoreMenu';
import { ProjectMenu } from './ProjectMenu';
import { FitToProjectButton, RangePicker } from './RangePicker';
import { TransferMenu } from './TransferMenu';

const Divider = () => <div className="mx-1 h-5 w-px bg-border" />;

export function Toolbar() {
  const { t } = useTranslation();
  const ui = useStore((s) => s.ui);
  const people = useStore((s) => s.doc?.people);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const view = ui.view;
  const personList = Object.values(people ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  const toggled = (on: boolean) => (on ? 'bg-surface-2 text-text' : '');

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
      <img src="/favicon.svg" alt="" className="mx-1 h-6 w-6" />
      <ProjectMenu />
      <Divider />

      {view.mode === 'plan' && (
        <>
          <button
            className="btn-primary w-8 justify-center px-0"
            title={t('toolbar.newItemTitle')}
            aria-label={t('toolbar.newItem')}
            onClick={() => addItem({ relativeTo: ui.selectedId })}
          >
            <Plus size={17} />
          </button>
          <button
            className="btn-icon"
            title={t('toolbar.newChildTitle')}
            aria-label={t('toolbar.newChild')}
            disabled={!ui.selectedId}
            onClick={() => addItem({ relativeTo: ui.selectedId, asChild: true })}
          >
            <CornerDownRight size={16} />
          </button>
          <Divider />
        </>
      )}

      <label className="flex items-center gap-1.5 text-muted" title={t('toolbar.view')}>
        <Eye size={16} />
        <select
          className="input h-8 w-auto max-w-[190px] py-0 text-text"
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
          aria-label={t('toolbar.view')}
        >
          <option value="">{t('toolbar.plan')}</option>
          {personList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {view.mode === 'person' && (
        <div className="seg ml-1" role="group">
          <button
            aria-pressed={view.layout === 'gantt'}
            onClick={() => setUi({ view: { ...view, layout: 'gantt' } })}
            title={t('toolbar.gantt')}
            aria-label={t('toolbar.gantt')}
          >
            <CalendarDays size={14} />
          </button>
          <button
            aria-pressed={view.layout === 'agenda'}
            onClick={() => setUi({ view: { ...view, layout: 'agenda' } })}
            title={t('toolbar.agenda')}
            aria-label={t('toolbar.agenda')}
          >
            <List size={14} />
          </button>
        </div>
      )}

      <div className="flex-1" />

      <button
        className="btn-icon"
        title={t('toolbar.today')}
        aria-label={t('toolbar.today')}
        onClick={() => requestScroll(toDay(todayISO()))}
      >
        <LocateFixed size={16} />
      </button>
      <FitToProjectButton />
      <RangePicker />
      <button
        className={`btn-icon ${ui.showCritical ? 'bg-[var(--critical)]/10 text-[var(--critical)] hover:text-[var(--critical)]' : ''}`}
        aria-pressed={ui.showCritical}
        onClick={() => setUi({ showCritical: !ui.showCritical })}
        title={t('toolbar.critical')}
        aria-label={t('toolbar.critical')}
      >
        <Zap size={16} />
      </button>
      <Divider />
      <button
        className="btn-icon"
        onClick={undo}
        disabled={!canUndo}
        title={t('toolbar.undo')}
        aria-label={t('toolbar.undo')}
      >
        <Undo2 size={16} />
      </button>
      <button
        className="btn-icon"
        onClick={redo}
        disabled={!canRedo}
        title={t('toolbar.redo')}
        aria-label={t('toolbar.redo')}
      >
        <Redo2 size={16} />
      </button>
      <Divider />
      <TransferMenu />
      <button
        className={`btn-icon ${toggled(ui.panel === 'team')}`}
        aria-pressed={ui.panel === 'team'}
        onClick={() => setUi({ panel: ui.panel === 'team' ? null : 'team' })}
        title={t('toolbar.team')}
        aria-label={t('toolbar.team')}
      >
        <Users size={16} />
      </button>
      <button
        className={`btn-icon ${toggled(ui.panel === 'details')}`}
        aria-pressed={ui.panel === 'details'}
        onClick={() => setUi({ panel: ui.panel === 'details' ? null : 'details' })}
        title={t('details.title')}
        aria-label={t('details.title')}
      >
        <PanelRight size={16} />
      </button>
      <MoreMenu />
    </header>
  );
}
