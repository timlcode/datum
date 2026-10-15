import type { Calendar } from './types';
import { addDays, dayOf, makeDateTime, timeOf, weekday, type DayStr, type DateTimeStr } from './dates';

export const DAY_START_HOUR = 8;
export const LUNCH_START_HOUR = 12;
export const LUNCH_END_HOUR = 13;
export const DAY_END_HOUR = 17;

export function defaultCalendar(): Calendar {
  return {
    name: 'Standard',
    workWeek: [false, true, true, true, true, true, false],
    hoursPerDay: 8,
    exceptions: [],
  };
}

/**
 * Maps working-day positions to dates and back. Position 0 is the first working
 * day on or after the anchor. Positions are fractional working days.
 */
export class WorkCalendar {
  private exceptions: Map<string, boolean>;
  private forward: DayStr[] = [];
  private backward: DayStr[] = [];
  private indexCache = new Map<string, number>();
  readonly anchor: DayStr;

  constructor(readonly cal: Calendar, anchorDay: DayStr) {
    this.exceptions = new Map(cal.exceptions.map((e) => [e.date, e.working]));
    let a = anchorDay;
    let guard = 0;
    while (!this.isWorking(a) && guard++ < 400) a = addDays(a, 1);
    this.anchor = a;
    this.forward.push(this.anchor);
  }

  isWorking(day: DayStr): boolean {
    const ex = this.exceptions.get(day);
    if (ex !== undefined) return ex;
    return this.cal.workWeek[weekday(day)];
  }

  private hasAnyWorkingDay(): boolean {
    return this.cal.workWeek.some(Boolean) || [...this.exceptions.values()].some(Boolean);
  }

  /** Working day at integer index (negative goes before the anchor). */
  dayAtIndex(i: number): DayStr {
    i = Math.floor(i);
    if (!this.hasAnyWorkingDay()) return addDays(this.anchor, i);
    if (i >= 0) {
      while (this.forward.length <= i) {
        let d = addDays(this.forward[this.forward.length - 1], 1);
        let guard = 0;
        while (!this.isWorking(d) && guard++ < 400) d = addDays(d, 1);
        this.forward.push(d);
      }
      return this.forward[i];
    }
    const k = -i - 1;
    while (this.backward.length <= k) {
      let d = addDays(this.backward.length ? this.backward[this.backward.length - 1] : this.anchor, -1);
      let guard = 0;
      while (!this.isWorking(d) && guard++ < 400) d = addDays(d, -1);
      this.backward.push(d);
    }
    return this.backward[k];
  }

  /**
   * Index of a day. Non-working days snap to the next ('next') or previous
   * ('prev') working day.
   */
  indexOfDay(day: DayStr, snap: 'next' | 'prev' = 'next'): number {
    const key = day + snap;
    const cached = this.indexCache.get(key);
    if (cached !== undefined) return cached;
    let result: number;
    if (!this.hasAnyWorkingDay()) {
      result = Math.round((Date.parse(day) - Date.parse(this.anchor)) / 86400000);
    } else if (day >= this.anchor) {
      while (this.forward[this.forward.length - 1] < day) this.dayAtIndex(this.forward.length);
      // First working day >= day.
      let lo = 0;
      let hi = this.forward.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.forward[mid] < day) lo = mid + 1;
        else hi = mid;
      }
      if (this.forward[lo] === day) result = lo;
      else result = snap === 'next' ? lo : lo - 1;
    } else {
      while (!this.backward.length || this.backward[this.backward.length - 1] > day) {
        this.dayAtIndex(-(this.backward.length + 1));
      }
      // backward[k] is the working day at index -(k+1), descending order. Find first k with backward[k] <= day.
      let lo = 0;
      let hi = this.backward.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.backward[mid] > day) lo = mid + 1;
        else hi = mid;
      }
      const idx = -(lo + 1);
      if (this.backward[lo] === day) result = idx;
      else result = snap === 'next' ? idx + 1 : idx;
    }
    this.indexCache.set(key, result);
    return result;
  }

  /** Convert a start date-time to a position. */
  positionOfStart(dt: DateTimeStr): number {
    const day = dayOf(dt);
    if (!this.isWorking(day)) return this.indexOfDay(day, 'next');
    const idx = this.indexOfDay(day);
    const { h, m } = timeOf(dt);
    return idx + this.hoursIntoDay(h + m / 60) / this.cal.hoursPerDay;
  }

  /** Convert a finish date-time to a position (end of day = next integer). */
  positionOfFinish(dt: DateTimeStr): number {
    const day = dayOf(dt);
    if (!this.isWorking(day)) return this.indexOfDay(day, 'prev') + 1;
    const idx = this.indexOfDay(day);
    const { h, m } = timeOf(dt);
    const hours = this.hoursIntoDay(h + m / 60);
    if (hours <= 0) return idx;
    return idx + hours / this.cal.hoursPerDay;
  }

  private hoursIntoDay(clock: number): number {
    if (clock <= DAY_START_HOUR) return 0;
    if (clock <= LUNCH_START_HOUR) return clock - DAY_START_HOUR;
    if (clock < LUNCH_END_HOUR) return LUNCH_START_HOUR - DAY_START_HOUR;
    return Math.min(this.cal.hoursPerDay, LUNCH_START_HOUR - DAY_START_HOUR + (clock - LUNCH_END_HOUR));
  }

  private clockFromHours(hours: number, asFinish: boolean): { h: number; m: number } {
    const morning = LUNCH_START_HOUR - DAY_START_HOUR;
    let clock: number;
    if (hours < morning || (hours === morning && asFinish)) clock = DAY_START_HOUR + hours;
    else clock = LUNCH_END_HOUR + (hours - morning);
    const h = Math.floor(clock);
    const m = Math.round((clock - h) * 60);
    return m === 60 ? { h: h + 1, m: 0 } : { h, m };
  }

  /** Start date-time for a position. */
  startDateTime(p: number): DateTimeStr {
    const i = Math.floor(p + 1e-9);
    const frac = Math.max(0, p - i);
    const day = this.dayAtIndex(i);
    if (frac < 1e-9) return makeDateTime(day, DAY_START_HOUR, 0);
    const { h, m } = this.clockFromHours(frac * this.cal.hoursPerDay, false);
    return makeDateTime(day, h, m);
  }

  /** Finish date-time for a position (integer positions land at end of previous day). */
  finishDateTime(p: number): DateTimeStr {
    const i = Math.floor(p + 1e-9);
    const frac = Math.max(0, p - i);
    if (frac < 1e-9) {
      const day = this.dayAtIndex(i - 1);
      return makeDateTime(day, DAY_END_HOUR, 0);
    }
    const day = this.dayAtIndex(i);
    const { h, m } = this.clockFromHours(frac * this.cal.hoursPerDay, true);
    return makeDateTime(day, h, m);
  }

  /** Number of working days in [fromDay, toDay] inclusive. */
  workingDaysBetween(fromDay: DayStr, toDay: DayStr): number {
    if (toDay < fromDay) return 0;
    return this.indexOfDay(toDay, 'prev') - this.indexOfDay(fromDay, 'next') + 1;
  }
}
