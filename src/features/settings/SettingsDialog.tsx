import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { levelStyle } from '../../domain/styles';
import type { ProjectMeta } from '../../domain/types';
import { currentLanguage, LANGUAGES, setLanguage } from '../../i18n';
import {
  moveLevel,
  removeLastLevel,
  renameProject,
  setCalendar,
  setLevelNames,
  setLevelStyle,
  setProjectStart,
  setScheduleMode,
} from '../../store/actions';
import { setUi, useStore } from '../../store/projectStore';
import { formatDay, formatISO, MEDIUM } from '../common/format';
import { legible } from '../common/color';
import { Modal } from '../common/Modal';
import { Popover } from '../common/Popover';
import { FillPreview, StyleEditor } from '../common/StyleEditor';

// 1970-01-04 was a Sunday: day numbers 3..9 give Sunday..Saturday.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function SettingsDialog() {
  const { t } = useTranslation();
  const project = useStore((s) => s.doc?.project);
  const dark = useStore((s) => s.ui.dark);
  const maxDepth = useStore((s) => {
    const items = s.doc?.items ?? {};
    let max = 0;
    for (const item of Object.values(items)) {
      let d = 0;
      let p = item.parentId;
      while (p && items[p] && d < 100) {
        d++;
        p = items[p].parentId;
      }
      max = Math.max(max, d + 1);
    }
    return max;
  });
  const [holiday, setHoliday] = useState('');
  if (!project) return null;

  const levels = project.levelNames;
  const rows = Math.max(levels.length, maxDepth);
  const updateLevel = (i: number, name: string) => {
    const next = [...levels];
    while (next.length <= i) next.push('');
    next[i] = name;
    setLevelNames(next);
  };
  const cal = project.calendar;

  return (
    <Modal title={t('settings.title')} onClose={() => setUi({ settingsOpen: false })} width={620}>
      <Section title={t('settings.general')}>
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <label>
            <span className="label">{t('settings.projectName')}</span>
            <input
              key={project.name}
              className="input"
              defaultValue={project.name}
              onBlur={(e) => e.target.value !== project.name && renameProject(e.target.value)}
            />
          </label>
          <label>
            <span className="label">{t('settings.startDate')}</span>
            <input
              key={project.startDate}
              type="date"
              className="input"
              defaultValue={project.startDate}
              onBlur={(e) =>
                e.target.value !== project.startDate && setProjectStart(e.target.value)
              }
            />
          </label>
        </div>
        <div className="mt-3">
          <span className="label">{t('settings.language')}</span>
          <div className="seg">
            {LANGUAGES.map((lng) => (
              <button
                key={lng}
                aria-pressed={currentLanguage() === lng}
                onClick={() => setLanguage(lng)}
              >
                {lng === 'de' ? 'Deutsch' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('settings.levels')}>
        <p className="mb-3 text-[12px] text-muted">{t('settings.levelsHint')}</p>
        <ol className="space-y-1.5">
          {Array.from({ length: rows }, (_, i) => (
            <li
              key={i}
              className="flex items-center gap-2"
              style={{ paddingLeft: Math.min(i, 8) * 14 }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold"
                style={{
                  color: legible(levelStyle(project, i).color, dark),
                  background: `${legible(levelStyle(project, i).color, dark)}1a`,
                }}
              >
                {i + 1}
              </span>
              <input
                key={`${i}-${levels[i] ?? ''}`}
                className="input h-7"
                defaultValue={levels[i] ?? ''}
                placeholder={t('settings.levelFallback', { n: i + 1 })}
                onBlur={(e) =>
                  e.target.value !== (levels[i] ?? '') && updateLevel(i, e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <LevelStyleButton project={project} depth={i} />
              <button
                className="btn-icon h-7 w-7"
                disabled={i === 0 || i >= levels.length}
                onClick={() => moveLevel(i, -1)}
              >
                <ArrowUp size={13} />
              </button>
              <button
                className="btn-icon h-7 w-7"
                disabled={i >= levels.length - 1}
                onClick={() => moveLevel(i, 1)}
              >
                <ArrowDown size={13} />
              </button>
              <button
                className="btn-icon h-7 w-7 hover:text-danger"
                disabled={i >= levels.length || i !== levels.length - 1}
                onClick={removeLastLevel}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ol>
        <button className="btn mt-2 text-accent" onClick={() => setLevelNames([...levels, ''])}>
          <Plus size={14} /> {t('settings.addLevel')}
        </button>
      </Section>

      <Section title={t('settings.calendar')}>
        <span className="label">{t('settings.workdays')}</span>
        <div className="mb-3 flex flex-wrap gap-1">
          {WEEKDAY_ORDER.map((wd) => {
            const on = cal.workdays.includes(wd);
            return (
              <button
                key={wd}
                className={`h-8 w-11 rounded-md border text-[12px] ${
                  on
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'border-border text-muted'
                }`}
                onClick={() =>
                  setCalendar({
                    ...cal,
                    workdays: on
                      ? cal.workdays.filter((d) => d !== wd)
                      : [...cal.workdays, wd].sort(),
                  })
                }
              >
                {formatDay(3 + wd, { weekday: 'short' })}
              </button>
            );
          })}
        </div>
        <span className="label">{t('settings.holidays')}</span>
        <div className="mb-2 flex gap-2">
          <input
            type="date"
            className="input w-44"
            value={holiday}
            onChange={(e) => setHoliday(e.target.value)}
          />
          <button
            className="btn"
            disabled={!holiday || cal.holidays.includes(holiday)}
            onClick={() => {
              setCalendar({ ...cal, holidays: [...cal.holidays, holiday].sort() });
              setHoliday('');
            }}
          >
            <Plus size={14} /> {t('settings.addHoliday')}
          </button>
        </div>
        {cal.holidays.length === 0 ? (
          <p className="text-[12px] text-muted">{t('settings.noHolidays')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {cal.holidays.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[12px]"
              >
                {formatISO(h, MEDIUM)}
                <button
                  className="text-muted hover:text-danger"
                  onClick={() =>
                    setCalendar({ ...cal, holidays: cal.holidays.filter((x) => x !== h) })
                  }
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('settings.scheduling')}>
        {(['push', 'keepGap'] as const).map((mode) => (
          <label
            key={mode}
            className="mb-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 has-[:checked]:border-accent"
          >
            <input
              type="radio"
              name="scheduleMode"
              className="mt-0.5 accent-[rgb(var(--accent))]"
              checked={project.scheduleMode === mode}
              onChange={() => setScheduleMode(mode)}
            />
            <span>
              <span className="block font-medium">{t(`settings.${mode}`)}</span>
              <span className="text-[12px] text-muted">{t(`settings.${mode}Hint`)}</span>
            </span>
          </label>
        ))}
      </Section>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 text-[13px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Preview of a level's bar style that opens the style editor for that level. */
function LevelStyleButton({ project, depth }: { project: ProjectMeta; depth: number }) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const style = levelStyle(project, depth);
  return (
    <>
      <button
        className="flex h-7 shrink-0 items-center rounded-md border border-border px-2 hover:border-accent"
        title={t('style.title')}
        aria-label={`${t('style.title')} ${depth + 1}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { x: r.left - 120, y: r.bottom - 4 });
        }}
      >
        <FillPreview fill={style.fill} color={style.color} width={46} />
      </button>
      {anchor && (
        <Popover
          x={anchor.x}
          y={anchor.y}
          onClose={() => setAnchor(null)}
          className="w-[290px] p-3"
        >
          <p className="mb-3 text-[12px] text-muted">{t('style.levelHint')}</p>
          <StyleEditor value={style} onChange={(patch) => setLevelStyle(depth, patch)} />
          <button
            className="btn mt-3 w-full justify-center"
            onClick={() => setLevelStyle(depth, null)}
          >
            <RotateCcw size={14} /> {t('style.resetLevel')}
          </button>
        </Popover>
      )}
    </>
  );
}
