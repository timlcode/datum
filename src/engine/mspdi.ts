// Writes a Microsoft Project XML (MSPDI) document. Element order follows the
// MSPDI schema; Project is strict about ordering.

import type { ConstraintType, LinkType, Project, ScheduleResult } from './types';
import { computeOutline } from './outline';
import { dayOf } from './dates';

const CONSTRAINT_CODE: Record<ConstraintType, number> = {
  ASAP: 0, ALAP: 1, MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7,
};
const LINK_CODE: Record<LinkType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dt(s?: string): string | undefined {
  if (!s) return undefined;
  if (s.length === 10) return `${s}T08:00:00`;
  return s.length === 16 ? `${s}:00` : s;
}

function durationIso(days: number, hoursPerDay: number): string {
  const totalMinutes = Math.round(days * hoursPerDay * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `PT${h}H${m}M0S`;
}

/** Slack/lag in tenths of minutes. */
function tenthsOfMinutes(days: number, hoursPerDay: number): number {
  return Math.round(days * hoursPerDay * 60 * 10);
}

function nowIso(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function exportMspdi(project: Project, schedule: ScheduleResult): string {
  const hpd = project.calendar.hoursPerDay || 8;
  const outline = computeOutline(project.tasks);
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);
  const el = (tag: string, value: string | number | boolean | undefined, indent = '') => {
    if (value === undefined) return;
    const v = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    w(`${indent}<${tag}>${typeof v === 'string' ? esc(v) : v}</${tag}>`);
  };

  const projectStart = dt(schedule.projectStart)!;
  const projectFinish = dt(schedule.projectFinish)!;

  w('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  w('<Project xmlns="http://schemas.microsoft.com/project">');
  const I = '  ';
  el('SaveVersion', 14, I);
  el('Name', (project.filePath?.split('/').pop() ?? project.name) || 'schedule.xml', I);
  el('Title', project.name, I);
  el('Company', project.company, I);
  el('Manager', project.manager, I);
  el('Author', project.author ?? 'Datum', I);
  el('CreationDate', nowIso(), I);
  el('Revision', 1, I);
  el('LastSaved', nowIso(), I);
  el('ScheduleFromStart', 1, I);
  el('StartDate', projectStart, I);
  el('FinishDate', projectFinish, I);
  el('FYStartDate', 1, I);
  el('CriticalSlackLimit', 0, I);
  el('CurrencyDigits', 2, I);
  el('CurrencySymbol', '$', I);
  el('CurrencySymbolPosition', 0, I);
  el('CalendarUID', 1, I);
  el('DefaultStartTime', '08:00:00', I);
  el('DefaultFinishTime', '17:00:00', I);
  el('MinutesPerDay', hpd * 60, I);
  el('MinutesPerWeek', hpd * 60 * 5, I);
  el('DaysPerMonth', 20, I);
  el('DefaultTaskType', 1, I);
  el('DefaultFixedCostAccrual', 3, I);
  el('DefaultStandardRate', 0, I);
  el('DefaultOvertimeRate', 0, I);
  el('DurationFormat', 7, I);
  el('WorkFormat', 2, I);
  el('EditableActualCosts', 0, I);
  el('HonorConstraints', 1, I);
  el('EarnedValueMethod', 0, I);
  el('InsertedProjectsLikeSummary', 0, I);
  el('MultipleCriticalPaths', 0, I);
  el('NewTasksEffortDriven', 0, I);
  el('NewTasksEstimated', 0, I);
  el('SplitsInProgressTasks', 1, I);
  el('SpreadActualCost', 0, I);
  el('SpreadPercentComplete', 0, I);
  el('TaskUpdatesResource', 1, I);
  el('FiscalYearStart', 0, I);
  el('WeekStartDay', 1, I);
  el('MoveCompletedEndsBack', 0, I);
  el('MoveRemainingStartsBack', 0, I);
  el('MoveRemainingStartsForward', 0, I);
  el('MoveCompletedEndsForward', 0, I);
  el('BaselineForEarnedValue', 0, I);
  el('AutoAddNewResourcesAndTasks', 1, I);
  if (project.statusDate) el('StatusDate', `${project.statusDate}T17:00:00`, I);
  el('CurrentDate', nowIso(), I);
  el('MicrosoftProjectServerURL', 1, I);
  el('Autolink', 0, I);
  el('NewTaskStartDate', 0, I);
  el('NewTasksAreManual', 0, I);
  el('DefaultTaskEVMethod', 0, I);
  el('ProjectExternallyEdited', 0, I);
  el('ExtendedCreationDate', '1984-01-01T00:00:00', I);
  el('ActualsInSync', 0, I);
  el('RemoveFileProperties', 0, I);
  el('AdminProject', 0, I);
  w(`${I}<ExtendedAttributes/>`);

  // Calendar.
  w(`${I}<Calendars>`);
  w(`${I}  <Calendar>`);
  el('UID', 1, I + '    ');
  el('Name', project.calendar.name || 'Standard', I + '    ');
  el('IsBaseCalendar', 1, I + '    ');
  el('IsBaselineCalendar', 0, I + '    ');
  el('BaseCalendarUID', -1, I + '    ');
  w(`${I}    <WeekDays>`);
  for (let d = 0; d < 7; d++) {
    const working = project.calendar.workWeek[d];
    w(`${I}      <WeekDay>`);
    el('DayType', d + 1, I + '        ');
    el('DayWorking', working ? 1 : 0, I + '        ');
    if (working) {
      w(`${I}        <WorkingTimes>`);
      w(`${I}          <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>`);
      w(`${I}          <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>`);
      w(`${I}        </WorkingTimes>`);
    }
    w(`${I}      </WeekDay>`);
  }
  for (const ex of project.calendar.exceptions) {
    w(`${I}      <WeekDay>`);
    el('DayType', 0, I + '        ');
    el('DayWorking', ex.working ? 1 : 0, I + '        ');
    w(`${I}        <TimePeriod><FromDate>${ex.date}T00:00:00</FromDate><ToDate>${ex.date}T23:59:00</ToDate></TimePeriod>`);
    if (ex.working) {
      w(`${I}        <WorkingTimes>`);
      w(`${I}          <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>`);
      w(`${I}          <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>`);
      w(`${I}        </WorkingTimes>`);
    }
    w(`${I}      </WeekDay>`);
  }
  w(`${I}    </WeekDays>`);
  w(`${I}  </Calendar>`);
  w(`${I}</Calendars>`);

  // Tasks.
  w(`${I}<Tasks>`);
  const T = I + '    ';
  // Project summary task.
  w(`${I}  <Task>`);
  el('UID', 0, T);
  el('ID', 0, T);
  el('Name', project.name, T);
  el('Active', 1, T);
  el('Manual', 0, T);
  el('Type', 1, T);
  el('IsNull', 0, T);
  el('CreateDate', nowIso(), T);
  el('WBS', '0', T);
  el('OutlineNumber', '0', T);
  el('OutlineLevel', 0, T);
  el('Priority', 500, T);
  el('Start', projectStart, T);
  el('Finish', projectFinish, T);
  el('Duration', durationIso(schedule.durationDays, hpd), T);
  el('DurationFormat', 7, T);
  el('ResumeValid', 0, T);
  el('EffortDriven', 0, T);
  el('Recurring', 0, T);
  el('OverAllocated', 0, T);
  el('Estimated', 0, T);
  el('Milestone', 0, T);
  el('Summary', 1, T);
  el('Critical', 1, T);
  el('IsSubproject', 0, T);
  el('IsSubprojectReadOnly', 0, T);
  el('ExternalTask', 0, T);
  el('EarlyStart', projectStart, T);
  el('EarlyFinish', projectFinish, T);
  el('LateStart', projectStart, T);
  el('LateFinish', projectFinish, T);
  el('FixedCostAccrual', 3, T);
  el('PercentComplete', 0, T);
  el('PercentWorkComplete', 0, T);
  el('RemainingDuration', durationIso(schedule.durationDays, hpd), T);
  el('ConstraintType', 0, T);
  el('CalendarUID', -1, T);
  el('LevelAssignments', 1, T);
  el('LevelingCanSplit', 1, T);
  el('LevelingDelay', 0, T);
  el('LevelingDelayFormat', 8, T);
  el('IgnoreResourceCalendar', 0, T);
  if (project.notes) el('Notes', project.notes, T);
  el('HideBar', 0, T);
  el('Rollup', 0, T);
  el('EarnedValueMethod', 0, T);
  w(`${I}  </Task>`);

  const resourceUidByName = new Map<string, number>();
  const assignments: { uid: number; taskUid: number; resUid: number; start: string; finish: string; work: string }[] = [];
  let nextResUid = 1;
  let nextAsgUid = 1;

  project.tasks.forEach((t, i) => {
    const s = schedule.byUid.get(t.uid)!;
    const info = outline.get(t.uid)!;
    const start = dt(s.start)!;
    const finish = dt(s.finish)!;
    const dur = s.summary ? s.durationDays : t.milestone ? 0 : t.durationDays;
    w(`${I}  <Task>`);
    el('UID', t.uid, T);
    el('ID', i + 1, T);
    el('Name', t.name || `Task ${i + 1}`, T);
    el('Active', 1, T);
    el('Manual', 0, T);
    el('Type', 1, T);
    el('IsNull', 0, T);
    el('CreateDate', nowIso(), T);
    el('WBS', s.wbs, T);
    el('OutlineNumber', s.wbs, T);
    el('OutlineLevel', info.level, T);
    el('Priority', 500, T);
    el('Start', start, T);
    el('Finish', finish, T);
    el('Duration', durationIso(dur, hpd), T);
    el('DurationFormat', 7, T);
    el('ResumeValid', 0, T);
    el('EffortDriven', 0, T);
    el('Recurring', 0, T);
    el('OverAllocated', 0, T);
    el('Estimated', 0, T);
    el('Milestone', t.milestone && !s.summary ? 1 : 0, T);
    el('Summary', s.summary ? 1 : 0, T);
    el('Critical', s.critical ? 1 : 0, T);
    el('IsSubproject', 0, T);
    el('IsSubprojectReadOnly', 0, T);
    el('ExternalTask', 0, T);
    el('EarlyStart', start, T);
    el('EarlyFinish', finish, T);
    el('LateStart', dt(s.lateStart), T);
    el('LateFinish', dt(s.lateFinish), T);
    el('FreeSlack', tenthsOfMinutes(s.freeSlackDays, hpd), T);
    el('TotalSlack', tenthsOfMinutes(s.totalSlackDays, hpd), T);
    el('StartSlack', tenthsOfMinutes(s.totalSlackDays, hpd), T);
    el('FinishSlack', tenthsOfMinutes(s.totalSlackDays, hpd), T);
    el('FixedCostAccrual', 3, T);
    el('PercentComplete', Math.max(0, Math.min(100, Math.round(t.percentComplete || 0))), T);
    el('PercentWorkComplete', Math.max(0, Math.min(100, Math.round(t.percentComplete || 0))), T);
    if (t.actualStart) el('ActualStart', dt(t.actualStart), T);
    if (t.actualFinish) el('ActualFinish', dt(t.actualFinish), T);
    el('RemainingDuration', durationIso(dur * (1 - (t.percentComplete || 0) / 100), hpd), T);
    el('ConstraintType', s.summary ? 0 : CONSTRAINT_CODE[t.constraintType] ?? 0, T);
    el('CalendarUID', -1, T);
    if (!s.summary && t.constraintDate && t.constraintType !== 'ASAP' && t.constraintType !== 'ALAP') {
      el('ConstraintDate', dt(t.constraintDate), T);
    }
    el('LevelAssignments', 1, T);
    el('LevelingCanSplit', 1, T);
    el('LevelingDelay', 0, T);
    el('LevelingDelayFormat', 8, T);
    el('IgnoreResourceCalendar', 0, T);
    if (t.notes) el('Notes', t.notes, T);
    el('HideBar', 0, T);
    el('Rollup', 0, T);
    el('EarnedValueMethod', 0, T);
    for (const link of t.predecessors) {
      if (!schedule.byUid.has(link.predUid)) continue;
      w(`${T}<PredecessorLink>`);
      el('PredecessorUID', link.predUid, T + '  ');
      el('Type', LINK_CODE[link.type], T + '  ');
      el('CrossProject', 0, T + '  ');
      el('LinkLag', tenthsOfMinutes(link.lagDays || 0, hpd), T + '  ');
      el('LagFormat', 7, T + '  ');
      w(`${T}</PredecessorLink>`);
    }
    if (t.baselineStart && t.baselineFinish) {
      w(`${T}<Baseline>`);
      el('Number', 0, T + '  ');
      el('Start', dt(t.baselineStart), T + '  ');
      el('Finish', dt(t.baselineFinish), T + '  ');
      el('Duration', durationIso(t.baselineDurationDays ?? dur, hpd), T + '  ');
      el('DurationFormat', 7, T + '  ');
      w(`${T}</Baseline>`);
    }
    w(`${I}  </Task>`);

    if (t.resourceNames && !s.summary) {
      for (const raw of t.resourceNames.split(/[,;]/)) {
        const name = raw.trim();
        if (!name) continue;
        let uid = resourceUidByName.get(name);
        if (uid === undefined) {
          uid = nextResUid++;
          resourceUidByName.set(name, uid);
        }
        assignments.push({ uid: nextAsgUid++, taskUid: t.uid, resUid: uid, start, finish, work: durationIso(dur, hpd) });
      }
    }
  });
  w(`${I}</Tasks>`);

  // Resources.
  w(`${I}<Resources>`);
  let rid = 1;
  for (const [name, uid] of resourceUidByName) {
    w(`${I}  <Resource>`);
    el('UID', uid, T);
    el('ID', rid++, T);
    el('Name', name, T);
    el('Type', 1, T);
    el('IsNull', 0, T);
    el('Initials', name.slice(0, 1).toUpperCase(), T);
    el('WorkGroup', 0, T);
    el('MaxUnits', 1, T);
    el('PeakUnits', 1, T);
    el('OverAllocated', 0, T);
    el('CanLevel', 1, T);
    el('AccrueAt', 3, T);
    el('StandardRate', 0, T);
    el('StandardRateFormat', 2, T);
    el('Cost', 0, T);
    el('OvertimeRate', 0, T);
    el('OvertimeRateFormat', 2, T);
    el('CalendarUID', 1, T);
    el('IsGeneric', 0, T);
    el('IsInactive', 0, T);
    el('IsEnterprise', 0, T);
    el('IsBudget', 0, T);
    w(`${I}  </Resource>`);
  }
  w(`${I}</Resources>`);

  // Assignments.
  w(`${I}<Assignments>`);
  for (const a of assignments) {
    w(`${I}  <Assignment>`);
    el('UID', a.uid, T);
    el('TaskUID', a.taskUid, T);
    el('ResourceUID', a.resUid, T);
    el('PercentWorkComplete', 0, T);
    el('Finish', a.finish, T);
    el('HasFixedRateUnits', 1, T);
    el('FixedMaterial', 0, T);
    el('LevelingDelayFormat', 7, T);
    el('RegularWork', a.work, T);
    el('RemainingWork', a.work, T);
    el('Start', a.start, T);
    el('Units', 1, T);
    el('Work', a.work, T);
    el('WorkContour', 0, T);
    w(`${I}  </Assignment>`);
  }
  w(`${I}</Assignments>`);
  w('</Project>');
  return lines.join('\n') + '\n';
}

export function suggestedFileName(project: Project): string {
  const base = (project.name || 'schedule').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${base}.xml`;
}

export { dayOf };
