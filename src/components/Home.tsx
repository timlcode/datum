import { useEffect, useState } from 'react';
import { FilePlus2, FolderOpen, Sparkles, School, FileClock, RotateCcw, X, Clock } from 'lucide-react';
import { Logo } from './Logo';
import { AppearanceMenu } from './AppearanceMenu';
import { api, type RecentEntry } from '../api';
import { readAutosave, clearAutosave, useStore } from '../state/store';
import { useFileActions } from '../hooks/useFileActions';
import { shortcutEvents } from '../hooks/useShortcuts';

function ago(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.round(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString();
}

export function Home() {
  const files = useFileActions();
  const openDialog = useStore((s) => s.openDialog);
  const setProject = useStore((s) => s.setProject);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [health, setHealth] = useState<{ java: boolean; ai: boolean; aiProvider: string; chromium: boolean; model: string; version: string } | null>(null);
  const [autosave, setAutosave] = useState(readAutosave());

  useEffect(() => {
    api.places().then((r) => setRecent(r.recent)).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === 'new') files.newBlank();
    };
    shortcutEvents.addEventListener('command', h);
    return () => shortcutEvents.removeEventListener('command', h);
  }, [files]);

  return (
    <div className="home">
      <div className="home-tools"><AppearanceMenu /></div>
      <div className="inner">
        <div className="hero">
          <Logo size={44} />
          <h1>Datum</h1>
        </div>
        <p className="tag">Critical path, look-ahead, and the decisions that actually move a job. Opens Project and Primavera. Saves XML a superintendent can hand back.</p>

        {autosave && (
          <div className="recover">
            <FileClock />
            <div className="t">
              <b>Unsaved work from {ago(autosave.savedAt)}</b>
              <span>
                {autosave.project.name} · {autosave.project.tasks.length} tasks
                {autosave.project.filePath ? ` · ${autosave.project.filePath}` : ''}
              </span>
            </div>
            <button
              className="btn primary"
              onClick={() => {
                setProject(autosave.project, { dirty: true });
              }}
            >
              <RotateCcw /> Recover
            </button>
            <button
              className="icon-btn"
              title="Discard"
              onClick={() => {
                clearAutosave();
                setAutosave(null);
              }}
            >
              <X />
            </button>
          </div>
        )}

        <div className="cards">
          <button className="card" onClick={files.newBlank}>
            <FilePlus2 />
            <b>New schedule</b>
            <span>Start from a blank sheet. Type tasks, durations and predecessors like you would in Project.</span>
          </button>
          <button className="card ai" onClick={() => openDialog('ai-build')}>
            <Sparkles />
            <b>Build with AI</b>
            <span>Describe the job in plain English and get a fully linked CPM schedule to refine.</span>
          </button>
          <button className="card" onClick={files.newFromTemplate}>
            <School />
            <b>School addition template</b>
            <span>Fictional CMAR classroom wing: precon, permits, long-lead, structure, a decision log, and a buyout board.</span>
          </button>
          <button className="card" onClick={() => openDialog('open')}>
            <FolderOpen />
            <b>Open file</b>
            <span>.mpp, .xml (MS Project), .xer (Primavera), .mpx and more.</span>
          </button>
        </div>

        <h3>Recent</h3>
        {recent.length === 0 ? (
          <div className="empty-state" style={{ textAlign: 'left', padding: '8px 0 24px' }}>
            Files you open will show up here.
          </div>
        ) : (
          <div className="recent">
            {recent.map((r) => (
              <button key={r.path} onClick={() => files.openPath(r.path)} title={r.path}>
                <Clock />
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{r.name}</div>
                  <div className="pth">{r.path}</div>
                </div>
                <div className="when">{ago(r.openedAt)}</div>
              </button>
            ))}
          </div>
        )}

        <div className="foot">
          <span>
            Project files: <span className={health?.java ? 'ok' : 'bad'}>{health ? (health.java ? 'ready' : 'Java missing') : '…'}</span>
          </span>
          <span>
            AI{health?.model ? ` (${health.model})` : ''}: <span className={health?.ai ? 'ok' : 'bad'}>{health ? (health.ai ? health.aiProvider : 'optional, not configured') : '…'}</span>
          </span>
          <span>
            PDF export: <span className={health?.chromium ? 'ok' : 'bad'}>{health ? (health.chromium ? 'ready' : 'no browser found') : '…'}</span>
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <kbd>Ctrl</kbd> <kbd>K</kbd> for commands
          </span>
        </div>
      </div>
    </div>
  );
}
