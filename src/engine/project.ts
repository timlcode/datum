import type { BoardCard, Project, Task } from './types';
import { defaultCalendar } from './calendar';
import { makeDateTime, todayLocal, type DayStr } from './dates';

export function newProject(name = 'Untitled Schedule', startDay: DayStr = todayLocal()): Project {
  return {
    name,
    startDate: makeDateTime(startDay, 8, 0),
    statusDate: todayLocal(),
    calendar: defaultCalendar(),
    tasks: [],
    nextUid: 1,
    decisions: [],
    buyout: [],
  };
}

export function newTask(uid: number, partial: Partial<Task> = {}): Task {
  return {
    uid,
    name: '',
    outlineLevel: 1,
    durationDays: 1,
    milestone: false,
    constraintType: 'ASAP',
    predecessors: [],
    percentComplete: 0,
    resourceNames: '',
    notes: '',
    expanded: true,
    ...partial,
  };
}

/** Deep-ish clone suitable for undo snapshots. */
function cloneCard(c: BoardCard): BoardCard {
  return { ...c, tags: [...(c.tags ?? [])] };
}

export function cloneProject(p: Project): Project {
  return {
    ...p,
    calendar: { ...p.calendar, workWeek: [...p.calendar.workWeek] as Project['calendar']['workWeek'], exceptions: p.calendar.exceptions.map((e) => ({ ...e })) },
    tasks: p.tasks.map((t) => ({ ...t, predecessors: t.predecessors.map((l) => ({ ...l })) })),
    decisions: (p.decisions ?? []).map(cloneCard),
    buyout: (p.buyout ?? []).map(cloneCard),
  };
}
