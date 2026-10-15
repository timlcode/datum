import { useEffect, useMemo, useState } from 'react';
import type { Project } from '@engine/types';
import { computeSchedule } from '@engine/schedule';
import { DEFAULT_PRINT, pageMetrics, type PrintOptions } from './printOptions';
import { GanttPrint } from './GanttPrint';
import { SheetPrint } from './SheetPrint';
import { LookAheadPrint } from './LookAheadPrint';
import { MilestonesPrint } from './MilestonesPrint';
import { ReportHead } from './ReportHead';

export function PrintPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const auto = params.get('auto') === '1';
  const [data, setData] = useState<{ project: Project; options: PrintOptions } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing print job.');
      return;
    }
    fetch(`/api/print/job/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Print job not found');
        setData({ project: j.project, options: { ...DEFAULT_PRINT, ...(j.options || {}) } });
      })
      .catch((e) => setError((e as Error).message));
  }, [token]);

  useEffect(() => {
    if (data && auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [data, auto]);

  const schedule = useMemo(() => (data ? computeSchedule(data.project) : null), [data]);

  if (error) return <div className="print-root" style={{ padding: 40 }}>{error}</div>;
  if (!data || !schedule) return <div className="print-root" style={{ padding: 40 }}>Preparing…</div>;

  const { project, options } = data;
  const metrics = pageMetrics(options.paper, options.orientation);
  const css = `@page { size: ${metrics.cssSize}; margin: ${metrics.margin}; @bottom-left { content: "${(project.name || '').replace(/"/g, '\\"')} · Datum"; font-family: Inter, sans-serif; font-size: 8px; color: #8a93a3; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Inter, sans-serif; font-size: 8px; color: #8a93a3; } }`;

  return (
    <div className="print-root" style={{ fontSize: `${10.5 * options.fontScale}px` }}>
      <style>{css}</style>
      <div className="print-screen-bar">
        <span>Print preview · {options.paper} {options.orientation}</span>
        <button onClick={() => window.print()}>Print / Save as PDF…</button>
        <button className="ghost" onClick={() => window.close()}>Close</button>
      </div>
      <div className="print-page" style={{ width: metrics.contentWidth + (window.matchMedia('print').matches ? 0 : 2 * 0.45 * 96) }}>
        <div style={{ width: metrics.contentWidth }}>
          {options.view === 'gantt' && <GanttPrint project={project} schedule={schedule} options={options} width={metrics.contentWidth} head={<ReportHead project={project} schedule={schedule} options={options} kind="Gantt Chart" />} />}
          {options.view === 'sheet' && <SheetPrint project={project} schedule={schedule} options={options} width={metrics.contentWidth} head={<ReportHead project={project} schedule={schedule} options={options} kind="Task Sheet" />} />}
          {options.view === 'lookahead' && <LookAheadPrint project={project} schedule={schedule} options={options} width={metrics.contentWidth} head={<ReportHead project={project} schedule={schedule} options={options} kind={`${options.weeks}-Week Look-Ahead`} />} />}
          {options.view === 'milestones' && <MilestonesPrint project={project} schedule={schedule} options={options} width={metrics.contentWidth} head={<ReportHead project={project} schedule={schedule} options={options} kind="Milestone Report" />} />}
          {options.notes && <div className="rep-notes">{options.notes}</div>}
        </div>
      </div>
    </div>
  );
}
