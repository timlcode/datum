import type { Project, ScheduleError, ScheduleResult, Scheduled, Task } from './types';
import { WorkCalendar } from './calendar';
import { computeOutline } from './outline';
import { dayOf } from './dates';

type Side = 'S' | 'F';

interface Node {
  id: string;
  uid: number;
  kind: 'leaf' | 'sumStart' | 'sumEnd';
  dur: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  drivenByFinish: boolean;
  out: Edge[];
  in: Edge[];
  indeg: number;
}

interface Edge {
  from: Node;
  to: Node;
  fromSide: Side;
  toSide: Side;
  lag: number;
}

const EPS = 1e-6;

/** Critical Path Method over the task outline. */
export function computeSchedule(project: Project): ScheduleResult {
  const { tasks } = project;
  const cal = new WorkCalendar(project.calendar, dayOf(project.startDate));
  const outline = computeOutline(tasks);
  const taskByUid = new Map(tasks.map((t) => [t.uid, t]));
  const errors: ScheduleError[] = [];

  // Build nodes.
  const nodes = new Map<string, Node>();
  const mk = (id: string, uid: number, kind: Node['kind'], dur: number): Node => {
    const n: Node = { id, uid, kind, dur, es: 0, ef: 0, ls: Infinity, lf: Infinity, drivenByFinish: false, out: [], in: [], indeg: 0 };
    nodes.set(id, n);
    return n;
  };
  const isSummary = (uid: number) => (outline.get(uid)?.childUids.length ?? 0) > 0;
  const leafDuration = (t: Task): number => {
    if (t.milestone) return 0;
    if (t.actualStart && t.actualFinish) {
      return Math.max(0, cal.positionOfFinish(t.actualFinish) - cal.positionOfStart(t.actualStart));
    }
    return Math.max(0, t.durationDays || 0);
  };

  for (const t of tasks) {
    if (isSummary(t.uid)) {
      mk(`S${t.uid}`, t.uid, 'sumStart', 0);
      mk(`E${t.uid}`, t.uid, 'sumEnd', 0);
    } else {
      mk(`T${t.uid}`, t.uid, 'leaf', leafDuration(t));
    }
  }

  const addEdge = (from: Node, fromSide: Side, to: Node, toSide: Side, lag: number) => {
    const e: Edge = { from, to, fromSide, toSide, lag };
    from.out.push(e);
    to.in.push(e);
    to.indeg++;
  };

  // Outline edges: summary start bounds children; children finishes bound summary end.
  for (const t of tasks) {
    const info = outline.get(t.uid)!;
    if (!info.childUids.length) continue;
    const s = nodes.get(`S${t.uid}`)!;
    const e = nodes.get(`E${t.uid}`)!;
    for (const c of info.childUids) {
      const cs = isSummary(c) ? nodes.get(`S${c}`)! : nodes.get(`T${c}`)!;
      const cf = isSummary(c) ? nodes.get(`E${c}`)! : nodes.get(`T${c}`)!;
      addEdge(s, 'S', cs, 'S', 0);
      addEdge(cf, 'F', e, 'F', 0);
    }
  }

  // Dependency links.
  for (const t of tasks) {
    for (const link of t.predecessors) {
      const pred = taskByUid.get(link.predUid);
      if (!pred) {
        errors.push({ code: 'missing_pred', message: `Task "${t.name}" references a missing predecessor (uid ${link.predUid}).`, uids: [t.uid] });
        continue;
      }
      if (pred.uid === t.uid) {
        errors.push({ code: 'self_link', message: `Task "${t.name}" is linked to itself.`, uids: [t.uid] });
        continue;
      }
      const predSide: Side = link.type[0] as Side;
      const succSide: Side = link.type[1] as Side;
      const fromNode = isSummary(pred.uid)
        ? nodes.get(predSide === 'S' ? `S${pred.uid}` : `E${pred.uid}`)!
        : nodes.get(`T${pred.uid}`)!;
      let toNode: Node;
      let toSide: Side = succSide;
      if (isSummary(t.uid)) {
        // Constraints on a summary are applied to the start of its block.
        toNode = nodes.get(`S${t.uid}`)!;
        toSide = 'S';
      } else {
        toNode = nodes.get(`T${t.uid}`)!;
      }
      addEdge(fromNode, predSide, toNode, toSide, link.lagDays || 0);
    }
  }

  // Topological order (Kahn).
  const order: Node[] = [];
  const queue: Node[] = [];
  for (const n of nodes.values()) if (n.indeg === 0) queue.push(n);
  const indeg = new Map<string, number>();
  for (const n of nodes.values()) indeg.set(n.id, n.indeg);
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const e of n.out) {
      const d = indeg.get(e.to.id)! - 1;
      indeg.set(e.to.id, d);
      if (d === 0) queue.push(e.to);
    }
  }
  if (order.length !== nodes.size) {
    const inCycle = [...nodes.values()].filter((n) => (indeg.get(n.id) ?? 0) > 0);
    const uids = [...new Set(inCycle.map((n) => n.uid))];
    errors.push({
      code: 'cycle',
      message: `Circular dependency involving: ${uids.map((u) => taskByUid.get(u)?.name ?? u).join(', ')}.`,
      uids,
    });
    // Append cyclic nodes so they still get positions.
    for (const n of inCycle) order.push(n);
  }

  const pos = (dt: string, kind: 'start' | 'finish') => (kind === 'start' ? cal.positionOfStart(dt) : cal.positionOfFinish(dt));
  const constraintPos = (t: Task): number | undefined => {
    if (!t.constraintDate) return undefined;
    const startLike = t.constraintType === 'MSO' || t.constraintType === 'SNET' || t.constraintType === 'SNLT';
    return pos(t.constraintDate, startLike ? 'start' : 'finish');
  };

  // Forward pass.
  for (const n of order) {
    let es = 0;
    let drivenByFinish = false;
    for (const e of n.in) {
      const base = e.fromSide === 'S' ? e.from.es : e.from.ef;
      let v = base + e.lag;
      if (e.toSide === 'F') v -= n.dur;
      if (v > es + EPS) {
        es = v;
        drivenByFinish = e.fromSide === 'F';
      } else if (Math.abs(v - es) <= EPS && e.fromSide === 'F') {
        drivenByFinish = true;
      }
    }
    if (n.kind === 'sumEnd') {
      // Summary end is the latest child finish (or at least the summary start).
      const s = nodes.get(`S${n.uid}`)!;
      es = Math.max(es, s.es);
      n.es = n.ef = es;
      n.drivenByFinish = true;
      continue;
    }
    if (n.kind === 'leaf') {
      const t = taskByUid.get(n.uid)!;
      const c = constraintPos(t);
      // When a date overrides the predecessor-driven position, the milestone
      // rendering must follow the side the date was given on: start-side dates
      // sit at the start of that day, finish-side dates at the end of it.
      if (t.actualStart) {
        es = pos(t.actualStart, 'start');
        drivenByFinish = false;
      } else if (c !== undefined) {
        switch (t.constraintType) {
          case 'MSO': es = c; drivenByFinish = false; break;
          case 'SNET': if (c > es + EPS) { es = c; drivenByFinish = false; } break;
          case 'MFO': es = c - n.dur; drivenByFinish = true; break;
          case 'FNET': if (c - n.dur > es + EPS) { es = c - n.dur; drivenByFinish = true; } break;
          default: break;
        }
      }
    }
    n.es = es;
    n.ef = es + n.dur;
    n.drivenByFinish = drivenByFinish;
  }

  let projectFinish = 0;
  for (const n of nodes.values()) projectFinish = Math.max(projectFinish, n.ef);

  // Backward pass.
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    let lf = projectFinish;
    for (const e of n.out) {
      const toLate = e.toSide === 'S' ? e.to.ls : e.to.lf;
      let v = toLate - e.lag;
      if (e.fromSide === 'S') v += n.dur;
      if (v < lf) lf = v;
    }
    if (n.kind === 'leaf') {
      const t = taskByUid.get(n.uid)!;
      const c = constraintPos(t);
      if (t.actualStart) {
        lf = Math.min(lf, n.ef);
      } else if (c !== undefined) {
        switch (t.constraintType) {
          case 'MSO': lf = n.ef; break;
          case 'MFO': lf = n.ef; break;
          case 'FNLT': lf = Math.min(lf, c); break;
          case 'SNLT': lf = Math.min(lf, c + n.dur); break;
          default: break;
        }
      }
    }
    n.lf = lf;
    n.ls = lf - n.dur;
  }

  // As-late-as-possible tasks sit at their late dates.
  for (const n of nodes.values()) {
    if (n.kind !== 'leaf') continue;
    const t = taskByUid.get(n.uid)!;
    if (t.constraintType === 'ALAP' && !t.actualStart) {
      n.es = n.ls;
      n.ef = n.lf;
    }
  }

  // Assemble results.
  const byUid = new Map<number, Scheduled>();
  const rows: Scheduled[] = [];
  const summaryNodes = (uid: number) => ({ s: nodes.get(`S${uid}`)!, e: nodes.get(`E${uid}`)! });

  // Children first so summaries can aggregate; iterate in reverse row order.
  const tmp = new Map<number, Scheduled>();
  for (let i = tasks.length - 1; i >= 0; i--) {
    const t = tasks[i];
    const info = outline.get(t.uid)!;
    const hasChildren = info.childUids.length > 0;
    let es: number, ef: number, ls: number, lf: number, totalSlack: number, freeSlack: number, critical: boolean;
    let start: string, finish: string;
    if (hasChildren) {
      const { e } = summaryNodes(t.uid);
      const kids = info.childUids.map((c) => tmp.get(c)!);
      es = Math.min(...kids.map((k) => k.es));
      ef = e.ef;
      ls = Math.min(...kids.map((k) => k.ls));
      lf = e.lf;
      totalSlack = Math.min(...kids.map((k) => k.totalSlackDays));
      freeSlack = totalSlack;
      critical = kids.some((k) => k.critical);
      start = cal.startDateTime(es);
      finish = ef > es + EPS ? cal.finishDateTime(ef) : start;
    } else {
      const n = nodes.get(`T${t.uid}`)!;
      es = n.es; ef = n.ef; ls = n.ls; lf = n.lf;
      totalSlack = ls - es;
      freeSlack = totalSlack;
      for (const e of n.out) {
        if (e.to.kind === 'sumEnd') continue;
        const base = e.fromSide === 'S' ? n.es : n.ef;
        const toEarly = e.toSide === 'S' ? e.to.es : e.to.ef;
        freeSlack = Math.min(freeSlack, toEarly - (base + e.lag));
      }
      critical = totalSlack <= EPS;
      if (n.dur <= EPS) {
        // Milestone: show at end of the driving predecessor's day when finish-driven.
        const dt = n.drivenByFinish && Math.abs(es - Math.round(es)) < EPS && es > 0 ? cal.finishDateTime(es) : cal.startDateTime(es);
        start = t.actualStart ?? dt;
        finish = start;
      } else {
        start = t.actualStart ?? cal.startDateTime(es);
        finish = t.actualFinish ?? cal.finishDateTime(ef);
      }
    }
    const sched: Scheduled = {
      uid: t.uid,
      summary: hasChildren,
      es, ef, ls, lf,
      start,
      finish,
      lateStart: cal.startDateTime(ls),
      lateFinish: lf > ls + EPS ? cal.finishDateTime(lf) : cal.startDateTime(lf),
      totalSlackDays: round2(totalSlack),
      freeSlackDays: round2(Math.max(0, freeSlack)),
      critical,
      durationDays: hasChildren ? round2(ef - es) : round2(nodes.get(`T${t.uid}`)!.dur),
      wbs: info.wbs,
      id: i + 1,
      parentUid: info.parentUid,
      level: info.level,
      hidden: info.hidden,
      hasChildren,
    };
    tmp.set(t.uid, sched);
  }
  for (const t of tasks) {
    const s = tmp.get(t.uid)!;
    byUid.set(t.uid, s);
    rows.push(s);
  }

  const projectStartPos = rows.length ? Math.min(0, ...rows.map((r) => r.es)) : 0;
  return {
    byUid,
    rows,
    projectStart: cal.startDateTime(projectStartPos),
    projectFinish: projectFinish > EPS ? cal.finishDateTime(projectFinish) : cal.startDateTime(0),
    durationDays: round2(projectFinish - projectStartPos),
    errors,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Would adding link pred -> succ create a cycle? */
export function wouldCreateCycle(tasks: Task[], predUid: number, succUid: number): boolean {
  if (predUid === succUid) return true;
  const outline = computeOutline(tasks);
  // Ancestors/descendants cannot be linked to each other.
  const isAncestor = (a: number, b: number) => {
    let p = outline.get(b)?.parentUid;
    while (p !== undefined) {
      if (p === a) return true;
      p = outline.get(p)?.parentUid;
    }
    return false;
  };
  if (isAncestor(predUid, succUid) || isAncestor(succUid, predUid)) return true;
  // Walk successors of succ (including outline-propagated ones) looking for pred.
  const succsOf = new Map<number, number[]>();
  for (const t of tasks) {
    for (const l of t.predecessors) {
      if (!succsOf.has(l.predUid)) succsOf.set(l.predUid, []);
      succsOf.get(l.predUid)!.push(t.uid);
    }
  }
  const expand = (uid: number): number[] => {
    // A task's effective successors include successors of its ancestors and of itself;
    // its descendants also inherit.
    const res = new Set<number>();
    const chain: number[] = [uid];
    let p = outline.get(uid)?.parentUid;
    while (p !== undefined) { chain.push(p); p = outline.get(p)?.parentUid; }
    for (const u of chain) for (const s of succsOf.get(u) ?? []) res.add(s);
    // Descendants of uid: their successors also matter (uid finish depends on them? no - they depend on uid start).
    return [...res];
  };
  const seen = new Set<number>();
  const stack = [succUid];
  while (stack.length) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    if (u === predUid || isAncestor(u, predUid) || isAncestor(predUid, u)) return true;
    for (const s of expand(u)) stack.push(s);
    // Descendants of u are also "after" u's start.
    for (const c of outline.get(u)?.childUids ?? []) stack.push(c);
  }
  return false;
}
