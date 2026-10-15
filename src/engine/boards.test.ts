import { describe, expect, it } from 'vitest';
import { newProject, newTask } from './project';
import { computeSchedule } from './schedule';
import {
  buyoutSummary,
  horizonMilestones,
  milestoneTone,
  nextThirty,
  normalizeProject,
  overdueDecisions,
  overdueMilestones,
} from './boards';
import type { BoardCard, Project } from './types';

function card(partial: Partial<BoardCard> & Pick<BoardCard, 'id' | 'column' | 'title'>): BoardCard {
  return { priority: 'normal', description: '', owner: '', tags: [], ...partial };
}

describe('boards', () => {
  it('normalizes missing boards and illegal columns', () => {
    const p = newProject('Bare', '2026-09-14');
    delete p.decisions;
    delete p.buyout;
    p.decisions = [{ id: 'd1', column: 'Not a column', title: 'Brick color', priority: 'high', description: '', owner: 'Owner', tags: ['envelope'] }];
    normalizeProject(p);
    expect(p.decisions![0].column).toBe('Pending Decision');
    expect(p.buyout).toEqual([]);
  });

  it('flags overdue decisions and ignores closed ones', () => {
    const cards = [
      card({ id: '1', column: 'Pending Decision', title: 'Switchgear', dueDate: '2026-10-01' }),
      card({ id: '2', column: 'Decided', title: 'Locksets', dueDate: '2026-09-01' }),
      card({ id: '3', column: 'Owner Review', title: 'Play surface', dueDate: '2026-10-20' }),
    ];
    const overdue = overdueDecisions(cards, '2026-10-15');
    expect(overdue.map((c) => c.id)).toEqual(['1']);
  });

  it('sums buyout dollars and the gap to target', () => {
    const cards = [
      card({ id: '1', column: 'Bidding', title: 'Steel', budgetConcept: 100, budgetProposal: 120 }),
      card({ id: '2', column: 'Awarded', title: 'Concrete', budgetConcept: 80, budgetProposal: 70 }),
      card({ id: '3', column: 'Mobilized', title: 'Demo', budgetConcept: 40 }),
    ];
    const s = buyoutSummary(cards, 300);
    expect(s.proposal).toBe(190);
    expect(s.awarded).toBe(110);
    expect(s.gap).toBe(110);
  });
});

describe('horizon', () => {
  function sample(): Project {
    const p = newProject('Horizon', '2026-09-14');
    p.tasks = [
      newTask(1, { name: 'Preconstruction', outlineLevel: 1 }),
      newTask(2, { name: 'Notice to Proceed', outlineLevel: 2, durationDays: 0, milestone: true, percentComplete: 100 }),
      newTask(3, {
        name: 'Geotech memo accepted',
        outlineLevel: 2,
        durationDays: 0,
        milestone: true,
        predecessors: [{ predUid: 2, type: 'FS', lagDays: 0 }],
        constraintType: 'MFO',
        constraintDate: '2026-10-01T17:00',
      }),
      newTask(4, {
        name: 'Permit issued',
        outlineLevel: 2,
        durationDays: 0,
        milestone: true,
        predecessors: [{ predUid: 2, type: 'FS', lagDays: 10 }],
      }),
      newTask(5, {
        name: 'Substantial completion',
        outlineLevel: 1,
        durationDays: 0,
        milestone: true,
        predecessors: [{ predUid: 4, type: 'FS', lagDays: 40 }],
      }),
    ];
    p.nextUid = 6;
    return p;
  }

  it('classifies milestone tone', () => {
    const t = newTask(1, { name: 'M', milestone: true, durationDays: 0 });
    expect(milestoneTone(t, '2026-10-01T17:00', false, 0, '2026-10-15')).toBe('at-risk');
    expect(milestoneTone({ ...t, percentComplete: 100 }, '2026-10-01T17:00', true, 0, '2026-10-15')).toBe('complete');
    expect(milestoneTone(t, '2026-10-20T17:00', false, 3, '2026-10-15')).toBe('in-progress');
    expect(milestoneTone(t, '2026-12-01T17:00', false, 8, '2026-10-15')).toBe('upcoming');
  });

  it('splits the next 30 days from overdue milestones', () => {
    const p = sample();
    const schedule = computeSchedule(p);
    const items = horizonMilestones(p, schedule, '2026-10-15');
    const names = items.map((m) => m.name);
    expect(names).toContain('Geotech memo accepted');
    expect(names).not.toContain('Notice to Proceed');
    const overdue = overdueMilestones(items, '2026-10-15');
    expect(overdue.some((m) => m.name === 'Geotech memo accepted' && m.tone === 'at-risk')).toBe(true);
    const soon = nextThirty(items, '2026-10-15');
    expect(soon.every((m) => m.date >= '2026-10-15' && m.date <= '2026-11-14')).toBe(true);
    expect(soon.some((m) => m.name === 'Substantial completion')).toBe(false);
  });
});
