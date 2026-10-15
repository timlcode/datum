import { useMemo } from 'react';
import { HeartPulse, X, Sparkles } from 'lucide-react';
import { useStore } from '../state/store';
import { assessHealth, healthScore } from '@engine/health';

export function HealthPanel() {
  const project = useStore((s) => s.project)!;
  const schedule = useStore((s) => s.schedule)!;
  const setSidePanel = useStore((s) => s.setSidePanel);
  const select = useStore((s) => s.select);
  const findings = useMemo(() => assessHealth(project, schedule), [project, schedule]);
  const score = healthScore(findings);
  const color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--accent)' : 'var(--red)';
  const idOf = (uid: number) => schedule.byUid.get(uid)?.id ?? uid;

  return (
    <div className="side-panel">
      <div className="head"><HeartPulse /> Schedule health <button className="icon-btn x" onClick={() => setSidePanel(null)}><X /></button></div>
      <div className="body">
        <div className="score">
          <div className="ring" style={{ ['--pct' as string]: score, ['--ring-color' as string]: color }}><span>{score}</span></div>
          <div className="txt">
            <b>{score >= 80 ? 'Solid logic' : score >= 50 ? 'Needs attention' : 'Fix before issuing'}</b>
            <span>{findings.length === 0 ? 'No issues found across the standard checks.' : `${findings.length} finding${findings.length > 1 ? 's' : ''} across logic, float, constraints and durations.`}</span>
          </div>
        </div>
        {findings.map((f) => (
          <div className="finding" key={f.code} onClick={() => f.uids.length && select(f.uids, f.uids[0])} title={f.uids.length ? 'Click to select these tasks' : undefined}>
            <div className="t"><i className={`sev ${f.severity}`} />{f.title}</div>
            <div className="d">{f.detail}</div>
            {f.uids.length > 0 && (
              <div className="ids">
                {f.uids.slice(0, 18).map((u) => <span key={u}>#{idOf(u)}</span>)}
                {f.uids.length > 18 && <span>+{f.uids.length - 18} more</span>}
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 8 }}>Want a second opinion on sequencing, durations and missing scope?</div>
          <button className="btn ai" onClick={() => setSidePanel('review')}><Sparkles /> Run AI schedule review</button>
        </div>
      </div>
    </div>
  );
}
