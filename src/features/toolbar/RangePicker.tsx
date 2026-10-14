import { CalendarRange } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dayFromParts, mondayOf, parts, toDay, toISO, todayISO } from '../../domain/dates';
import { setUi, useStore, type DateRange } from '../../store/projectStore';
import { formatISO } from '../common/format';
import { Popover } from '../common/Popover';

type Preset = 'project' | 'weeks2' | 'month1' | 'months3' | 'months6' | 'year1';
const PRESETS: Preset[] = ['project', 'weeks2', 'month1', 'months3', 'months6', 'year1'];

function addMonths(day: number, months: number): number {
  const { year, month, date } = parts(day);
  return dayFromParts(year, month + months, date);
}

function presetRange(preset: Preset, projectRange: DateRange): DateRange {
  if (preset === 'project') return projectRange;
  const from = mondayOf(toDay(todayISO()));
  const to =
    preset === 'weeks2'
      ? from + 13
      : addMonths(from, { month1: 1, months3: 3, months6: 6, year1: 12 }[preset]) - 1;
  return { from: toISO(from), to: toISO(to) };
}

/** Lets the user pick any period; the timeline then fits exactly that period. */
export function RangePicker() {
  const { t } = useTranslation();
  const zoom = useStore((s) => s.ui.zoom);
  const range = useStore((s) => s.ui.range);
  const items = useStore((s) => s.doc?.items);
  const projectStart = useStore((s) => s.doc?.project.startDate);
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<DateRange | null>(null);

  const projectRange = (): DateRange => {
    const list = Object.values(items ?? {});
    if (!list.length) {
      const from = projectStart ?? todayISO();
      return { from, to: toISO(toDay(from) + 30) };
    }
    return {
      from: list.reduce((m, i) => (i.start < m ? i.start : m), list[0].start),
      to: list.reduce((m, i) => (i.end > m ? i.end : m), list[0].end),
    };
  };

  const apply = (r: DateRange) => {
    const ordered = r.from <= r.to ? r : { from: r.to, to: r.from };
    setUi({ zoom: 'custom', range: ordered });
    setAnchor(null);
  };

  const active = zoom === 'custom' && range;
  const short = { day: '2-digit', month: '2-digit' } as const;

  return (
    <>
      <button
        ref={ref}
        className={`btn ${active ? 'bg-accent/10 text-accent' : ''}`}
        aria-pressed={!!active}
        title={t('toolbar.rangeTitle')}
        onClick={() => {
          const r = ref.current!.getBoundingClientRect();
          setDraft(range ?? projectRange());
          setAnchor(anchor ? null : { x: r.left, y: r.bottom - 4 });
        }}
      >
        <CalendarRange size={15} />
        {active ? `${formatISO(range.from, short)} – ${formatISO(range.to)}` : t('toolbar.range')}
      </button>
      {anchor && draft && (
        <Popover
          x={anchor.x}
          y={anchor.y}
          onClose={() => setAnchor(null)}
          className="w-[300px] p-3"
        >
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label>
              <span className="label">{t('toolbar.rangeFrom')}</span>
              <input
                type="date"
                className="input"
                aria-label={t('toolbar.rangeFrom')}
                value={draft.from}
                onChange={(e) => e.target.value && setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label>
              <span className="label">{t('toolbar.rangeTo')}</span>
              <input
                type="date"
                className="input"
                aria-label={t('toolbar.rangeTo')}
                value={draft.to}
                onChange={(e) => e.target.value && setDraft({ ...draft, to: e.target.value })}
              />
            </label>
          </div>
          <button className="btn-primary mb-3 w-full justify-center" onClick={() => apply(draft)}>
            {t('toolbar.rangeApply')}
          </button>
          <span className="label">{t('toolbar.rangeQuick')}</span>
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                className="rounded-md border border-border px-2 py-1.5 text-left text-[12px] hover:border-accent hover:text-accent"
                onClick={() => apply(presetRange(p, projectRange()))}
              >
                {t(`toolbar.presets.${p}`)}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
