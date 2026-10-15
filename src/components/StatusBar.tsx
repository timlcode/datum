import { useMemo } from 'react';
import { useStore } from '../state/store';
import { fmtMedium } from '@engine/dates';
import { assessHealth, healthScore } from '@engine/health';

export function StatusBar() {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const dirty = useStore((s) => s.dirty);
  const selection = useStore((s) => s.selection);
  const busy = useStore((s) => s.busy);
  const setSidePanel = useStore((s) => s.setSidePanel);

  const stats = useMemo(() => {
    const leaves = schedule.rows.filter((r) => !r.hasChildren);
    const critical = leaves.filter((r) => r.critical).length;
    const milestones = project.tasks.filter((t) => t.milestone).length;
    const done = leaves.filter((r) => (project.tasks.find((t) => t.uid === r.uid)?.percentComplete ?? 0) >= 100).length;
    const findings = assessHealth(project, schedule);
    return { leaves: leaves.length, critical, milestones, done, score: healthScore(findings), findings: findings.length };
  }, [project, schedule]);

  const err = schedule.errors[0];

  return (
    <div className="statusbar">
      <span><b>{stats.leaves}</b> tasks</span>
      <span><b>{stats.milestones}</b> milestones</span>
      <span className="crit"><b style={{ color: 'inherit' }}>{stats.critical}</b> critical</span>
      <span>{fmtMedium(schedule.projectStart)} → <b>{fmtMedium(schedule.projectFinish)}</b> · {schedule.durationDays} working days</span>
      {err && <span className="warn" title={err.message} onClick={() => useStore.getState().select(err.uids)}>⚠ {err.message}</span>}
      <div className="right">
        {busy && <span>{busy}</span>}
        {selection.length > 1 && <span>{selection.length} selected</span>}
        <span className="pill" style={{ cursor: 'pointer' }} onClick={() => setSidePanel('health')} title="Schedule health">
          Health <b style={{ color: stats.score >= 80 ? 'var(--green)' : stats.score >= 50 ? 'var(--accent)' : 'var(--red)' }}>{stats.score}</b>
        </span>
        <span className="pill"><i className={`dot ${dirty ? 'dirty' : ''}`} />{dirty ? 'Unsaved' : 'Saved'}</span>
      </div>
    </div>
  );
}
