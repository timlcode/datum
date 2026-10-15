import { useMemo } from 'react';
import type { Project, ScheduleResult } from '@engine/types';
import type { PrintOptions } from './printOptions';
import { buildLookAhead } from '@engine/lookahead';
import { fmtNumericShort as fmtNumeric, fmtNumeric as fmtNumericLong, todayLocal, weekday, WEEKDAYS_SHORT } from '@engine/dates';
import { formatDuration } from '@engine/predecessors';

interface Props {
  project: Project;
  schedule: ScheduleResult;
  options: PrintOptions;
  width: number;
  head: React.ReactNode;
}

export function LookAheadPrint({ project, schedule, options, width, head }: Props) {
  const statusDay = project.statusDate ?? todayLocal();
  const la = useMemo(
    () => buildLookAhead(project, schedule, statusDay, { weeks: options.weeks, includeWeekends: options.includeWeekends, includeComplete: options.includeComplete, from: options.rangeFrom }),
    [project, schedule, statusDay, options],
  );
  const dayW = Math.max(14, Math.min(26, Math.floor((width * 0.5) / la.days.length)));
  const fixed = 26 + 100 + 40 + 56 + 56;
  const nameW = width - fixed - dayW * la.days.length;
  const today = todayLocal();
  const cols = 6 + la.days.length;

  return (
    <table className="rep" style={{ width }}>
      <colgroup>
        <col style={{ width: 26 }} />
        <col style={{ width: nameW }} />
        <col style={{ width: 100 }} />
        <col style={{ width: 40 }} />
        <col style={{ width: 56 }} />
        <col style={{ width: 56 }} />
        {la.days.map((d) => <col key={d} style={{ width: dayW }} />)}
      </colgroup>
      <thead>
        <tr><td colSpan={cols} style={{ border: 0, padding: 0, height: 'auto', whiteSpace: 'normal' }}>{head}</td></tr>
        <tr>
          <th className="col c" rowSpan={2}>#</th>
          <th className="col" rowSpan={2}>Activity</th>
          <th className="col" rowSpan={2}>Responsible</th>
          <th className="col r" rowSpan={2}>Dur</th>
          <th className="col" rowSpan={2}>Start</th>
          <th className="col" rowSpan={2}>Finish</th>
          {la.weeks.map((w) => <th key={w.start} className="col week" colSpan={w.days.length}>Week of {fmtNumericLong(w.start)}</th>)}
        </tr>
        <tr>
          {la.days.map((d) => {
            const wd = weekday(d);
            return <th key={d} className={`col day ${wd === 0 || wd === 6 ? 'weekend' : ''}`}>{WEEKDAYS_SHORT[wd][0]}<small>{Number(d.slice(8))}</small></th>;
          })}
        </tr>
      </thead>
      <tbody>
        {la.groups.length === 0 && (
          <tr><td colSpan={cols} style={{ textAlign: 'center', color: 'var(--p-fg-3)', height: 40 }}>No activities in this window.</td></tr>
        )}
        {la.groups.map((g) => (
          <GroupRows key={g.phase} group={g} cols={cols} today={today} />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({ group, cols, today }: { group: ReturnType<typeof buildLookAhead>['groups'][number]; cols: number; today: string }) {
  return (
    <>
      <tr className="group"><td colSpan={cols}>{group.phase}</td></tr>
      {group.rows.map((r) => (
        <tr key={r.task.uid} className={r.task.milestone ? 'milestone' : ''}>
          <td className="id">{r.s.id}</td>
          <td className="nm">{r.task.milestone && <i className="dia" />}{r.task.name}{r.task.percentComplete > 0 ? ` (${r.task.percentComplete}%)` : ''}</td>
          <td>{r.task.resourceNames}</td>
          <td className="r">{r.task.milestone ? '—' : formatDuration(r.task.durationDays, { compact: true })}</td>
          <td>{fmtNumeric(r.s.start)}</td>
          <td>{fmtNumeric(r.s.finish)}</td>
          {r.cells.map((c) => {
            const wd = weekday(c.day);
            return (
              <td key={c.day} className={`day ${wd === 0 || wd === 6 ? 'weekend' : ''}`} style={c.day === today ? { boxShadow: 'inset 0 0 0 1px var(--p-accent)' } : undefined}>
                {c.milestone ? <i className="ms" /> : c.active ? <i className={`${r.s.critical ? 'crit' : ''} ${r.task.percentComplete >= 100 ? 'done' : ''} ${c.start ? 'start' : ''} ${c.end ? 'end' : ''}`} /> : null}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
