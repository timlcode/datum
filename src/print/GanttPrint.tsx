import { useMemo } from 'react';
import type { Project, ScheduleResult } from '@engine/types';
import type { PrintOptions } from './printOptions';
import { ColHeaders, PRINT_COL_WIDTH, RowCells, printRows, rowClass } from './printCells';
import { WorkCalendar } from '@engine/calendar';
import { addDays, addMonths, dayOf, diffDays, MONTHS_SHORT, startOfMonth, startOfWeek, timeOf, todayLocal, weekday } from '@engine/dates';

const ROW_H = 20;

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  arrow?: boolean;
  critical: boolean;
}

function dayFraction(dt: string): number {
  const { h, m } = timeOf(dt);
  const clock = h + m / 60;
  let hours: number;
  if (clock <= 8) hours = 0;
  else if (clock <= 12) hours = clock - 8;
  else if (clock < 13) hours = 4;
  else hours = Math.min(8, 4 + (clock - 13));
  return hours / 8;
}

interface Props {
  project: Project;
  schedule: ScheduleResult;
  options: PrintOptions;
  width: number;
  head: React.ReactNode;
}

export function GanttPrint({ project, schedule, options, width, head }: Props) {
  const rows = useMemo(() => printRows(project, schedule, options), [project, schedule, options]);
  const columns = options.columns.length ? options.columns : ['id', 'name', 'dur', 'start', 'finish'];
  const gridW = columns.reduce((a, c) => a + PRINT_COL_WIDTH[c as keyof typeof PRINT_COL_WIDTH], 0);
  const chartW = Math.max(200, Math.min(width - gridW, Math.round(width * options.chartShare)));
  const nameW = Math.max(120, width - chartW - (gridW - PRINT_COL_WIDTH.name));
  const cal = useMemo(() => new WorkCalendar(project.calendar, dayOf(project.startDate)), [project]);
  const statusDay = project.statusDate ?? todayLocal();

  // Time range.
  let minDay = dayOf(schedule.projectStart);
  let maxDay = dayOf(schedule.projectFinish);
  for (const r of rows) {
    if (dayOf(r.s.start) < minDay) minDay = dayOf(r.s.start);
    if (dayOf(r.s.finish) > maxDay) maxDay = dayOf(r.s.finish);
  }
  if (options.rangeFrom) minDay = options.rangeFrom;
  if (options.rangeTo) maxDay = options.rangeTo;
  const totalDays = Math.max(14, diffDays(minDay, maxDay) + 1);
  const pxPerDay = chartW / (totalDays + 2);
  const start = addDays(minDay, -1);
  const x = (day: string) => diffDays(start, day) * pxPerDay;
  const xs = (dt: string) => x(dayOf(dt)) + dayFraction(dt) * pxPerDay;

  // Timescale cells.
  const scale = useMemo(() => {
    const top: { x: number; w: number; label: string }[] = [];
    const bottom: { x: number; w: number; label: string; day: string }[] = [];
    const end = addDays(start, totalDays + 1);
    if (pxPerDay >= 5) {
      let m = startOfMonth(start);
      while (m <= end) {
        const next = addMonths(m, 1);
        const x0 = Math.max(0, x(m));
        const x1 = Math.min(chartW, x(next));
        const [y, mo] = m.split('-').map(Number);
        if (x1 > x0) top.push({ x: x0, w: x1 - x0, label: x1 - x0 > 60 ? `${MONTHS_SHORT[mo - 1]} ${y}` : MONTHS_SHORT[mo - 1] });
        m = next;
      }
      let w = startOfWeek(start, 1);
      while (w <= end) {
        const x0 = Math.max(0, x(w));
        const x1 = Math.min(chartW, x(addDays(w, 7)));
        if (x1 > x0) bottom.push({ x: x0, w: x1 - x0, label: x1 - x0 > 26 ? `${Number(w.slice(5, 7))}/${Number(w.slice(8))}` : '', day: w });
        w = addDays(w, 7);
      }
    } else {
      let y = Number(start.slice(0, 4));
      const ey = Number(end.slice(0, 4));
      while (y <= ey) {
        const x0 = Math.max(0, x(`${y}-01-01`));
        const x1 = Math.min(chartW, x(`${y + 1}-01-01`));
        if (x1 > x0) top.push({ x: x0, w: x1 - x0, label: String(y) });
        y++;
      }
      let m = startOfMonth(start);
      while (m <= end) {
        const next = addMonths(m, 1);
        const x0 = Math.max(0, x(m));
        const x1 = Math.min(chartW, x(next));
        const mo = Number(m.slice(5, 7));
        if (x1 > x0) bottom.push({ x: x0, w: x1 - x0, label: x1 - x0 > 16 ? MONTHS_SHORT[mo - 1] : MONTHS_SHORT[mo - 1][0], day: m });
        m = next;
      }
    }
    return { top, bottom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, totalDays, pxPerDay, chartW]);

  // Non-working shading (only when visible enough).
  const shading = useMemo(() => {
    if (pxPerDay < 3) return [];
    const out: { x: number; w: number }[] = [];
    let run = -1;
    for (let i = 0; i <= totalDays + 1; i++) {
      const d = addDays(start, i);
      const nw = i <= totalDays && !cal.isWorking(d);
      if (nw && run < 0) run = i;
      if (!nw && run >= 0) { out.push({ x: run * pxPerDay, w: (i - run) * pxPerDay }); run = -1; }
    }
    return out;
  }, [start, totalDays, pxPerDay, cal]);

  // Bars geometry and link segments split per row.
  const rowIndex = new Map(rows.map((r, i) => [r.task.uid, i]));
  const geom = rows.map((r, i) => {
    const x1 = xs(r.s.start);
    const x2 = Math.max(x1 + 1, xs(r.s.finish));
    return { x1, x2, cy: i * ROW_H + ROW_H / 2 };
  });
  const segsByRow: Seg[][] = rows.map(() => []);
  if (options.showLinks) {
    const pushSeg = (seg: Seg) => {
      // Split vertical segments across rows; horizontal ones land in one row.
      if (seg.x1 === seg.x2) {
        const [ya, yb] = seg.y1 < seg.y2 ? [seg.y1, seg.y2] : [seg.y2, seg.y1];
        const r0 = Math.max(0, Math.floor(ya / ROW_H));
        const r1 = Math.min(rows.length - 1, Math.floor((yb - 0.01) / ROW_H));
        for (let r = r0; r <= r1; r++) {
          const top = Math.max(ya, r * ROW_H);
          const bot = Math.min(yb, (r + 1) * ROW_H);
          segsByRow[r].push({ x1: seg.x1, y1: top - r * ROW_H, x2: seg.x2, y2: bot - r * ROW_H, critical: seg.critical });
        }
      } else {
        const r = Math.min(rows.length - 1, Math.max(0, Math.floor(seg.y1 / ROW_H)));
        segsByRow[r].push({ ...seg, y1: seg.y1 - r * ROW_H, y2: seg.y2 - r * ROW_H });
      }
    };
    rows.forEach((r, i) => {
      for (const l of r.task.predecessors) {
        const pi = rowIndex.get(l.predUid);
        if (pi === undefined) continue;
        const pg = geom[pi];
        const g = geom[i];
        const fromX = l.type[0] === 'S' ? pg.x1 : pg.x2;
        const toX = l.type[1] === 'S' ? g.x1 : g.x2;
        const critical = rows[pi].s.critical && r.s.critical && !rows[pi].s.hasChildren && !r.s.hasChildren;
        const stub = 5;
        const pts: [number, number][] = [];
        if (l.type[1] === 'S') {
          if (toX >= fromX + stub * 2 || l.type[0] === 'S') {
            const midX = l.type[0] === 'S' ? Math.min(fromX, toX) - stub : fromX + stub;
            pts.push([fromX, pg.cy], [midX, pg.cy], [midX, g.cy], [toX, g.cy]);
          } else {
            const yMid = pg.cy + (g.cy > pg.cy ? ROW_H / 2 : -ROW_H / 2);
            pts.push([fromX, pg.cy], [fromX + stub, pg.cy], [fromX + stub, yMid], [toX - stub, yMid], [toX - stub, g.cy], [toX, g.cy]);
          }
        } else {
          const midX = Math.max(fromX, toX) + stub;
          pts.push([fromX, pg.cy], [midX, pg.cy], [midX, g.cy], [toX, g.cy]);
        }
        for (let k = 1; k < pts.length; k++) {
          pushSeg({ x1: pts[k - 1][0], y1: pts[k - 1][1], x2: pts[k][0], y2: pts[k][1], arrow: k === pts.length - 1, critical });
        }
      }
    });
  }

  const todayX = x(statusDay);

  return (
    <table className="rep" style={{ width }}>
      <colgroup>
        {columns.map((c) => <col key={c} style={{ width: c === 'name' ? nameW : PRINT_COL_WIDTH[c as keyof typeof PRINT_COL_WIDTH] }} />)}
        <col style={{ width: chartW }} />
      </colgroup>
      <thead>
        <tr>
          <td colSpan={columns.length + 1} style={{ border: 0, padding: 0, height: 'auto', whiteSpace: 'normal' }}>{head}</td>
        </tr>
        <tr>
          <ColHeaders columns={columns as never} />
          <th className="chart">
            <div className="ts" style={{ width: chartW }}>
              {scale.top.map((c, i) => <div key={i} className="cell top" style={{ left: c.x, width: c.w }}>{c.label}</div>)}
              {scale.bottom.map((c, i) => <div key={i} className="cell bottom" style={{ left: c.x, width: c.w }}>{c.label}</div>)}
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const g = geom[i];
          const isMs = r.task.milestone && !r.s.hasChildren;
          const done = r.task.percentComplete >= 100;
          const label = options.showLabels && !r.s.hasChildren ? r.task.resourceNames : '';
          return (
            <tr key={r.task.uid} className={rowClass(r)}>
              <RowCells r={r} columns={columns as never} project={project} />
              <td className="chart">
                <div className="cv" style={{ width: chartW }}>
                  {shading.map((s, k) => <div key={k} className="nw" style={{ left: s.x, width: s.w }} />)}
                  {scale.bottom.map((c, k) => <div key={k} className="grid-v" style={{ left: c.x }} />)}
                  <div className="today" style={{ left: todayX }} />
                  {options.showBaseline && r.task.baselineStart && r.task.baselineFinish && (
                    <div className="bl" style={{ left: xs(r.task.baselineStart), width: Math.max(1, xs(r.task.baselineFinish) - xs(r.task.baselineStart)) }} />
                  )}
                  {r.s.hasChildren ? (
                    <div className="sum" style={{ left: g.x1, width: Math.max(6, g.x2 - g.x1) }} />
                  ) : isMs ? (
                    <div className={`ms ${done ? 'done' : ''}`} style={{ left: g.x1 }} />
                  ) : (
                    <div className={`bar ${done ? 'done' : r.s.critical ? 'crit' : ''}`} style={{ left: g.x1, width: Math.max(2, g.x2 - g.x1), background: r.task.color || undefined }}>
                      {r.task.percentComplete > 0 && r.task.percentComplete < 100 && <div className="pct" style={{ width: `${r.task.percentComplete}%` }} />}
                    </div>
                  )}
                  {(label || isMs) && <div className="lbl" style={{ left: g.x2 + (isMs ? 8 : 4) }}>{isMs ? r.task.name : label}</div>}
                  {segsByRow[i].length > 0 && (
                    <svg className="links">
                      {segsByRow[i].map((s, k) => (
                        <g key={k}>
                          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.critical ? '#d63a4d' : '#6b7280'} strokeWidth={s.critical ? 1 : 0.8} />
                          {s.arrow && (
                            <path d={s.x2 >= s.x1 ? `M${s.x2},${s.y2} l-4,-2.5 v5 z` : `M${s.x2},${s.y2} l4,-2.5 v5 z`} fill={s.critical ? '#d63a4d' : '#6b7280'} />
                          )}
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export { weekday };
