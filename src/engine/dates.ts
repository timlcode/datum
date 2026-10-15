// Timezone-free date helpers. Calendar days are handled as "YYYY-MM-DD" strings
// and date-times as "YYYY-MM-DDTHH:mm". Arithmetic is done in UTC so DST never
// shifts a schedule.

export type DayStr = string; // YYYY-MM-DD
export type DateTimeStr = string; // YYYY-MM-DDTHH:mm

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

export function dayFromUtc(d: Date): DayStr {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function utcFromDay(day: DayStr): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(day: DayStr, n: number): DayStr {
  const d = utcFromDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayFromUtc(d);
}

export function diffDays(a: DayStr, b: DayStr): number {
  return Math.round((utcFromDay(b).getTime() - utcFromDay(a).getTime()) / 86400000);
}

/** 0 = Sunday .. 6 = Saturday */
export function weekday(day: DayStr): number {
  return utcFromDay(day).getUTCDay();
}

export function dayOf(dt: DateTimeStr | DayStr): DayStr {
  return dt.slice(0, 10);
}

export function timeOf(dt: DateTimeStr): { h: number; m: number } {
  if (dt.length < 16) return { h: 8, m: 0 };
  return { h: Number(dt.slice(11, 13)), m: Number(dt.slice(14, 16)) };
}

export function makeDateTime(day: DayStr, h: number, m = 0): DateTimeStr {
  return `${day}T${pad(h)}:${pad(m)}`;
}

export function todayLocal(): DayStr {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function compareDay(a: DayStr, b: DayStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function startOfWeek(day: DayStr, weekStartsOn = 1): DayStr {
  const wd = weekday(day);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(day, -back);
}

export function startOfMonth(day: DayStr): DayStr {
  return day.slice(0, 8) + '01';
}

export function addMonths(day: DayStr, n: number): DayStr {
  const d = utcFromDay(day);
  d.setUTCMonth(d.getUTCMonth() + n);
  return dayFromUtc(d);
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Wed 9/17/26" style. */
export function fmtShort(dt?: DateTimeStr | DayStr): string {
  if (!dt) return '';
  const day = dayOf(dt);
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS_SHORT[weekday(day)]} ${m}/${d}/${String(y).slice(2)}`;
}

/** "9/17/2026" */
export function fmtNumeric(dt?: DateTimeStr | DayStr): string {
  if (!dt) return '';
  const [y, m, d] = dayOf(dt).split('-').map(Number);
  return `${m}/${d}/${y}`;
}

/** "9/17/26" */
export function fmtNumericShort(dt?: DateTimeStr | DayStr): string {
  if (!dt) return '';
  const [y, m, d] = dayOf(dt).split('-').map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

/** "Sep 17, 2026" */
export function fmtMedium(dt?: DateTimeStr | DayStr): string {
  if (!dt) return '';
  const [y, m, d] = dayOf(dt).split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** "September 17, 2026" */
export function fmtLong(dt?: DateTimeStr | DayStr): string {
  if (!dt) return '';
  const [y, m, d] = dayOf(dt).split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

/** Parse loose user input ("9/17", "9/17/26", "2026-09-17", "Sep 17") into YYYY-MM-DD. */
export function parseUserDate(input: string, refYear?: number): DayStr | null {
  const s = input.trim();
  if (!s) return null;
  const year = refYear ?? new Date().getFullYear();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    return build(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/))) {
    let y = m[3] ? Number(m[3]) : year;
    if (y < 100) y += 2000;
    return build(y, Number(m[1]), Number(m[2]));
  }
  if ((m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/))) {
    const mi = MONTHS_LONG.findIndex((n) => n.toLowerCase().startsWith(m![1].toLowerCase().slice(0, 3)));
    if (mi < 0) return null;
    let y = m[3] ? Number(m[3]) : year;
    if (y < 100) y += 2000;
    return build(y, mi + 1, Number(m[2]));
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return build(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;

  function build(y: number, mo: number, d: number): DayStr | null {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return null;
    return dayFromUtc(dt);
  }
}
