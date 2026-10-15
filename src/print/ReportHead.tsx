import type { Project, ScheduleResult } from '@engine/types';
import type { PrintOptions } from './printOptions';
import { fmtMedium, todayLocal } from '@engine/dates';

export function ReportHead({ project, schedule, options, kind }: { project: Project; schedule: ScheduleResult; options: PrintOptions; kind: string }) {
  const legend = options.legend && (options.view === 'gantt' || options.view === 'lookahead');
  return (
    <div className="rep-head">
      <div className="band">
        <svg className="logo" viewBox="0 0 64 64" fill="none" aria-hidden>
          <rect x="2" y="2" width="60" height="60" rx="15" fill="#e8890c" />
          <path d="M14 22h36" stroke="#14110a" strokeWidth="5" strokeLinecap="round" />
          <path d="M32 22L46 48H18L32 22z" fill="#14110a" />
          <path d="M32 30v12" stroke="#e8890c" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
        <div>
          <h1>{project.name}</h1>
          <div className="sub">{options.subtitle || kind}{project.company ? ` · ${project.company}` : ''}</div>
        </div>
        <div className="meta">
          <div>Start <b>{fmtMedium(schedule.projectStart)}</b> · Finish <b>{fmtMedium(schedule.projectFinish)}</b> · {schedule.durationDays} working days</div>
          <div>Status date {fmtMedium(project.statusDate ?? todayLocal())} · Printed {fmtMedium(todayLocal())}</div>
        </div>
      </div>
      {legend && (
        <div className="legend">
          <span><i className="sw" style={{ background: 'var(--p-task)' }} />Task</span>
          <span><i className="sw" style={{ background: 'var(--p-critical)' }} />Critical</span>
          <span><i className="sw" style={{ background: 'var(--p-done)' }} />Complete</span>
          {options.view === 'gantt' && <span><i className="sw sum" style={{ background: 'var(--p-summary)' }} />Summary</span>}
          <span><i className="sw ms" style={{ background: 'var(--p-milestone)' }} />Milestone</span>
          {options.view === 'gantt' && options.showBaseline && <span><i className="sw bl" />Baseline</span>}
          <span><i className="sw" style={{ background: 'transparent', borderTop: '1.5px dashed var(--p-accent)', height: 0 }} />Status date</span>
        </div>
      )}
    </div>
  );
}
