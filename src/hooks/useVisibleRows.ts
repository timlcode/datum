import { useMemo } from 'react';
import { useStore } from '../state/store';
import type { Scheduled, Task } from '@engine/types';

export interface Row {
  task: Task;
  s: Scheduled;
  index: number;
}

/** Rows currently visible in grid/Gantt after collapse, filter and search. */
export function useVisibleRows(): Row[] {
  const project = useStore((s) => s.project);
  const schedule = useStore((s) => s.schedule);
  const filter = useStore((s) => s.filter);
  const search = useStore((s) => s.search);
  return useMemo(() => {
    if (!project || !schedule) return [];
    const q = search.trim().toLowerCase();
    const rows: Row[] = project.tasks.map((task, index) => ({ task, s: schedule.byUid.get(task.uid)!, index }));
    if (filter === 'all' && !q) return rows.filter((r) => !r.s.hidden);
    const keep = new Set<number>();
    const parentOf = new Map<number, number | undefined>(rows.map((r) => [r.task.uid, r.s.parentUid]));
    const matches = (r: Row): boolean => {
      if (q && !r.task.name.toLowerCase().includes(q) && !r.task.resourceNames.toLowerCase().includes(q) && String(r.s.id) !== q) return false;
      switch (filter) {
        case 'critical': return r.s.critical && !r.s.hasChildren;
        case 'milestones': return r.task.milestone && !r.s.hasChildren;
        case 'incomplete': return !r.s.hasChildren && r.task.percentComplete < 100;
        case 'summary': return r.s.hasChildren;
        default: return true;
      }
    };
    for (const r of rows) {
      if (matches(r)) {
        keep.add(r.task.uid);
        let p = parentOf.get(r.task.uid);
        while (p !== undefined) {
          keep.add(p);
          p = parentOf.get(p);
        }
      }
    }
    return rows.filter((r) => keep.has(r.task.uid) && (!r.s.hidden || q !== '' || filter !== 'all'));
  }, [project, schedule, filter, search]);
}
