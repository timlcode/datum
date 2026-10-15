import type { Project, ScheduleResult } from './types';

export interface HealthFinding {
  code: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  uids: number[];
}

/** Fast schedule-quality checks in the spirit of the DCMA 14-point assessment. */
export function assessHealth(project: Project, schedule: ScheduleResult): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const tasks = project.tasks;
  const leaves = tasks.filter((t) => !schedule.byUid.get(t.uid)?.hasChildren);
  if (!leaves.length) return findings;

  const hasSucc = new Set<number>();
  for (const t of tasks) for (const l of t.predecessors) hasSucc.add(l.predUid);

  const firstStart = Math.min(...leaves.map((t) => schedule.byUid.get(t.uid)!.es));
  const lastFinish = Math.max(...leaves.map((t) => schedule.byUid.get(t.uid)!.ef));

  // Tasks with no predecessor, other than whatever legitimately kicks the schedule off.
  const noPredAll = leaves.filter((t) => t.predecessors.length === 0);
  const startsAtZero = noPredAll.filter((t) => schedule.byUid.get(t.uid)!.es <= firstStart + 1e-6);
  const openStarts = noPredAll.filter((t) => !startsAtZero.includes(t) || (startsAtZero.length > 1 && !t.milestone));
  if (openStarts.length) {
    findings.push({
      code: 'open_start',
      severity: openStarts.length > leaves.length * 0.05 ? 'high' : 'medium',
      title: `${openStarts.length} task${openStarts.length > 1 ? 's' : ''} with no predecessor`,
      detail: 'Every task except the first should have at least one predecessor so the logic drives its date.',
      uids: openStarts.map((t) => t.uid),
    });
  }

  const openEnds = leaves.filter((t) => !hasSucc.has(t.uid) && schedule.byUid.get(t.uid)!.ef < lastFinish - 1e-6);
  if (openEnds.length) {
    findings.push({
      code: 'open_end',
      severity: openEnds.length > leaves.length * 0.05 ? 'high' : 'medium',
      title: `${openEnds.length} task${openEnds.length > 1 ? 's' : ''} with no successor`,
      detail: 'Dangling tasks never push the finish date, so delays on them are invisible to the critical path.',
      uids: openEnds.map((t) => t.uid),
    });
  }

  const negFloat = leaves.filter((t) => schedule.byUid.get(t.uid)!.totalSlackDays < -1e-6);
  if (negFloat.length) {
    findings.push({
      code: 'negative_float',
      severity: 'high',
      title: `${negFloat.length} task${negFloat.length > 1 ? 's' : ''} with negative float`,
      detail: 'Constraints are forcing dates the logic cannot meet. Relax the constraint or shorten the chain.',
      uids: negFloat.map((t) => t.uid),
    });
  }

  const hard = leaves.filter((t) => t.constraintType === 'MSO' || t.constraintType === 'MFO');
  if (hard.length) {
    findings.push({
      code: 'hard_constraints',
      severity: hard.length > 2 ? 'medium' : 'low',
      title: `${hard.length} hard constraint${hard.length > 1 ? 's' : ''} (Must Start/Finish On)`,
      detail: 'Hard constraints override logic. Prefer Start No Earlier Than or a milestone with a deadline.',
      uids: hard.map((t) => t.uid),
    });
  }

  const long = leaves.filter((t) => !t.milestone && t.durationDays > 44);
  if (long.length) {
    findings.push({
      code: 'long_duration',
      severity: 'low',
      title: `${long.length} task${long.length > 1 ? 's' : ''} longer than 44 working days`,
      detail: 'Long activities hide progress. Break them into phases or areas so status is measurable.',
      uids: long.map((t) => t.uid),
    });
  }

  const bigLag = tasks.filter((t) => t.predecessors.some((l) => Math.abs(l.lagDays) > 10));
  if (bigLag.length) {
    findings.push({
      code: 'large_lag',
      severity: 'low',
      title: `${bigLag.length} link${bigLag.length > 1 ? 's' : ''} with lag over 10 days`,
      detail: 'Large lags usually stand in for real work (cure time, lead time). Model them as tasks where possible.',
      uids: bigLag.map((t) => t.uid),
    });
  }

  const leads = tasks.filter((t) => t.predecessors.some((l) => l.lagDays < 0));
  if (leads.length) {
    findings.push({
      code: 'leads',
      severity: 'low',
      title: `${leads.length} link${leads.length > 1 ? 's' : ''} with negative lag (lead)`,
      detail: 'Leads let a successor start before its predecessor is done. Start-to-start links are usually clearer.',
      uids: leads.map((t) => t.uid),
    });
  }

  const critCount = leaves.filter((t) => schedule.byUid.get(t.uid)!.critical).length;
  const critPct = critCount / leaves.length;
  if (leaves.length >= 10 && critPct > 0.5) {
    findings.push({
      code: 'critical_heavy',
      severity: 'medium',
      title: `${Math.round(critPct * 100)}% of tasks are critical`,
      detail: 'A schedule this tight has no room to absorb delays. Check for missing float or over-linked chains.',
      uids: [],
    });
  }

  const unnamed = tasks.filter((t) => !t.name.trim());
  if (unnamed.length) {
    findings.push({
      code: 'unnamed',
      severity: 'low',
      title: `${unnamed.length} unnamed task${unnamed.length > 1 ? 's' : ''}`,
      detail: 'Name every row or delete it before sharing the schedule.',
      uids: unnamed.map((t) => t.uid),
    });
  }

  const milestones = leaves.filter((t) => t.milestone).length;
  if (leaves.length >= 15 && milestones === 0) {
    findings.push({
      code: 'no_milestones',
      severity: 'low',
      title: 'No milestones',
      detail: 'Add key dates (NTP, dry-in, substantial completion, CO) so progress reads at a glance.',
      uids: [],
    });
  }

  return findings;
}

export function healthScore(findings: HealthFinding[]): number {
  let score = 100;
  for (const f of findings) score -= f.severity === 'high' ? 20 : f.severity === 'medium' ? 10 : 4;
  return Math.max(0, score);
}
