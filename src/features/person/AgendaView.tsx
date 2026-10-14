import { Diamond, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isoWeek, mondayOf, toDay } from '../../domain/dates';
import { ancestors } from '../../domain/tree';
import type { Item } from '../../domain/types';
import { select } from '../../store/actions';
import { useDisplay } from '../../store/analysis';
import { setUi, useStore } from '../../store/projectStore';
import { formatDay, formatISO, MEDIUM, WEEKDAY_SHORT } from '../common/format';

/** Week-by-week list of a person's own items with what they wait for and feed into. */
export function AgendaView() {
  const { t } = useTranslation();
  const model = useDisplay();
  const selectedId = useStore((s) => s.ui.selectedId);
  if (!model?.person) return null;
  const { doc, person } = model;
  const view = useStore.getState().ui.view;
  const name = view.mode === 'person' ? doc.people[view.personId]?.name : '';

  const own = model.rows.filter((r) => r.role === 'own').map((r) => doc.items[r.id]);
  const weeks = new Map<number, Item[]>();
  for (const item of own) {
    const wk = mondayOf(toDay(item.start));
    weeks.set(wk, [...(weeks.get(wk) ?? []), item]);
  }
  const deps = Object.values(doc.dependencies);

  if (!own.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        {t('person.empty', { name })}
      </div>
    );
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto bg-bg px-6 py-5">
      <div className="mx-auto max-w-3xl space-y-6">
        {[...weeks.entries()]
          .sort(([a], [b]) => a - b)
          .map(([monday, items]) => (
            <section key={monday}>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                {t('person.week', { week: isoWeek(monday) })} · {formatDay(monday, MEDIUM)}
              </h3>
              <ul className="space-y-2">
                {items.map((item) => {
                  const waits = deps
                    .filter((d) => d.toId === item.id)
                    .map((d) => doc.items[d.fromId]);
                  const feeds = deps
                    .filter((d) => d.fromId === item.id)
                    .map((d) => doc.items[d.toId]);
                  const path = ancestors(doc.items, item.id)
                    .map((a) => a.name)
                    .join(' › ');
                  return (
                    <li
                      key={item.id}
                      className={`cursor-pointer rounded-lg border bg-surface p-3 transition-colors hover:border-accent ${
                        selectedId === item.id ? 'border-accent' : 'border-border'
                      }`}
                      onClick={() => {
                        select(item.id);
                        setUi({ panel: 'details' });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {item.kind === 'milestone' && <Diamond size={13} className="text-muted" />}
                        {item.kind === 'deadline' && (
                          <Flag size={13} className="text-[var(--critical)]" />
                        )}
                        <span
                          className={`font-medium ${item.status === 'done' ? 'text-muted line-through' : ''}`}
                        >
                          {item.name}
                        </span>
                        <span className="ml-auto whitespace-nowrap text-[12px] tabular-nums text-muted">
                          {item.kind === 'task'
                            ? `${formatISO(item.start, WEEKDAY_SHORT)} – ${formatISO(item.end, WEEKDAY_SHORT)}`
                            : formatISO(item.end, WEEKDAY_SHORT)}
                        </span>
                      </div>
                      {path && <div className="mt-0.5 text-[11.5px] text-muted">{path}</div>}
                      {(waits.length > 0 || feeds.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                          {waits.filter(Boolean).map((w) => (
                            <span key={w.id} className={person.own.has(w.id) ? '' : 'text-muted'}>
                              ← {t('person.blockedBy')} <b className="font-medium">{w.name}</b> (
                              {formatISO(w.end)})
                            </span>
                          ))}
                          {feeds.filter(Boolean).map((f) => (
                            <span
                              key={f.id}
                              className={
                                f.kind === 'deadline'
                                  ? 'text-danger'
                                  : person.own.has(f.id)
                                    ? ''
                                    : 'text-muted'
                              }
                            >
                              → {t('person.feeds')} <b className="font-medium">{f.name}</b> (
                              {formatISO(f.kind === 'task' ? f.start : f.end)})
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
