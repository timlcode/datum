import { useMemo } from 'react';
import { useStore } from '../state/store';
import { buyoutSummary, horizonMilestones, money, nextThirty, openDecisions, overdueDecisions, overdueMilestones } from '@engine/boards';
import { fmtShort, todayLocal } from '@engine/dates';

export function PulseView() {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const today = project.statusDate || todayLocal();
  const items = useMemo(() => horizonMilestones(project, schedule, today), [project, schedule, today]);
  const soon = nextThirty(items, today);
  const lateMs = overdueMilestones(items, today);
  const decisions = project.decisions ?? [];
  const lateDec = overdueDecisions(decisions, today);
  const open = openDecisions(decisions);
  const critical = schedule.rows.filter((r) => r.critical && !r.summary && !r.hidden).length;
  const buy = buyoutSummary(project.buyout ?? [], project.buyoutTarget);
  const finish = schedule.projectFinish?.slice(0, 10);

  return (
    <div className="pulse">
      <div className="pulse-head">
        <div>
          <h2>Pulse</h2>
          <p>Status date {fmtShort(today)}. The next month, what is already late, and whether buyout is telling the truth.</p>
        </div>
      </div>
      <div className="pulse-stats">
        <button onClick={() => setView('milestones')}><b>{soon.length}</b><span>Milestones in 30 days</span></button>
        <button onClick={() => setView('milestones')} className={lateMs.length ? 'hot' : ''}><b>{lateMs.length}</b><span>Milestones overdue</span></button>
        <button onClick={() => setView('decisions')}><b>{open.length}</b><span>Open decisions</span></button>
        <button onClick={() => setView('decisions')} className={lateDec.length ? 'hot' : ''}><b>{lateDec.length}</b><span>Decisions overdue</span></button>
        <button onClick={() => setView('gantt')}><b>{critical}</b><span>Critical tasks</span></button>
        <button onClick={() => setView('buyout')} className={buy.gap !== undefined && buy.gap < 0 ? 'hot' : ''}>
          <b>{buy.gap === undefined ? '—' : money(buy.gap)}</b>
          <span>Buyout gap</span>
        </button>
      </div>
      <div className="pulse-grid">
        <section>
          <header>Coming up <button onClick={() => setView('milestones')}>Milestones</button></header>
          {soon.length === 0 ? <p className="quiet">No milestones land in the next 30 days.</p> : (
            <ul>
              {soon.map((m) => (
                <li key={m.uid}>
                  <button onClick={() => { select([m.uid], m.uid); setView('gantt'); }}>
                    <i className={`status-dot ${m.tone}`} />
                    <span className="nm">{m.name}</span>
                    <span className="meta">{m.phase}</span>
                    <span className="dt">{fmtShort(m.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <header>Overdue <button onClick={() => setView('decisions')}>Decisions</button></header>
          {lateMs.length + lateDec.length === 0 ? <p className="quiet">Nothing is late. Write that down; it is rare.</p> : (
            <ul>
              {lateMs.map((m) => (
                <li key={`m${m.uid}`}>
                  <button onClick={() => { select([m.uid], m.uid); setView('gantt'); }}>
                    <i className="status-dot at-risk" />
                    <span className="nm">{m.name}</span>
                    <span className="meta">Milestone</span>
                    <span className="dt">{fmtShort(m.date)}</span>
                  </button>
                </li>
              ))}
              {lateDec.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setView('decisions')}>
                    <i className="status-dot at-risk" />
                    <span className="nm">{c.title}</span>
                    <span className="meta">{c.owner || c.column}</span>
                    <span className="dt">{c.dueDate ? fmtShort(c.dueDate) : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="wide">
          <header>Buyout <button onClick={() => setView('buyout')}>Open the board</button></header>
          <div className="buy-line">
            <span>Target <b>{money(buy.target)}</b></span>
            <span>Proposals <b>{money(buy.proposal)}</b></span>
            <span>Awarded <b>{money(buy.awarded)}</b></span>
            <span>Finish <b>{finish ? fmtShort(finish) : '—'}</b></span>
          </div>
          {(project.buyout ?? []).length === 0 && <p className="quiet">No packages yet. The pipeline is a blank sheet of paper.</p>}
        </section>
      </div>
    </div>
  );
}
