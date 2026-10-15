import type { Task } from './types';

export interface OutlineInfo {
  uid: number;
  index: number;
  level: number;
  parentUid?: number;
  childUids: number[];
  wbs: string;
  hidden: boolean;
}

/** Derive parent/child structure, WBS numbers and visibility from outline levels. */
export function computeOutline(tasks: Task[]): Map<number, OutlineInfo> {
  const out = new Map<number, OutlineInfo>();
  const stack: { uid: number; level: number; counter: number; hidden: boolean; expanded: boolean; wbs: string }[] = [];
  let topCounter = 0;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const level = Math.max(1, t.outlineLevel);
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : undefined;
    let wbs: string;
    if (parent) {
      parent.counter++;
      wbs = `${parent.wbs}.${parent.counter}`;
    } else {
      topCounter++;
      wbs = String(topCounter);
    }
    const hidden = parent ? parent.hidden || !parent.expanded : false;
    const info: OutlineInfo = {
      uid: t.uid,
      index: i,
      level: parent ? parent.level + 1 : 1,
      parentUid: parent?.uid,
      childUids: [],
      wbs,
      hidden,
    };
    out.set(t.uid, info);
    if (parent) out.get(parent.uid)!.childUids.push(t.uid);
    stack.push({ uid: t.uid, level, counter: 0, hidden, expanded: t.expanded, wbs });
  }
  return out;
}

/** Normalize outline levels so no task is more than one level deeper than its predecessor row. */
export function normalizeLevels(tasks: Task[]): Task[] {
  let prev = 0;
  return tasks.map((t) => {
    const level = Math.max(1, Math.min(t.outlineLevel, prev + 1));
    prev = level;
    return level === t.outlineLevel ? t : { ...t, outlineLevel: level };
  });
}

/** Index range [start, end) of a task and all of its descendants. */
export function subtreeRange(tasks: Task[], index: number): [number, number] {
  const level = tasks[index].outlineLevel;
  let end = index + 1;
  while (end < tasks.length && tasks[end].outlineLevel > level) end++;
  return [index, end];
}

export function isSummaryAt(tasks: Task[], index: number): boolean {
  return index + 1 < tasks.length && tasks[index + 1].outlineLevel > tasks[index].outlineLevel;
}
