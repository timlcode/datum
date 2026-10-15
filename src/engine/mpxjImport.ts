// Converts the JSON produced by MPXJ's JsonWriter (MpxjConvert file.mpp out.json)
// into a Datum Project. Durations arrive as seconds of working time.

import type { Calendar, ConstraintType, LinkType, Project, Task } from './types';
import { defaultCalendar } from './calendar';
import { dayOf, todayLocal } from './dates';
import { normalizeLevels } from './outline';

interface MpxjRelation {
  predecessor_task_unique_id: number;
  successor_task_unique_id: number;
  type?: string;
  lag?: number;
  lag_units?: string;
}

interface MpxjTask {
  unique_id: number;
  id?: number;
  name?: string;
  outline_level?: number;
  duration?: number;
  duration_units?: string;
  milestone?: boolean;
  summary?: boolean;
  start?: string;
  finish?: string;
  actual_start?: string;
  actual_finish?: string;
  baseline_start?: string;
  baseline_finish?: string;
  baseline_duration?: number;
  percent_complete?: number;
  constraint_type?: string;
  constraint_date?: string;
  predecessors?: MpxjRelation[];
  notes?: string;
  expanded?: boolean;
  active?: boolean;
  resource_names?: string;
  parent_task_unique_id?: number;
  is_null?: boolean;
}

interface MpxjCalendarDay {
  type?: string;
  hours?: { from: string; to: string }[];
}

interface MpxjCalendar {
  unique_id: number;
  name?: string;
  type?: string;
  sunday?: MpxjCalendarDay;
  monday?: MpxjCalendarDay;
  tuesday?: MpxjCalendarDay;
  wednesday?: MpxjCalendarDay;
  thursday?: MpxjCalendarDay;
  friday?: MpxjCalendarDay;
  saturday?: MpxjCalendarDay;
  exceptions?: MpxjException[];
}

interface MpxjRecurrence {
  type?: string; // daily | weekly | monthly | yearly
  start_date?: string;
  finish_date?: string;
  occurrences?: number;
  relative?: boolean;
  day_number?: number; // absolute: day of month; relative: 1..4 = nth, 5 = last
  month_number?: number;
  weekly_days?: string[];
  frequency?: number;
}

interface MpxjException {
  name?: string;
  from?: string;
  to?: string;
  type?: string;
  hours?: unknown[];
  /** MS Project recurring exceptions (yearly holidays etc.) carry no from/to. */
  recurrence?: MpxjRecurrence;
  parent_unique_id?: number;
}

interface MpxjResource {
  unique_id: number;
  name?: string;
}

interface MpxjAssignment {
  task_unique_id: number;
  resource_unique_id?: number;
}

export interface MpxjJson {
  property_values?: Record<string, unknown>;
  calendars?: MpxjCalendar[];
  resources?: MpxjResource[];
  tasks?: MpxjTask[];
  assignments?: MpxjAssignment[];
}

const CONSTRAINT_MAP: Record<string, ConstraintType> = {
  AS_SOON_AS_POSSIBLE: 'ASAP',
  AS_LATE_AS_POSSIBLE: 'ALAP',
  MUST_START_ON: 'MSO',
  MUST_FINISH_ON: 'MFO',
  START_NO_EARLIER_THAN: 'SNET',
  START_NO_LATER_THAN: 'SNLT',
  FINISH_NO_EARLIER_THAN: 'FNET',
  FINISH_NO_LATER_THAN: 'FNLT',
};

function trimDate(s?: string): string | undefined {
  if (!s) return undefined;
  return s.slice(0, 16);
}

export function importMpxj(json: MpxjJson, filePath?: string): Project {
  const props = json.property_values ?? {};
  const minutesPerDay = Number(props.minutes_per_day) || 480;
  const secondsPerDay = minutesPerDay * 60;

  const toDays = (seconds: number | undefined, units?: string): number => {
    if (!seconds) return 0;
    if (units && units.startsWith('e') && seconds >= 86400) {
      // Elapsed units: convert calendar time to approximate working days.
      return round2((seconds / 86400) * (5 / 7));
    }
    return round2(seconds / secondsPerDay);
  };

  // Calendar: use the project default calendar if it exists.
  const calendar = importCalendar(json.calendars ?? [], Number(props.default_calendar_unique_id));

  // Resource names via assignments.
  const resourceName = new Map<number, string>();
  for (const r of json.resources ?? []) if (r.name) resourceName.set(r.unique_id, r.name);
  const namesByTask = new Map<number, string[]>();
  for (const a of json.assignments ?? []) {
    const n = a.resource_unique_id !== undefined ? resourceName.get(a.resource_unique_id) : undefined;
    if (!n) continue;
    if (!namesByTask.has(a.task_unique_id)) namesByTask.set(a.task_unique_id, []);
    namesByTask.get(a.task_unique_id)!.push(n);
  }

  const raw = (json.tasks ?? []).filter((t) => !t.is_null && t.name !== undefined);
  // Drop the project summary task (uid 0 / outline level 0).
  const hasRoot = raw.some((t) => (t.outline_level ?? 1) === 0 || t.unique_id === 0);
  const rootName = raw.find((t) => (t.outline_level ?? 1) === 0 || t.unique_id === 0)?.name;
  const list = raw.filter((t) => !((t.outline_level ?? 1) === 0 || t.unique_id === 0));
  list.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  let maxUid = 0;
  const tasks: Task[] = list.map((t) => {
    maxUid = Math.max(maxUid, t.unique_id);
    const milestone = !!t.milestone || (t.duration ?? 0) === 0 && !t.summary;
    const links = (t.predecessors ?? []).map((r) => ({
      predUid: r.predecessor_task_unique_id,
      type: ((r.type ?? 'FS').toUpperCase() as LinkType),
      lagDays: toDays(r.lag, r.lag_units),
    }));
    const task: Task = {
      uid: t.unique_id,
      name: t.name ?? '',
      outlineLevel: Math.max(1, t.outline_level ?? 1),
      durationDays: milestone ? 0 : Math.max(0, toDays(t.duration, t.duration_units)),
      milestone,
      constraintType: CONSTRAINT_MAP[t.constraint_type ?? ''] ?? 'ASAP',
      constraintDate: trimDate(t.constraint_date),
      predecessors: links,
      percentComplete: Math.round(Number(t.percent_complete ?? 0)),
      resourceNames: t.resource_names ?? (namesByTask.get(t.unique_id)?.join(', ') ?? ''),
      notes: (t.notes ?? '').trim(),
      expanded: t.expanded !== false,
      actualStart: trimDate(t.actual_start),
      actualFinish: trimDate(t.actual_finish),
      baselineStart: trimDate(t.baseline_start),
      baselineFinish: trimDate(t.baseline_finish),
      baselineDurationDays: t.baseline_duration !== undefined ? toDays(t.baseline_duration) : undefined,
    };
    if (task.constraintType === 'ASAP' || task.constraintType === 'ALAP') task.constraintDate = undefined;
    return task;
  });

  const startDate = trimDate(props.start_date as string | undefined);
  const name =
    (props.project_title as string | undefined) ||
    (hasRoot ? rootName : undefined) ||
    (filePath ? filePath.split('/').pop()!.replace(/\.[^.]+$/, '') : 'Imported Schedule');

  const statusRaw = trimDate(props.status_date as string | undefined);
  const project: Project = {
    name: name ?? 'Imported Schedule',
    startDate: startDate ?? `${todayLocal()}T08:00`,
    statusDate: statusRaw ? dayOf(statusRaw) : todayLocal(),
    company: props.company as string | undefined,
    author: props.author as string | undefined,
    manager: props.manager as string | undefined,
    calendar,
    tasks: normalizeLevels(tasks),
    nextUid: maxUid + 1,
    filePath,
    notes: (props.comments as string | undefined) ?? undefined,
  };
  return project;
}

function importCalendar(cals: MpxjCalendar[], defaultUid: number): Calendar {
  const cal = defaultCalendar();
  const source = cals.find((c) => c.unique_id === defaultUid) ?? cals.find((c) => c.name === 'Standard') ?? cals[0];
  if (!source) return cal;
  cal.name = source.name ?? 'Standard';
  const days: (keyof MpxjCalendar)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let anyDefined = false;
  const week = [...cal.workWeek] as Calendar['workWeek'];
  days.forEach((d, i) => {
    const v = source[d] as MpxjCalendarDay | undefined;
    if (!v || !v.type) return;
    anyDefined = true;
    week[i] = v.type === 'working';
  });
  if (anyDefined) cal.workWeek = week;
  for (const ex of source.exceptions ?? []) {
    const working = ex.type === 'working' || (Array.isArray(ex.hours) && ex.hours.length > 0);
    if (ex.recurrence && !ex.from) {
      for (const d of expandRecurrence(ex.recurrence)) cal.exceptions.push({ date: d, working, name: ex.name });
      continue;
    }
    if (!ex.from) continue;
    const from = dayOf(ex.from);
    const to = ex.to ? dayOf(ex.to) : from;
    let d = from;
    let guard = 0;
    while (d <= to && guard++ < 366) {
      cal.exceptions.push({ date: d, working, name: ex.name });
      d = addOne(d);
    }
  }
  return cal;
}

const WEEKDAY_INDEX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** nth (1-4) or last (5) weekday of a month, UTC. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  if (n >= 5) {
    const last = new Date(Date.UTC(year, month0 + 1, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return new Date(Date.UTC(year, month0, last.getUTCDate() - back));
  }
  const first = new Date(Date.UTC(year, month0, 1));
  const fwd = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month0, 1 + fwd + (n - 1) * 7));
}

/**
 * Expands an MS Project recurring calendar exception into concrete days.
 * Bounded by the recurrence's own start/finish and a 12-year cap so a
 * "yearly until 2063" holiday cannot bloat the calendar.
 */
function expandRecurrence(r: MpxjRecurrence): string[] {
  if (!r.start_date) return [];
  const start = new Date(Date.parse(dayOf(r.start_date) + 'T00:00:00Z'));
  const capEnd = new Date(Date.UTC(start.getUTCFullYear() + 12, 11, 31));
  const finish = r.finish_date ? new Date(Math.min(Date.parse(dayOf(r.finish_date) + 'T00:00:00Z'), capEnd.getTime())) : capEnd;
  const maxOcc = r.occurrences && r.occurrences > 0 ? Math.min(r.occurrences, 400) : 400;
  const out: string[] = [];
  const freq = Math.max(1, r.frequency ?? 1);
  const type = (r.type ?? 'yearly').toLowerCase();
  const weekdays = (r.weekly_days ?? []).map((w) => WEEKDAY_INDEX[w.toLowerCase()]).filter((n) => n !== undefined);

  if (type === 'daily') {
    for (let d = new Date(start), i = 0; d <= finish && i < maxOcc; d.setUTCDate(d.getUTCDate() + freq), i++) out.push(ymd(d));
  } else if (type === 'weekly') {
    const days = weekdays.length ? weekdays : [start.getUTCDay()];
    // Walk week by week from the start's week.
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    for (let w = new Date(weekStart); w <= finish && out.length < maxOcc; w.setUTCDate(w.getUTCDate() + 7 * freq)) {
      for (const wd of days) {
        const d = new Date(w);
        d.setUTCDate(d.getUTCDate() + wd);
        if (d >= start && d <= finish && out.length < maxOcc) out.push(ymd(d));
      }
    }
  } else if (type === 'monthly') {
    for (let y = start.getUTCFullYear(), m = start.getUTCMonth(), i = 0; i < 12 * 13; i++, m += freq) {
      const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
      const d = r.relative && weekdays.length ? nthWeekday(yy, mm, weekdays[0], r.day_number ?? 1) : new Date(Date.UTC(yy, mm, r.day_number ?? start.getUTCDate()));
      if (d > finish || out.length >= maxOcc) break;
      if (d >= start) out.push(ymd(d));
    }
  } else {
    // yearly
    const month0 = (r.month_number ?? start.getUTCMonth() + 1) - 1;
    for (let y = start.getUTCFullYear(); y <= finish.getUTCFullYear() && out.length < maxOcc; y += freq) {
      const d = r.relative && weekdays.length ? nthWeekday(y, month0, weekdays[0], r.day_number ?? 1) : new Date(Date.UTC(y, month0, r.day_number ?? start.getUTCDate()));
      if (d >= start && d <= finish) out.push(ymd(d));
    }
  }
  return out;
}

function addOne(day: string): string {
  const dt = new Date(Date.parse(day + 'T00:00:00Z') + 86400000);
  return dt.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
