// Field-office boards and the horizon strip. Pure functions so the views and
// the tests share one definition of "overdue" and "next 30 days".

import type { BoardCard, CardPriority, Project, ScheduleResult, Task } from './types';
import { addDays, dayOf, type DayStr } from './dates';

export const DECISION_COLUMNS = [
  'Pending Decision',
  'Info Provided',
  'Owner Review',
  'Decided',
  'Implemented',
] as const;

export const BUYOUT_COLUMNS = [
  'Scope Defined',
  'Bidding',
  'Leveling',
  'Awarded',
  'Contract Executed',
  'Mobilized',
] as const;

/** Columns that mean a decision is no longer open. */
export const DECISION_CLOSED = new Set<string>(['Decided', 'Implemented']);

/** Columns that count toward awarded buyout dollars. */
export const BUYOUT_AWARDED = new Set<string>(['Awarded', 'Contract Executed', 'Mobilized']);

export type MilestoneTone = 'complete' | 'in-progress' | 'at-risk' | 'upcoming';

const PRIORITIES = new Set<CardPriority>(['low', 'normal', 'high']);

function cleanCard(raw: Partial<BoardCard> | undefined, fallbackColumn: string): BoardCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? '').trim();
  if (!title) return null;
  const priority = PRIORITIES.has(raw.priority as CardPriority) ? (raw.priority as CardPriority) : 'normal';
  const due = typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.dueDate) ? raw.dueDate.slice(0, 10) : undefined;
  return {
    id: String(raw.id || `card-${Math.random().toString(36).slice(2, 10)}`),
    column: String(raw.column || fallbackColumn),
    title,
    priority,
    description: String(raw.description ?? ''),
    owner: String(raw.owner ?? ''),
    dueDate: due,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)).filter(Boolean) : [],
    budgetConcept: numberOrUndef(raw.budgetConcept),
    budgetProposal: numberOrUndef(raw.budgetProposal),
  };
}

function numberOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Fill boards on files saved before they existed, and drop blank cards. */
export function normalizeProject(p: Project): Project {
  const decisions = (p.decisions ?? [])
    .map((c) => cleanCard(c, DECISION_COLUMNS[0]))
    .filter((c): c is BoardCard => !!c);
  const buyout = (p.buyout ?? [])
    .map((c) => cleanCard(c, BUYOUT_COLUMNS[0]))
    .filter((c): c is BoardCard => !!c);
  for (const c of decisions) {
    if (!DECISION_COLUMNS.includes(c.column as (typeof DECISION_COLUMNS)[number])) c.column = DECISION_COLUMNS[0];
  }
  for (const c of buyout) {
    if (!BUYOUT_COLUMNS.includes(c.column as (typeof BUYOUT_COLUMNS)[number])) c.column = BUYOUT_COLUMNS[0];
  }
  p.decisions = decisions;
  p.buyout = buyout;
  if (p.buyoutTarget !== undefined && !Number.isFinite(Number(p.buyoutTarget))) p.buyoutTarget = undefined;
  return p;
}

export function newCardId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface HorizonMilestone {
  uid: number;
  name: string;
  date: DayStr;
  critical: boolean;
  tone: MilestoneTone;
  phase: string;
  slackDays: number;
}

export function milestoneTone(task: Task, finish: string, critical: boolean, slackDays: number, today: DayStr): MilestoneTone {
  if (task.percentComplete >= 100 || task.actualFinish) return 'complete';
  const date = dayOf(finish);
  if (date < today || slackDays < 0) return 'at-risk';
  if (task.percentComplete > 0 || date <= addDays(today, 14)) return critical && date <= addDays(today, 7) ? 'at-risk' : 'in-progress';
  return 'upcoming';
}

export function horizonMilestones(project: Project, schedule: ScheduleResult, today: DayStr): HorizonMilestone[] {
  const end = addDays(today, 30);
  const out: HorizonMilestone[] = [];
  for (const t of project.tasks) {
    const s = schedule.byUid.get(t.uid);
    if (!t.milestone || !s || s.hasChildren) continue;
    const date = dayOf(s.finish);
    const tone = milestoneTone(t, s.finish, s.critical, s.totalSlackDays, today);
    if (tone === 'complete') continue;
    if (date > end) continue;
    const parent = s.parentUid !== undefined ? project.tasks.find((x) => x.uid === s.parentUid)?.name ?? '' : '';
    out.push({ uid: t.uid, name: t.name, date, critical: s.critical, tone, phase: parent, slackDays: s.totalSlackDays });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  return out;
}

export function nextThirty(items: HorizonMilestone[], today: DayStr): HorizonMilestone[] {
  const end = addDays(today, 30);
  return items.filter((m) => m.date >= today && m.date <= end);
}

export function overdueMilestones(items: HorizonMilestone[], today: DayStr): HorizonMilestone[] {
  return items.filter((m) => m.date < today);
}

export function openDecisions(cards: BoardCard[]): BoardCard[] {
  return cards.filter((c) => !DECISION_CLOSED.has(c.column));
}

export function overdueDecisions(cards: BoardCard[], today: DayStr): BoardCard[] {
  return openDecisions(cards)
    .filter((c) => c.dueDate && c.dueDate < today)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
}

export interface BuyoutSummary {
  concept: number;
  proposal: number;
  awarded: number;
  target?: number;
  /** Target minus proposal. Negative means the proposals are over the target. */
  gap?: number;
}

export function buyoutSummary(cards: BoardCard[], target?: number): BuyoutSummary {
  let concept = 0;
  let proposal = 0;
  let awarded = 0;
  for (const c of cards) {
    concept += c.budgetConcept ?? 0;
    proposal += c.budgetProposal ?? 0;
    if (BUYOUT_AWARDED.has(c.column)) awarded += c.budgetProposal || c.budgetConcept || 0;
  }
  const gap = target !== undefined && Number.isFinite(target) ? target - proposal : undefined;
  return { concept, proposal, awarded, target: target !== undefined && Number.isFinite(target) ? target : undefined, gap };
}

export function money(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(Math.round(n));
  const formatted = abs.toLocaleString('en-US');
  return n < 0 ? `−$${formatted}` : `$${formatted}`;
}
