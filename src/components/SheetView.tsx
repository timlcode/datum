import { useVisibleRows } from '../hooks/useVisibleRows';
import { TaskGrid, type ColumnId } from './TaskGrid';

const COLUMNS: ColumnId[] = ['id', 'wbs', 'name', 'dur', 'start', 'finish', 'pred', 'resource', 'pct', 'slack', 'lateFinish', 'constraint', 'notes'];

export function SheetView() {
  const rows = useVisibleRows();
  return <TaskGrid rows={rows} columns={COLUMNS} nameWidth={360} />;
}
