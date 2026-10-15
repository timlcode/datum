import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useStore } from '../state/store';
import { buildLookAhead } from '@engine/lookahead';
import { addDays, fmtMedium, fmtNumeric, todayLocal, weekday, WEEKDAYS_SHORT } from '@engine/dates';
import { formatDuration } from '@engine/predecessors';

export function LookAheadView() {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const openDialog = useStore((s) => s.openDialog);
  const select = useStore((s) => s.select);
  const [weeks, setWeeks] = useState(3);
  const [offset, setOffset] = useState(0);
  const [includeComplete, setIncludeComplete] = useState(false);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const statusDay = project.statusDate ?? todayLocal();
  const la = useMemo(
    () => buildLookAhead(project, schedule, statusDay, { weeks, includeComplete, includeWeekends, from: offset ? addDays(statusDay, offset * 7 - (weekday(statusDay) + 6) % 7) : undefined }),
    [project, schedule, statusDay, weeks, includeComplete, includeWeekends, offset],
  );
  const today = todayLocal();
  const dayW = 30;
  const count = la.groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="lookahead">
      <div className="la-head">
        <h2>{weeks}-Week Look-Ahead</h2>
        <span className="rng">{fmtMedium(la.from)} – {fmtMedium(la.to)}</span>
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} title="Previous week"><ChevronLeft /></button>
        <button className="btn sm" onClick={() => setOffset(0)}>This week</button>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} title="Next week"><ChevronRight /></button>
        <div style={{ flex: 1 }} />
        <div className="toolbar" style={{ border: 0, background: 'none', padding: 0 }}>
          <div className="seg">
            {[2, 3, 4, 6].map((w) => (
              <button key={w} className={weeks === w ? 'active' : ''} onClick={() => setWeeks(w)}>{w} wk</button>
            ))}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={includeWeekends} onChange={(e) => setIncludeWeekends(e.target.checked)} /> Weekends</label>
        <label className="check"><input type="checkbox" checked={includeComplete} onChange={(e) => setIncludeComplete(e.target.checked)} /> Completed</label>
        <button className="btn" onClick={() => openDialog('print')}><Printer /> Print</button>
      </div>
      {count === 0 ? (
        <div className="none">No activities fall in this window. Check the status date in Project Settings, or move the window.</div>
      ) : (
        <table>
          <colgroup>
            <col style={{ width: 44 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 96 }} />
            {la.days.map((d) => <col key={d} style={{ width: dayW }} />)}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>#</th>
              <th rowSpan={2}>Activity</th>
              <th rowSpan={2}>Responsible</th>
              <th rowSpan={2}>Dur</th>
              <th rowSpan={2}>Start</th>
              <th rowSpan={2}>Finish</th>
              {la.weeks.map((w) => (
                <th key={w.start} className="week" colSpan={w.days.length}>Week of {fmtNumeric(w.start)}</th>
              ))}
            </tr>
            <tr>
              {la.days.map((d) => {
                const wd = weekday(d);
                return (
                  <th key={d} className={`day ${wd === 0 || wd === 6 ? 'weekend' : ''} ${d === today ? 'today' : ''}`}>
                    {WEEKDAYS_SHORT[wd][0]}<small>{Number(d.slice(8))}</small>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {la.groups.map((g) => (
              <GroupRows key={g.phase} group={g} today={today} onSelect={(uid) => select([uid], uid)} dayCount={la.days.length} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupRows({ group, today, onSelect, dayCount }: { group: ReturnType<typeof buildLookAhead>['groups'][number]; today: string; onSelect: (uid: number) => void; dayCount: number }) {
  return (
    <>
      <tr className="group">
        <td colSpan={6 + dayCount}>{group.phase}</td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.task.uid} className={r.task.milestone ? 'milestone' : ''} onDoubleClick={() => onSelect(r.task.uid)}>
          <td style={{ color: 'var(--fg-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{r.s.id}</td>
          <td className="nm">{r.task.name}{r.task.percentComplete > 0 && <span className="trade">{r.task.percentComplete}%</span>}</td>
          <td>{r.task.resourceNames}</td>
          <td>{r.task.milestone ? '—' : formatDuration(r.task.durationDays, { compact: true })}</td>
          <td>{fmtNumeric(r.s.start)}</td>
          <td>{fmtNumeric(r.s.finish)}</td>
          {r.cells.map((c) => {
            const wd = weekday(c.day);
            const cls = `day ${wd === 0 || wd === 6 ? 'weekend' : ''} ${c.day === today ? 'today' : ''}`;
            return (
              <td key={c.day} className={cls}>
                {c.milestone ? <i className="ms" /> : c.active ? <i className={`${r.s.critical ? 'crit' : ''} ${r.task.percentComplete >= 100 ? 'done' : ''} ${c.start ? 'start' : ''} ${c.end ? 'end' : ''}`} /> : null}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
