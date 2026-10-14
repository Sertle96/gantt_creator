import { Check, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Item, Person } from '../../domain/types';
import { addPerson, assignPerson, toggleAssignee } from '../../store/actions';
import { useStore } from '../../store/projectStore';
import { Avatar, AvatarStack } from '../common/Avatar';
import { Popover } from '../common/Popover';

interface PeopleCellProps {
  width: number;
  item: Item;
  people: Person[];
}

/** Grid cell showing assignees; a click opens a checklist to assign or remove people. */
export function PeopleCell({ width, item, people }: PeopleCellProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="px-0.5" style={{ width }}>
      <button
        ref={ref}
        aria-label={`${item.name}: ${t('grid.assign')}`}
        title={t('grid.assign')}
        className={`flex h-[26px] w-full items-center rounded border px-1 hover:border-border ${
          anchor ? 'border-accent bg-surface' : 'border-transparent'
        }`}
        onClick={() => {
          const r = ref.current!.getBoundingClientRect();
          setAnchor(anchor ? null : { x: r.left, y: r.bottom - 6 });
        }}
      >
        {people.length > 0 ? (
          <AvatarStack people={people} size={20} />
        ) : (
          <UserPlus size={14} className="text-muted/0 group-hover:text-muted/70" />
        )}
      </button>
      {anchor && (
        <PeoplePopover item={item} x={anchor.x} y={anchor.y} onClose={() => setAnchor(null)} />
      )}
    </div>
  );
}

interface PeoplePopoverProps {
  item: Item;
  x: number;
  y: number;
  onClose: () => void;
}

export function PeoplePopover({ item, x, y, onClose }: PeoplePopoverProps) {
  const { t } = useTranslation();
  const people = useStore((s) => s.doc?.people);
  const assigned = useStore((s) => s.doc?.items[item.id]?.assigneeIds ?? []);
  const [name, setName] = useState('');
  const list = Object.values(people ?? {}).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Popover x={x} y={y} onClose={onClose} className="w-[240px]">
      <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {t('grid.assign')}
      </div>
      {list.length === 0 && (
        <p className="px-3 py-1 text-[12px] text-muted">{t('grid.noPeople')}</p>
      )}
      <div className="scroll-thin max-h-[260px] overflow-y-auto">
        {list.map((p) => {
          const on = assigned.includes(p.id);
          return (
            <button
              key={p.id}
              role="menuitemcheckbox"
              aria-checked={on}
              className="menu-item"
              onClick={() => toggleAssignee(item.id, p.id)}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  on ? 'border-accent bg-accent text-accent-fg' : 'border-border'
                }`}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <Avatar person={p} size={20} />
              <span className="truncate">{p.name}</span>
            </button>
          );
        })}
      </div>
      <form
        className="mt-1 flex items-center gap-1.5 border-t border-border px-2 pb-1 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = addPerson(name);
          if (id) {
            assignPerson(item.id, id);
            setName('');
          }
        }}
      >
        <UserPlus size={14} className="shrink-0 text-muted" />
        <input
          className="input h-7 text-[12px]"
          placeholder={t('grid.newPerson')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </form>
    </Popover>
  );
}
