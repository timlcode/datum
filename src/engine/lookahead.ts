import type { Project, Scheduled, ScheduleResult, Task } from './types';
import { addDays, dayOf, startOfWeek, weekday, type DayStr } from './dates';
import { computeOutline } from './outline';

export interface LookAheadCell {
  day: DayStr;
  active: boolean;
  start: boolean;
  end: boolean;
  milestone: boolean;
}

export interface LookAheadRow {
  task: Task;
  s: Scheduled;
  phase: string;
  cells: LookAheadCell[];
  status: 'complete' | 'in-progress' | 'starting' | 'finishing' | 'milestone';
}

export interface LookAhead {
  from: DayStr;
  to: DayStr;
  days: DayStr[];
  weeks: { start: DayStr; days: DayStr[] }[];
  groups: { phase: string; rows: LookAheadRow[] }[];
  statusDay: DayStr;
}

export interface LookAheadOptions {
  weeks?: number;
  includeWeekends?: boolean;
  includeComplete?: boolean;
  /** Start the window on this day (defaults to the Monday of the status week). */
  from?: DayStr;
}

export function buildLookAhead(project: Project, schedule: ScheduleResult, statusDay: DayStr, opts: LookAheadOptions = {}): LookAhead {
  const weeks = opts.weeks ?? 3;
  const from = opts.from ?? startOfWeek(statusDay, 1);
  const to = addDays(from, weeks * 7 - 1);
  const allDays: DayStr[] = [];
  for (let i = 0; i < weeks * 7; i++) allDays.push(addDays(from, i));
  const days = opts.includeWeekends ? allDays : allDays.filter((d) => weekday(d) !== 0 && weekday(d) !== 6);
  const weekList: LookAhead['weeks'] = [];
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(from, w * 7);
    weekList.push({ start: ws, days: days.filter((d) => d >= ws && d < addDays(ws, 7)) });
  }

  const outline = computeOutline(project.tasks);
  const phaseOf = (uid: number): string => {
    let p = outline.get(uid)?.parentUid;
    let name = '';
    while (p !== undefined) {
      name = project.tasks.find((t) => t.uid === p)?.name ?? name;
      p = outline.get(p)?.parentUid;
    }
    return name || 'General';
  };

  const groups = new Map<string, LookAheadRow[]>();
  for (const t of project.tasks) {
    const s = schedule.byUid.get(t.uid)!;
    if (s.hasChildren) continue;
    const sd = dayOf(s.start);
    const fd = dayOf(s.finish);
    if (fd < from || sd > to) continue;
    if (!opts.includeComplete && t.percentComplete >= 100) continue;
    const isMs = t.milestone;
    const cells: LookAheadCell[] = days.map((d) => ({
      day: d,
      active: d >= sd && d <= fd,
      start: d === sd,
      end: d === fd,
      milestone: isMs && d === fd,
    }));
    let status: LookAheadRow['status'] = 'in-progress';
    if (t.percentComplete >= 100) status = 'complete';
    else if (isMs) status = 'milestone';
    else if (sd >= from && fd <= to) status = 'starting';
    else if (sd >= from) status = 'starting';
    else if (fd <= to) status = 'finishing';
    const phase = phaseOf(t.uid);
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase)!.push({ task: t, s, phase, cells, status });
  }
  // Keep phases in outline order.
  const order: string[] = [];
  for (const t of project.tasks) {
    const s = schedule.byUid.get(t.uid)!;
    if (!s.hasChildren) {
      const ph = phaseOf(t.uid);
      if (!order.includes(ph)) order.push(ph);
    }
  }
  return {
    from,
    to,
    days,
    weeks: weekList,
    statusDay,
    groups: order.filter((p) => groups.has(p)).map((phase) => ({ phase, rows: groups.get(phase)! })),
  };
}
