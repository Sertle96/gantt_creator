import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setUi, useStore } from '../../store/projectStore';
import { Avatar } from '../common/Avatar';

export function PersonBanner() {
  const { t } = useTranslation();
  const view = useStore((s) => s.ui.view);
  const person = useStore((s) =>
    view.mode === 'person' ? s.doc?.people[view.personId] : undefined,
  );
  if (view.mode !== 'person' || !person) return null;
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      <button
        className="btn h-7 px-2 text-[12px]"
        onClick={() => setUi({ view: { mode: 'plan' } })}
      >
        <ArrowLeft size={14} /> {t('person.back')}
      </button>
      <Avatar person={person} size={24} />
      <span className="font-semibold">{t('person.title', { name: person.name })}</span>
      <span className="flex items-center gap-3 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-5 rounded-sm"
            style={{ background: person.color }}
          />
          {t('person.own')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-slate-400/50" />
          {t('person.context')}
        </span>
      </span>
    </div>
  );
}
