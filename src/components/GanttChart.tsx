import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { Row } from '../hooks/useVisibleRows';
import { buildTimeScale, dayAtX, xOfFinish, xOfStart, type TimeScale } from './timescale';
import { WorkCalendar } from '@engine/calendar';
import { addDays, dayOf, diffDays, fmtShort, makeDateTime, todayLocal, weekday } from '@engine/dates';
import { formatDuration } from '@engine/predecessors';
import { shortcutEvents } from '../hooks/useShortcuts';

const ROW_H = 30;
const BAR_H = 16;
const SUM_H = 8;
const HEADER_H = 50;

interface Drag {
  kind: 'move' | 'resize' | 'link';
  uid: number;
  startX: number;
  curX: number;
  curY: number;
  origX1: number;
  origX2: number;
  targetUid?: number | null;
}

interface Props {
  rows: Row[];
  onScroll?: (top: number) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function GanttChart({ rows, onScroll, scrollRef }: Props) {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const zoom = useStore((s) => s.zoom);
  const selection = useStore((s) => s.selection);
  const showLinks = useStore((s) => s.showLinks);
  const showLabels = useStore((s) => s.showLabels);
  const showBaseline = useStore((s) => s.showBaseline);
  const st = useStore.getState;
  const localRef = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? localRef;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ uid: number; x: number; y: number } | null>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [viewportW, setViewportW] = useState(1200);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);

  const cal = useMemo(() => new WorkCalendar(project.calendar, dayOf(project.startDate)), [project.calendar, project.startDate]);
  const statusDay = project.statusDate ?? todayLocal();

  const ts: TimeScale = useMemo(() => {
    let min = dayOf(schedule.projectStart);
    let max = dayOf(schedule.projectFinish);
    for (const r of schedule.rows) {
      const a = dayOf(r.start);
      const b = dayOf(r.finish);
      if (a < min) min = a;
      if (b > max) max = b;
    }
    for (const t of project.tasks) {
      if (t.baselineStart && dayOf(t.baselineStart) < min) min = dayOf(t.baselineStart);
      if (t.baselineFinish && dayOf(t.baselineFinish) > max) max = dayOf(t.baselineFinish);
    }
    if (statusDay < min) min = statusDay;
    if (statusDay > max) max = statusDay;
    return buildTimeScale(zoom, min, max, viewportW);
  }, [zoom, schedule, project.tasks, statusDay, viewportW]);

  const bodyH = Math.max(rows.length * ROW_H, 200);
  const rowIndexByUid = useMemo(() => new Map(rows.map((r, i) => [r.task.uid, i])), [rows]);

  // Scroll to today on request and on first mount.
  const scrollToDay = useCallback((day: string) => {
    const el = ref.current;
    if (!el) return;
    const x = diffDays(ts.start, day) * ts.pxPerDay;
    el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3);
  }, [ref, ts]);
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const ps = dayOf(schedule.projectStart);
    const pf = dayOf(schedule.projectFinish);
    scrollToDay(statusDay >= ps && statusDay <= pf ? statusDay : ps);
  }, [scrollToDay, schedule.projectStart, schedule.projectFinish, statusDay]);
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'today') scrollToDay(statusDay);
    };
    shortcutEvents.addEventListener('command', h);
    return () => shortcutEvents.removeEventListener('command', h);
  }, [scrollToDay, statusDay]);

  // Keep the selected task visible horizontally when selection changes from the grid.
  const activeUid = useStore((s) => s.activeUid);
  useEffect(() => {
    if (activeUid === null) return;
    const s = schedule.byUid.get(activeUid);
    const el = ref.current;
    if (!s || !el) return;
    const x1 = xOfStart(ts, s.start);
    const x2 = xOfFinish(ts, s.finish);
    if (x2 < el.scrollLeft || x1 > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = Math.max(0, x1 - 120);
    }
  }, [activeUid, schedule, ts, ref]);

  // Geometry per visible row.
  const bars = useMemo(() => {
    return rows.map((r, i) => {
      const { task: t, s } = r;
      const x1 = xOfStart(ts, s.start);
      const x2 = Math.max(x1 + (t.milestone && !s.hasChildren ? 0 : 2), xOfFinish(ts, s.finish));
      const y = i * ROW_H;
      return { r, i, x1, x2, y, cy: y + ROW_H / 2 };
    });
  }, [rows, ts]);
  const barByUid = useMemo(() => new Map(bars.map((b) => [b.r.task.uid, b])), [bars]);

  // Drag handling.
  const svgRef = useRef<SVGSVGElement>(null);
  const svgPoint = (e: MouseEvent | React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const p = svgPoint(e);
      let targetUid: number | null = null;
      if (drag.kind === 'link') {
        const idx = Math.floor(p.y / ROW_H);
        const row = rows[idx];
        if (row && row.task.uid !== drag.uid) targetUid = row.task.uid;
      }
      setDrag({ ...drag, curX: p.x, curY: p.y, targetUid });
    };
    const onUp = (e: MouseEvent) => {
      const p = svgPoint(e);
      const dx = p.x - drag.startX;
      const days = Math.round(dx / ts.pxPerDay);
      const task = project.tasks.find((t) => t.uid === drag.uid);
      const s = schedule.byUid.get(drag.uid);
      if (task && s) {
        if (drag.kind === 'move' && Math.abs(days) >= 1) {
          // Snap to the next working day at or after the target.
          let day = addDays(dayOf(s.start), days);
          let guard = 0;
          while (!cal.isWorking(day) && guard++ < 10) day = addDays(day, days > 0 ? 1 : -1);
          st().patchTask(task.uid, { constraintType: 'SNET', constraintDate: makeDateTime(day, 8) });
        } else if (drag.kind === 'resize' && Math.abs(days) >= 1) {
          const endDay = addDays(dayOf(s.finish), days);
          const newDur = Math.max(0, cal.workingDaysBetween(dayOf(s.start), endDay));
          if (newDur !== task.durationDays) st().patchTask(task.uid, { durationDays: newDur, milestone: newDur === 0 });
        } else if (drag.kind === 'link' && drag.targetUid != null) {
          const err = st().addLink(drag.uid, drag.targetUid, 'FS', 0);
          if (err) st().toast(err, 'error');
        }
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, rows, ts, project.tasks, schedule, cal, st]);

  const beginDrag = (e: React.MouseEvent, kind: Drag['kind'], uid: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const b = barByUid.get(uid)!;
    const p = svgPoint(e);
    if (!selection.includes(uid)) st().select([uid], uid);
    setDrag({ kind, uid, startX: p.x, curX: p.x, curY: p.y, origX1: b.x1, origX2: b.x2, targetUid: null });
  };

  // Links.
  const linkPaths = useMemo(() => {
    if (!showLinks) return [];
    const out: { d: string; key: string; critical: boolean }[] = [];
    for (const b of bars) {
      for (const l of b.r.task.predecessors) {
        const pb = barByUid.get(l.predUid);
        if (!pb) continue;
        const fromX = l.type[0] === 'S' ? pb.x1 : pb.x2;
        const toX = l.type[1] === 'S' ? b.x1 : b.x2;
        const critical = pb.r.s.critical && b.r.s.critical && !pb.r.s.hasChildren && !b.r.s.hasChildren;
        const y1 = pb.cy;
        const y2 = b.cy;
        const down = y2 > y1;
        const stub = 8;
        let d: string;
        if (l.type[1] === 'S') {
          if (toX >= fromX + stub * 2 || l.type[0] === 'S') {
            const midX = l.type[0] === 'S' ? Math.min(fromX, toX) - stub : fromX + stub;
            d = `M${fromX},${y1} H${midX} V${y2} H${toX}`;
          } else {
            const yMid = y1 + (down ? ROW_H / 2 : -ROW_H / 2);
            d = `M${fromX},${y1} H${fromX + stub} V${yMid} H${toX - stub} V${y2} H${toX}`;
          }
        } else {
          const midX = Math.max(fromX, toX) + stub;
          d = `M${fromX},${y1} H${midX} V${y2} H${toX}`;
        }
        out.push({ d, key: `${l.predUid}-${b.r.task.uid}`, critical });
      }
    }
    return out;
  }, [bars, barByUid, showLinks]);

  // Non-working day shading.
  const shading = useMemo(() => {
    if (ts.zoom === 'month' || ts.zoom === 'quarter') return [];
    const rects: { x: number; w: number }[] = [];
    let runStart = -1;
    for (let i = 0; i <= ts.totalDays; i++) {
      const d = addDays(ts.start, i);
      const nonWorking = i < ts.totalDays && !cal.isWorking(d);
      if (nonWorking && runStart < 0) runStart = i;
      if (!nonWorking && runStart >= 0) {
        rects.push({ x: runStart * ts.pxPerDay, w: (i - runStart) * ts.pxPerDay });
        runStart = -1;
      }
    }
    return rects;
  }, [ts, cal]);

  const todayX = diffDays(ts.start, statusDay) * ts.pxPerDay;
  const selSet = new Set(selection);

  const hoverInfo = hover ? barByUid.get(hover.uid) : null;

  return (
    <div
      className="gantt"
      ref={ref}
      onScroll={(e) => onScroll?.((e.target as HTMLDivElement).scrollTop)}
      onMouseLeave={() => { setHover(null); setHoverRow(null); }}
    >
      <div className="timescale" style={{ width: ts.width }}>
        <div className="ts-row top">
          {ts.top.map((c, i) => (
            <div key={i} className="ts-cell" style={{ left: c.x, width: c.w }}>{c.label}</div>
          ))}
        </div>
        <div className="ts-row bottom">
          {ts.bottom.map((c, i) => (
            <div key={i} className={`ts-cell ${c.weekend ? 'weekend' : ''} ${c.day === statusDay ? 'today' : ''}`} style={{ left: c.x, width: c.w }}>
              {ts.zoom === 'day' ? (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.05 }}>
                  <span style={{ fontSize: 9, opacity: 0.7 }}>{c.sub}</span>
                  <span>{c.label}</span>
                </span>
              ) : c.label}
            </div>
          ))}
        </div>
      </div>
      <div className="canvas" style={{ width: ts.width, height: bodyH }}>
        <svg
          ref={svgRef}
          width={ts.width}
          height={bodyH}
          onMouseMove={(e) => {
            const p = svgPoint(e);
            setHoverRow(Math.floor(p.y / ROW_H));
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              const p = svgPoint(e);
              const row = rows[Math.floor(p.y / ROW_H)];
              if (row) st().select([row.task.uid], row.task.uid);
              else st().select([], null);
            }
          }}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-2)" />
            </marker>
            <marker id="arrow-crit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--red)" />
            </marker>
            <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
            </pattern>
          </defs>
          {/* Non-working shading */}
          {shading.map((r, i) => (
            <rect key={i} x={r.x} y={0} width={r.w} height={bodyH} fill="rgba(255,255,255,0.025)" />
          ))}
          {/* Row lines and selection */}
          {bars.map((b) => (
            <g key={b.r.task.uid}>
              {selSet.has(b.r.task.uid) && <rect x={0} y={b.y} width={ts.width} height={ROW_H} fill="rgba(245,165,36,0.07)" />}
              {hoverRow === b.i && !selSet.has(b.r.task.uid) && <rect x={0} y={b.y} width={ts.width} height={ROW_H} fill="rgba(255,255,255,0.02)" />}
              <line x1={0} x2={ts.width} y1={b.y + ROW_H - 0.5} y2={b.y + ROW_H - 0.5} stroke="var(--line)" strokeWidth={1} />
            </g>
          ))}
          {/* Vertical grid */}
          {ts.bottom.map((c, i) => (
            <line key={i} x1={c.x + 0.5} x2={c.x + 0.5} y1={0} y2={bodyH} stroke="var(--line)" strokeWidth={1} opacity={ts.zoom === 'day' ? 0.5 : 1} />
          ))}
          {/* Status date */}
          <line x1={todayX + 0.5} x2={todayX + 0.5} y1={0} y2={bodyH} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.8} />

          {/* Links */}
          {linkPaths.map((l) => (
            <path key={l.key} d={l.d} fill="none" stroke={l.critical ? 'var(--red)' : 'var(--fg-3)'} strokeWidth={l.critical ? 1.4 : 1.1} markerEnd={l.critical ? 'url(#arrow-crit)' : 'url(#arrow)'} opacity={l.critical ? 0.9 : 0.75} />
          ))}

          {/* Bars */}
          {bars.map((b) => {
            const { task: t, s } = b.r;
            const uid = t.uid;
            const dragging = drag && drag.uid === uid && drag.kind !== 'link';
            let x1 = b.x1;
            let x2 = b.x2;
            if (dragging) {
              const dx = Math.round((drag.curX - drag.startX) / ts.pxPerDay) * ts.pxPerDay;
              if (drag.kind === 'move') { x1 += dx; x2 += dx; }
              else x2 = Math.max(x1 + ts.pxPerDay, x2 + dx);
            }
            const w = Math.max(2, x2 - x1);
            const isMs = t.milestone && !s.hasChildren;
            const done = t.percentComplete >= 100;
            const color = t.color || (s.hasChildren ? 'var(--gantt-summary)' : done ? 'var(--gantt-done)' : s.critical ? 'var(--gantt-critical)' : 'var(--gantt-task)');
            const label = showLabels ? (s.hasChildren ? '' : t.resourceNames || '') : '';
            const baseline = showBaseline && t.baselineStart && t.baselineFinish ? { x1: xOfStart(ts, t.baselineStart), x2: xOfFinish(ts, t.baselineFinish) } : null;
            const isHover = hoverRow === b.i;
            return (
              <g key={uid} className={isHover ? 'row-hover' : ''}
                onMouseEnter={(e) => setHover({ uid, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ uid, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                onDoubleClick={() => { st().select([uid], uid); if (!st().detailsOpen) st().toggleFlag('detailsOpen'); }}
              >
                {baseline && (
                  <rect x={baseline.x1} y={b.cy + BAR_H / 2 - 1} width={Math.max(2, baseline.x2 - baseline.x1)} height={4} rx={1} fill="var(--fg-3)" opacity={0.8} />
                )}
                {s.hasChildren ? (
                  <g className="bar" onMouseDown={(e) => { e.stopPropagation(); st().select([uid], uid); }}>
                    <rect x={x1} y={b.cy - SUM_H / 2 - 2} width={w} height={SUM_H} fill={color} rx={1} />
                    <path d={`M${x1},${b.cy - SUM_H / 2 - 2} l0,${SUM_H + 6} l6,-6 z`} fill={color} />
                    <path d={`M${x2},${b.cy - SUM_H / 2 - 2} l0,${SUM_H + 6} l-6,-6 z`} fill={color} />
                    {showLabels && <text className="bar-label" x={x2 + 8} y={b.cy + 4} style={{ fontWeight: 600, fill: 'var(--fg-1)' }}>{t.name}</text>}
                  </g>
                ) : isMs ? (
                  <g className="bar" onMouseDown={(e) => beginDrag(e, 'move', uid)}>
                    <rect x={x1 - 8} y={b.cy - 8} width={16} height={16} transform={`rotate(45 ${x1} ${b.cy})`} rx={2} fill={done ? 'var(--gantt-done)' : t.color || 'var(--gantt-milestone)'} stroke={selSet.has(uid) ? '#fff' : 'none'} strokeWidth={1.5} />
                    {showLabels && <text className="bar-label" x={x1 + 14} y={b.cy + 4}>{t.name}{t.milestone ? ` · ${fmtShort(s.finish).replace(/^\w+ /, '')}` : ''}</text>}
                    <circle className="link-handle" cx={x1 + 12} cy={b.cy} r={4} onMouseDown={(e) => beginDrag(e, 'link', uid)} />
                  </g>
                ) : (
                  <g className="bar" onMouseDown={(e) => beginDrag(e, 'move', uid)}>
                    <rect x={x1} y={b.cy - BAR_H / 2} width={w} height={BAR_H} rx={3} fill={color} stroke={selSet.has(uid) ? '#fff' : 'rgba(0,0,0,0.35)'} strokeWidth={selSet.has(uid) ? 1.5 : 1} />
                    {t.percentComplete > 0 && t.percentComplete < 100 && (
                      <rect x={x1} y={b.cy - BAR_H / 2} width={w * t.percentComplete / 100} height={BAR_H} rx={3} fill="url(#hatch)" />
                    )}
                    {t.percentComplete > 0 && t.percentComplete < 100 && (
                      <rect x={x1 + 2} y={b.cy - 1.5} width={Math.max(0, (w - 4) * t.percentComplete / 100)} height={3} rx={1.5} fill="rgba(0,0,0,0.45)" />
                    )}
                    {label && <text className="bar-label" x={x2 + 20} y={b.cy + 4}>{label}</text>}
                    {w >= 20 && <rect className="handle" x={x2 - 6} y={b.cy - BAR_H / 2} width={8} height={BAR_H} onMouseDown={(e) => beginDrag(e, 'resize', uid)} />}
                    <circle className="link-handle" cx={x2 + 10} cy={b.cy} r={4} onMouseDown={(e) => beginDrag(e, 'link', uid)} />
                  </g>
                )}
              </g>
            );
          })}

          {/* Link drag line */}
          {drag && drag.kind === 'link' && (() => {
            const from = barByUid.get(drag.uid)!;
            const target = drag.targetUid != null ? barByUid.get(drag.targetUid) : null;
            return (
              <g pointerEvents="none">
                <line x1={from.x2} y1={from.cy} x2={target ? target.x1 : drag.curX} y2={target ? target.cy : drag.curY} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 3" />
                {target && <rect x={0} y={target.y} width={ts.width} height={ROW_H} fill="rgba(245,165,36,0.12)" />}
              </g>
            );
          })()}
        </svg>
      </div>

      {hover && hoverInfo && !drag && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{hoverInfo.r.task.name || 'Untitled task'}</b>
          <div className="row"><span>Start</span><span>{fmtShort(hoverInfo.r.s.start)}</span></div>
          <div className="row"><span>Finish</span><span>{fmtShort(hoverInfo.r.s.finish)}</span></div>
          <div className="row"><span>Duration</span><span>{formatDuration(hoverInfo.r.s.durationDays)}</span></div>
          {!hoverInfo.r.s.hasChildren && <div className="row"><span>Total slack</span><span style={{ color: hoverInfo.r.s.critical ? 'var(--red)' : undefined }}>{hoverInfo.r.s.critical ? 'Critical' : `${hoverInfo.r.s.totalSlackDays}d`}</span></div>}
          {hoverInfo.r.task.resourceNames && <div className="row"><span>Responsible</span><span>{hoverInfo.r.task.resourceNames}</span></div>}
          {hoverInfo.r.task.percentComplete > 0 && <div className="row"><span>Complete</span><span>{hoverInfo.r.task.percentComplete}%</span></div>}
        </div>
      )}
      {drag && drag.kind !== 'link' && (() => {
        const days = Math.round((drag.curX - drag.startX) / ts.pxPerDay);
        const s = schedule.byUid.get(drag.uid)!;
        const txt = drag.kind === 'move'
          ? `Start ${fmtShort(addDays(dayOf(s.start), days))}${days ? ` (${days > 0 ? '+' : ''}${days}d)` : ''}`
          : `Finish ${fmtShort(addDays(dayOf(s.finish), days))}`;
        return <div className="tooltip" style={{ left: drag.curX + (ref.current?.getBoundingClientRect().left ?? 0) - (ref.current?.scrollLeft ?? 0) + 12, top: (ref.current?.getBoundingClientRect().top ?? 0) + HEADER_H + drag.curY - (ref.current?.scrollTop ?? 0) - 40 }}>{txt}</div>;
      })()}
    </div>
  );
}

export { ROW_H as GANTT_ROW_H, HEADER_H as GANTT_HEADER_H, weekday };
