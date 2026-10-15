import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, X, RefreshCw, Sparkles } from 'lucide-react';
import { useStore } from '../state/store';
import { streamAi } from '../api';
import { AiProgress, type AiProgressState } from './AiProgress';

interface Review {
  overall: string;
  findings: { severity: 'high' | 'medium' | 'low'; title: string; detail: string; suggestion: string; taskIds: number[] }[];
}

export function ReviewPanel() {
  const project = useStore((s) => s.project)!;
  const setSidePanel = useStore((s) => s.setSidePanel);
  const select = useStore((s) => s.select);
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<AiProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setReview(null);
    setProgress({ status: 'Sending the schedule…', thought: '', chars: 0, startedAt: Date.now() });
    try {
      const r = await streamAi<Review>('/api/ai/review', { project: useStore.getState().project }, (ev) => {
        setProgress((p) => {
          if (!p) return p;
          if (ev.type === 'status') return { ...p, status: ev.data ?? p.status };
          if (ev.type === 'thought') return { ...p, status: 'Reviewing…', thought: (p.thought + (ev.data ?? '')).slice(-1500) };
          if (ev.type === 'text') return { ...p, status: 'Writing findings…', chars: p.chars + (ev.data?.length ?? 0) };
          return p;
        });
      }, ac.signal);
      setReview(r);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  };

  useEffect(() => {
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uidOfId = (id: number) => project.tasks[id - 1]?.uid;

  return (
    <div className="side-panel">
      <div className="head">
        <ClipboardCheck /> AI schedule review
        <button className="icon-btn" title="Run again" onClick={run} disabled={!!progress} style={{ marginLeft: 'auto' }}><RefreshCw /></button>
        <button className="icon-btn" onClick={() => setSidePanel(null)}><X /></button>
      </div>
      <div className="body">
        {progress && <AiProgress state={progress} />}
        {error && (
          <div className="finding" style={{ borderColor: 'var(--red)' }}>
            <div className="t"><i className="sev high" />Review failed</div>
            <div className="d">{error}</div>
          </div>
        )}
        {review && (
          <>
            <div className="finding" style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.12), rgba(79,140,255,0.06))', cursor: 'default' }}>
              <div className="t"><Sparkles style={{ width: 14, height: 14, color: 'var(--purple)' }} /> Overall</div>
              <div className="d" style={{ color: 'var(--fg-1)' }}>{review.overall}</div>
            </div>
            {review.findings.map((f, i) => {
              const uids = f.taskIds.map(uidOfId).filter((u): u is number => u !== undefined);
              return (
                <div className="finding" key={i} onClick={() => uids.length && select(uids, uids[0])}>
                  <div className="t"><i className={`sev ${f.severity}`} />{f.title}</div>
                  <div className="d">{f.detail}</div>
                  {f.suggestion && <div className="s"><b>Fix:</b> {f.suggestion}</div>}
                  {f.taskIds.length > 0 && <div className="ids">{f.taskIds.map((id) => <span key={id}>#{id}</span>)}</div>}
                </div>
              );
            })}
            {review.findings.length === 0 && <div className="empty-state">No findings. The reviewer thinks this schedule holds up.</div>}
          </>
        )}
      </div>
    </div>
  );
}
