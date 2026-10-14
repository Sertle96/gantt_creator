import { ChevronRight, Diamond, Flag, GripVertical } from 'lucide-react';
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Item, Person } from '../../domain/types';
import {
  addItem,
  indent,
  outdent,
  renameItem,
  select,
  setCollapsed,
  setDuration,
  setItemDate,
  startEditing,
} from '../../store/actions';
import type { DisplayRow } from '../../store/analysis';
import { useStore } from '../../store/projectStore';
import { formatISO } from '../common/format';
import { ROW_H } from '../gantt/scale';
import { PeopleCell } from '../people/PeoplePicker';
import { COL_WIDTH, HANDLE_W, INDENT, type ColumnLayout } from './columns';

const FULL_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

export interface GridRowProps {
  row: DisplayRow;
  index: number;
  item: Item;
  layout: ColumnLayout;
  people: Person[];
  levelLabel: string;
  levelColor: string;
  breadcrumb: string;
  workdays: number;
  selected: boolean;
  editing: boolean;
  critical: boolean;
  overrun: number;
  personMode: boolean;
  dropActive: boolean;
  onGripDown: (e: ReactPointerEvent, row: DisplayRow) => void;
}

export const GridRow = memo(function GridRow(props: GridRowProps) {
  const { t } = useTranslation();
  const { row, index, item, layout, selected, editing, personMode } = props;
  const isParent = row.hasChildren;
  const isPoint = !isParent && item.kind !== 'task';
  const depth = personMode ? 0 : row.depth;
  const context = row.role === 'context';

  return (
    <div
      data-row-id={item.id}
      className={`group absolute left-0 right-0 flex items-center border-b border-border/50 ${
        selected ? 'bg-accent/10' : 'hover:bg-surface-2/70'
      } ${props.dropActive ? 'outline outline-2 -outline-offset-2 outline-accent' : ''}`}
      style={{ top: index * ROW_H, height: ROW_H }}
      onMouseDown={() => !selected && select(item.id)}
    >
      {props.critical && (
        <span className="absolute inset-y-1 left-0 w-[3px] rounded bg-[var(--critical)]" />
      )}
      <div
        className={`flex h-full items-center justify-center text-muted/60 ${
          personMode ? '' : 'cursor-grab opacity-0 group-hover:opacity-100 active:cursor-grabbing'
        }`}
        style={{ width: HANDLE_W }}
        onPointerDown={personMode ? undefined : (e) => props.onGripDown(e, row)}
        title={personMode ? undefined : t('grid.dragRow')}
      >
        {!personMode && <GripVertical size={14} />}
      </div>

      {layout.showWbs && (
        <div
          className="truncate px-1.5 font-mono text-[11px] text-muted"
          style={{ width: COL_WIDTH.wbs }}
        >
          {row.wbs}
        </div>
      )}

      <div
        className={`flex h-full min-w-0 items-center gap-1 pl-1.5 pr-2 ${context ? 'opacity-55' : ''}`}
        style={{ width: layout.nameWidth, paddingLeft: 6 + depth * INDENT }}
        onDoubleClick={() => startEditing(item.id)}
      >
        {!personMode && (
          <button
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text ${
              isParent ? '' : 'invisible'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(item.id, !item.collapsed);
            }}
            aria-label={item.collapsed ? t('grid.expand') : t('grid.collapse')}
            tabIndex={-1}
          >
            <ChevronRight
              size={14}
              className={`transition-transform ${item.collapsed ? '' : 'rotate-90'}`}
            />
          </button>
        )}
        {isPoint && item.kind === 'milestone' && (
          <Diamond size={12} className="shrink-0 text-muted" />
        )}
        {isPoint && item.kind === 'deadline' && (
          <Flag size={12} className="shrink-0 text-[var(--critical)]" />
        )}
        {personMode ? (
          props.breadcrumb && (
            <span
              className="max-w-[45%] shrink-0 truncate text-[11px] text-muted"
              title={props.breadcrumb}
            >
              {props.breadcrumb} ›
            </span>
          )
        ) : (
          <span
            className="max-w-[76px] shrink-0 truncate rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
            title={props.levelLabel}
            style={{ color: props.levelColor, background: `${props.levelColor}1a` }}
          >
            {props.levelLabel}
          </span>
        )}
        {editing ? (
          <NameEditor item={item} />
        ) : (
          <span
            className={`min-w-0 truncate ${isParent ? 'font-semibold' : ''} ${
              item.status === 'done' ? 'text-muted line-through' : ''
            }`}
            title={item.name}
          >
            {item.name}
          </span>
        )}
      </div>

      {layout.right.map((key) => {
        const w = COL_WIDTH[key];
        if (key === 'start') {
          return (
            <DateCell
              key={key}
              width={w}
              label={`${item.name}: ${t('grid.start')}`}
              value={isPoint ? '' : item.start}
              disabled={item.kind === 'deadline' && !isParent}
              onCommit={(v) => setItemDate(item.id, 'start', v)}
            />
          );
        }
        if (key === 'end') {
          return (
            <DateCell
              key={key}
              width={w}
              label={`${item.name}: ${t('grid.end')}`}
              value={item.end}
              disabled={isParent}
              danger={props.overrun > 0}
              onCommit={(v) => setItemDate(item.id, 'end', v)}
            />
          );
        }
        if (key === 'duration') {
          return (
            <DurationCell
              key={key}
              width={w}
              label={`${item.name}: ${t('grid.duration')}`}
              value={isPoint ? 0 : props.workdays}
              editable={!isParent && item.kind !== 'deadline'}
              onCommit={(v) => setDuration(item.id, v)}
            />
          );
        }
        return <PeopleCell key={key} width={w} item={item} people={props.people} />;
      })}
    </div>
  );
});

function NameEditor({ item }: { item: Item }) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(item.name);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const save = () => renameItem(item.id, value);
  return (
    <input
      ref={ref}
      className="h-6 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-[13px] outline-none ring-2 ring-accent/20"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        save();
        if (useStore.getState().ui.editingId === item.id) startEditing(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
          if (e.ctrlKey || e.metaKey) addItem({ relativeTo: item.id, asChild: true });
          else if (e.shiftKey) startEditing(null);
          else addItem({ relativeTo: item.id });
        } else if (e.key === 'Escape') {
          startEditing(null);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          save();
          if (e.shiftKey) outdent(item.id);
          else indent(item.id);
          requestAnimationFrame(() => startEditing(item.id));
        }
      }}
    />
  );
}

interface DateCellProps {
  width: number;
  value: string;
  disabled?: boolean;
  danger?: boolean;
  label: string;
  onCommit: (value: string) => void;
}

const cellInput =
  'h-[26px] w-full rounded border border-transparent bg-transparent px-1 text-[12px] tabular-nums outline-none hover:border-border focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20';

/** Plausible complete date (typing a year digit by digit passes through e.g. 0002-…). */
const isComplete = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900;

/** Always-editable date field, committed when a complete date is entered or picked. */
function DateCell({ width, value, disabled, danger, label, onCommit }: DateCellProps) {
  if (disabled) {
    return (
      <div className="truncate px-2 text-[12px] tabular-nums text-muted" style={{ width }}>
        {value ? formatISO(value, FULL_DATE) : '–'}
      </div>
    );
  }
  const commit = (v: string) => {
    if (v !== value && (v === '' || isComplete(v))) onCommit(v);
  };
  return (
    <div className="px-0.5" style={{ width }}>
      <input
        key={value}
        type="date"
        aria-label={label}
        defaultValue={value}
        className={`${cellInput} date-cell ${danger ? 'font-semibold text-danger' : ''} ${
          value ? '' : 'is-empty'
        }`}
        onChange={(e) => isComplete(e.target.value) && commit(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          const input = e.target as HTMLInputElement;
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            input.value = value;
            input.blur();
          }
        }}
      />
    </div>
  );
}

interface DurationCellProps {
  width: number;
  value: number;
  editable: boolean;
  label: string;
  onCommit: (value: number) => void;
}

/** Always-editable working-day count; 0 turns a task into a milestone. */
function DurationCell({ width, value, editable, label, onCommit }: DurationCellProps) {
  const { t } = useTranslation();
  if (!editable) {
    return (
      <div className="truncate px-2 text-[12px] tabular-nums text-muted" style={{ width }}>
        {value ? t('common.workdays', { count: value }) : '–'}
      </div>
    );
  }
  const commit = (raw: string) => {
    const v = Math.round(Number(raw));
    if (raw !== '' && Number.isFinite(v) && v !== value) onCommit(v);
  };
  return (
    <div className="flex items-center px-0.5" style={{ width }}>
      <input
        key={value}
        type="number"
        min={0}
        aria-label={label}
        defaultValue={value}
        className={`${cellInput} text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          const input = e.target as HTMLInputElement;
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            input.value = String(value);
            input.blur();
          }
        }}
      />
      <span className="pl-0.5 pr-1 text-[11px] text-muted">{t('common.wdUnit')}</span>
    </div>
  );
}
