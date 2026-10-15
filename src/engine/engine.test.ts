import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSchedule, wouldCreateCycle } from './schedule';
import { newProject, newTask } from './project';
import { WorkCalendar, defaultCalendar } from './calendar';
import { formatPredecessors, idMaps, parseDuration, parsePredecessors } from './predecessors';
import { importMpxj } from './mpxjImport';
import { exportMspdi } from './mspdi';
import type { Project } from './types';

function proj(): Project {
  const p = newProject('Test', '2026-09-14'); // Monday
  p.tasks = [
    newTask(1, { name: 'Phase 1', outlineLevel: 1 }),
    newTask(2, { name: 'A', outlineLevel: 2, durationDays: 5 }),
    newTask(3, { name: 'B', outlineLevel: 2, durationDays: 3, predecessors: [{ predUid: 2, type: 'FS', lagDays: 0 }] }),
    newTask(4, { name: 'C', outlineLevel: 2, durationDays: 2, predecessors: [{ predUid: 2, type: 'SS', lagDays: 1 }] }),
    newTask(5, { name: 'Done', outlineLevel: 1, durationDays: 0, milestone: true, predecessors: [{ predUid: 1, type: 'FS', lagDays: 0 }] }),
  ];
  p.nextUid = 6;
  return p;
}

describe('calendar', () => {
  it('maps positions to dates over weekends', () => {
    const cal = new WorkCalendar(defaultCalendar(), '2026-09-14');
    expect(cal.startDateTime(0)).toBe('2026-09-14T08:00');
    expect(cal.finishDateTime(5)).toBe('2026-09-18T17:00');
    expect(cal.startDateTime(5)).toBe('2026-09-21T08:00');
    expect(cal.finishDateTime(0.5)).toBe('2026-09-14T12:00');
    expect(cal.startDateTime(0.5)).toBe('2026-09-14T13:00');
    expect(cal.positionOfStart('2026-09-21T08:00')).toBe(5);
    expect(cal.positionOfFinish('2026-09-18T17:00')).toBe(5);
    expect(cal.positionOfStart('2026-09-19T08:00')).toBe(5); // Saturday -> Monday
    expect(cal.dayAtIndex(-1)).toBe('2026-09-11');
    expect(cal.indexOfDay('2026-09-11')).toBe(-1);
    expect(cal.indexOfDay('2026-09-12', 'next')).toBe(0);
    expect(cal.indexOfDay('2026-09-12', 'prev')).toBe(-1);
  });
  it('honors exceptions', () => {
    const c = defaultCalendar();
    c.exceptions.push({ date: '2026-09-15', working: false, name: 'Holiday' });
    const cal = new WorkCalendar(c, '2026-09-14');
    expect(cal.dayAtIndex(1)).toBe('2026-09-16');
  });
});

describe('cpm', () => {
  it('computes forward/backward pass with summaries', () => {
    const r = computeSchedule(proj());
    const a = r.byUid.get(2)!;
    const b = r.byUid.get(3)!;
    const c = r.byUid.get(4)!;
    const done = r.byUid.get(5)!;
    const phase = r.byUid.get(1)!;
    expect(a.start).toBe('2026-09-14T08:00');
    expect(a.finish).toBe('2026-09-18T17:00');
    expect(b.start).toBe('2026-09-21T08:00');
    expect(b.finish).toBe('2026-09-23T17:00');
    expect(c.start).toBe('2026-09-15T08:00');
    expect(phase.summary).toBe(true);
    expect(phase.start).toBe('2026-09-14T08:00');
    expect(phase.finish).toBe('2026-09-23T17:00');
    expect(done.start).toBe('2026-09-23T17:00');
    expect(a.critical).toBe(true);
    expect(b.critical).toBe(true);
    expect(c.critical).toBe(false);
    expect(c.totalSlackDays).toBe(5);
    expect(r.projectFinish).toBe('2026-09-23T17:00');
    expect(r.durationDays).toBe(8);
    expect(r.errors).toHaveLength(0);
  });
  it('detects cycles', () => {
    const p = proj();
    p.tasks[1].predecessors.push({ predUid: 3, type: 'FS', lagDays: 0 });
    const r = computeSchedule(p);
    expect(r.errors.some((e) => e.code === 'cycle')).toBe(true);
    expect(wouldCreateCycle(proj().tasks, 3, 2)).toBe(true);
    expect(wouldCreateCycle(proj().tasks, 2, 5)).toBe(false);
    expect(wouldCreateCycle(proj().tasks, 5, 2)).toBe(true);
  });
  it('applies SNET constraints', () => {
    const p = proj();
    p.tasks[1].constraintType = 'SNET';
    p.tasks[1].constraintDate = '2026-09-21T08:00';
    const r = computeSchedule(p);
    expect(r.byUid.get(2)!.start).toBe('2026-09-21T08:00');
  });
  it('honors FF and SF links with lag', () => {
    const p = newProject('Links', '2026-09-14');
    p.tasks = [
      newTask(1, { name: 'A', durationDays: 5 }),
      newTask(2, { name: 'B', durationDays: 4, predecessors: [{ predUid: 1, type: 'FF', lagDays: 1 }] }),
      newTask(3, { name: 'C', durationDays: 3, predecessors: [{ predUid: 1, type: 'SF', lagDays: 2 }] }),
    ];
    p.nextUid = 4;
    const r = computeSchedule(p);
    expect(r.errors).toHaveLength(0);
    const a = r.byUid.get(1)!;
    const b = r.byUid.get(2)!;
    const c = r.byUid.get(3)!;
    expect(a.finish).toBe('2026-09-18T17:00');
    // FF+1: B finishes one working day after A.
    expect(b.finish).toBe('2026-09-21T17:00');
    expect(b.start).toBe('2026-09-16T08:00');
    // SF+2: C finishes two working days after A starts (Wednesday).
    expect(c.finish).toBe('2026-09-16T17:00');
    expect(b.critical || c.critical).toBe(true);
    expect(a.critical).toBe(true);
  });
  it('shows a date-constrained milestone on the constraint day', () => {
    const p = proj();
    // "Done" is finish-driven by Phase 1 (ends 9/23); MSO pushes it to a later day.
    p.tasks[4].constraintType = 'MSO';
    p.tasks[4].constraintDate = '2026-10-12T08:00';
    let r = computeSchedule(p);
    expect(r.byUid.get(5)!.start.slice(0, 10)).toBe('2026-10-12');
    p.tasks[4].constraintType = 'MFO';
    p.tasks[4].constraintDate = '2026-10-12T17:00';
    r = computeSchedule(p);
    expect(r.byUid.get(5)!.start.slice(0, 10)).toBe('2026-10-12');
    // A finish-driven milestone with no constraint still lands at the end of its predecessor's last day.
    p.tasks[4].constraintType = 'ASAP';
    p.tasks[4].constraintDate = undefined;
    r = computeSchedule(p);
    expect(r.byUid.get(5)!.start).toBe('2026-09-23T17:00');
  });
});

describe('predecessor text', () => {
  it('round trips', () => {
    const p = proj();
    const { idByUid, uidById } = idMaps(p.tasks);
    expect(formatPredecessors(p.tasks[3].predecessors, idByUid)).toBe('2SS+1d');
    expect(formatPredecessors(p.tasks[2].predecessors, idByUid)).toBe('2');
    const parsed = parsePredecessors('2FS+2d, 3SS-1w', uidById, 4);
    expect(parsed.error).toBeUndefined();
    expect(parsed.links).toEqual([
      { predUid: 2, type: 'FS', lagDays: 2 },
      { predUid: 3, type: 'SS', lagDays: -5 },
    ]);
    expect(parsePredecessors('99', uidById).error).toMatch(/no task/);
    expect(parseDuration('2w')).toBe(10);
    expect(parseDuration('3')).toBe(3);
    expect(parseDuration('4h')).toBe(0.5);
  });
});

describe('mpxj import + mspdi export', () => {
  it('imports a real converted file and exports XML', () => {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync('/tmp/aeg.json', 'utf8'));
    } catch {
      return; // fixture not available
    }
    const p = importMpxj(json as never, '/tmp/aeg.mpp');
    expect(p.tasks.length).toBeGreaterThan(10);
    expect(p.name.length).toBeGreaterThan(0);
    const r = computeSchedule(p);
    expect(r.errors).toHaveLength(0);
    const xml = exportMspdi(p, r);
    expect(xml).toContain('<PredecessorLink>');
    expect(xml.split('<Task>').length - 1).toBe(58);
  });
});
