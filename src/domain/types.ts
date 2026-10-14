/** ISO calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

export type ItemKind = 'task' | 'milestone' | 'deadline';
export type ItemStatus = 'open' | 'active' | 'done';
export type Side = 'start' | 'end';
export type ScheduleMode = 'push' | 'keepGap';

export interface CalendarSettings {
  /** Weekdays that are working days, 0 = Sunday … 6 = Saturday. */
  workdays: number[];
  holidays: ISODate[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  startDate: ISODate;
  /** Global name per hierarchy depth (index 0 = top level). Deeper levels fall back to "Level n". */
  levelNames: string[];
  calendar: CalendarSettings;
  scheduleMode: ScheduleMode;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  parentId: string | null;
  /** Fractional index key, sorts siblings. */
  order: string;
  name: string;
  kind: ItemKind;
  /** Inclusive start day. Equals `end` for milestones and deadlines. Rolled up for parents. */
  start: ISODate;
  /** Inclusive end day. */
  end: ISODate;
  assigneeIds: string[];
  progress: number;
  status: ItemStatus;
  color?: string;
  notes?: string;
  collapsed?: boolean;
  updatedAt: string;
}

export interface Dependency {
  id: string;
  fromId: string;
  toId: string;
  fromSide: Side;
  toSide: Side;
  /** Hard links drive scheduling; soft links are associations only. */
  hard: boolean;
  /** Lag in working days (may be negative). */
  lag: number;
  updatedAt: string;
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
  email?: string;
  updatedAt: string;
}

export interface ProjectDoc {
  formatVersion: 1;
  project: ProjectMeta;
  items: Record<string, Item>;
  dependencies: Record<string, Dependency>;
  people: Record<string, Person>;
}

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export function linkType(dep: Pick<Dependency, 'fromSide' | 'toSide'>): LinkType {
  const a = dep.fromSide === 'end' ? 'F' : 'S';
  const b = dep.toSide === 'start' ? 'S' : 'F';
  return `${a}${b}` as LinkType;
}

export function sidesOf(type: LinkType): { fromSide: Side; toSide: Side } {
  return {
    fromSide: type[0] === 'F' ? 'end' : 'start',
    toSide: type[1] === 'S' ? 'start' : 'end',
  };
}
