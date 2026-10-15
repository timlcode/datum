import type { Project, Scheduled, ScheduleResult, Task } from '@engine/types';
import type { ColumnId } from '../components/TaskGrid';
import { fmtNumericShort as fmtNumeric } from '@engine/dates';
import { formatDuration, formatPredecessors, idMaps } from '@engine/predecessors';
import type { PrintOptions } from './printOptions';

export const PRINT_COL_WIDTH: Record<ColumnId, number> = {
  id: 26, wbs: 44, name: 220, dur: 40, start: 58, finish: 58, pred: 82, resource: 90, pct: 36, slack: 44, lateFinish: 58, constraint: 100, notes: 160,
};
export const PRINT_COL_LABEL: Record<ColumnId, string> = {
  id: '#', wbs: 'WBS', name: 'Task name', dur: 'Dur', start: 'Start', finish: 'Finish', pred: 'Pred', resource: 'Responsible', pct: '%', slack: 'Slack', lateFinish: 'Late fin.', constraint: 'Constraint', notes: 'Notes',
};
const RIGHT: ColumnId[] = ['dur', 'pct', 'slack'];

export interface PrintRow {
  task: Task;
  s: Scheduled;
}

export function printRows(project: Project, schedule: ScheduleResult, options: PrintOptions): PrintRow[] {
  const rows: PrintRow[] = project.tasks.map((task) => ({ task, s: schedule.byUid.get(task.uid)! }));
  let out = rows;
  if (options.collapsedOnly) out = out.filter((r) => !r.s.hidden);
  if (options.criticalOnly) {
    const keep = new Set<number>();
    for (const r of out) {
      if (!r.s.hasChildren && r.s.critical) {
        keep.add(r.task.uid);
        let p = r.s.parentUid;
        while (p !== undefined) { keep.add(p); p = schedule.byUid.get(p)?.parentUid; }
      }
    }
    out = out.filter((r) => keep.has(r.task.uid));
  }
  return out;
}

export function cellText(r: PrintRow, col: ColumnId, project: Project): string {
  const { task: t, s } = r;
  switch (col) {
    case 'id': return String(s.id);
    case 'wbs': return s.wbs;
    case 'name': return t.name;
    case 'dur': return s.hasChildren ? formatDuration(s.durationDays, { compact: true }) : t.milestone ? '0d' : formatDuration(t.durationDays, { compact: true });
    case 'start': return fmtNumeric(s.start);
    case 'finish': return fmtNumeric(s.finish);
    case 'pred': return formatPredecessors(t.predecessors, idMaps(project.tasks).idByUid);
    case 'resource': return t.resourceNames;
    case 'pct': return `${t.percentComplete}%`;
    case 'slack': return s.hasChildren ? '' : `${s.totalSlackDays}d`;
    case 'lateFinish': return s.hasChildren ? '' : fmtNumeric(s.lateFinish);
    case 'constraint': return t.constraintType === 'ASAP' ? '' : `${t.constraintType} ${t.constraintDate ? fmtNumeric(t.constraintDate) : ''}`;
    case 'notes': return t.notes;
  }
}

export function ColHeaders({ columns }: { columns: ColumnId[] }) {
  return (
    <>
      {columns.map((c) => (
        <th key={c} className={`col ${RIGHT.includes(c) ? 'r' : c === 'id' ? 'c' : ''}`}>{PRINT_COL_LABEL[c]}</th>
      ))}
    </>
  );
}

export function RowCells({ r, columns, project }: { r: PrintRow; columns: ColumnId[]; project: Project }) {
  return (
    <>
      {columns.map((c) => {
        if (c === 'name') {
          return (
            <td key={c} className="nm" title={r.task.name}>
              <span className="ind" style={{ width: (r.s.level - 1) * 10 }} />
              {r.task.milestone && !r.s.hasChildren && <i className="dia" />}
              {r.task.name}
            </td>
          );
        }
        return <td key={c} className={`${RIGHT.includes(c) ? 'r' : ''} ${c === 'id' ? 'id' : ''} ${c === 'pred' ? 'pred' : ''} ${c === 'notes' ? 'notes' : ''}`}>{cellText(r, c, project)}</td>;
      })}
    </>
  );
}

export function rowClass(r: PrintRow): string {
  return [
    r.s.hasChildren ? 'summary' : '',
    r.task.milestone && !r.s.hasChildren ? 'milestone' : '',
    r.s.critical && !r.s.hasChildren ? 'critical' : '',
    r.task.percentComplete >= 100 && !r.s.hasChildren ? 'done' : '',
  ].filter(Boolean).join(' ');
}
