import { useEffect, useMemo, useState } from 'react';
import { Folder, FileText, Home, Cloud, FolderOpen, Download, Clock, X, ArrowUp, FolderPlus } from 'lucide-react';
import { api, type FsEntry, type Place, type RecentEntry } from '../api';
import { useStore } from '../state/store';
import { suggestedFileName } from '@engine/mspdi';

const PLACE_ICONS: Record<string, React.ReactNode> = {
  Home: <Home />, Desktop: <Cloud />, Documents: <FileText />, Downloads: <Download />, Projects: <FolderOpen />, Schedules: <Folder />,
};

function fmtSize(n?: number): string {
  if (n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

interface Props {
  mode: 'open' | 'save';
  onClose: () => void;
  onOpen?: (path: string) => void;
  onSave?: (path: string) => void;
  /** Extension enforced in save mode. */
  ext?: 'xml' | 'pdf';
  defaultName?: string;
  title?: string;
  /** Open mode: list every file, not just schedule formats (for reference attachments). */
  allFiles?: boolean;
  /** Footer hint override. */
  hint?: string;
}

const LAST_DIR_KEY = 'datum.lastDir';

export function FileDialog({ mode, onClose, onOpen, onSave, ext = 'xml', defaultName, title, allFiles = false, hint }: Props) {
  const project = useStore((s) => s.project);
  const [places, setPlaces] = useState<Place[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [path, setPath] = useState<string>('');
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(() => defaultName ?? (project ? suggestedFileName(project) : 'schedule.xml'));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list(p, ext === 'pdf' || allFiles);
      setPath(r.path);
      setParent(r.parent);
      setEntries(r.entries);
      setSelected(null);
      localStorage.setItem(LAST_DIR_KEY, r.path);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.places().then((r) => {
      setPlaces(r.places);
      setRecent(r.recent);
      const initial = project?.filePath ? project.filePath.slice(0, project.filePath.lastIndexOf('/')) : localStorage.getItem(LAST_DIR_KEY) || r.places[0]?.path || '~';
      load(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crumbs = useMemo(() => {
    const parts = path.split('/').filter(Boolean);
    return parts.map((p, i) => ({ label: p, path: '/' + parts.slice(0, i + 1).join('/') }));
  }, [path]);

  const commit = async () => {
    if (mode === 'open') {
      if (selected) onOpen?.(selected);
      return;
    }
    let fn = name.trim();
    if (!fn) return;
    if (ext === 'pdf') {
      if (!/\.pdf$/i.test(fn)) fn = fn.replace(/\.(xml|mspdi|mpp)$/i, '') + '.pdf';
    } else if (!/\.(xml|mspdi)$/i.test(fn)) {
      fn = fn.replace(/\.(mpp|pdf|xer|mpx)$/i, '') + '.xml';
    }
    const full = `${path}/${fn}`;
    const { exists } = await api.exists(full);
    if (exists && !confirm(`${fn} already exists. Replace it?`)) return;
    onSave?.(full);
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog wide">
        <div className="d-head">
          <FolderOpen />
          <h2>{title ?? (mode === 'open' ? 'Open schedule' : 'Save as Microsoft Project XML')}</h2>
          <button className="icon-btn x" onClick={onClose}><X /></button>
        </div>
        <div className="d-body">
          <div className="filebrowser">
            <div className="places">
              <h4>Places</h4>
              {places.map((p) => (
                <button key={p.path} className={path === p.path ? 'on' : ''} onClick={() => load(p.path)}>{PLACE_ICONS[p.name] ?? <Folder />} {p.name}</button>
              ))}
              {mode === 'open' && recent.length > 0 && (
                <>
                  <h4>Recent</h4>
                  {recent.slice(0, 8).map((r) => (
                    <button key={r.path} title={r.path} onClick={() => onOpen?.(r.path)}><Clock /> {r.name}</button>
                  ))}
                </>
              )}
            </div>
            <div className="pane">
              <div className="crumbs">
                <button onClick={() => parent && load(parent)} disabled={!parent} title="Up one level"><ArrowUp style={{ width: 13, height: 13 }} /></button>
                <button onClick={() => load('/')} title="Root" data-crumb="root">/</button>
                {crumbs.map((c, i) => (
                  <span key={c.path} style={{ display: 'contents' }}>
                    {i > 0 && <span className="sepc">›</span>}
                    <button className={i === crumbs.length - 1 ? 'last' : ''} onClick={() => load(c.path)}>{c.label}</button>
                  </span>
                ))}
                {mode === 'save' && (
                  <button style={{ marginLeft: 'auto' }} title="New folder" onClick={async () => {
                    const n = prompt('New folder name');
                    if (!n) return;
                    try { await api.mkdir(`${path}/${n}`); load(path); } catch (err) { setError((err as Error).message); }
                  }}><FolderPlus style={{ width: 14, height: 14 }} /></button>
                )}
              </div>
              <div className="entries">
                {error && <div className="empty">{error}</div>}
                {!error && !loading && entries.length === 0 && <div className="empty">No folders or schedule files here.</div>}
                {entries.map((e) => (
                  <div
                    key={e.path}
                    className={`entry ${e.isDir ? 'dir' : ''} ${selected === e.path ? 'on' : ''}`}
                    onClick={() => {
                      if (e.isDir) return;
                      setSelected(e.path);
                      if (mode === 'save') setName(e.name.replace(/\.[^.]+$/, '') + '.' + ext);
                    }}
                    onDoubleClick={() => {
                      if (e.isDir) load(e.path);
                      else if (mode === 'open') onOpen?.(e.path);
                      else commit();
                    }}
                  >
                    {e.isDir ? <Folder /> : <FileText />}
                    <span className="nm">
                      {e.name}
                      {!e.isDir && e.ext && <span className={`ext ${e.ext.slice(1)}`}>{e.ext.slice(1)}</span>}
                    </span>
                    <span className="meta">{e.isDir ? '' : fmtDate(e.modified)}</span>
                    <span className="meta">{e.isDir ? '' : fmtSize(e.size)}</span>
                  </div>
                ))}
              </div>
              {mode === 'save' && (
                <div className="namebar">
                  <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>File name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} autoFocus spellCheck={false} />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="d-foot">
          <span className="left">
            {hint ? hint : mode === 'open' ? 'Opens .mpp, .xml, .mpx, .xer and other schedule formats.' : ext === 'pdf' ? 'Choose where to save the PDF.' : 'Microsoft Project opens .xml directly (File → Open). .mpp cannot be written by any tool outside Project.'}
          </span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={commit} disabled={mode === 'open' ? !selected : !name.trim()}>{mode === 'open' ? 'Open' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
