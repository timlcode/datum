import { useMemo } from 'react';
import { Diamond, Printer } from 'lucide-react';
import { useStore } from '../state/store';
import { fmtShort, todayLocal, dayOf, diffDays } from '@engine/dates';
import { computeOutline } from '@engine/outline';
import { milestoneTone, type MilestoneTone } from '@engine/boards';

function MilestoneStatus({ tone, past }: { tone: MilestoneTone; past: boolean }) {
  const label = tone === 'complete' ? 'Complete' : past ? 'Past due' : tone === 'at-risk' ? 'At risk' : tone === 'in-progress' ? 'In progress' : 'Upcoming';
  const cls = tone === 'complete' ? 'done' : past || tone === 'at-risk' ? 'at-risk' : tone === 'in-progress' ? 'in-progress' : 'upcoming';
  const dot = tone === 'complete' ? 'complete' : past || tone === 'at-risk' ? 'at-risk' : tone;
  return (
    <span className={`st ${cls}`}>
      <i className={`status-dot ${dot}`} />
      {label}
    </span>
  );
}

export function MilestonesView() {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const select = useStore((s) => s.select);
  const openDialog = useStore((s) => s.openDialog);
  const today = todayLocal();
  const rows = useMemo(() => {
    const outline = computeOutline(project.tasks);
    const phaseOf = (uid: number) => {
      const p = outline.get(uid)?.parentUid;
      return p !== undefined ? project.tasks.find((t) => t.uid === p)?.name ?? '' : '';
    };
    return project.tasks
      .filter((t) => t.milestone && !schedule.byUid.get(t.uid)!.hasChildren)
      .map((t) => ({ t, s: schedule.byUid.get(t.uid)!, phase: phaseOf(t.uid) }))
      .sort((a, b) => (a.s.finish < b.s.finish ? -1 : a.s.finish > b.s.finish ? 1 : 0));
  }, [project, schedule]);

  return (
    <div className="milestones">
      <div className="la-head" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Milestones</h2>
        <span style={{ color: 'var(--fg-2)' }}>{rows.length} key dates</span>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => openDialog('print')}><Printer /> Print</button>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state"><Diamond />No milestones yet. Select a task and press <kbd>Ctrl</kbd>+<kbd>M</kbd>, or set its duration to 0.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Milestone</th>
              <th style={{ width: 130 }}>Date</th>
              <th style={{ width: 120 }}>Baseline</th>
              <th style={{ width: 90 }}>Variance</th>
              <th style={{ width: 90 }}>Slack</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 160 }}>Responsible</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, s, phase }) => {
              const tone = milestoneTone(t, s.finish, s.critical, s.totalSlackDays, today);
              const variance = t.baselineFinish ? diffDays(dayOf(t.baselineFinish), dayOf(s.finish)) : null;
              return (
                <tr key={t.uid} onDoubleClick={() => { select([t.uid], t.uid); useStore.getState().setView('gantt'); }}>
                  <td style={{ color: 'var(--fg-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{s.id}</td>
                  <td className="nm">{t.name}{phase && <span className="ph">{phase}</span>}</td>
                  <td>{fmtShort(s.finish)}</td>
                  <td style={{ color: 'var(--fg-2)' }}>{t.baselineFinish ? fmtShort(t.baselineFinish) : '—'}</td>
                  <td className={`var ${variance !== null && variance > 0 ? 'late' : variance !== null && variance < 0 ? 'early' : ''}`}>
                    {variance === null ? '—' : variance === 0 ? 'On plan' : `${variance > 0 ? '+' : ''}${variance}d`}
                  </td>
                  <td>{s.critical ? <span style={{ color: 'var(--red)' }}>Critical</span> : `${s.totalSlackDays}d`}</td>
                  <td><MilestoneStatus tone={tone} past={tone !== 'complete' && dayOf(s.finish) < today} /></td>
                  <td style={{ color: 'var(--fg-2)' }}>{t.resourceNames}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
