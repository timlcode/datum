import { useEffect, useRef } from 'react';
import {
  Plus, Trash2, IndentIncrease, IndentDecrease, Link2, Unlink2, Diamond, Undo2, Redo2, Search, ArrowUp, ArrowDown,
  ChevronsDownUp, ChevronsUpDown, PanelRight, Crosshair, GitCommitHorizontal, Tag, Baseline,
} from 'lucide-react';
import { useStore, type Filter, type Zoom } from '../state/store';
import { shortcutEvents, emitCommand } from '../hooks/useShortcuts';

export function Toolbar() {
  const selection = useStore((s) => s.selection);
  const view = useStore((s) => s.view);
  const zoom = useStore((s) => s.zoom);
  const filter = useStore((s) => s.filter);
  const search = useStore((s) => s.search);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const showLinks = useStore((s) => s.showLinks);
  const showLabels = useStore((s) => s.showLabels);
  const showBaseline = useStore((s) => s.showBaseline);
  const detailsOpen = useStore((s) => s.detailsOpen);
  const hasBaseline = useStore((s) => s.project?.tasks.some((t) => t.baselineStart) ?? false);
  const st = useStore.getState;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === 'search') searchRef.current?.focus();
    };
    shortcutEvents.addEventListener('command', h);
    return () => shortcutEvents.removeEventListener('command', h);
  }, [st]);

  const gridView = view === 'gantt' || view === 'sheet';
  const hasSel = selection.length > 0;

  return (
    <div className="toolbar">
      <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => st().undo()}><Undo2 /></button>
      <button className="icon-btn" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => st().redo()}><Redo2 /></button>
      <div className="sep" />
      <button className="btn sm" title="Insert task below (Insert)" disabled={!gridView} onClick={() => emitCommand('insert')}>
        <Plus /> Task
      </button>
      <button className="icon-btn" title="Delete selected (Delete)" disabled={!hasSel || !gridView} onClick={() => st().deleteTasks(selection)}><Trash2 /></button>
      <div className="sep" />
      <button className="icon-btn" title="Outdent (Alt+Shift+←)" disabled={!hasSel || !gridView} onClick={() => st().outdent(selection)}><IndentDecrease /></button>
      <button className="icon-btn" title="Indent (Alt+Shift+→)" disabled={!hasSel || !gridView} onClick={() => st().indent(selection)}><IndentIncrease /></button>
      <button className="icon-btn" title="Move up (Alt+↑)" disabled={!hasSel || !gridView} onClick={() => st().moveTasks(selection, -1)}><ArrowUp /></button>
      <button className="icon-btn" title="Move down (Alt+↓)" disabled={!hasSel || !gridView} onClick={() => st().moveTasks(selection, 1)}><ArrowDown /></button>
      <div className="sep" />
      <button className="icon-btn" title="Link selected tasks Finish-to-Start (Ctrl+L)" disabled={selection.length < 2} onClick={() => st().linkSelected()}><Link2 /></button>
      <button className="icon-btn" title="Remove links from selected (Ctrl+Shift+L)" disabled={!hasSel} onClick={() => st().unlinkSelected()}><Unlink2 /></button>
      <button className="icon-btn" title="Toggle milestone (Ctrl+M)" disabled={!hasSel} onClick={() => st().toggleMilestone(selection)}><Diamond /></button>
      <div className="sep" />
      <button className="icon-btn" title="Expand all" onClick={() => st().expandAll(true)}><ChevronsUpDown /></button>
      <button className="icon-btn" title="Collapse all" onClick={() => st().expandAll(false)}><ChevronsDownUp /></button>
      <div className="spacer" />
      {view === 'gantt' && (
        <>
          <button className={`icon-btn ${showLinks ? 'active' : ''}`} title="Show dependency links" onClick={() => st().toggleFlag('showLinks')}><GitCommitHorizontal /></button>
          <button className={`icon-btn ${showLabels ? 'active' : ''}`} title="Show bar labels" onClick={() => st().toggleFlag('showLabels')}><Tag /></button>
          <button className={`icon-btn ${showBaseline ? 'active' : ''}`} title={hasBaseline ? 'Show baseline bars' : 'No baseline set (File → Set baseline)'} disabled={!hasBaseline} onClick={() => st().toggleFlag('showBaseline')}><Baseline /></button>
          <button className="icon-btn" title="Scroll to today" onClick={() => emitCommand('today')}><Crosshair /></button>
          <div className="seg">
            {(['day', 'week', 'month', 'quarter'] as Zoom[]).map((z) => (
              <button key={z} className={zoom === z ? 'active' : ''} onClick={() => st().setZoom(z)}>{z[0].toUpperCase() + z.slice(1)}</button>
            ))}
          </div>
          <div className="sep" />
        </>
      )}
      {gridView && (
        <select value={filter} onChange={(e) => st().setFilter(e.target.value as Filter)} title="Filter rows">
          <option value="all">All tasks</option>
          <option value="critical">Critical only</option>
          <option value="milestones">Milestones</option>
          <option value="incomplete">Incomplete</option>
          <option value="summary">Summary tasks</option>
        </select>
      )}
      <div className="search">
        <Search />
        <input ref={searchRef} placeholder="Find task…  (Ctrl+F)" value={search} onChange={(e) => st().setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { st().setSearch(''); (e.target as HTMLInputElement).blur(); } }} />
      </div>
      <button className={`icon-btn ${detailsOpen ? 'active' : ''}`} title="Task details (Ctrl+I)" onClick={() => st().toggleFlag('detailsOpen')}><PanelRight /></button>
    </div>
  );
}
