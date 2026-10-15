import { useEffect, useMemo, useState } from 'react';
import { X, PanelRight, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../state/store';
import { fmtShort, makeDateTime, parseUserDate, dayOf } from '@engine/dates';
import { idMaps, parseDuration } from '@engine/predecessors';
import type { ConstraintType, Link, LinkType } from '@engine/types';

const COLORS = ['#4f8cff', '#3ecf8e', '#f5a524', '#ef4b5e', '#a78bfa', '#22d3ee', '#f472b6', '#94a3b8'];
const CONSTRAINTS: { id: ConstraintType; label: string; dated: boolean }[] = [
  { id: 'ASAP', label: 'As soon as possible', dated: false },
  { id: 'ALAP', label: 'As late as possible', dated: false },
  { id: 'SNET', label: 'Start no earlier than', dated: true },
  { id: 'SNLT', label: 'Start no later than', dated: true },
  { id: 'FNET', label: 'Finish no earlier than', dated: true },
  { id: 'FNLT', label: 'Finish no later than', dated: true },
  { id: 'MSO', label: 'Must start on', dated: true },
  { id: 'MFO', label: 'Must finish on', dated: true },
];

export function TaskDetails() {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const activeUid = useStore((s) => s.activeUid);
  const st = useStore.getState;
  const task = project.tasks.find((t) => t.uid === activeUid);
  const s = task ? schedule.byUid.get(task.uid) : undefined;
  const maps = useMemo(() => idMaps(project.tasks), [project.tasks]);
  const [dur, setDur] = useState('');
  const [cdate, setCdate] = useState('');
  const [addPred, setAddPred] = useState('');

  useEffect(() => {
    if (task) {
      setDur(task.milestone ? '0' : String(task.durationDays));
      setCdate(task.constraintDate ? dayOf(task.constraintDate) : '');
    }
  }, [task?.uid, task?.durationDays, task?.milestone, task?.constraintDate]);

  const close = () => st().toggleFlag('detailsOpen');

  if (!task || !s) {
    return (
      <div className="side-panel details">
        <div className="head"><PanelRight /> Task details <button className="icon-btn x" onClick={close}><X /></button></div>
        <div className="empty-state"><PanelRight />Select a task to see and edit its details.</div>
      </div>
    );
  }

  const successors = project.tasks.filter((t) => t.predecessors.some((l) => l.predUid === task.uid));
  const updateLink = (i: number, patch: Partial<Link>) => {
    const links = task.predecessors.map((l, k) => (k === i ? { ...l, ...patch } : l));
    const err = st().setPredecessors(task.uid, links);
    if (err) st().toast(err, 'error');
  };

  return (
    <div className="side-panel details">
      <div className="head">
        <PanelRight /> Task {s.id}
        <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>{s.wbs}</span>
        <button className="icon-btn x" onClick={close}><X /></button>
      </div>
      <div className="body">
        <div className="field">
          <label>Name</label>
          <input value={task.name} onChange={(e) => st().setTaskField(task.uid, 'name', e.target.value)} />
        </div>
        <div className="dates">
          <div className="stat"><div className="k">Start</div><div className="v">{fmtShort(s.start)}</div></div>
          <div className="stat"><div className="k">Finish</div><div className="v">{fmtShort(s.finish)}</div></div>
          <div className="stat"><div className="k">Total slack</div><div className={`v ${s.critical ? 'crit' : ''}`}>{s.hasChildren ? '—' : s.critical ? 'Critical' : `${s.totalSlackDays} days`}</div></div>
          <div className="stat"><div className="k">Late finish</div><div className="v">{s.hasChildren ? '—' : fmtShort(s.lateFinish)}</div></div>
        </div>
        {!s.hasChildren && (
          <div className="fields-2">
            <div className="field">
              <label>Duration (working days)</label>
              <input
                value={dur}
                onChange={(e) => setDur(e.target.value)}
                onBlur={() => {
                  const d = parseDuration(dur);
                  if (d === null) { st().toast('Enter a duration like 5d or 2w.', 'error'); return; }
                  st().patchTask(task.uid, { durationDays: d, milestone: d === 0 });
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </div>
            <div className="field">
              <label>% Complete</label>
              <input type="number" min={0} max={100} value={task.percentComplete} onChange={(e) => st().setTaskField(task.uid, 'percentComplete', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </div>
          </div>
        )}
        <div className="field">
          <label>Responsible / trade</label>
          <input value={task.resourceNames} onChange={(e) => st().setTaskField(task.uid, 'resourceNames', e.target.value)} placeholder="e.g. Concrete sub" />
        </div>
        {!s.hasChildren && (
          <>
            <label className="check" style={{ marginBottom: 10 }}>
              <input type="checkbox" checked={task.milestone} onChange={() => st().toggleMilestone([task.uid])} /> Milestone
            </label>
            <div className="fields-2">
              <div className="field">
                <label>Constraint</label>
                <select value={task.constraintType} onChange={(e) => {
                  const c = e.target.value as ConstraintType;
                  const needsDate = CONSTRAINTS.find((x) => x.id === c)!.dated;
                  st().patchTask(task.uid, { constraintType: c, constraintDate: needsDate ? task.constraintDate ?? s.start : undefined });
                }}>
                  {CONSTRAINTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Constraint date</label>
                <input
                  value={cdate}
                  disabled={!CONSTRAINTS.find((x) => x.id === task.constraintType)!.dated}
                  onChange={(e) => setCdate(e.target.value)}
                  onBlur={() => {
                    if (!cdate.trim()) return;
                    const d = parseUserDate(cdate, Number(project.startDate.slice(0, 4)));
                    if (!d) { st().toast('Enter a date like 9/17/26.', 'error'); return; }
                    const startLike = ['SNET', 'SNLT', 'MSO'].includes(task.constraintType);
                    st().patchTask(task.uid, { constraintDate: makeDateTime(d, startLike ? 8 : 17) });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder="m/d/yyyy"
                />
              </div>
            </div>
          </>
        )}
        <div className="field">
          <label>Predecessors</label>
          <div className="links">
            {task.predecessors.map((l, i) => {
              const pred = project.tasks.find((t) => t.uid === l.predUid);
              return (
                <div className="link-row" key={l.predUid}>
                  <span className="nm" title={pred?.name}><span className="id">{maps.idByUid.get(l.predUid)}</span>{pred?.name}</span>
                  <select value={l.type} onChange={(e) => updateLink(i, { type: e.target.value as LinkType })}>
                    {(['FS', 'SS', 'FF', 'SF'] as LinkType[]).map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <input value={l.lagDays} type="number" step={1} onChange={(e) => updateLink(i, { lagDays: Number(e.target.value) || 0 })} title="Lag in working days" />
                  <button className="icon-btn x" style={{ width: 24, height: 24 }} onClick={() => {
                    const err = st().setPredecessors(task.uid, task.predecessors.filter((_, k) => k !== i));
                    if (err) st().toast(err, 'error');
                  }}><Trash2 style={{ width: 13, height: 13 }} /></button>
                </div>
              );
            })}
            <div className="link-row" style={{ gridTemplateColumns: '1fr 26px' }}>
              <input
                placeholder="Add by ID, e.g. 12 or 12SS+3d"
                value={addPred}
                onChange={(e) => setAddPred(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const m = addPred.trim().match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+(?:\.\d+)?)?\s*(d|w)?$/i);
                  if (!m) { st().toast('Use a task ID like 12 or 12SS+3d.', 'error'); return; }
                  const uid = maps.uidById.get(Number(m[1]));
                  if (uid === undefined) { st().toast(`No task with ID ${m[1]}.`, 'error'); return; }
                  let lag = m[3] ? Number(m[3].replace(/\s/g, '')) : 0;
                  if ((m[4] ?? 'd').toLowerCase() === 'w') lag *= 5;
                  const err = st().addLink(uid, task.uid, ((m[2] ?? 'FS').toUpperCase()) as LinkType, lag);
                  if (err) st().toast(err, 'error');
                  else setAddPred('');
                }}
              />
              <button className="icon-btn" style={{ width: 24, height: 24 }} title="Press Enter to add"><Plus style={{ width: 13, height: 13 }} /></button>
            </div>
          </div>
        </div>
        {successors.length > 0 && (
          <div className="field">
            <label>Successors</label>
            <div style={{ fontSize: 12, color: 'var(--fg-2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {successors.map((t) => {
                const l = t.predecessors.find((x) => x.predUid === task.uid)!;
                return <span key={t.uid}><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-3)', marginRight: 6 }}>{maps.idByUid.get(t.uid)}</span>{t.name} <span style={{ color: 'var(--fg-3)' }}>{l.type}{l.lagDays ? (l.lagDays > 0 ? '+' : '') + l.lagDays + 'd' : ''}</span></span>;
              })}
            </div>
          </div>
        )}
        <div className="field">
          <label>Bar color</label>
          <div className="colors">
            <button className={`none ${!task.color ? 'on' : ''}`} onClick={() => st().patchTask(task.uid, { color: undefined })} title="Automatic">A</button>
            {COLORS.map((c) => <button key={c} style={{ background: c }} className={task.color === c ? 'on' : ''} onClick={() => st().patchTask(task.uid, { color: c })} />)}
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={task.notes} onChange={(e) => st().setTaskField(task.uid, 'notes', e.target.value)} placeholder="Assumptions, submittal numbers, who to call…" />
        </div>
        {task.baselineStart && (
          <div className="field">
            <label>Baseline</label>
            <div className="hint">{fmtShort(task.baselineStart)} → {fmtShort(task.baselineFinish)} ({task.baselineDurationDays}d)</div>
          </div>
        )}
      </div>
    </div>
  );
}
