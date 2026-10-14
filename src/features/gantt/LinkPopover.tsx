import { ArrowRight, Link, Trash2, Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { linkType, sidesOf, type Dependency, type LinkType } from '../../domain/types';
import { deleteDependency, updateDependency } from '../../store/actions';
import { useStore } from '../../store/projectStore';
import { Popover } from '../common/Popover';

interface LinkPopoverProps {
  dep: Dependency;
  x: number;
  y: number;
  onClose: () => void;
}

const TYPES: LinkType[] = ['FS', 'SS', 'FF', 'SF'];

export function LinkPopover({ dep, x, y, onClose }: LinkPopoverProps) {
  const { t } = useTranslation();
  const items = useStore((s) => s.doc?.items);
  const from = items?.[dep.fromId];
  const to = items?.[dep.toId];

  return (
    <Popover x={x} y={y} onClose={onClose} className="w-[280px] p-3">
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-medium">
        <span className="truncate">{from?.name}</span>
        <ArrowRight size={13} className="shrink-0 text-muted" />
        <span className="truncate">{to?.name}</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <button
          className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] ${
            dep.hard
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-muted hover:text-text'
          }`}
          onClick={() => updateDependency(dep.id, { hard: true })}
        >
          <Link size={13} /> {t('link.makeHard')}
        </button>
        <button
          className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] ${
            !dep.hard
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-muted hover:text-text'
          }`}
          onClick={() => updateDependency(dep.id, { hard: false })}
        >
          <Unlink size={13} /> {t('link.makeSoft')}
        </button>
      </div>

      <label className="label">{t('link.type')}</label>
      <select
        className="input mb-3"
        value={linkType(dep)}
        onChange={(e) => updateDependency(dep.id, sidesOf(e.target.value as LinkType))}
      >
        {TYPES.map((type) => (
          <option key={type} value={type}>
            {type} · {t(`link.${type}`)}
          </option>
        ))}
      </select>

      <label className="label">{t('link.lag')}</label>
      <input
        type="number"
        className="input mb-3"
        defaultValue={dep.lag}
        key={dep.lag}
        onBlur={(e) => {
          const lag = Math.round(Number(e.target.value));
          if (Number.isFinite(lag) && lag !== dep.lag) updateDependency(dep.id, { lag });
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />

      <button
        className="btn w-full justify-center text-danger hover:bg-danger/10"
        onClick={() => {
          deleteDependency(dep.id);
          onClose();
        }}
      >
        <Trash2 size={14} /> {t('link.delete')}
      </button>
    </Popover>
  );
}
