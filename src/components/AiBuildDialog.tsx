import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { useStore } from '../state/store';
import { streamAi, type Attachment } from '../api';
import { AttachmentStrip } from './AttachmentStrip';
import { AiProgress, type AiProgressState } from './AiProgress';
import { newProject, newTask } from '@engine/project';
import type { Link, LinkType, Project, Task } from '@engine/types';
import { addDays, startOfWeek, todayLocal, parseUserDate, makeDateTime } from '@engine/dates';
import { normalizeLevels } from '@engine/outline';

interface GenTask {
  key: string;
  name: string;
  durationDays: number;
  milestone: boolean;
  trade?: string;
  predecessors: { key: string; type: LinkType; lagDays: number }[];
  notes?: string;
}
interface GenResult {
  projectName: string;
  summary: string;
  phases: { name: string; tasks: GenTask[] }[];
}

const TYPES = ['School expansion', 'New school (ground-up)', 'Commercial TI', 'Office build-out', 'Renovation', 'Site / civil', 'Warehouse', 'Multi-family'];
const DELIVERY = ['CMAR', 'Design-Build', 'Design-Bid-Build', 'GMP'];

const EXAMPLES = [
  'Two-story 22,000 sf classroom addition to Cedar Ridge Elementary. Steel frame, slab on grade, brick veneer with metal panel accents, TPO roof. CMAR with GMP. Must be ready for teachers two weeks before the August 2027 school start. Include long-lead switchgear and RTUs.',
  '8,500 sf tenant improvement for a pediatric clinic on the second floor of an occupied office building. Demo existing partitions, new MEP, 12 exam rooms, imaging room with lead-lined walls. Owner wants 5 months.',
  'Single-story 40,000 sf tilt-up warehouse with 3,000 sf office, 6 dock doors, ESFR sprinklers, and truck court paving on a 5-acre greenfield site.',
];

export function convertGenerated(gen: GenResult, startDay: string): Project {
  const p = newProject(gen.projectName || 'AI Schedule', startDay);
  p.notes = gen.summary;
  const uidByKey = new Map<string, number>();
  let uid = 1;
  const tasks: Task[] = [];
  for (const ph of gen.phases) {
    tasks.push(newTask(uid++, { name: ph.name, outlineLevel: 1 }));
    for (const t of ph.tasks) {
      uidByKey.set(t.key, uid);
      tasks.push(newTask(uid++, {
        name: t.name,
        outlineLevel: 2,
        durationDays: t.milestone ? 0 : Math.max(0, Math.round(t.durationDays)),
        milestone: t.milestone || t.durationDays === 0,
        resourceNames: t.trade ?? '',
        notes: t.notes ?? '',
      }));
    }
  }
  const byUid = new Map(tasks.map((t) => [t.uid, t]));
  for (const ph of gen.phases) {
    for (const t of ph.tasks) {
      const task = byUid.get(uidByKey.get(t.key)!)!;
      const links: Link[] = [];
      for (const pr of t.predecessors ?? []) {
        const pu = uidByKey.get(pr.key);
        if (pu === undefined || pu === task.uid) continue;
        if (links.some((l) => l.predUid === pu)) continue;
        links.push({ predUid: pu, type: (['FS', 'SS', 'FF', 'SF'].includes(pr.type) ? pr.type : 'FS') as LinkType, lagDays: Math.round(pr.lagDays || 0) });
      }
      task.predecessors = links;
    }
  }
  p.tasks = normalizeLevels(tasks);
  p.nextUid = uid;
  return p;
}

export function AiBuildDialog({ onClose }: { onClose: () => void }) {
  const st = useStore.getState;
  const [brief, setBrief] = useState('');
  const [type, setType] = useState<string>('School expansion');
  const [delivery, setDelivery] = useState<string>('CMAR');
  const [start, setStart] = useState(addDays(startOfWeek(todayLocal()), 7));
  const [finish, setFinish] = useState('');
  const [detail, setDetail] = useState<'simple' | 'standard' | 'detailed'>('standard');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [progress, setProgress] = useState<AiProgressState | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    briefRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  const canGenerate = !!brief.trim() || attachments.length > 0;
  const generate = async () => {
    if (!canGenerate) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setResult(null);
    setProgress({ status: 'Reading your brief…', thought: '', chars: 0, startedAt: Date.now() });
    try {
      const r = await streamAi<GenResult>('/api/ai/generate', {
        brief, projectType: type, delivery, startDate: start, targetFinish: finish || undefined, detail, attachments,
      }, (ev) => {
        setProgress((p) => {
          if (!p) return p;
          if (ev.type === 'status') return { ...p, status: ev.data ?? p.status };
          if (ev.type === 'thought') return { ...p, status: 'Planning the build sequence…', thought: (p.thought + (ev.data ?? '')).slice(-2000) };
          if (ev.type === 'text') return { ...p, status: 'Writing tasks and logic…', chars: p.chars + (ev.data?.length ?? 0) };
          return p;
        });
      }, ac.signal);
      if (!r.phases?.length) throw new Error('The AI returned an empty schedule. Try adding more detail to the brief.');
      setResult(r);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const accept = () => {
    if (!result) return;
    const day = parseUserDate(start) ?? todayLocal();
    const p = convertGenerated(result, day);
    if (st().project && st().dirty && !confirm('Replace the current unsaved schedule with the generated one?')) return;
    st().setProject(p, { dirty: true });
    st().toast(`Built ${p.tasks.length} rows across ${result.phases.length} phases. Review the logic, then save.`, 'success');
    onClose();
  };

  const taskCount = result ? result.phases.reduce((n, p) => n + p.tasks.length, 0) : 0;
  const baselineRows = attachments.filter((a) => a.kind === 'schedule' && a.mode === 'baseline').reduce((n, a) => n + (parseInt(a.summary) || 0), 0);
  const expectedChars = baselineRows ? baselineRows * 190 : detail === 'simple' ? 4500 : detail === 'detailed' ? 22000 : 12000;

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !progress) onClose(); }}>
      <div className="dialog lg">
        <div className="d-head">
          <Sparkles style={{ color: 'var(--purple)' }} />
          <h2>Build a schedule with AI</h2>
          <button className="icon-btn x" onClick={onClose}><X /></button>
        </div>
        <div className="d-body">
          <div className="field">
            <label>Describe the project</label>
            <textarea
              ref={briefRef}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Size, type, structure, site conditions, delivery method, key dates, anything unusual…"
              style={{ minHeight: 110 }}
              disabled={!!progress}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate(); }}
            />
            <div className="chips" style={{ marginTop: 4 }}>
              {EXAMPLES.map((ex, i) => (
                <button key={i} className="chip" onClick={() => setBrief(ex)} disabled={!!progress}>Example {i + 1}</button>
              ))}
            </div>
          </div>
          <AttachmentStrip
            attachments={attachments}
            onChange={setAttachments}
            disabled={!!progress}
            defaultMode="baseline"
            hint="A PM, sub or vendor schedule as Baseline is mirrored then fixed; Reference informs the build; Verify flags disagreements."
          />
          <div className="fields-2">
            <div className="field">
              <label>Project type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} disabled={!!progress}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Delivery</label>
              <select value={delivery} onChange={(e) => setDelivery(e.target.value)} disabled={!!progress}>
                {DELIVERY.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="fields-3">
            <div className="field">
              <label>Start (NTP)</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={!!progress} />
            </div>
            <div className="field">
              <label>Target completion (optional)</label>
              <input type="date" value={finish} onChange={(e) => setFinish(e.target.value)} disabled={!!progress} />
            </div>
            <div className="field">
              <label>Detail</label>
              <select value={detail} onChange={(e) => setDetail(e.target.value as typeof detail)} disabled={!!progress}>
                <option value="simple">Simple (15–30 tasks)</option>
                <option value="standard">Standard (45–80 tasks)</option>
                <option value="detailed">Detailed (80–120 tasks)</option>
              </select>
            </div>
          </div>
          {progress && <AiProgress state={progress} expected={expectedChars} />}
          {error && <div className="finding" style={{ borderColor: 'var(--red)', cursor: 'default' }}><div className="t"><i className="sev high" />Couldn't build the schedule</div><div className="d">{error}</div></div>}
          {result && (
            <div className="ai-preview">
              <div className="sum"><b>{result.projectName}</b> · {taskCount} tasks in {result.phases.length} phases<br />{result.summary}</div>
              <div className="list">
                {result.phases.map((ph, i) => (
                  <div key={i}>
                    <div className="ph">{ph.name}</div>
                    {ph.tasks.map((t) => (
                      <div key={t.key} className={`tk ${t.milestone ? 'ms' : ''}`}>
                        <span>{t.milestone ? '◆ ' : ''}{t.name}</span>
                        <span className="d">{t.milestone ? '—' : `${t.durationDays}d`}</span>
                        <span className="tr">{t.trade}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="d-foot">
          <span className="left">Optional. Uses the AI endpoint configured for this install, and nothing else.</span>
          {progress ? (
            <button className="btn" onClick={() => { abortRef.current?.abort(); setProgress(null); }}>Cancel</button>
          ) : result ? (
            <>
              <button className="btn" onClick={generate}>Regenerate</button>
              <button className="btn primary" onClick={accept}><Check /> Use this schedule</button>
            </>
          ) : (
            <button className="btn ai" onClick={generate} disabled={!canGenerate}><Sparkles /> Build schedule</button>
          )}
        </div>
      </div>
    </div>
  );
}

export { makeDateTime };
