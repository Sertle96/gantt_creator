import { useTranslation } from 'react-i18next';
import { toDay, todayISO } from '../../domain/dates';
import type { WorkCalendar } from '../../domain/calendar';
import { TIER_H, TIERS, tickLabel, ticks, type Scale } from './scale';

interface TimelineHeaderProps {
  scale: Scale;
  cal: WorkCalendar;
  fromX: number;
  toX: number;
}

export function TimelineHeader({ scale, cal, fromX, toX }: TimelineHeaderProps) {
  const { t } = useTranslation();
  const [topUnit, bottomUnit] = TIERS[scale.zoom];
  const weekLabel = (w: number) => t('person.week', { week: w });
  const label = (start: number, unit: Parameters<typeof tickLabel>[1], width: number) =>
    tickLabel(start, unit, width, weekLabel);
  const top = ticks(scale, topUnit, fromX, toX, label);
  const bottom = ticks(scale, bottomUnit, fromX, toX, label);
  const today = toDay(todayISO());

  return (
    <svg width={scale.width} height={TIER_H * 2} className="block select-none">
      <rect width={scale.width} height={TIER_H * 2} fill="rgb(var(--surface))" />
      {top.map((tick) => (
        <g key={`t${tick.day}`}>
          <line x1={tick.x} x2={tick.x} y1={0} y2={TIER_H} stroke="var(--grid-line)" />
          <text
            x={Math.max(tick.x, fromX) + 6}
            y={TIER_H / 2 + 4}
            fontSize={11.5}
            fontWeight={600}
            fill="rgb(var(--text))"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {bottom.map((tick) => {
        const off = bottomUnit === 'day' && !cal.isWorkday(tick.day);
        const isToday = bottomUnit === 'day' && tick.day === today;
        return (
          <g key={`b${tick.day}`}>
            {off && (
              <rect x={tick.x} y={TIER_H} width={tick.w} height={TIER_H} fill="var(--weekend)" />
            )}
            <line x1={tick.x} x2={tick.x} y1={TIER_H} y2={TIER_H * 2} stroke="var(--grid-line)" />
            <text
              x={tick.x + tick.w / 2}
              y={TIER_H + TIER_H / 2 + 4}
              fontSize={11}
              textAnchor="middle"
              fontWeight={isToday ? 700 : 400}
              fill={
                isToday ? 'var(--today)' : off ? 'rgb(var(--muted) / 0.7)' : 'rgb(var(--muted))'
              }
            >
              {tick.label}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={scale.width} y1={TIER_H} y2={TIER_H} stroke="var(--grid-line)" />
      <line
        x1={0}
        x2={scale.width}
        y1={TIER_H * 2 - 0.5}
        y2={TIER_H * 2 - 0.5}
        stroke="rgb(var(--border))"
      />
    </svg>
  );
}
