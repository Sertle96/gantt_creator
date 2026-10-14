import { Link, Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Dependency } from '../../domain/types';
import { toggleDependencyHard } from '../../store/actions';
import type { DisplayModel } from '../../store/analysis';
import { linkRoute, type BarGeom, type LinkRoute } from './geometry';

interface DependencyLayerProps {
  model: DisplayModel;
  geom: (id: string) => BarGeom | null;
  rowsFrom: number;
  rowsTo: number;
  critical: Set<string> | null;
  selectedDepId: string | null;
  onOpenMenu: (dep: Dependency, clientX: number, clientY: number) => void;
  /** Lines go below the bars, chain-link toggles above everything. */
  part: 'lines' | 'toggles';
}

interface RenderedLink {
  dep: Dependency;
  route: LinkRoute;
  folded: boolean;
  selected: boolean;
  isCritical: boolean;
  tone: 'accent' | 'critical' | 'link' | 'link-soft';
  color: string;
  opacity: number;
}

function collect({
  model,
  geom,
  rowsFrom,
  rowsTo,
  critical,
  selectedDepId,
}: DependencyLayerProps): RenderedLink[] {
  const { doc, rowIndex, person } = model;
  const deps = person ? person.deps : Object.values(doc.dependencies);

  // Links into collapsed parts of the tree attach to the closest visible ancestor.
  const resolve = (id: string): string | null => {
    if (rowIndex.has(id)) return id;
    if (person) return null;
    let cur = doc.items[id]?.parentId;
    while (cur) {
      if (rowIndex.has(cur)) return cur;
      cur = doc.items[cur]?.parentId;
    }
    return null;
  };

  const out: RenderedLink[] = [];
  for (const dep of deps) {
    const a = resolve(dep.fromId);
    const b = resolve(dep.toId);
    if (!a || !b || a === b) continue;
    const ga = geom(a);
    const gb = geom(b);
    if (!ga || !gb) continue;
    if (Math.min(ga.row, gb.row) > rowsTo || Math.max(ga.row, gb.row) < rowsFrom) continue;
    const selected = dep.id === selectedDepId;
    const isCritical = critical?.has(dep.id) ?? false;
    const tone = selected ? 'accent' : isCritical ? 'critical' : dep.hard ? 'link' : 'link-soft';
    const contextual =
      person && (!person.own.has(dep.fromId) || !person.own.has(dep.toId)) ? 0.55 : 1;
    const dimmed = critical && !isCritical ? 0.35 : 1;
    out.push({
      dep,
      route: linkRoute(ga, dep.fromSide, gb, dep.toSide),
      folded: a !== dep.fromId || b !== dep.toId,
      selected,
      isCritical,
      tone,
      color: tone === 'accent' ? 'rgb(var(--accent))' : `var(--${tone})`,
      opacity: Math.min(contextual, dimmed),
    });
  }
  return out;
}

export function DependencyLayer(props: DependencyLayerProps) {
  const { t } = useTranslation();
  const links = collect(props);
  const { doc } = props.model;

  if (props.part === 'lines') {
    return (
      <g>
        {links.map(({ dep, route, folded, selected, isCritical, tone, color, opacity }) => (
          <g
            key={dep.id}
            data-dep-id={dep.id}
            className={`dep ${selected ? 'is-selected' : ''}`}
            opacity={opacity}
            onContextMenu={(e) => {
              e.preventDefault();
              props.onOpenMenu(dep, e.clientX, e.clientY);
            }}
          >
            <path
              d={route.d}
              fill="none"
              stroke="transparent"
              strokeWidth={10}
              style={{ cursor: 'pointer' }}
              onClick={(e) => props.onOpenMenu(dep, e.clientX, e.clientY)}
            />
            <path
              className="dep-line"
              d={route.d}
              fill="none"
              stroke={color}
              strokeWidth={isCritical || selected ? 2 : 1.5}
              strokeDasharray={dep.hard ? (folded ? '2 3' : undefined) : '5 4'}
              markerEnd={dep.hard ? `url(#arrow-${tone})` : undefined}
              pointerEvents="none"
            />
          </g>
        ))}
      </g>
    );
  }

  return (
    <g>
      {links.map(({ dep, route, color, opacity }) => (
        <g
          key={dep.id}
          data-dep-id={dep.id}
          className="dep-toggle"
          transform={`translate(${route.mid.x},${route.mid.y})`}
          opacity={opacity}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            toggleDependencyHard(dep.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            props.onOpenMenu(dep, e.clientX, e.clientY);
          }}
          role="button"
          aria-label={t(dep.hard ? 'link.hard' : 'link.soft')}
        >
          <title>{`${doc.items[dep.fromId]?.name} → ${doc.items[dep.toId]?.name}\n${t(
            dep.hard ? 'link.hard' : 'link.soft',
          )}\n${t('link.toggle')}`}</title>
          <circle r={9} fill="rgb(var(--surface))" stroke={color} strokeWidth={1.25} />
          {dep.hard ? (
            <Link x={-5.5} y={-5.5} width={11} height={11} color={color} strokeWidth={2.5} />
          ) : (
            <Unlink x={-5.5} y={-5.5} width={11} height={11} color={color} strokeWidth={2.5} />
          )}
        </g>
      ))}
    </g>
  );
}
