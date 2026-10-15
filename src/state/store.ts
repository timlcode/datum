import { create } from 'zustand';
import type { BoardCard, Link, Project, ScheduleResult, Task } from '@engine/types';
import { computeSchedule, wouldCreateCycle } from '@engine/schedule';
import { cloneProject, newProject, newTask } from '@engine/project';
import { normalizeLevels, subtreeRange } from '@engine/outline';
import { newCardId, normalizeProject } from '@engine/boards';

export type ViewName = 'gantt' | 'sheet' | 'lookahead' | 'milestones' | 'pulse' | 'decisions' | 'buyout';
export type BoardName = 'decisions' | 'buyout';
export type Zoom = 'day' | 'week' | 'month' | 'quarter';
export type Filter = 'all' | 'critical' | 'milestones' | 'incomplete' | 'summary';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export type DialogName =
  | null
  | 'open'
  | 'saveAs'
  | 'ai-build'
  | 'ai-edit'
  | 'print'
  | 'settings'
  | 'about'
  | 'shortcuts';

interface State {
  project: Project | null;
  schedule: ScheduleResult | null;
  dirty: boolean;
  past: Project[];
  future: Project[];
  selection: number[];
  activeUid: number | null;
  view: ViewName;
  zoom: Zoom;
  filter: Filter;
  search: string;
  showBaseline: boolean;
  showLinks: boolean;
  showLabels: boolean;
  detailsOpen: boolean;
  sidePanel: null | 'health' | 'review';
  dialog: DialogName;
  toasts: Toast[];
  splitPx: number;
  busy: string | null;
  /** Uid of a just-inserted task whose first name edit should merge into the insert's undo step. */
  coalesceUid: number | null;
  /** Increments whenever a different project is loaded; views use it to reset scroll state. */
  projectSeq: number;

  setProject: (p: Project | null, opts?: { keepHistory?: boolean; dirty?: boolean }) => void;
  update: (mutate: (draft: Project) => void | false, opts?: { silent?: boolean; coalesceUid?: number }) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (path: string) => void;
  setView: (v: ViewName) => void;
  setZoom: (z: Zoom) => void;
  setFilter: (f: Filter) => void;
  setSearch: (s: string) => void;
  select: (uids: number[], active?: number | null) => void;
  toggleFlag: (key: 'showBaseline' | 'showLinks' | 'showLabels' | 'detailsOpen') => void;
  setSidePanel: (p: State['sidePanel']) => void;
  openDialog: (d: DialogName) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setSplit: (px: number) => void;
  setBusy: (b: string | null) => void;

  // Task operations (all go through update()).
  insertTask: (opts?: { afterUid?: number | null; name?: string; asChild?: boolean }) => number | null;
  deleteTasks: (uids: number[]) => void;
  indent: (uids: number[]) => void;
  outdent: (uids: number[]) => void;
  moveTasks: (uids: number[], dir: -1 | 1) => void;
  toggleExpand: (uid: number) => void;
  expandAll: (expanded: boolean) => void;
  setTaskField: <K extends keyof Task>(uid: number, key: K, value: Task[K]) => void;
  patchTask: (uid: number, patch: Partial<Task>) => void;
  setPredecessors: (uid: number, links: Link[]) => string | null;
  linkSelected: () => void;
  unlinkSelected: () => void;
  addLink: (predUid: number, succUid: number, type?: Link['type'], lagDays?: number) => string | null;
  toggleMilestone: (uids: number[]) => void;
  setBaseline: () => void;
  clearBaseline: () => void;
  addCard: (board: BoardName, partial: Partial<BoardCard>) => void;
  patchCard: (board: BoardName, id: string, patch: Partial<BoardCard>) => void;
  moveCard: (board: BoardName, id: string, column: string) => void;
  removeCard: (board: BoardName, id: string) => void;
  setBuyoutTarget: (n: number | undefined) => void;
}

const HISTORY_LIMIT = 200;
let toastSeq = 1;
const AUTOSAVE_KEY = 'datum.autosave';
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleOf(p: Project | null): ScheduleResult | null {
  return p ? computeSchedule(p) : null;
}

function persist(p: Project | null, dirty: boolean) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      if (p && dirty) localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt: Date.now(), project: p }));
      else localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* storage full or unavailable */
    }
  }, 400);
}

export function readAutosave(): { savedAt: number; project: Project } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as { savedAt: number; project: Project }) : null;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}

export const useStore = create<State>((set, get) => ({
  project: null,
  schedule: null,
  dirty: false,
  past: [],
  future: [],
  selection: [],
  activeUid: null,
  view: 'gantt',
  zoom: 'week',
  filter: 'all',
  search: '',
  showBaseline: false,
  showLinks: true,
  showLabels: true,
  detailsOpen: false,
  sidePanel: null,
  dialog: null,
  toasts: [],
  splitPx: 780,
  busy: null,
  coalesceUid: null,
  projectSeq: 0,

  setProject: (p, opts = {}) => {
    const project = p ? normalizeProject(p) : null;
    const dirty = opts.dirty ?? false;
    set({
      project,
      schedule: scheduleOf(project),
      dirty,
      projectSeq: get().projectSeq + 1,
      past: opts.keepHistory ? get().past : [],
      future: opts.keepHistory ? get().future : [],
      selection: [],
      activeUid: null,
      sidePanel: null,
    });
    persist(project, dirty);
  },

  update: (mutate, opts = {}) => {
    const cur = get().project;
    if (!cur) return;
    const draft = cloneProject(cur);
    const result = mutate(draft);
    if (result === false) return;
    draft.tasks = normalizeLevels(draft.tasks);
    const merge = opts.silent || (opts.coalesceUid !== undefined && opts.coalesceUid === get().coalesceUid);
    const past = merge ? get().past : [...get().past, cur].slice(-HISTORY_LIMIT);
    set({ project: draft, schedule: scheduleOf(draft), dirty: true, past, future: merge ? get().future : [], coalesceUid: null });
    persist(draft, true);
  },

  undo: () => {
    const { past, project } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, schedule: scheduleOf(prev), dirty: true, past: past.slice(0, -1), future: [project, ...get().future] });
    persist(prev, true);
  },

  redo: () => {
    const { future, project } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({ project: next, schedule: scheduleOf(next), dirty: true, past: [...get().past, project], future: future.slice(1) });
    persist(next, true);
  },

  markSaved: (path) => {
    const p = get().project;
    if (!p) return;
    const np = { ...p, filePath: path };
    set({ project: np, dirty: false });
    persist(np, false);
  },

  setView: (view) => set({ view }),
  setZoom: (zoom) => set({ zoom }),
  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  select: (uids, active) => set({ selection: uids, activeUid: active === undefined ? (uids[uids.length - 1] ?? null) : active }),
  toggleFlag: (key) => set({ [key]: !get()[key] } as Partial<State>),
  setSidePanel: (sidePanel) => set({ sidePanel }),
  openDialog: (dialog) => set({ dialog }),
  toast: (text, kind = 'info') => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setSplit: (splitPx) => set({ splitPx }),
  setBusy: (busy) => set({ busy }),

  insertTask: (opts = {}) => {
    const p = get().project;
    if (!p) return null;
    let created: number | null = null;
    get().update((d) => {
      const uid = d.nextUid++;
      const afterUid = opts.afterUid === undefined ? get().activeUid : opts.afterUid;
      let index = afterUid === null || afterUid === undefined ? d.tasks.length : d.tasks.findIndex((t) => t.uid === afterUid);
      let level = 1;
      let linkPrev = false;
      if (index >= 0 && index < d.tasks.length && afterUid !== null && afterUid !== undefined) {
        const ref = d.tasks[index];
        const refIsSummary = isSummaryIn(d.tasks, index);
        if (opts.asChild || (refIsSummary && ref.expanded)) {
          // First child of the summary.
          level = ref.outlineLevel + 1;
          index = index + 1;
        } else if (refIsSummary) {
          // Sibling after the collapsed summary's whole block.
          const [, end] = subtreeRange(d.tasks, index);
          level = ref.outlineLevel;
          index = end;
        } else {
          level = ref.outlineLevel;
          index = index + 1;
          linkPrev = true;
        }
      } else {
        index = d.tasks.length;
        const prev = d.tasks[index - 1];
        if (prev) {
          level = prev.outlineLevel;
          linkPrev = !isSummaryIn(d.tasks, index - 1);
        }
      }
      const prev = d.tasks[index - 1];
      const task = newTask(uid, {
        name: opts.name ?? '',
        outlineLevel: level,
        durationDays: 1,
        // New rows follow the row above by default so the schedule stays linked.
        predecessors: linkPrev && prev ? [{ predUid: prev.uid, type: 'FS', lagDays: 0 }] : [],
      });
      d.tasks.splice(index, 0, task);
      created = uid;
    });
    if (created !== null) set({ selection: [created], activeUid: created, coalesceUid: created });
    return created;
  },

  deleteTasks: (uids) => {
    if (!uids.length) return;
    get().update((d) => {
      const remove = new Set<number>();
      for (const uid of uids) {
        const i = d.tasks.findIndex((t) => t.uid === uid);
        if (i < 0) continue;
        const [s, e] = subtreeRange(d.tasks, i);
        for (let k = s; k < e; k++) remove.add(d.tasks[k].uid);
      }
      d.tasks = d.tasks.filter((t) => !remove.has(t.uid));
      for (const t of d.tasks) t.predecessors = t.predecessors.filter((l) => !remove.has(l.predUid));
    });
    set({ selection: [], activeUid: null });
  },

  indent: (uids) => {
    get().update((d) => {
      const idxs = uids.map((u) => d.tasks.findIndex((t) => t.uid === u)).filter((i) => i > 0).sort((a, b) => a - b);
      if (!idxs.length) return false;
      const done = new Set<number>();
      for (const i of idxs) {
        if (done.has(i)) continue;
        const [s, e] = subtreeRange(d.tasks, i);
        const prev = d.tasks[i - 1];
        if (d.tasks[i].outlineLevel > prev.outlineLevel) continue;
        for (let k = s; k < e; k++) {
          d.tasks[k].outlineLevel++;
          done.add(k);
        }
        // A task that becomes a summary loses its own duration semantics; keep links but ensure parent expanded.
        prev.expanded = true;
      }
    });
  },

  outdent: (uids) => {
    get().update((d) => {
      const idxs = uids.map((u) => d.tasks.findIndex((t) => t.uid === u)).filter((i) => i >= 0).sort((a, b) => b - a);
      if (!idxs.length) return false;
      let changed = false;
      for (const i of idxs) {
        if (d.tasks[i].outlineLevel <= 1) continue;
        const [s, e] = subtreeRange(d.tasks, i);
        const level = d.tasks[i].outlineLevel;
        for (let k = s; k < e; k++) d.tasks[k].outlineLevel--;
        // Following siblings at the old level become children of the outdented task (Project behavior).
        for (let k = e; k < d.tasks.length && d.tasks[k].outlineLevel >= level; k++) {
          /* they stay as-is; they now nest under the outdented task */
        }
        changed = true;
      }
      return changed ? undefined : false;
    });
  },

  moveTasks: (uids, dir) => {
    get().update((d) => {
      const uid = uids[0];
      const i = d.tasks.findIndex((t) => t.uid === uid);
      if (i < 0) return false;
      const [s, e] = subtreeRange(d.tasks, i);
      const block = d.tasks.slice(s, e);
      const level = d.tasks[i].outlineLevel;
      if (dir === -1) {
        // Find previous sibling block start.
        let j = s - 1;
        if (j < 0) return false;
        if (d.tasks[j].outlineLevel < level) return false;
        while (j > 0 && d.tasks[j].outlineLevel > level) j--;
        if (d.tasks[j].outlineLevel !== level) return false;
        d.tasks.splice(s, e - s);
        d.tasks.splice(j, 0, ...block);
      } else {
        if (e >= d.tasks.length) return false;
        if (d.tasks[e].outlineLevel < level) return false;
        const [, e2] = subtreeRange(d.tasks, e);
        d.tasks.splice(s, e - s);
        d.tasks.splice(e2 - (e - s), 0, ...block);
      }
    });
  },

  toggleExpand: (uid) => {
    get().update((d) => {
      const t = d.tasks.find((x) => x.uid === uid);
      if (!t) return false;
      t.expanded = !t.expanded;
    }, { silent: true });
  },

  expandAll: (expanded) => {
    get().update((d) => {
      for (const t of d.tasks) t.expanded = expanded;
    }, { silent: true });
  },

  setTaskField: (uid, key, value) => {
    get().update((d) => {
      const t = d.tasks.find((x) => x.uid === uid);
      if (!t || t[key] === value) return false;
      t[key] = value;
      if (key === 'durationDays') {
        const n = Number(value);
        if (n > 0 && t.milestone) t.milestone = false;
        if (n === 0 && !t.milestone) t.milestone = true;
      }
      if (key === 'milestone' && value === true) t.durationDays = 0;
    }, { coalesceUid: key === 'name' ? uid : undefined });
  },

  patchTask: (uid, patch) => {
    get().update((d) => {
      const t = d.tasks.find((x) => x.uid === uid);
      if (!t) return false;
      Object.assign(t, patch);
    });
  },

  setPredecessors: (uid, links) => {
    const p = get().project;
    if (!p) return 'No project';
    for (const l of links) {
      const trial = p.tasks.map((t) => (t.uid === uid ? { ...t, predecessors: t.predecessors.filter((x) => x.predUid !== l.predUid) } : t));
      if (wouldCreateCycle(trial, l.predUid, uid)) {
        const pred = p.tasks.find((t) => t.uid === l.predUid);
        return `Linking to "${pred?.name ?? l.predUid}" would create a circular dependency.`;
      }
    }
    get().update((d) => {
      const t = d.tasks.find((x) => x.uid === uid);
      if (!t) return false;
      t.predecessors = links;
    });
    return null;
  },

  addLink: (predUid, succUid, type = 'FS', lagDays = 0) => {
    const p = get().project;
    if (!p) return 'No project';
    if (predUid === succUid) return 'A task cannot link to itself.';
    if (wouldCreateCycle(p.tasks, predUid, succUid)) return 'That link would create a circular dependency.';
    get().update((d) => {
      const t = d.tasks.find((x) => x.uid === succUid);
      if (!t) return false;
      if (t.predecessors.some((l) => l.predUid === predUid)) return false;
      t.predecessors.push({ predUid, type, lagDays });
    });
    return null;
  },

  linkSelected: () => {
    const { selection, project } = get();
    if (!project || selection.length < 2) return;
    const ordered = project.tasks.filter((t) => selection.includes(t.uid)).map((t) => t.uid);
    for (let i = 1; i < ordered.length; i++) {
      const err = get().addLink(ordered[i - 1], ordered[i]);
      if (err) get().toast(err, 'error');
    }
  },

  unlinkSelected: () => {
    const { selection, project } = get();
    if (!project || !selection.length) return;
    const sel = new Set(selection);
    get().update((d) => {
      for (const t of d.tasks) {
        if (sel.has(t.uid)) {
          t.predecessors = selection.length === 1 ? [] : t.predecessors.filter((l) => !sel.has(l.predUid));
        }
      }
    });
  },

  toggleMilestone: (uids) => {
    get().update((d) => {
      for (const uid of uids) {
        const t = d.tasks.find((x) => x.uid === uid);
        if (!t) continue;
        t.milestone = !t.milestone;
        if (t.milestone) t.durationDays = 0;
        else if (t.durationDays === 0) t.durationDays = 1;
      }
    });
  },

  setBaseline: () => {
    const s = get().schedule;
    if (!s) return;
    get().update((d) => {
      for (const t of d.tasks) {
        const r = s.byUid.get(t.uid);
        if (!r) continue;
        t.baselineStart = r.start;
        t.baselineFinish = r.finish;
        t.baselineDurationDays = r.durationDays;
      }
    });
    set({ showBaseline: true });
  },

  clearBaseline: () => {
    get().update((d) => {
      for (const t of d.tasks) {
        delete t.baselineStart;
        delete t.baselineFinish;
        delete t.baselineDurationDays;
      }
    });
    set({ showBaseline: false });
  },

  addCard: (board, partial) => {
    get().update((d) => {
      normalizeProject(d);
      const card: BoardCard = {
        id: partial.id || newCardId(),
        column: partial.column || (board === 'decisions' ? 'Pending Decision' : 'Scope Defined'),
        title: (partial.title ?? '').trim() || 'Untitled',
        priority: partial.priority ?? 'normal',
        description: partial.description ?? '',
        owner: partial.owner ?? '',
        dueDate: partial.dueDate || undefined,
        tags: partial.tags ?? [],
        budgetConcept: partial.budgetConcept,
        budgetProposal: partial.budgetProposal,
      };
      d[board]!.push(card);
    });
  },

  patchCard: (board, id, patch) => {
    get().update((d) => {
      normalizeProject(d);
      const card = d[board]!.find((c) => c.id === id);
      if (!card) return false;
      Object.assign(card, patch);
      if (patch.title !== undefined) card.title = patch.title.trim() || 'Untitled';
      if (patch.dueDate === '') card.dueDate = undefined;
    });
  },

  moveCard: (board, id, column) => {
    get().update((d) => {
      normalizeProject(d);
      const card = d[board]!.find((c) => c.id === id);
      if (!card || card.column === column) return false;
      card.column = column;
    });
  },

  removeCard: (board, id) => {
    get().update((d) => {
      normalizeProject(d);
      d[board] = d[board]!.filter((c) => c.id !== id);
    });
  },

  setBuyoutTarget: (n) => {
    get().update((d) => {
      d.buyoutTarget = n !== undefined && Number.isFinite(n) ? n : undefined;
    });
  },
}));

function isSummaryIn(tasks: Task[], index: number): boolean {
  return index + 1 < tasks.length && tasks[index + 1].outlineLevel > tasks[index].outlineLevel;
}

export function blankProject(name?: string): Project {
  const p = newProject(name);
  p.tasks = [
    newTask(1, { name: 'Notice to Proceed', milestone: true, durationDays: 0 }),
    newTask(2, { name: 'New task', durationDays: 5, predecessors: [{ predUid: 1, type: 'FS', lagDays: 0 }] }),
  ];
  p.nextUid = 3;
  return p;
}
