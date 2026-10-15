import { useEffect, useRef, useState } from 'react';
import { Wand2, X, Check } from 'lucide-react';
import { useStore } from '../state/store';
import { streamAi, type Attachment } from '../api';
import { AttachmentStrip } from './AttachmentStrip';
import { AiProgress, type AiProgressState } from './AiProgress';
import type { ConstraintType, LinkType, Project, Task } from '@engine/types';
import { newTask } from '@engine/project';
import { wouldCreateCycle } from '@engine/schedule';
import { fmtNumeric, makeDateTime } from '@engine/dates';
import { WorkCalendar } from '@engine/calendar';

interface Op {
  op: 'update' | 'add' | 'delete' | 'link' | 'unlink';
  id?: number;
  afterId?: number;
  name?: string;
  durationDays?: number;
  milestone?: boolean;
  trade?: string;
  percentComplete?: number;
  notes?: string;
  predId?: number;
  linkType?: LinkType;
  lagDays?: number;
  outlineLevel?: number;
  constraintType?: ConstraintType;
  constraintDate?: string;
  actualStart?: string;
  actualFinish?: string;
  source?: string;
}

const CONSTRAINT_TYPES: ConstraintType[] = ['ASAP', 'ALAP', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'];
const START_LIKE: ConstraintType[] = ['SNET', 'SNLT', 'MSO'];
const CONSTRAINT_LABEL: Record<ConstraintType, string> = {
  ASAP: 'as soon as possible',
  ALAP: 'as late as possible',
  SNET: 'start no earlier than',
  SNLT: 'start no later than',
  FNET: 'finish no earlier than',
  FNLT: 'finish no later than',
  MSO: 'must start on',
  MFO: 'must finish on',
};

/** Accepts YYYY-MM-DD (or a full local date-time) from the AI; returns a local date-time or null if unusable. */
function aiDate(v: string | undefined, hour: number): string | null | undefined {
  if (v === undefined) return undefined;
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return makeDateTime(s, hour);
  return undefined;
}
interface EditResult {
  explanation: string;
  operations: Op[];
}

const EXAMPLES = [
  'Verify the geotech memo against the notes I paste here and update actual dates. Do not invent dates.',
  'Push the whole Interior Finishes phase out two weeks.',
  'Add a 5-day “Owner FF&E walkthrough” after punch list, done by the Owner.',
  'Mark everything in Preconstruction 100% complete.',
  'Verify the attached sub schedule against ours and reconcile the dates and durations.',
];

/** Applies AI edit operations to a project. Returns a description of what changed. */
export function applyOps(project: Project, ops: Op[]): { applied: number; skipped: string[] } {
  const skipped: string[] = [];
  let applied = 0;
  const byId = () => project.tasks.map((t) => t.uid); // index+1 -> uid at time of call
  const findUid = (id?: number) => (id !== undefined ? byId()[id - 1] : undefined);
  for (const op of ops) {
    switch (op.op) {
      case 'update': {
        const uid = findUid(op.id);
        const t = project.tasks.find((x) => x.uid === uid);
        if (!t) { skipped.push(`update #${op.id}: not found`); break; }
        if (op.name !== undefined) t.name = op.name;
        if (op.durationDays !== undefined) { t.durationDays = Math.max(0, op.durationDays); t.milestone = t.durationDays === 0; }
        if (op.milestone !== undefined) { t.milestone = op.milestone; if (op.milestone) t.durationDays = 0; }
        if (op.trade !== undefined) t.resourceNames = op.trade;
        if (op.percentComplete !== undefined) t.percentComplete = Math.max(0, Math.min(100, op.percentComplete));
        if (op.notes !== undefined) t.notes = op.notes;
        if (op.source) {
          const line = `Source: ${op.source}`;
          if (!t.notes?.includes(line)) t.notes = t.notes ? `${t.notes}\n${line}` : line;
        }
        if (op.outlineLevel !== undefined) t.outlineLevel = Math.max(1, op.outlineLevel);
        if (op.constraintType !== undefined && CONSTRAINT_TYPES.includes(op.constraintType)) {
          t.constraintType = op.constraintType;
          if (!['ASAP', 'ALAP'].includes(op.constraintType)) {
            const d = aiDate(op.constraintDate, START_LIKE.includes(op.constraintType) ? 8 : 17);
            if (d) t.constraintDate = d;
            else if (!t.constraintDate) { t.constraintType = 'ASAP'; skipped.push(`update #${op.id}: ${op.constraintType} needs a date`); }
          } else {
            t.constraintDate = undefined;
          }
        } else if (op.constraintDate !== undefined && t.constraintType !== 'ASAP' && t.constraintType !== 'ALAP') {
          const d = aiDate(op.constraintDate, START_LIKE.includes(t.constraintType) ? 8 : 17);
          if (d) t.constraintDate = d;
        }
        const as = aiDate(op.actualStart, 8);
        if (as !== undefined) t.actualStart = as ?? undefined;
        const af = aiDate(op.actualFinish, 17);
        if (af !== undefined) {
          t.actualFinish = af ?? undefined;
          if (af) {
            // The engine positions a task from actualStart; without one, back the start off the finish by the duration.
            if (!t.actualStart || t.actualStart > af) {
              const cal = new WorkCalendar(project.calendar, project.startDate.slice(0, 10));
              t.actualStart = cal.startDateTime(Math.max(0, cal.positionOfFinish(af) - Math.max(t.milestone ? 0 : t.durationDays, 0)));
            }
            if (op.percentComplete === undefined) t.percentComplete = 100;
          }
        }
        applied++;
        break;
      }
      case 'add': {
        const afterUid = findUid(op.afterId);
        let index = afterUid !== undefined ? project.tasks.findIndex((x) => x.uid === afterUid) + 1 : project.tasks.length;
        const ref = index > 0 ? project.tasks[index - 1] : undefined;
        const level = op.outlineLevel ?? ref?.outlineLevel ?? 1;
        const uid = project.nextUid++;
        const t: Task = newTask(uid, {
          name: op.name ?? 'New task',
          outlineLevel: level,
          durationDays: op.milestone ? 0 : Math.max(0, op.durationDays ?? 1),
          milestone: !!op.milestone || op.durationDays === 0,
          resourceNames: op.trade ?? '',
          notes: op.notes ?? '',
        });
        if (index < 0) index = project.tasks.length;
        project.tasks.splice(index, 0, t);
        if (op.predId !== undefined) {
          const pu = findUid(op.predId);
          if (pu !== undefined && pu !== uid) t.predecessors.push({ predUid: pu, type: op.linkType ?? 'FS', lagDays: op.lagDays ?? 0 });
        }
        applied++;
        break;
      }
      case 'delete': {
        const uid = findUid(op.id);
        if (uid === undefined) { skipped.push(`delete #${op.id}: not found`); break; }
        project.tasks = project.tasks.filter((x) => x.uid !== uid);
        for (const t of project.tasks) t.predecessors = t.predecessors.filter((l) => l.predUid !== uid);
        applied++;
        break;
      }
      case 'link': {
        const succ = findUid(op.id);
        const pred = findUid(op.predId);
        const t = project.tasks.find((x) => x.uid === succ);
        if (!t || pred === undefined) { skipped.push(`link #${op.predId} → #${op.id}: not found`); break; }
        if (wouldCreateCycle(project.tasks, pred, succ!)) { skipped.push(`link #${op.predId} → #${op.id}: would create a loop`); break; }
        const existing = t.predecessors.find((l) => l.predUid === pred);
        if (existing) { existing.type = op.linkType ?? existing.type; existing.lagDays = op.lagDays ?? existing.lagDays; }
        else t.predecessors.push({ predUid: pred, type: op.linkType ?? 'FS', lagDays: op.lagDays ?? 0 });
        applied++;
        break;
      }
      case 'unlink': {
        const succ = findUid(op.id);
        const pred = findUid(op.predId);
        const t = project.tasks.find((x) => x.uid === succ);
        if (!t) { skipped.push(`unlink #${op.id}: not found`); break; }
        t.predecessors = pred === undefined ? [] : t.predecessors.filter((l) => l.predUid !== pred);
        applied++;
        break;
      }
    }
  }
  return { applied, skipped };
}

export function AiEditDialog({ onClose }: { onClose: () => void }) {
  const st = useStore.getState;
  const selection = useStore((s) => s.selection);
  const schedule = useStore((s) => s.schedule)!;
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [progress, setProgress] = useState<AiProgressState | null>(null);
  const [result, setResult] = useState<EditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  const selectedIds = selection.map((u) => schedule.byUid.get(u)?.id).filter(Boolean);

  const run = async () => {
    if (!text.trim()) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setResult(null);
    setProgress({ status: 'Working out the changes…', thought: '', chars: 0, startedAt: Date.now() });
    const instruction = selectedIds.length ? `${text.trim()}\n(The user currently has tasks ${selectedIds.map((i) => '#' + i).join(', ')} selected.)` : text.trim();
    try {
      const r = await streamAi<EditResult>('/api/ai/edit', { project: st().project, instruction, attachments }, (ev) => {
        setProgress((p) => {
          if (!p) return p;
          if (ev.type === 'status') return { ...p, status: ev.data ?? p.status, thought: '', chars: 0 };
          if (ev.type === 'thought') return { ...p, thought: (p.thought + (ev.data ?? '')).slice(-1500) };
          if (ev.type === 'text') return { ...p, status: 'Writing changes…', chars: p.chars + (ev.data?.length ?? 0) };
          return p;
        });
      }, ac.signal);
      setResult(r);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const apply = () => {
    if (!result) return;
    let summary = { applied: 0, skipped: [] as string[] };
    st().update((d) => {
      summary = applyOps(d, result.operations);
    });
    st().toast(`Applied ${summary.applied} change${summary.applied === 1 ? '' : 's'}${summary.skipped.length ? `; skipped ${summary.skipped.length}` : ''}. Undo with Ctrl+Z.`, summary.skipped.length ? 'info' : 'success');
    onClose();
  };

  const taskName = (id?: number) => {
    const tasks = st().project?.tasks ?? [];
    const uid = id !== undefined ? tasks[id - 1]?.uid : undefined;
    const t = tasks.find((x) => x.uid === uid);
    return t ? `#${id} ${t.name}` : `#${id}`;
  };
  const fmtDay = (v: string) => (v.trim() ? fmtNumeric(v.trim().slice(0, 10)) : 'cleared');
  const describeUpdate = (op: Op): string => {
    const parts: string[] = [];
    if (op.name !== undefined) parts.push(`rename to "${op.name}"`);
    if (op.durationDays !== undefined) parts.push(`duration ${op.durationDays}d`);
    if (op.milestone !== undefined) parts.push(op.milestone ? 'make milestone' : 'not a milestone');
    if (op.trade !== undefined) parts.push(`responsible ${op.trade}`);
    if (op.percentComplete !== undefined) parts.push(`${op.percentComplete}% complete`);
    if (op.outlineLevel !== undefined) parts.push(`outline level ${op.outlineLevel}`);
    if (op.constraintType !== undefined) {
      const label = CONSTRAINT_LABEL[op.constraintType] ?? op.constraintType;
      parts.push(op.constraintDate && !['ASAP', 'ALAP'].includes(op.constraintType) ? `${label} ${fmtDay(op.constraintDate)}` : label);
    } else if (op.constraintDate !== undefined) parts.push(`constraint date ${fmtDay(op.constraintDate)}`);
    if (op.actualStart !== undefined) parts.push(`actual start ${fmtDay(op.actualStart)}`);
    if (op.actualFinish !== undefined) parts.push(`actual finish ${fmtDay(op.actualFinish)}`);
    if (op.notes !== undefined) parts.push('notes');
    if (op.source) parts.push(`source: ${op.source}`);
    return parts.join(', ') || 'no fields';
  };
  const describe = (op: Op): string => {
    switch (op.op) {
      case 'update': return `Update ${taskName(op.id)}: ${describeUpdate(op)}`;
      case 'add': return `Add "${op.name}" (${op.milestone ? 'milestone' : `${op.durationDays ?? 1}d`}) after #${op.afterId ?? 'end'}${op.predId ? `, after #${op.predId}` : ''}`;
      case 'delete': return `Delete ${taskName(op.id)}`;
      case 'link': return `Link ${taskName(op.predId)} → ${taskName(op.id)} ${op.linkType ?? 'FS'}${op.lagDays ? (op.lagDays > 0 ? '+' : '') + op.lagDays + 'd' : ''}`;
      case 'unlink': return `Unlink ${op.predId ? `${taskName(op.predId)} from ` : 'all predecessors of '}${taskName(op.id)}`;
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !progress) onClose(); }}>
      <div className="dialog">
        <div className="d-head">
          <Wand2 style={{ color: 'var(--purple)' }} />
          <h2>Change the schedule with AI</h2>
          <button className="icon-btn x" onClick={onClose}><X /></button>
        </div>
        <div className="d-body">
          <div className="field">
            <label>What should change?</label>
            <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell Datum what to change, like you'd tell a scheduler." style={{ minHeight: 80 }} disabled={!!progress} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); }} />
            {selectedIds.length > 0 && <div className="hint">Selected tasks: {selectedIds.map((i) => `#${i}`).join(', ')}</div>}
            <div className="chips" style={{ marginTop: 4 }}>
              {EXAMPLES.map((ex) => <button key={ex} className="chip" onClick={() => setText(ex)} disabled={!!progress}>{ex}</button>)}
            </div>
          </div>
          <AttachmentStrip
            attachments={attachments}
            onChange={setAttachments}
            disabled={!!progress}
            defaultMode="verify"
            hint="Attach a sub or vendor schedule to check the live schedule against it, or as reference for the change."
          />
          {progress && <AiProgress state={progress} expected={2500} />}
          {error && <div className="finding" style={{ borderColor: 'var(--red)', cursor: 'default' }}><div className="t"><i className="sev high" />Couldn't work that out</div><div className="d">{error}</div></div>}
          {result && result.operations.length > 0 && (
            <div className="ai-preview">
              <div className="sum">{result.explanation}</div>
              <div className="list">
                {result.operations.map((op, i) => <div key={i} className="tk" style={{ gridTemplateColumns: '1fr', paddingLeft: 12 }}>{describe(op)}</div>)}
              </div>
            </div>
          )}
          {result && result.operations.length === 0 && (
            <div className="finding" style={{ cursor: 'default' }}>
              <div className="t"><i className="sev low" />Datum proposed no changes</div>
              <div className="d">{result.explanation}</div>
              <div className="d" style={{ marginTop: 6 }}>If this was a live-date check, no fact mapped onto a task, or the instruction did not ask for one. Name the task, or configure a facts source and try again.</div>
            </div>
          )}
        </div>
        <div className="d-foot">
          <span className="left">Changes are previewed first and can be undone. Live dates only arrive if a facts source is configured.</span>
          {progress ? (
            <button className="btn" onClick={() => { abortRef.current?.abort(); setProgress(null); }}>Cancel</button>
          ) : result && result.operations.length ? (
            <>
              <button className="btn" onClick={() => setResult(null)}>Back</button>
              <button className="btn primary" onClick={apply}><Check /> Apply {result.operations.length} change{result.operations.length === 1 ? '' : 's'}</button>
            </>
          ) : result ? (
            <button className="btn" onClick={() => setResult(null)}>Edit instruction</button>
          ) : (
            <button className="btn ai" onClick={run} disabled={!text.trim()}><Wand2 /> Propose changes</button>
          )}
        </div>
      </div>
    </div>
  );
}
