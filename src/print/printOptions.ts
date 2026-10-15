import type { ColumnId } from '../components/TaskGrid';

export type PrintView = 'gantt' | 'sheet' | 'lookahead' | 'milestones';
export type Paper = 'letter' | 'legal' | 'tabloid' | 'a4' | 'a3';

export interface PrintOptions {
  view: PrintView;
  paper: Paper;
  orientation: 'landscape' | 'portrait';
  subtitle: string;
  columns: ColumnId[];
  /** Share of the page width given to the Gantt chart (0.4–0.85). */
  chartShare: number;
  showLinks: boolean;
  showLabels: boolean;
  showBaseline: boolean;
  criticalOnly: boolean;
  collapsedOnly: boolean;
  weeks: number;
  includeWeekends: boolean;
  includeComplete: boolean;
  legend: boolean;
  notes: string;
  rangeFrom?: string;
  rangeTo?: string;
  fontScale: number;
}

export const DEFAULT_PRINT: PrintOptions = {
  view: 'gantt',
  paper: 'letter',
  orientation: 'landscape',
  subtitle: '',
  columns: ['id', 'name', 'dur', 'start', 'finish'],
  chartShare: 0.6,
  showLinks: true,
  showLabels: false,
  showBaseline: false,
  criticalOnly: false,
  collapsedOnly: false,
  weeks: 3,
  includeWeekends: false,
  includeComplete: false,
  legend: true,
  notes: '',
  fontScale: 1,
};

/** CSS page size and usable content width in CSS px at 96 dpi. */
export function pageMetrics(paper: Paper, orientation: PrintOptions['orientation']) {
  const sizes: Record<Paper, [number, number]> = {
    letter: [8.5, 11],
    legal: [8.5, 14],
    tabloid: [11, 17],
    a4: [8.27, 11.69],
    a3: [11.69, 16.54],
  };
  const [sw, sh] = sizes[paper];
  const [w, h] = orientation === 'landscape' ? [sh, sw] : [sw, sh];
  const marginX = 0.45;
  const marginTop = 0.4;
  const marginBottom = 0.55;
  return {
    cssSize: `${w}in ${h}in`,
    margin: `${marginTop}in ${marginX}in ${marginBottom}in`,
    contentWidth: Math.floor((w - marginX * 2) * 96),
    contentHeight: Math.floor((h - marginTop - marginBottom) * 96),
  };
}
