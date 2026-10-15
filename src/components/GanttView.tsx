import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useVisibleRows } from '../hooks/useVisibleRows';
import { TaskGrid, type ColumnId } from './TaskGrid';
import { GanttChart } from './GanttChart';

const COLUMNS: ColumnId[] = ['id', 'name', 'dur', 'start', 'finish', 'pred'];
const FIXED_W = 44 + 78 + 108 + 108 + 120;

export function GanttView() {
  const rows = useVisibleRows();
  const projectSeq = useStore((s) => s.projectSeq);
  const splitPx = useStore((s) => s.splitPx);
  const setSplit = useStore((s) => s.setSplit);
  const gridRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Never let the grid swallow the chart on a half-screen window.
  const effectiveSplit = Math.min(splitPx, Math.max(320, Math.floor(winW * 0.55)));

  const syncFrom = useCallback((source: 'grid' | 'gantt', top: number) => {
    if (syncing.current) return;
    syncing.current = true;
    const target = source === 'grid' ? ganttRef.current : gridRef.current;
    if (target && Math.abs(target.scrollTop - top) > 0.5) target.scrollTop = top;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const container = gridRef.current?.parentElement?.parentElement;
      if (!container) return;
      const left = container.getBoundingClientRect().left;
      setSplit(Math.max(280, Math.min(e.clientX - left, window.innerWidth - 300)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, setSplit]);

  return (
    <>
      <div className="split">
        <div className="left" style={{ width: effectiveSplit }}>
          <TaskGrid rows={rows} columns={COLUMNS} scrollRef={gridRef} onScroll={(t) => syncFrom('grid', t)} nameWidth={Math.max(200, effectiveSplit - FIXED_W - 12)} />
        </div>
        <div className={`divider ${dragging ? 'dragging' : ''}`} onMouseDown={() => setDragging(true)} />
        <div className="right">
          <GanttChart key={projectSeq} rows={rows} scrollRef={ganttRef} onScroll={(t) => syncFrom('gantt', t)} />
          <div className="gantt-legend">
            <span><i className="sw" style={{ background: 'var(--gantt-task)' }} />Task</span>
            <span><i className="sw" style={{ background: 'var(--gantt-critical)' }} />Critical</span>
            <span><i className="sw" style={{ background: 'var(--gantt-done)' }} />Complete</span>
            <span><i className="sw" style={{ background: 'var(--gantt-summary)' }} />Summary</span>
            <span><i className="sw ms" style={{ background: 'var(--gantt-milestone)' }} />Milestone</span>
            <span className="hint" style={{ color: 'var(--fg-3)' }}>Drag bars to move · drag right edge to resize · drag the dot to link</span>
          </div>
        </div>
      </div>
    </>
  );
}
