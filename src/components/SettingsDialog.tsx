import { useState } from 'react';
import { Settings, X, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../state/store';
import { AppearanceControls } from './AppearanceMenu';
import { addDays, dayOf, makeDateTime, todayLocal, WEEKDAYS_SHORT } from '@engine/dates';
import type { Calendar } from '@engine/types';

const US_HOLIDAYS = (year: number): { date: string; name: string }[] => {
  const nth = (month: number, weekday: number, n: number) => {
    let d = `${year}-${String(month).padStart(2, '0')}-01`;
    let count = 0;
    for (let i = 0; i < 31; i++) {
      const wd = new Date(d + 'T00:00:00Z').getUTCDay();
      if (wd === weekday) { count++; if (count === n) return d; }
      d = addDays(d, 1);
    }
    return d;
  };
  const last = (month: number, weekday: number) => {
    let d = addDays(`${year}-${String(month + 1).padStart(2, '0')}-01`, -1);
    if (month === 12) d = `${year}-12-31`;
    while (new Date(d + 'T00:00:00Z').getUTCDay() !== weekday) d = addDays(d, -1);
    return d;
  };
  return [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: last(5, 1), name: 'Memorial Day' },
    { date: `${year}-07-04`, name: 'Independence Day' },
    { date: nth(9, 1, 1), name: 'Labor Day' },
    { date: nth(11, 4, 4), name: 'Thanksgiving' },
    { date: addDays(nth(11, 4, 4), 1), name: 'Day after Thanksgiving' },
    { date: `${year}-12-25`, name: 'Christmas Day' },
  ];
};

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const [name, setName] = useState(project.name);
  const [company, setCompany] = useState(project.company ?? '');
  const [manager, setManager] = useState(project.manager ?? '');
  const [start, setStart] = useState(dayOf(project.startDate));
  const [status, setStatus] = useState(project.statusDate ?? todayLocal());
  const [cal, setCal] = useState<Calendar>({ ...project.calendar, workWeek: [...project.calendar.workWeek] as Calendar['workWeek'], exceptions: [...project.calendar.exceptions] });

  const save = () => {
    update((d) => {
      d.name = name.trim() || d.name;
      d.company = company.trim() || undefined;
      d.manager = manager.trim() || undefined;
      d.startDate = makeDateTime(start, 8);
      d.statusDate = status;
      d.calendar = { ...cal, exceptions: cal.exceptions.filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)) };
    });
    onClose();
  };

  const addHolidays = () => {
    const y = Number(start.slice(0, 4));
    const list = [...US_HOLIDAYS(y), ...US_HOLIDAYS(y + 1), ...US_HOLIDAYS(y + 2)];
    const have = new Set(cal.exceptions.map((e) => e.date));
    setCal({ ...cal, exceptions: [...cal.exceptions, ...list.filter((h) => !have.has(h.date)).map((h) => ({ date: h.date, working: false, name: h.name }))] });
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog">
        <div className="d-head"><Settings /><h2>Project settings</h2><button className="icon-btn x" onClick={onClose}><X /></button></div>
        <div className="d-body">
          <div className="field">
            <label>Appearance</label>
            <AppearanceControls />
            <div className="hint">Saved on this computer. It does not travel with the schedule file.</div>
          </div>
          <div className="field"><label>Project name</label><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="fields-2">
            <div className="field"><label>Company</label><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="General contractor" /></div>
            <div className="field"><label>Project manager</label><input value={manager} onChange={(e) => setManager(e.target.value)} /></div>
          </div>
          <div className="fields-2">
            <div className="field"><label>Project start</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /><div className="hint">Tasks without predecessors start here.</div></div>
            <div className="field"><label>Status date</label><input type="date" value={status} onChange={(e) => setStatus(e.target.value)} /><div className="hint">Drives the look-ahead window and the dashed line on the Gantt.</div></div>
          </div>
          <div className="field">
            <label>Work week</label>
            <div className="calendar-week">
              {WEEKDAYS_SHORT.map((d, i) => (
                <button key={d} className={cal.workWeek[i] ? 'on' : ''} onClick={() => { const w = [...cal.workWeek] as Calendar['workWeek']; w[i] = !w[i]; setCal({ ...cal, workWeek: w }); }}>{d}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Holidays &amp; non-working days</label>
            <div className="holidays">
              {cal.exceptions.map((ex, i) => (
                <div className="h" key={i}>
                  <input type="date" value={ex.date} onChange={(e) => { const list = [...cal.exceptions]; list[i] = { ...ex, date: e.target.value }; setCal({ ...cal, exceptions: list }); }} />
                  <input value={ex.name ?? ''} placeholder="Name" onChange={(e) => { const list = [...cal.exceptions]; list[i] = { ...ex, name: e.target.value }; setCal({ ...cal, exceptions: list }); }} />
                  <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setCal({ ...cal, exceptions: cal.exceptions.filter((_, k) => k !== i) })}><Trash2 style={{ width: 13, height: 13 }} /></button>
                </div>
              ))}
              {cal.exceptions.length === 0 && <div className="hint">None. Weekends are already non-working.</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn sm" onClick={() => setCal({ ...cal, exceptions: [...cal.exceptions, { date: '', working: false, name: '' }] })}><Plus /> Add day</button>
              <button className="btn sm" onClick={addHolidays}>Add US holidays</button>
            </div>
          </div>
        </div>
        <div className="d-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save settings</button>
        </div>
      </div>
    </div>
  );
}
