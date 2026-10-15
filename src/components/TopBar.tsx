import { useEffect, useRef, useState } from 'react';
import {
  BarChart3, Table2, CalendarRange, Flag, Save, FolderOpen, Sparkles, Printer, HeartPulse, Settings, ChevronDown,
  FilePlus2, School, Menu as MenuIcon, X, Wand2, ClipboardCheck, Keyboard, Info, Baseline, Eraser, Activity, Kanban, HardHat,
} from 'lucide-react';
import { Logo } from './Logo';
import { AppearanceMenu } from './AppearanceMenu';
import { useStore, type ViewName } from '../state/store';
import type { FileActions } from '../hooks/useFileActions';
import { shortcutEvents } from '../hooks/useShortcuts';

const VIEWS: { id: ViewName; label: string; icon: React.ReactNode }[] = [
  { id: 'gantt', label: 'Gantt', icon: <BarChart3 /> },
  { id: 'sheet', label: 'Sheet', icon: <Table2 /> },
  { id: 'lookahead', label: '3-Week', icon: <CalendarRange /> },
  { id: 'milestones', label: 'Miles', icon: <Flag /> },
  { id: 'pulse', label: 'Pulse', icon: <Activity /> },
  { id: 'decisions', label: 'Decisions', icon: <Kanban /> },
  { id: 'buyout', label: 'Buyout', icon: <HardHat /> },
];

export function TopBar({ files }: { files: FileActions }) {
  const project = useStore((s) => s.project)!;
  const dirty = useStore((s) => s.dirty);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const openDialog = useStore((s) => s.openDialog);
  const sidePanel = useStore((s) => s.sidePanel);
  const setSidePanel = useStore((s) => s.setSidePanel);
  const update = useStore((s) => s.update);
  const setBaseline = useStore((s) => s.setBaseline);
  const clearBaseline = useStore((s) => s.clearBaseline);
  const [menu, setMenu] = useState<null | 'file' | 'ai'>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === 'save') files.save();
      if (name === 'saveAs') files.saveAs();
      if (name === 'new') files.newBlank();
    };
    shortcutEvents.addEventListener('command', h);
    return () => shortcutEvents.removeEventListener('command', h);
  }, [files]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const fileName = project.filePath?.split('/').pop();
  const hasBaseline = project.tasks.some((t) => t.baselineStart);

  return (
    <div className="topbar">
      <div className="brand">
        <Logo /> <span className="lbl">Datum</span>
      </div>
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button className="btn ghost file-btn" onClick={() => setMenu(menu === 'file' ? null : 'file')}>
          <MenuIcon /> <span className="lbl">File</span> <ChevronDown style={{ width: 12, height: 12 }} />
        </button>
        {menu === 'file' && (
          <div className="menu" style={{ top: 36, left: 0 }} onClick={() => setMenu(null)}>
            <button onClick={files.newBlank}><FilePlus2 /> New schedule <span className="k">Ctrl+N</span></button>
            <button onClick={files.newFromTemplate}><School /> New from school template</button>
            <button onClick={() => openDialog('ai-build')}><Sparkles /> New with AI…</button>
            <div className="sep" />
            <button onClick={() => openDialog('open')}><FolderOpen /> Open… <span className="k">Ctrl+O</span></button>
            <button onClick={files.save}><Save /> Save <span className="k">Ctrl+S</span></button>
            <button onClick={files.saveAs}><Save /> Save As… <span className="k">Ctrl+Shift+S</span></button>
            <div className="sep" />
            <button onClick={() => openDialog('print')}><Printer /> Print / Export PDF… <span className="k">Ctrl+P</span></button>
            <button onClick={() => openDialog('settings')}><Settings /> Project settings…</button>
            <div className="sep" />
            <div className="lbl">Baseline</div>
            <button onClick={setBaseline}><Baseline /> {hasBaseline ? 'Re-set baseline to current dates' : 'Set baseline'}</button>
            <button onClick={clearBaseline} disabled={!hasBaseline}><Eraser /> Clear baseline</button>
            <div className="sep" />
            <button onClick={() => openDialog('shortcuts')}><Keyboard /> Keyboard shortcuts</button>
            <button onClick={() => openDialog('about')}><Info /> About Datum</button>
            <div className="sep" />
            <button onClick={files.close}><X /> Close schedule</button>
          </div>
        )}
        {menu === 'ai' && (
          <div className="menu" style={{ top: 36, left: 80 }} onClick={() => setMenu(null)}>
            <button onClick={() => openDialog('ai-edit')}><Wand2 /> Change schedule with AI… <span className="k">Ctrl+Shift+A</span></button>
            <button onClick={() => setSidePanel(sidePanel === 'review' ? null : 'review')}><ClipboardCheck /> AI schedule review</button>
            <div className="sep" />
            <button onClick={() => openDialog('ai-build')}><Sparkles /> Build a new schedule with AI…</button>
          </div>
        )}
      </div>
      <div className="project-title">
        <input
          value={project.name}
          onChange={(e) => update((d) => { d.name = e.target.value; }, { silent: true })}
          onBlur={(e) => update((d) => { d.name = e.target.value.trim() || 'Untitled Schedule'; })}
          spellCheck={false}
        />
        <div className="sub">
          {fileName ? fileName : 'Not saved yet'}
          {dirty && <span className="dirty"> • unsaved</span>}
        </div>
      </div>
      <div className="view-tabs">
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)} title={`Ctrl+${VIEWS.indexOf(v) + 1}`}>
            {v.icon} <span className="lbl">{v.label}</span>
          </button>
        ))}
      </div>
      <div className="topbar-actions" style={{ marginLeft: 0 }}>
        <AppearanceMenu />
        <button className="btn ai" onClick={() => setMenu(menu === 'ai' ? null : 'ai')} title="AI tools">
          <Sparkles /> <span className="lbl">AI</span> <ChevronDown style={{ width: 12, height: 12 }} />
        </button>
        <button className={`btn ${sidePanel === 'health' ? 'primary' : ''}`} onClick={() => setSidePanel(sidePanel === 'health' ? null : 'health')} title="Schedule health check">
          <HeartPulse /> <span className="lbl">Health</span>
        </button>
        <button className="btn" onClick={() => openDialog('print')} title="Print or export PDF (Ctrl+P)">
          <Printer /> <span className="lbl">Print</span>
        </button>
        <button className={`btn ${dirty ? 'primary' : ''}`} onClick={files.save} title="Save (Ctrl+S)">
          <Save /> <span className="lbl">Save</span>
        </button>
      </div>
    </div>
  );
}
