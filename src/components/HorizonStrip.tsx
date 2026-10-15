import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../state/store';
import { horizonMilestones, nextThirty, overdueDecisions, overdueMilestones, openDecisions } from '@engine/boards';
import { todayLocal, fmtShort } from '@engine/dates';

const COLLAPSE_KEY = 'datum.horizon.collapsed';

export function HorizonStrip() {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const today = project.statusDate || todayLocal();
  const items = useMemo(() => horizonMilestones(project, schedule, today), [project, schedule, today]);
  const soon = nextThirty(items, today);
  const lateMs = overdueMilestones(items, today);
  const lateDec = overdueDecisions(project.decisions ?? [], today);
  const open = openDecisions(project.decisions ?? []).length;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  };

  const jumpMilestone = (uid: number) => {
    select([uid], uid);
    setView('gantt');
  };

  return (
    <div className={`horizon ${collapsed ? 'collapsed' : ''}`}>
      <button className="horizon-toggle" onClick={toggle} title={collapsed ? 'Show the next 30 days' : 'Hide the horizon strip'}>
        {collapsed ? <ChevronRight /> : <ChevronDown />}
      </button>
      {collapsed ? (
        <button className="horizon-summary" onClick={toggle}>
          <b>{soon.length}</b> in 30 days
          <span className={lateMs.length + lateDec.length ? 'hot' : ''}>{lateMs.length + lateDec.length} overdue</span>
          <span>{open} open decision{open === 1 ? '' : 's'}</span>
        </button>
      ) : (
        <div className="horizon-body">
          <section>
            <header>Next 30 days</header>
            <div className="chips">
              {soon.length === 0 && <span className="quiet">Clear horizon. Enjoy it; it will not last.</span>}
              {soon.map((m) => (
                <button key={m.uid} className={`chip ${m.tone}`} onClick={() => jumpMilestone(m.uid)} title={m.phase || m.name}>
                  <i className={`status-dot ${m.tone}`} />
                  <span className="nm">{m.name}</span>
                  <span className="dt">{fmtShort(m.date)}</span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <header>Overdue</header>
            <div className="chips">
              {lateMs.length + lateDec.length === 0 && <span className="quiet">Nothing past due.</span>}
              {lateMs.map((m) => (
                <button key={m.uid} className="chip at-risk" onClick={() => jumpMilestone(m.uid)}>
                  <i className="status-dot at-risk" />
                  <span className="nm">{m.name}</span>
                  <span className="dt">{fmtShort(m.date)}</span>
                </button>
              ))}
              {lateDec.map((c) => (
                <button key={c.id} className="chip at-risk" onClick={() => setView('decisions')}>
                  <i className="status-dot at-risk" />
                  <span className="nm">{c.title}</span>
                  <span className="dt">{c.dueDate ? fmtShort(c.dueDate) : ''}</span>
                </button>
              ))}
            </div>
          </section>
          <button className="horizon-stat" onClick={() => setView('pulse')}>
            <b>{open}</b>
            <span>open decision{open === 1 ? '' : 's'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
