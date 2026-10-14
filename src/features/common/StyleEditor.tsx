import { useTranslation } from 'react-i18next';
import { ITEM_COLORS } from '../../domain/factory';
import { BAR_FILLS, LABEL_POSITIONS, LEVEL_PALETTE, type ResolvedStyle } from '../../domain/styles';
import type { BarFill, BarStyle } from '../../domain/types';

const SWATCHES = [...new Set([...LEVEL_PALETTE, ...ITEM_COLORS])];

interface StyleEditorProps {
  value: ResolvedStyle;
  onChange: (patch: BarStyle) => void;
}

/** Colour, fill and label controls shared by level styles and individual bar styles. */
export function StyleEditor({ value, onChange }: StyleEditorProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div>
        <span className="label">{t('style.color')}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              aria-label={c}
              aria-pressed={value.color === c}
              className={`h-6 w-6 rounded-full ${
                value.color === c ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
              }`}
              style={{ background: c }}
              onClick={() => onChange({ color: c })}
            />
          ))}
          <label
            className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-dashed border-muted"
            title={t('style.custom')}
          >
            <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] opacity-70" />
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={value.color}
              onChange={(e) => onChange({ color: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div>
        <span className="label">{t('style.fill')}</span>
        <div className="grid grid-cols-4 gap-1">
          {BAR_FILLS.map((fill) => (
            <button
              key={fill}
              aria-pressed={value.fill === fill}
              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[11px] ${
                value.fill === fill
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:text-text'
              }`}
              onClick={() => onChange({ fill })}
            >
              <FillPreview fill={fill} color={value.color} />
              {t(`style.fills.${fill}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">{t('style.label')}</span>
        <div className="seg">
          {LABEL_POSITIONS.map((label) => (
            <button
              key={label}
              aria-pressed={value.label === label}
              onClick={() => onChange({ label })}
            >
              {t(`style.labels.${label}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FillPreview({
  fill,
  color,
  width = 40,
}: {
  fill: BarFill;
  color: string;
  width?: number;
}) {
  const id = `prev-${fill}-${color.replace('#', '')}`;
  return (
    <svg width={width} height={10} className="block">
      {fill === 'striped' && (
        <defs>
          <pattern
            id={id}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill={color} fillOpacity={0.25} />
            <rect width={3} height={6} fill={color} />
          </pattern>
        </defs>
      )}
      <rect
        x={0.75}
        y={0.75}
        width={width - 1.5}
        height={8.5}
        rx={2.5}
        fill={
          fill === 'solid'
            ? color
            : fill === 'soft'
              ? color
              : fill === 'striped'
                ? `url(#${id})`
                : 'transparent'
        }
        fillOpacity={fill === 'soft' ? 0.3 : 1}
        stroke={fill === 'solid' ? 'none' : color}
        strokeWidth={1.5}
      />
    </svg>
  );
}
