import type { Person } from '../../domain/types';
import { PERSON_MIME } from './personDrag';

interface AvatarProps {
  person: Person;
  size?: number;
  draggable?: boolean;
  ring?: boolean;
  title?: string;
}

export function Avatar({ person, size = 22, draggable = false, ring = false, title }: AvatarProps) {
  return (
    <span
      title={title ?? person.name}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData(PERSON_MIME, person.id);
              e.dataTransfer.setData('text/plain', person.name);
              e.dataTransfer.effectAllowed = 'copy';
            }
          : undefined
      }
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${
        ring ? 'ring-2 ring-surface' : ''
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        background: person.color,
      }}
    >
      {person.initials}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 3,
  size = 20,
}: {
  people: Person[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} ring />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted ring-2 ring-surface"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
