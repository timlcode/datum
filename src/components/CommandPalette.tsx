import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, FilePlus2, FolderOpen, Save, Printer, Sparkles, Wand2, ClipboardCheck, HeartPulse, Settings, BarChart3, Table2,
  CalendarRange, Flag, Plus, Link2, Diamond, Baseline, Keyboard, ChevronsDownUp, ChevronsUpDown, Crosshair, PanelRight,
  Activity, Kanban, HardHat,
} from 'lucide-react';
import { useStore } from '../state/store';
import { emitCommand } from '../hooks/useShortcuts';

interface Cmd {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  keys?: string;
  run: () => void;
  needsProject?: boolean;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const st = useStore.getState;
  const project = useStore((s) => s.project);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const cmds: Cmd[] = useMemo(() => [
    { id: 'new', label: 'New schedule', group: 'File', icon: <FilePlus2 />, keys: 'Ctrl+N', run: () => emitCommand('new') },
    { id: 'open', label: 'Open…', group: 'File', icon: <FolderOpen />, keys: 'Ctrl+O', run: () => st().openDialog('open') },
    { id: 'save', label: 'Save', group: 'File', icon: <Save />, keys: 'Ctrl+S', run: () => emitCommand('save'), needsProject: true },
    { id: 'saveas', label: 'Save as…', group: 'File', icon: <Save />, keys: 'Ctrl+Shift+S', run: () => emitCommand('saveAs'), needsProject: true },
    { id: 'print', label: 'Print / Export PDF…', group: 'File', icon: <Printer />, keys: 'Ctrl+P', run: () => st().openDialog('print'), needsProject: true },
    { id: 'settings', label: 'Project settings…', group: 'File', icon: <Settings />, run: () => st().openDialog('settings'), needsProject: true },
    { id: 'ai-build', label: 'Build a schedule with AI…', group: 'AI', icon: <Sparkles />, run: () => st().openDialog('ai-build') },
    { id: 'ai-edit', label: 'Change schedule with AI…', group: 'AI', icon: <Wand2 />, keys: 'Ctrl+Shift+A', run: () => st().openDialog('ai-edit'), needsProject: true },
    { id: 'ai-review', label: 'AI schedule review', group: 'AI', icon: <ClipboardCheck />, run: () => st().setSidePanel('review'), needsProject: true },
    { id: 'health', label: 'Schedule health check', group: 'Analyze', icon: <HeartPulse />, run: () => st().setSidePanel('health'), needsProject: true },
    { id: 'v-gantt', label: 'Gantt chart view', group: 'View', icon: <BarChart3 />, keys: 'Ctrl+1', run: () => st().setView('gantt'), needsProject: true },
    { id: 'v-sheet', label: 'Task sheet view', group: 'View', icon: <Table2 />, keys: 'Ctrl+2', run: () => st().setView('sheet'), needsProject: true },
    { id: 'v-la', label: 'Look-ahead view', group: 'View', icon: <CalendarRange />, keys: 'Ctrl+3', run: () => st().setView('lookahead'), needsProject: true },
    { id: 'v-ms', label: 'Milestones view', group: 'View', icon: <Flag />, keys: 'Ctrl+4', run: () => st().setView('milestones'), needsProject: true },
    { id: 'v-pulse', label: 'Pulse — next 30 days', group: 'View', icon: <Activity />, keys: 'Ctrl+5', run: () => st().setView('pulse'), needsProject: true },
    { id: 'v-dec', label: 'Decisions board', group: 'View', icon: <Kanban />, keys: 'Ctrl+6', run: () => st().setView('decisions'), needsProject: true },
    { id: 'v-buy', label: 'Buyout pipeline', group: 'View', icon: <HardHat />, keys: 'Ctrl+7', run: () => st().setView('buyout'), needsProject: true },
    { id: 'details', label: 'Toggle task details panel', group: 'View', icon: <PanelRight />, keys: 'Ctrl+I', run: () => st().toggleFlag('detailsOpen'), needsProject: true },
    { id: 'today', label: 'Scroll to status date', group: 'View', icon: <Crosshair />, run: () => { st().setView('gantt'); setTimeout(() => emitCommand('today'), 50); }, needsProject: true },
    { id: 'expand', label: 'Expand all', group: 'View', icon: <ChevronsUpDown />, run: () => st().expandAll(true), needsProject: true },
    { id: 'collapse', label: 'Collapse all', group: 'View', icon: <ChevronsDownUp />, run: () => st().expandAll(false), needsProject: true },
    { id: 'insert', label: 'Insert task', group: 'Edit', icon: <Plus />, keys: 'Insert', run: () => emitCommand('insert'), needsProject: true },
    { id: 'link', label: 'Link selected tasks', group: 'Edit', icon: <Link2 />, keys: 'Ctrl+L', run: () => st().linkSelected(), needsProject: true },
    { id: 'ms', label: 'Toggle milestone', group: 'Edit', icon: <Diamond />, keys: 'Ctrl+M', run: () => st().toggleMilestone(st().selection), needsProject: true },
    { id: 'baseline', label: 'Set baseline', group: 'Edit', icon: <Baseline />, run: () => st().setBaseline(), needsProject: true },
    { id: 'keys', label: 'Keyboard shortcuts', group: 'Help', icon: <Keyboard />, run: () => st().openDialog('shortcuts') },
  ], [st]);

  const list = useMemo(() => {
    const avail = cmds.filter((c) => !c.needsProject || project);
    const s = q.trim().toLowerCase();
    if (!s) return avail;
    return avail.filter((c) => c.label.toLowerCase().includes(s) || c.group.toLowerCase().includes(s));
  }, [cmds, q, project]);

  useEffect(() => setIdx(0), [q]);

  const run = (c: Cmd) => { onClose(); c.run(); };

  return (
    <div className="overlay" style={{ alignItems: 'start' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette">
        <div className="in">
          <Search />
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command…"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(list.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              else if (e.key === 'Enter') { if (list[idx]) run(list[idx]); }
              else if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="list">
          {list.map((c, i) => (
            <div key={c.id} className={`item ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => run(c)}>
              {c.icon}
              <span>{c.label}</span>
              <span className="grp">{c.group}</span>
              {c.keys && <span className="k">{c.keys}</span>}
            </div>
          ))}
          {list.length === 0 && <div className="empty-state">No matching commands.</div>}
        </div>
      </div>
    </div>
  );
}
