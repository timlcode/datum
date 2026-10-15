import { addDays, addMonths, dayOf, diffDays, MONTHS_LONG, MONTHS_SHORT, startOfMonth, startOfWeek, timeOf, weekday, type DayStr } from '@engine/dates';
import type { Zoom } from '../state/store';

export interface TimeScale {
  zoom: Zoom;
  pxPerDay: number;
  start: DayStr;
  end: DayStr;
  totalDays: number;
  width: number;
  top: { x: number; w: number; label: string }[];
  bottom: { x: number; w: number; label: string; sub?: string; weekend?: boolean; day: DayStr }[];
}

export const PX_PER_DAY: Record<Zoom, number> = { day: 34, week: 11, month: 3.4, quarter: 1.35 };

export function buildTimeScale(zoom: Zoom, minDay: DayStr, maxDay: DayStr, viewportPx = 1200): TimeScale {
  const pxPerDay = PX_PER_DAY[zoom];
  const pad = zoom === 'day' ? 5 : zoom === 'week' ? 14 : zoom === 'month' ? 45 : 90;
  let start = addDays(minDay, -pad);
  let end = addDays(maxDay, pad);
  start = zoom === 'day' || zoom === 'week' ? startOfWeek(start, 1) : startOfMonth(start);
  // Fill at least the viewport.
  const minDays = Math.ceil(viewportPx / pxPerDay);
  if (diffDays(start, end) < minDays) end = addDays(start, minDays);
  const totalDays = diffDays(start, end) + 1;
  const width = totalDays * pxPerDay;
  const top: TimeScale['top'] = [];
  const bottom: TimeScale['bottom'] = [];

  const x = (d: DayStr) => diffDays(start, d) * pxPerDay;

  if (zoom === 'day' || zoom === 'week') {
    // Top: months.
    let m = startOfMonth(start);
    while (m <= end) {
      const next = addMonths(m, 1);
      const x0 = Math.max(0, x(m));
      const x1 = Math.min(width, x(next));
      const [y, mo] = m.split('-').map(Number);
      top.push({ x: x0, w: x1 - x0, label: x1 - x0 > 90 ? `${MONTHS_LONG[mo - 1]} ${y}` : `${MONTHS_SHORT[mo - 1]} ${String(y).slice(2)}` });
      m = next;
    }
    if (zoom === 'day') {
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(start, i);
        const wd = weekday(d);
        bottom.push({ x: i * pxPerDay, w: pxPerDay, label: String(Number(d.slice(8, 10))), sub: 'SMTWTFS'[wd], weekend: wd === 0 || wd === 6, day: d });
      }
    } else {
      let w = start;
      while (w <= end) {
        const [, mo, dd] = w.split('-').map(Number);
        bottom.push({ x: x(w), w: pxPerDay * 7, label: `${mo}/${dd}`, day: w });
        w = addDays(w, 7);
      }
    }
  } else {
    // Top: years.
    let y = Number(start.slice(0, 4));
    const endYear = Number(end.slice(0, 4));
    while (y <= endYear) {
      const y0 = `${y}-01-01`;
      const y1 = `${y + 1}-01-01`;
      const x0 = Math.max(0, x(y0));
      const x1 = Math.min(width, x(y1));
      top.push({ x: x0, w: x1 - x0, label: String(y) });
      y++;
    }
    if (zoom === 'month') {
      let m = startOfMonth(start);
      while (m <= end) {
        const next = addMonths(m, 1);
        const mo = Number(m.slice(5, 7));
        bottom.push({ x: x(m), w: x(next) - x(m), label: MONTHS_SHORT[mo - 1], day: m });
        m = next;
      }
    } else {
      let m = startOfMonth(start);
      m = `${m.slice(0, 5)}${String(Math.floor((Number(m.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
      while (m <= end) {
        const next = addMonths(m, 3);
        const q = Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1;
        bottom.push({ x: x(m), w: x(next) - x(m), label: `Q${q} ${m.slice(2, 4)}`, day: m });
        m = next;
      }
    }
  }
  return { zoom, pxPerDay, start, end, totalDays, width, top, bottom };
}

/** Fraction of the visual day for a working-time clock, 08:00 -> 0, 17:00 -> 1. */
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

export function xOfStart(ts: TimeScale, dt: string): number {
  return (diffDays(ts.start, dayOf(dt)) + dayFraction(dt)) * ts.pxPerDay;
}

export function xOfFinish(ts: TimeScale, dt: string): number {
  return (diffDays(ts.start, dayOf(dt)) + dayFraction(dt)) * ts.pxPerDay;
}

export function dayAtX(ts: TimeScale, x: number): DayStr {
  return addDays(ts.start, Math.floor(x / ts.pxPerDay));
}
