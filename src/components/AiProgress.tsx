import { useEffect, useState } from 'react';

export interface AiProgressState {
  status: string;
  thought: string;
  chars: number;
  startedAt: number;
}

export function AiProgress({ state, expected = 9000 }: { state: AiProgressState; expected?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.round((Date.now() - state.startedAt) / 1000);
  const pct = state.chars > 0 ? Math.min(96, (state.chars / expected) * 100) : Math.min(30, secs * 1.2);
  return (
    <div className="ai-progress">
      <div className="st"><i className="spin" /> {state.status} <span style={{ marginLeft: 'auto', color: 'var(--fg-3)', fontWeight: 400 }}>{secs}s</span></div>
      {state.thought && <div className="thought">{state.thought.slice(-700)}</div>}
      <div className="meter"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
