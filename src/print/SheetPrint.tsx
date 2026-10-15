import { useMemo } from 'react';
import type { Project, ScheduleResult } from '@engine/types';
import type { PrintOptions } from './printOptions';
import { ColHeaders, PRINT_COL_WIDTH, RowCells, printRows, rowClass } from './printCells';
import type { ColumnId } from '../components/TaskGrid';

interface Props {
  project: Project;
  schedule: ScheduleResult;
  options: PrintOptions;
  width: number;
  head: React.ReactNode;
}

export function SheetPrint({ project, schedule, options, width, head }: Props) {
  const rows = useMemo(() => printRows(project, schedule, options), [project, schedule, options]);
  const columns: ColumnId[] = options.columns.length ? options.columns : ['id', 'name', 'dur', 'start', 'finish', 'pred', 'resource'];
  const fixed = columns.filter((c) => c !== 'name' && c !== 'notes').reduce((a, c) => a + PRINT_COL_WIDTH[c], 0);
  const flexCols = columns.filter((c) => c === 'name' || c === 'notes');
  const flexW = Math.max(120, (width - fixed) / Math.max(1, flexCols.length));
  return (
    <table className="rep" style={{ width }}>
      <colgroup>
        {columns.map((c) => <col key={c} style={{ width: c === 'name' || c === 'notes' ? flexW : PRINT_COL_WIDTH[c] }} />)}
      </colgroup>
      <thead>
        <tr>
          <td colSpan={columns.length} style={{ border: 0, padding: 0, height: 'auto', whiteSpace: 'normal' }}>{head}</td>
        </tr>
        <tr><ColHeaders columns={columns} /></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.task.uid} className={rowClass(r)}>
            <RowCells r={r} columns={columns} project={project} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
