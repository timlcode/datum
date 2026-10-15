// Core data model shared by the client, the server, and the file format layer.
// Dates are local-time ISO strings without a timezone ("2026-09-17T08:00"),
// matching how Microsoft Project stores them.

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export type ConstraintType =
  | 'ASAP' // As Soon As Possible
  | 'ALAP' // As Late As Possible
  | 'MSO' // Must Start On
  | 'MFO' // Must Finish On
  | 'SNET' // Start No Earlier Than
  | 'SNLT' // Start No Later Than
  | 'FNET' // Finish No Earlier Than
  | 'FNLT'; // Finish No Later Than

export interface Link {
  /** Unique id of the predecessor task. */
  predUid: number;
  type: LinkType;
  /** Lag in working days; negative values are leads. */
  lagDays: number;
}

export interface Task {
  uid: number;
  name: string;
  /** 1 = top level. Summary/leaf status is derived from the outline. */
  outlineLevel: number;
  /** Duration in working days (0 = milestone by default). */
  durationDays: number;
  milestone: boolean;
  constraintType: ConstraintType;
  constraintDate?: string;
  predecessors: Link[];
  percentComplete: number;
  /** Free-text responsible party / trade (maps to Resource Names). */
  resourceNames: string;
  notes: string;
  /** Collapsed summaries hide their descendants in the grid. */
  expanded: boolean;
  /** Actual dates lock the computed schedule. */
  actualStart?: string;
  actualFinish?: string;
  baselineStart?: string;
  baselineFinish?: string;
  baselineDurationDays?: number;
  /** Hex color override for the Gantt bar. */
  color?: string;
}

export interface CalendarException {
  /** YYYY-MM-DD */
  date: string;
  working: boolean;
  name?: string;
}

export interface Calendar {
  name: string;
  /** Sunday..Saturday */
  workWeek: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  hoursPerDay: number;
  exceptions: CalendarException[];
}

export interface Project {
  name: string;
  /** Project start, local ISO date-time. */
  startDate: string;
  /** Status date used by look-ahead and progress lines (YYYY-MM-DD). */
  statusDate?: string;
  company?: string;
  author?: string;
  manager?: string;
  calendar: Calendar;
  tasks: Task[];
  /** Next uid to assign; always greater than every task uid. */
  nextUid: number;
  /** Source file path, if any. */
  filePath?: string;
  /** Free-form notes / description. */
  notes?: string;
  /** Decision-log cards. Omitted on older files; treat missing as empty. */
  decisions?: BoardCard[];
  /** Subcontractor buyout cards. */
  buyout?: BoardCard[];
  /** Buyout budget target, in project currency. */
  buyoutTarget?: number;
}

export type CardPriority = 'low' | 'normal' | 'high';

export interface BoardCard {
  id: string;
  column: string;
  title: string;
  priority: CardPriority;
  description: string;
  owner: string;
  /** YYYY-MM-DD */
  dueDate?: string;
  tags: string[];
  budgetConcept?: number;
  budgetProposal?: number;
}

/** Computed schedule results for one task. Positions are in working days from project start. */
export interface Scheduled {
  uid: number;
  summary: boolean;
  /** Working-day positions (fractional days allowed). */
  es: number;
  ef: number;
  ls: number;
  lf: number;
  /** Local ISO strings. */
  start: string;
  finish: string;
  lateStart: string;
  lateFinish: string;
  totalSlackDays: number;
  freeSlackDays: number;
  critical: boolean;
  /** Working days (summary durations are computed from children). */
  durationDays: number;
  /** Derived outline number, e.g. "2.3.1". */
  wbs: string;
  /** Row id (1-based position in the task list). */
  id: number;
  /** Uid of the parent summary, if any. */
  parentUid?: number;
  /** Nesting depth for indentation. */
  level: number;
  /** True when hidden by a collapsed ancestor. */
  hidden: boolean;
  hasChildren: boolean;
}

export interface ScheduleResult {
  byUid: Map<number, Scheduled>;
  rows: Scheduled[];
  projectStart: string;
  projectFinish: string;
  /** Working days between project start and finish. */
  durationDays: number;
  errors: ScheduleError[];
}

export interface ScheduleError {
  code: 'cycle' | 'missing_pred' | 'self_link';
  message: string;
  uids: number[];
}
