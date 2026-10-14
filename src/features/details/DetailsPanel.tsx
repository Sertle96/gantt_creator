import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Link,
  Trash2,
  Unlink,
  X,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { levelStyle, resolveStyle } from '../../domain/styles';
import { linkType, type Dependency, type ItemKind, type ItemStatus } from '../../domain/types';
import {
  assignPerson,
  deleteDependency,
  deleteItem,
  levelLabel,
  renameItem,
  select,
  setDuration,
  setItemDate,
  setItemKind,
  toggleDependencyHard,
  unassignPerson,
  updateDependency,
  updateItem,
} from '../../store/actions';
import { analyze } from '../../store/analysis';
import { setUi, useStore } from '../../store/projectStore';
import { Avatar } from '../common/Avatar';
import { legible } from '../common/color';
import { ItemStyleEditor } from '../gantt/StylePopover';

const KINDS: ItemKind[] = ['task', 'milestone', 'deadline'];
const STATUSES: ItemStatus[] = ['open', 'active', 'done'];

export function DetailsPanel() {
  const { t } = useTranslation();
  const doc = useStore((s) => s.doc);
  const selectedId = useStore((s) => s.ui.selectedId);
  const dark = useStore((s) => s.ui.dark);
  const item = selectedId ? doc?.items[selectedId] : undefined;

  if (!doc || !item) {
    return (
      <PanelShell title={t('details.title')}>
        <p className="text-muted">{t('details.nothingSelected')}</p>
      </PanelShell>
    );
  }

  const analysis = analyze(doc);
  const isParent = (analysis.tree.children.get(item.id)?.length ?? 0) > 0;
  const depth = analysis.depth.get(item.id) ?? 0;
  const bound = analysis.bounds.get(item.id);
  const float = isParent ? undefined : analysis.critical().float.get(item.id);
  const overrun = analysis.overruns.get(item.id) ?? 0;
  const deps = Object.values(doc.dependencies);
  const incoming = deps.filter((d) => d.toId === item.id);
  const outgoing = deps.filter((d) => d.fromId === item.id);
  const assigned = item.assigneeIds.map((id) => doc.people[id]).filter(Boolean);
  const unassigned = Object.values(doc.people).filter((p) => !item.assigneeIds.includes(p.id));
  const isPoint = !isParent && item.kind !== 'task';
  const key = `${item.id}-${item.updatedAt}`;
  const levelColor = legible(levelStyle(doc.project, depth).color, dark);
  const style = resolveStyle(doc.project, item, depth);

  return (
    <PanelShell title={t('details.title')}>
      <div className="mb-3 flex items-center gap-2 text-[11px]">
        <span className="font-mono text-muted">{analysis.wbs.get(item.id)}</span>
        <span
          className="rounded px-1.5 py-px font-semibold uppercase tracking-wide"
          style={{ color: levelColor, background: `${levelColor}1a` }}
        >
          {levelLabel(doc, depth)}
        </span>
        {isParent && <span className="text-muted">· {t('kind.summary')}</span>}
      </div>

      <Field label={t('details.name')}>
        <input
          key={key}
          className="input font-medium"
          defaultValue={item.name}
          onBlur={(e) => renameItem(item.id, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </Field>

      {!isParent && (
        <Field label={t('details.kind')}>
          <div className="grid grid-cols-3 gap-1">
            {KINDS.map((k) => (
              <button
                key={k}
                title={t(`kind.${k}Hint`)}
                className={`rounded-md border px-2 py-1.5 text-[12px] ${
                  item.kind === k
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'border-border text-muted hover:text-text'
                }`}
                onClick={() => setItemKind(item.id, k)}
              >
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11.5px] text-muted">{t(`kind.${item.kind}Hint`)}</p>
        </Field>
      )}

      {isParent && <p className="mb-3 text-[12px] text-muted">{t('details.summaryHint')}</p>}

      <div className="grid grid-cols-2 gap-2">
        {isPoint ? (
          <Field label={t('details.date')} className="col-span-2">
            <input
              key={key}
              type="date"
              className="input"
              defaultValue={item.end}
              onBlur={(e) =>
                e.target.value !== item.end && setItemDate(item.id, 'end', e.target.value)
              }
            />
          </Field>
        ) : (
          <>
            <Field label={t('details.start')}>
              <input
                key={key}
                type="date"
                className="input"
                defaultValue={item.start}
                onBlur={(e) =>
                  e.target.value !== item.start && setItemDate(item.id, 'start', e.target.value)
                }
              />
            </Field>
            <Field label={t('details.end')}>
              <input
                key={key}
                type="date"
                className="input"
                disabled={isParent}
                defaultValue={item.end}
                onBlur={(e) =>
                  e.target.value !== item.end && setItemDate(item.id, 'end', e.target.value)
                }
              />
            </Field>
            <Field label={t('details.duration')} className="col-span-2">
              <input
                key={key}
                type="number"
                min={0}
                className="input"
                disabled={isParent}
                defaultValue={bound?.w ?? 0}
                onBlur={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v !== bound?.w) setDuration(item.id, v);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </Field>
          </>
        )}
      </div>

      {overrun > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-danger/10 px-2.5 py-2 text-[12px] text-danger">
          <AlertTriangle size={14} /> {t('details.overrun', { count: overrun })}
        </div>
      )}
      {float !== undefined && item.kind !== 'deadline' && (
        <div className="mb-3 flex items-center gap-2 text-[12px] text-muted">
          {float <= 0 && <Zap size={13} className="text-[var(--critical)]" />}
          {float <= 0
            ? t('details.critical')
            : `${t('details.float')}: ${t('common.workdaysLong', { count: float })}`}
        </div>
      )}

      {!isPoint && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('details.status')}>
            <select
              className="input"
              value={item.status}
              onChange={(e) => updateItem(item.id, { status: e.target.value as ItemStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`${t('details.progress')} · ${item.progress} %`}>
            <input
              key={key}
              type="range"
              min={0}
              max={100}
              step={5}
              className="h-8 w-full accent-[rgb(var(--accent))]"
              defaultValue={item.progress}
              onPointerUp={(e) =>
                updateItem(item.id, { progress: Number((e.target as HTMLInputElement).value) })
              }
              onKeyUp={(e) =>
                updateItem(item.id, { progress: Number((e.target as HTMLInputElement).value) })
              }
            />
          </Field>
        </div>
      )}

      <Field label={t('details.assignees')}>
        <div className="flex flex-wrap items-center gap-1.5">
          {assigned.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-1.5"
            >
              <Avatar person={p} size={20} />
              <span className="text-[12px]">{p.name}</span>
              <button
                className="text-muted hover:text-danger"
                onClick={() => unassignPerson(item.id, p.id)}
                title={t('people.unassign')}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {unassigned.length > 0 && (
            <select
              className="input h-7 w-auto py-0 text-[12px]"
              value=""
              onChange={(e) => e.target.value && assignPerson(item.id, e.target.value)}
            >
              <option value="">{t('details.addAssignee')}</option>
              {unassigned.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {!assigned.length && !unassigned.length && (
            <button
              className="text-[12px] text-accent hover:underline"
              onClick={() => setUi({ panel: 'team' })}
            >
              {t('people.add')}
            </button>
          )}
        </div>
      </Field>

      <details className="group mb-3 rounded-lg border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t('style.title')}
          <span className="flex items-center gap-1.5 normal-case tracking-normal">
            <span className="h-3 w-6 rounded-sm" style={{ background: style.color }} />
            <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="border-t border-border p-3">
          <ItemStyleEditor itemId={item.id} />
        </div>
      </details>

      <LinkList
        title={t('details.predecessors')}
        deps={incoming}
        other={(d) => d.fromId}
        icon="in"
      />
      <LinkList title={t('details.successors')} deps={outgoing} other={(d) => d.toId} icon="out" />

      <Field label={t('details.notes')}>
        <textarea
          key={key}
          className="input h-24 resize-y py-1.5"
          defaultValue={item.notes ?? ''}
          onBlur={(e) =>
            e.target.value !== (item.notes ?? '') && updateItem(item.id, { notes: e.target.value })
          }
        />
      </Field>

      <button
        className="btn mt-2 w-full justify-center text-danger hover:bg-danger/10"
        onClick={() => deleteItem(item.id)}
      >
        <Trash2 size={14} /> {t('details.delete')}
      </button>
    </PanelShell>
  );
}

function LinkList({
  title,
  deps,
  other,
  icon,
}: {
  title: string;
  deps: Dependency[];
  other: (d: Dependency) => string;
  icon: 'in' | 'out';
}) {
  const { t } = useTranslation();
  const items = useStore((s) => s.doc?.items);
  return (
    <Field label={title}>
      {deps.length === 0 ? (
        <p className="text-[12px] text-muted">{t('details.noLinks')}</p>
      ) : (
        <ul className="space-y-1">
          {deps.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-1.5 rounded-md bg-surface-2/60 px-1.5 py-1"
            >
              {icon === 'in' ? (
                <ArrowLeft size={13} className="shrink-0 text-muted" />
              ) : (
                <ArrowRight size={13} className="shrink-0 text-muted" />
              )}
              <button
                className="min-w-0 flex-1 truncate text-left text-[12px] hover:text-accent"
                onClick={() => select(other(d))}
              >
                {items?.[other(d)]?.name}
              </button>
              <span className="font-mono text-[10.5px] text-muted" title={t(`link.${linkType(d)}`)}>
                {linkType(d)}
              </span>
              <input
                key={`${d.id}-${d.lag}`}
                type="number"
                className="h-6 w-11 rounded border border-border bg-surface px-1 text-[11px]"
                defaultValue={d.lag}
                title={t('link.lag')}
                onBlur={(e) => {
                  const lag = Math.round(Number(e.target.value));
                  if (Number.isFinite(lag) && lag !== d.lag) updateDependency(d.id, { lag });
                }}
              />
              <button
                className={`btn-icon h-6 w-6 ${d.hard ? 'text-text' : ''}`}
                onClick={() => toggleDependencyHard(d.id)}
                title={t(d.hard ? 'link.hard' : 'link.soft')}
              >
                {d.hard ? <Link size={13} /> : <Unlink size={13} />}
              </button>
              <button
                className="btn-icon h-6 w-6 hover:text-danger"
                onClick={() => deleteDependency(d.id)}
                title={t('link.delete')}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <aside
      className="flex w-[340px] shrink-0 flex-col border-l border-border bg-surface"
      data-testid="side-panel"
    >
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        <button
          className="btn-icon h-7 w-7"
          onClick={() => setUi({ panel: null })}
          aria-label={t('common.close')}
        >
          <X size={15} />
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  );
}
