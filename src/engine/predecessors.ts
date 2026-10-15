import type { Link, LinkType, Task } from './types';

const LINK_TYPES: LinkType[] = ['FS', 'SS', 'FF', 'SF'];

/** Format links as Microsoft Project style text using row ids: "3FS+2d,5SS". */
export function formatPredecessors(links: Link[], idByUid: Map<number, number>): string {
  return links
    .map((l) => {
      const id = idByUid.get(l.predUid);
      if (id === undefined) return null;
      let s = String(id);
      const lag = l.lagDays || 0;
      if (l.type !== 'FS' || lag !== 0) s += l.type;
      if (lag !== 0) s += (lag > 0 ? '+' : '-') + fmtLag(Math.abs(lag));
      return s;
    })
    .filter(Boolean)
    .join(', ');
}

function fmtLag(days: number): string {
  if (Number.isInteger(days)) return `${days}d`;
  if (Number.isInteger(days * 5) && days >= 5) return `${days / 5}w`;
  return `${Math.round(days * 100) / 100}d`;
}

export interface ParseResult {
  links: Link[];
  error?: string;
}

/** Parse "3FS+2d, 5SS, 7, 9FF-1w" into links. Ids are row ids. */
export function parsePredecessors(text: string, uidById: Map<number, number>, selfUid?: number): ParseResult {
  const links: Link[] = [];
  const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?|ed|h|hrs?|hours?)?)?$/i);
    if (!m) return { links, error: `Can't read "${part}". Use forms like 3, 3FS+2d, 5SS-1w.` };
    const id = Number(m[1]);
    const uid = uidById.get(id);
    if (uid === undefined) return { links, error: `There is no task with ID ${id}.` };
    if (selfUid !== undefined && uid === selfUid) return { links, error: `A task can't be its own predecessor.` };
    const type = ((m[2] ?? 'FS').toUpperCase()) as LinkType;
    if (!LINK_TYPES.includes(type)) return { links, error: `Unknown link type "${m[2]}".` };
    let lag = 0;
    if (m[3]) {
      const n = Number(m[4]);
      const unit = (m[5] ?? 'd').toLowerCase();
      if (unit.startsWith('w')) lag = n * 5;
      else if (unit.startsWith('h')) lag = n / 8;
      else if (unit === 'ed') lag = n * 5 / 7;
      else lag = n;
      if (m[3] === '-') lag = -lag;
      lag = Math.round(lag * 100) / 100;
    }
    if (links.some((l) => l.predUid === uid)) continue;
    links.push({ predUid: uid, type, lagDays: lag });
  }
  return { links };
}

export function idMaps(tasks: Task[]): { idByUid: Map<number, number>; uidById: Map<number, number> } {
  const idByUid = new Map<number, number>();
  const uidById = new Map<number, number>();
  tasks.forEach((t, i) => {
    idByUid.set(t.uid, i + 1);
    uidById.set(i + 1, t.uid);
  });
  return { idByUid, uidById };
}

/** Parse "5d", "2w", "3", "1.5 days", "0" into working days. Returns null on failure. */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?|mo|mons?|months?|h|hrs?|hours?|ed|ew)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2] ?? 'd';
  if (u.startsWith('w') || u === 'ew') return round2(n * 5);
  if (u.startsWith('mo')) return round2(n * 20);
  if (u.startsWith('h')) return round2(n / 8);
  if (u === 'ed') return round2((n * 5) / 7);
  return round2(n);
}

export function formatDuration(days: number, opts: { compact?: boolean } = {}): string {
  const d = Math.round(days * 100) / 100;
  if (opts.compact) {
    if (Number.isInteger(d)) return `${d}d`;
    return `${d}d`;
  }
  if (d === 1) return '1 day';
  if (Number.isInteger(d)) return `${d} days`;
  return `${d} days`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
