import { useMemo } from 'react';
import type { Project, ScheduleResult } from '@engine/types';
import type { PrintOptions } from './printOptions';
import { fmtShort, todayLocal, dayOf, diffDays } from '@engine/dates';
import { computeOutline } from '@engine/outline';

interface Props {
  project: Project;
  schedule: ScheduleResult;
  options: PrintOptions;
  width: number;
  head: React.ReactNode;
}

export function MilestonesPrint({ project, schedule, width, head }: Props) {
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
      .sort((a, b) => (a.s.finish < b.s.finish ? -1 : 1));
  }, [project, schedule]);
  return (
    <table className="rep" style={{ width }}>
      <colgroup>
        <col style={{ width: 26 }} />
        <col />
        <col style={{ width: 150 }} />
        <col style={{ width: 90 }} />
        <col style={{ width: 90 }} />
        <col style={{ width: 60 }} />
        <col style={{ width: 60 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 130 }} />
      </colgroup>
      <thead>
        <tr><td colSpan={9} style={{ border: 0, padding: 0, height: 'auto', whiteSpace: 'normal' }}>{head}</td></tr>
        <tr>
          <th className="col c">#</th><th className="col">Milestone</th><th className="col">Phase</th><th className="col">Date</th><th className="col">Baseline</th><th className="col r">Var.</th><th className="col r">Slack</th><th className="col">Status</th><th className="col">Responsible</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ t, s, phase }) => {
          const done = t.percentComplete >= 100;
          const past = !done && dayOf(s.finish) < today;
          const v = t.baselineFinish ? diffDays(dayOf(t.baselineFinish), dayOf(s.finish)) : null;
          return (
            <tr key={t.uid} style={{ height: 22 }}>
              <td className="id">{s.id}</td>
              <td className="nm" style={{ fontWeight: 600 }}><i className="dia" />{t.name}</td>
              <td style={{ color: 'var(--p-fg-2)' }}>{phase}</td>
              <td>{fmtShort(s.finish)}</td>
              <td style={{ color: 'var(--p-fg-2)' }}>{t.baselineFinish ? fmtShort(t.baselineFinish) : '—'}</td>
              <td className="r" style={{ color: v !== null && v > 0 ? 'var(--p-critical)' : v !== null && v < 0 ? 'var(--p-done)' : undefined }}>{v === null ? '—' : v === 0 ? '0' : `${v > 0 ? '+' : ''}${v}d`}</td>
              <td className="r">{s.critical ? <span style={{ color: 'var(--p-critical)' }}>0d</span> : `${s.totalSlackDays}d`}</td>
              <td>{done ? <span className="st-pill done">Complete</span> : past ? <span className="st-pill past">Past due</span> : s.critical ? <span className="st-pill crit">Critical</span> : <span className="st-pill">On track</span>}</td>
              <td style={{ color: 'var(--p-fg-2)' }}>{t.resourceNames}</td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--p-fg-3)', height: 40 }}>No milestones in this schedule.</td></tr>}
      </tbody>
    </table>
  );
}
