import { useRef, useState } from 'react';
import { Paperclip, X, FileText, CalendarRange, FolderOpen } from 'lucide-react';
import { api, type Attachment, type AttachmentMode } from '../api';
import { FileDialog } from './FileDialog';

const MODES: { value: AttachmentMode; label: string; help: string }[] = [
  { value: 'baseline', label: 'Baseline', help: 'Mirror this file, then fix what is clearly wrong.' },
  { value: 'reference', label: 'Reference', help: 'Inform scope, durations and sequence.' },
  { value: 'verify', label: 'Verify', help: 'Compare against the schedule and flag disagreements.' },
];

interface Props {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
  defaultMode?: AttachmentMode;
  /** Short line under the strip. */
  hint?: string;
}

/**
 * Reference files for the AI dialogs: drop a PM / sub / vendor schedule, a PDF
 * or a CSV, pick how the model should treat it, and it rides along with the
 * prompt. Files are parsed server-side (MPXJ for schedules, pdftotext for PDFs).
 */
export function AttachmentStrip({ attachments, onChange, disabled, defaultMode = 'reference', hint }: Props) {
  const [mode, setMode] = useState<AttachmentMode>(defaultMode);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [browse, setBrowse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = async (work: () => Promise<{ attachment: Attachment }>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const { attachment } = await work();
      onChange([...attachments, attachment]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const addFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) await add(() => api.attachFile(f, mode), f.name);
  };
  const addPath = (p: string) => add(() => api.attachPath(p, mode), p.split('/').pop() ?? p);
  const setItemMode = (id: string, m: AttachmentMode) => onChange(attachments.map((a) => (a.id === id ? { ...a, mode: m } : a)));
  const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));

  return (
    <div className="field">
      <label>Reference files</label>
      <div
        className={`attach-drop ${drag ? 'over' : ''} ${disabled ? 'off' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled && e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }}
      >
        {attachments.length === 0 && !busy && (
          <div className="attach-empty">
            <Paperclip size={14} />
            <span>Drop a schedule (.mpp, .xml, .xer), a PDF, or a CSV here — or</span>
            <button className="link" onClick={() => inputRef.current?.click()} disabled={disabled}>choose a file</button>
            <span>/</span>
            <button className="link" onClick={() => setBrowse(true)} disabled={disabled}><FolderOpen size={12} /> browse this computer</button>
          </div>
        )}
        {attachments.map((a) => (
          <div key={a.id} className="attach-item">
            {a.kind === 'schedule' ? <CalendarRange size={14} /> : <FileText size={14} />}
            <span className="n" title={a.path}>{a.name}</span>
            <span className="s">{a.summary}</span>
            <select value={a.mode} onChange={(e) => setItemMode(a.id, e.target.value as AttachmentMode)} disabled={disabled} title={MODES.find((m) => m.value === a.mode)?.help}>
              {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <button className="icon-btn x" onClick={() => remove(a.id)} disabled={disabled} title="Remove"><X size={14} /></button>
          </div>
        ))}
        {busy && <div className="attach-item busy"><Paperclip size={14} /><span className="n">Reading {busy}…</span></div>}
        {attachments.length > 0 && !busy && (
          <div className="attach-more">
            <span>Add as</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as AttachmentMode)} disabled={disabled}>
              {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <button className="link" onClick={() => inputRef.current?.click()} disabled={disabled}>choose a file</button>
            <span>/</span>
            <button className="link" onClick={() => setBrowse(true)} disabled={disabled}>browse</button>
          </div>
        )}
        <input ref={inputRef} type="file" multiple hidden accept=".mpp,.mpt,.mpx,.xml,.mspdi,.xer,.pmxml,.planner,.gan,.pdf,.csv,.tsv,.txt,.md,.json" onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {error && <div className="hint" style={{ color: 'var(--red)' }}>{error}</div>}
      {!error && hint && <div className="hint">{hint}</div>}
      {browse && (
        <FileDialog
          mode="open"
          allFiles
          title="Attach a reference file"
          hint="Schedules (.mpp, .xml, .xer …), PDFs, and CSV / text files."
          onClose={() => setBrowse(false)}
          onOpen={(p) => { setBrowse(false); void addPath(p); }}
        />
      )}
    </div>
  );
}
