import { CalendarDays, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERSON_COLORS } from '../../domain/factory';
import { addPerson, removePerson, updatePerson } from '../../store/actions';
import { setUi, useStore } from '../../store/projectStore';
import { Avatar } from '../common/Avatar';
import { PanelShell } from '../details/DetailsPanel';

export function TeamPanel() {
  const { t } = useTranslation();
  const doc = useStore((s) => s.doc);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  if (!doc) return null;
  const people = Object.values(doc.people).sort((a, b) => a.name.localeCompare(b.name));
  const counts = new Map<string, number>();
  for (const item of Object.values(doc.items)) {
    for (const id of item.assigneeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const submit = () => {
    if (addPerson(name, email)) {
      setName('');
      setEmail('');
    }
  };

  return (
    <PanelShell title={t('people.title')}>
      <p className="mb-3 text-[12px] text-muted">{t('people.hint')}</p>

      <form
        className="mb-4 space-y-2 rounded-lg border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="input"
          placeholder={t('people.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="person-name"
        />
        <input
          className="input"
          type="email"
          placeholder={t('people.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-primary w-full justify-center" disabled={!name.trim()}>
          <UserPlus size={15} /> {t('people.add')}
        </button>
      </form>

      {people.length === 0 && <p className="text-muted">{t('people.empty')}</p>}
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.id} className="rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-2">
              <Avatar person={p} size={30} draggable title={t('people.hint')} />
              <div className="min-w-0 flex-1">
                <input
                  key={`${p.id}-${p.name}`}
                  className="w-full truncate bg-transparent text-[13px] font-medium outline-none focus:underline"
                  defaultValue={p.name}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value !== p.name &&
                    updatePerson(p.id, { name: e.target.value.trim() })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <div className="text-[11.5px] text-muted">
                  {t('people.tasks', { count: counts.get(p.id) ?? 0 })}
                </div>
              </div>
              <button
                className="btn-icon h-7 w-7"
                title={t('person.title', { name: p.name })}
                onClick={() => setUi({ view: { mode: 'person', personId: p.id, layout: 'gantt' } })}
              >
                <CalendarDays size={14} />
              </button>
              <button
                className="btn-icon h-7 w-7 hover:text-danger"
                title={t('common.delete')}
                onClick={() =>
                  window.confirm(t('people.removeConfirm', { name: p.name })) && removePerson(p.id)
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                key={`${p.id}-${p.email}`}
                className="input h-7 flex-1 text-[12px]"
                placeholder={t('people.email')}
                defaultValue={p.email ?? ''}
                onBlur={(e) =>
                  e.target.value !== (p.email ?? '') &&
                  updatePerson(p.id, { email: e.target.value.trim() || undefined })
                }
              />
              <input
                key={`${p.id}-${p.initials}`}
                className="input h-7 w-12 text-center text-[12px] uppercase"
                maxLength={3}
                title={t('people.initials')}
                defaultValue={p.initials}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== p.initials &&
                  updatePerson(p.id, { initials: e.target.value.trim().toUpperCase() })
                }
              />
            </div>
            <div className="mt-2 flex gap-1">
              {PERSON_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={c}
                  className={`h-4 w-4 rounded-full ${p.color === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`}
                  style={{ background: c }}
                  onClick={() => updatePerson(p.id, { color: c })}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

/** Draggable avatars shown above the plan for quick assignment. */
export function TeamStrip() {
  const { t } = useTranslation();
  const people = useStore((s) => s.doc?.people);
  const list = Object.values(people ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 text-[12px] text-muted">
      <span className="font-medium">{t('people.title')}:</span>
      {list.map((p) => (
        <span key={p.id} className="flex items-center gap-1">
          <Avatar person={p} size={22} draggable title={`${p.name} – ${t('people.hint')}`} />
        </span>
      ))}
      <button
        className="btn h-6 px-1.5 text-[12px] text-accent"
        onClick={() => setUi({ panel: 'team' })}
      >
        <UserPlus size={13} /> {list.length === 0 ? t('people.add') : ''}
      </button>
      {list.length > 0 && (
        <span className="ml-1 hidden text-[11.5px] lg:inline">{t('people.hint')}</span>
      )}
    </div>
  );
}
