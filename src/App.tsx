import { useEffect } from 'react';
import { useStore } from './state/store';
import { Home } from './components/Home';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { GanttView } from './components/GanttView';
import { SheetView } from './components/SheetView';
import { LookAheadView } from './components/LookAheadView';
import { MilestonesView } from './components/MilestonesView';
import { PulseView } from './components/PulseView';
import { FieldBoard } from './components/FieldBoard';
import { HorizonStrip } from './components/HorizonStrip';
import { TaskDetails } from './components/TaskDetails';
import { HealthPanel } from './components/HealthPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { Toasts } from './components/Toasts';
import { Dialogs } from './components/Dialogs';
import { useShortcuts } from './hooks/useShortcuts';
import { useFileActions } from './hooks/useFileActions';

export function App() {
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.view);
  const sidePanel = useStore((s) => s.sidePanel);
  const detailsOpen = useStore((s) => s.detailsOpen);
  const busy = useStore((s) => s.busy);
  const dirty = useStore((s) => s.dirty);
  useShortcuts();
  const files = useFileActions();

  useEffect(() => {
    document.title = project ? `${project.name}${dirty ? ' •' : ''} — Datum` : 'Datum';
  }, [project, dirty]);

  // Launched with a file (desktop entry / file manager): open it once.
  useEffect(() => {
    const path = new URLSearchParams(window.location.search).get('open');
    if (path) {
      window.history.replaceState({}, '', '/');
      files.openPath(path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  if (!project) {
    return (
      <div className="app no-project">
        {busy && <div className="busy-bar" />}
        <Home />
        <Dialogs files={files} />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="app">
      {busy && <div className="busy-bar" />}
      <TopBar files={files} />
      <Toolbar />
      <HorizonStrip />
      <div className="workarea">
        <div className="main">
          <div key={view} className="view-stage">
            {view === 'gantt' && <GanttView />}
            {view === 'sheet' && <SheetView />}
            {view === 'lookahead' && <LookAheadView />}
            {view === 'milestones' && <MilestonesView />}
            {view === 'pulse' && <PulseView />}
            {view === 'decisions' && <FieldBoard workflow="decisions" />}
            {view === 'buyout' && <FieldBoard workflow="buyout" />}
          </div>
        </div>
        {detailsOpen && <TaskDetails />}
        {sidePanel === 'health' && <HealthPanel />}
        {sidePanel === 'review' && <ReviewPanel />}
      </div>
      <StatusBar />
      <Dialogs files={files} />
      <Toasts />
    </div>
  );
}
