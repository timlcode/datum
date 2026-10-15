import { useEffect, useState } from 'react';
import { Printer, X, FileDown, ExternalLink, Eye } from 'lucide-react';
import { useStore } from '../state/store';
import { api } from '../api';
import { DEFAULT_PRINT, type Paper, type PrintOptions, type PrintView } from '../print/printOptions';
import { ALL_COLUMNS, type ColumnId } from './TaskGrid';
import { FileDialog } from './FileDialog';

const OPTS_KEY = 'datum.printOptions';
const VIEW_LABEL: Record<PrintView, string> = { gantt: 'Gantt chart', sheet: 'Task sheet', lookahead: 'Look-ahead', milestones: 'Milestones' };
const COL_CHOICES: ColumnId[] = ['id', 'wbs', 'name', 'dur', 'start', 'finish', 'pred', 'resource', 'pct', 'slack', 'lateFinish', 'constraint', 'notes'];

export function PrintDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const view = useStore((s) => s.view);
  const st = useStore.getState;
  const [opts, setOpts] = useState<PrintOptions>(() => {
    const saved = localStorage.getItem(OPTS_KEY);
    const base = saved ? { ...DEFAULT_PRINT, ...(JSON.parse(saved) as Partial<PrintOptions>) } : DEFAULT_PRINT;
    return { ...base, view: view as PrintView, showBaseline: st().showBaseline && project.tasks.some((t) => t.baselineStart) };
  });
  const [saveDialog, setSaveDialog] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastPdf, setLastPdf] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  }, [opts]);

  const set = <K extends keyof PrintOptions>(k: K, v: PrintOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const toggleCol = (c: ColumnId) => {
    const cols = opts.columns.includes(c) ? opts.columns.filter((x) => x !== c) : COL_CHOICES.filter((x) => opts.columns.includes(x) || x === c);
    set('columns', cols);
  };

  const preview = async (auto: boolean) => {
    setBusy('Preparing…');
    try {
      const { token } = await api.printJob(project, opts);
      window.open(`/print?token=${token}${auto ? '&auto=1' : ''}`, '_blank', 'width=1200,height=900');
    } catch (err) {
      st().toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = async (outPath: string) => {
    setSaveDialog(false);
    setBusy('Rendering PDF…');
    try {
      const { path } = await api.printPdf(project, { ...opts, outPath });
      setLastPdf(path);
      st().toast(`PDF saved: ${path.split('/').pop()}`, 'success');
    } catch (err) {
      st().toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const gridLike = opts.view === 'gantt' || opts.view === 'sheet';
  const suggested = `${project.name.replace(/[\\/:*?"<>|]+/g, '-')} - ${VIEW_LABEL[opts.view]}.pdf`;

  return (
    <>
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="dialog lg">
          <div className="d-head"><Printer /><h2>Print / Export PDF</h2><button className="icon-btn x" onClick={onClose}><X /></button></div>
          <div className="d-body">
            <div className="field">
              <label>Report</label>
              <div className="chips">
                {(Object.keys(VIEW_LABEL) as PrintView[]).map((v) => (
                  <button key={v} className={`chip ${opts.view === v ? 'on' : ''}`} onClick={() => set('view', v)}>{VIEW_LABEL[v]}</button>
                ))}
              </div>
            </div>
            <div className="fields-3">
              <div className="field">
                <label>Paper</label>
                <select value={opts.paper} onChange={(e) => set('paper', e.target.value as Paper)}>
                  <option value="letter">Letter (8.5×11)</option>
                  <option value="legal">Legal (8.5×14)</option>
                  <option value="tabloid">Tabloid (11×17)</option>
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                </select>
              </div>
              <div className="field">
                <label>Orientation</label>
                <select value={opts.orientation} onChange={(e) => set('orientation', e.target.value as PrintOptions['orientation'])}>
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </div>
              <div className="field">
                <label>Text size</label>
                <select value={opts.fontScale} onChange={(e) => set('fontScale', Number(e.target.value))}>
                  <option value={0.85}>Compact</option>
                  <option value={1}>Normal</option>
                  <option value={1.15}>Large</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Subtitle (optional)</label>
              <input value={opts.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder={`e.g. Baseline Schedule — Rev 2, ${VIEW_LABEL[opts.view]}`} />
            </div>
            {gridLike && (
              <div className="field">
                <label>Columns</label>
                <div className="chips">
                  {COL_CHOICES.map((c) => (
                    <button key={c} className={`chip ${opts.columns.includes(c) ? 'on' : ''}`} onClick={() => toggleCol(c)} disabled={c === 'name'}>{ALL_COLUMNS[c].label}</button>
                  ))}
                </div>
              </div>
            )}
            {opts.view === 'gantt' && (
              <div className="fields-2">
                <div className="field">
                  <label>Chart width</label>
                  <select value={opts.chartShare} onChange={(e) => set('chartShare', Number(e.target.value))}>
                    <option value={0.45}>45% of page</option>
                    <option value={0.6}>60% of page</option>
                    <option value={0.7}>70% of page</option>
                    <option value={0.8}>80% of page</option>
                  </select>
                </div>
                <div className="field">
                  <label>Date range</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="date" value={opts.rangeFrom ?? ''} onChange={(e) => set('rangeFrom', e.target.value || undefined)} title="From" />
                    <input type="date" value={opts.rangeTo ?? ''} onChange={(e) => set('rangeTo', e.target.value || undefined)} title="To" />
                  </div>
                  <div className="hint">Leave blank to fit the whole schedule on the page width.</div>
                </div>
              </div>
            )}
            {opts.view === 'lookahead' && (
              <div className="fields-3">
                <div className="field">
                  <label>Weeks</label>
                  <select value={opts.weeks} onChange={(e) => set('weeks', Number(e.target.value))}>
                    {[2, 3, 4, 6].map((w) => <option key={w} value={w}>{w} weeks</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Window starts</label>
                  <input type="date" value={opts.rangeFrom ?? ''} onChange={(e) => set('rangeFrom', e.target.value || undefined)} />
                  <div className="hint">Blank = week of the status date.</div>
                </div>
                <div className="field" style={{ justifyContent: 'flex-end' }}>
                  <label className="check"><input type="checkbox" checked={opts.includeWeekends} onChange={(e) => set('includeWeekends', e.target.checked)} /> Show weekends</label>
                  <label className="check"><input type="checkbox" checked={opts.includeComplete} onChange={(e) => set('includeComplete', e.target.checked)} /> Include completed</label>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
              {opts.view === 'gantt' && <label className="check"><input type="checkbox" checked={opts.showLinks} onChange={(e) => set('showLinks', e.target.checked)} /> Dependency arrows</label>}
              {opts.view === 'gantt' && <label className="check"><input type="checkbox" checked={opts.showLabels} onChange={(e) => set('showLabels', e.target.checked)} /> Responsible labels on bars</label>}
              {opts.view === 'gantt' && <label className="check"><input type="checkbox" checked={opts.showBaseline} onChange={(e) => set('showBaseline', e.target.checked)} disabled={!project.tasks.some((t) => t.baselineStart)} /> Baseline bars</label>}
              {gridLike && <label className="check"><input type="checkbox" checked={opts.criticalOnly} onChange={(e) => set('criticalOnly', e.target.checked)} /> Critical path only</label>}
              {gridLike && <label className="check"><input type="checkbox" checked={opts.collapsedOnly} onChange={(e) => set('collapsedOnly', e.target.checked)} /> Respect collapsed groups</label>}
              <label className="check"><input type="checkbox" checked={opts.legend} onChange={(e) => set('legend', e.target.checked)} /> Legend</label>
            </div>
            <div className="field">
              <label>Footer notes (optional)</label>
              <textarea value={opts.notes} onChange={(e) => set('notes', e.target.value)} style={{ minHeight: 50 }} placeholder="Assumptions, revision notes, distribution…" />
            </div>
            {lastPdf && (
              <div className="finding" style={{ cursor: 'default', borderColor: 'rgba(62,207,142,0.5)' }}>
                <div className="t">PDF saved</div>
                <div className="d" style={{ wordBreak: 'break-all' }}>{lastPdf}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <button className="btn sm" onClick={() => api.openExternal(lastPdf)}><ExternalLink /> Open</button>
                  <button className="btn sm" onClick={() => window.open(`/api/print/file?path=${encodeURIComponent(lastPdf)}`, '_blank')}><Eye /> View here</button>
                </div>
              </div>
            )}
          </div>
          <div className="d-foot">
            <span className="left">{busy ?? 'Preview opens in a new window with the system print dialog.'}</span>
            <button className="btn" onClick={() => preview(false)} disabled={!!busy}><Eye /> Preview</button>
            <button className="btn" onClick={() => preview(true)} disabled={!!busy}><Printer /> Print…</button>
            <button className="btn primary" onClick={() => setSaveDialog(true)} disabled={!!busy}><FileDown /> Save PDF…</button>
          </div>
        </div>
      </div>
      {saveDialog && <FileDialog mode="save" ext="pdf" title="Save PDF" defaultName={suggested} onClose={() => setSaveDialog(false)} onSave={exportPdf} />}
    </>
  );
}
