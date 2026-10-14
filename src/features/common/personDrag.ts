import type { DragEvent } from 'react';

export const PERSON_MIME = 'application/x-gantt-person';

/** True when a drag event carries a person from the team list. */
export function hasPerson(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(PERSON_MIME);
}
