import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Diamond } from 'lucide-react';
import { useStore } from '../state/store';
import type { Row } from '../hooks/useVisibleRows';
import { shortcutEvents } from '../hooks/useShortcuts';
import { fmtShort, makeDateTime, parseUserDate } from '@engine/dates';
import { formatDuration, formatPredecessors, idMaps, parseDuration, parsePredecessors } from '@engine/predecessors';
import type { Task } from '@engine/types';

export type ColumnId = 'id' | 'wbs' | 'name' | 'dur' | 'start' | 'finish' | 'pred' | 'resource' | 'pct' | 'slack' | 'constraint' | 'notes' | 'lateFinish';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  width: number;
  editable: boolean;
  mono?: boolean;
}

export const ALL_COLUMNS: Record<ColumnId, ColumnDef> = {
  id: { id: 'id', label: '#', width: 44, editable: false },
  wbs: { id: 'wbs', label: 'WBS', width: 64, editable: false },
  name: { id: 'name', label: 'Task name', width: 320, editable: true },
  dur: { id: 'dur', label: 'Duration', width: 78, editable: true },
  start: { id: 'start', label: 'Start', width: 108, editable: true },
  finish: { id: 'finish', label: 'Finish', width: 108, editable: true },
  pred: { id: 'pred', label: 'Predecessors', width: 120, editable: true, mono: true },
  resource: { id: 'resource', label: 'Responsible', width: 140, editable: true },
  pct: { id: 'pct', label: '% Done', width: 66, editable: true },
  slack: { id: 'slack', label: 'Total slack', width: 84, editable: false },
  lateFinish: { id: 'lateFinish', label: 'Late finish', width: 100, editable: false },
  constraint: { id: 'constraint', label: 'Constraint', width: 150, editable: false },
  notes: { id: 'notes', label: 'Notes', width: 240, editable: true },
};

const CONSTRAINT_LABEL: Record<Task['constraintType'], string> = {
  ASAP: '', ALAP: 'As late as possible', MSO: 'Must start on', MFO: 'Must finish on', SNET: 'Start no earlier than', SNLT: 'Start no later than', FNET: 'Finish no earlier than', FNLT: 'Finish no later than',
};

interface Props {
  rows: Row[];
  columns: ColumnId[];
  onScroll?: (top: number) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  nameWidth?: number;
}

export function TaskGrid({ rows, columns, onScroll, scrollRef, nameWidth }: Props) {
  const selection = useStore((s) => s.selection);
  const activeUid = useStore((s) => s.activeUid);
  const project = useStore((s) => s.project)!;
  const st = useStore.getState;
  const localRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef ?? localRef;
  const [activeCol, setActiveCol] = useState<ColumnId>('name');
  const [editing, setEditing] = useState<{ uid: number; col: ColumnId; value: string; error?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const maps = useMemo(() => idMaps(project.tasks), [project.tasks]);
  const cols = columns.map((c) => (c === 'name' && nameWidth ? { ...ALL_COLUMNS[c], width: nameWidth } : ALL_COLUMNS[c]));

  const rowIndexOf = useCallback((uid: number | null) => rows.findIndex((r) => r.task.uid === uid), [rows]);

  // Start editing a row that was just inserted once it exists in the rendered rows.
  const pendingEdit = useRef<{ uid: number; col: ColumnId } | null>(null);
  useEffect(() => {
    const p = pendingEdit.current;
    if (p && rows.some((r) => r.task.uid === p.uid)) {
      pendingEdit.current = null;
      setActiveCol(p.col);
      setEditing({ uid: p.uid, col: p.col, value: '' });
      containerRef.current?.focus();
    }
  }, [rows, containerRef]);

  useEffect(() => {
    const h = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === 'insert') {
        const uid = st().insertTask();
        if (uid !== null) pendingEdit.current = { uid, col: 'name' };
      }
    };
    shortcutEvents.addEventListener('command', h);
    return () => shortcutEvents.removeEventListener('command', h);
  }, [st]);

  // Keep the active row in view.
  useEffect(() => {
    if (activeUid === null) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`tr[data-uid="${activeUid}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeUid, containerRef]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing?.uid, editing?.col]);

  const cellValue = (r: Row, col: ColumnId): string => {
    const { task: t, s } = r;
    switch (col) {
      case 'name': return t.name;
      case 'dur': return s.hasChildren ? formatDuration(s.durationDays, { compact: true }) : t.milestone ? '0d' : formatDuration(t.durationDays, { compact: true });
      case 'start': return fmtShort(s.start);
      case 'finish': return fmtShort(s.finish);
      case 'pred': return formatPredecessors(t.predecessors, maps.idByUid);
      case 'resource': return t.resourceNames;
      case 'pct': return `${t.percentComplete}%`;
      case 'slack': return s.hasChildren ? '' : `${s.totalSlackDays}d`;
      case 'lateFinish': return s.hasChildren ? '' : fmtShort(s.lateFinish);
      case 'constraint': return t.constraintType === 'ASAP' ? '' : `${CONSTRAINT_LABEL[t.constraintType]}${t.constraintDate ? ' ' + fmtShort(t.constraintDate) : ''}`;
      case 'notes': return t.notes;
      case 'wbs': return s.wbs;
      case 'id': return String(s.id);
    }
  };

  const editValue = (r: Row, col: ColumnId): string => {
    const { task: t, s } = r;
    switch (col) {
      case 'dur': return t.milestone ? '0' : String(t.durationDays);
      case 'start': return s.start.slice(0, 10);
      case 'finish': return s.finish.slice(0, 10);
      case 'pct': return String(t.percentComplete);
      default: return cellValue(r, col);
    }
  };

  const startEdit = (uid: number, col: ColumnId, initial?: string) => {
    const r = rows.find((x) => x.task.uid === uid);
    if (!r) return;
    const def = ALL_COLUMNS[col];
    if (!def.editable) return;
    if (r.s.hasChildren && (col === 'dur' || col === 'start' || col === 'finish' || col === 'pct')) return;
    setEditing({ uid, col, value: initial ?? editValue(r, col) });
  };

  const commitEdit = (): boolean => {
    if (!editing) return true;
    const { uid, col, value } = editing;
    const r = rows.find((x) => x.task.uid === uid);
    if (!r) {
      setEditing(null);
      return true;
    }
    const v = value.trim();
    switch (col) {
      case 'name':
        st().setTaskField(uid, 'name', v);
        break;
      case 'resource':
        st().setTaskField(uid, 'resourceNames', v);
        break;
      case 'notes':
        st().setTaskField(uid, 'notes', v);
        break;
      case 'dur': {
        const d = parseDuration(v);
        if (d === null) {
          setEditing({ ...editing, error: 'Enter a duration like 5d, 2w or 0 for a milestone.' });
          return false;
        }
        st().patchTask(uid, { durationDays: d, milestone: d === 0 });
        break;
      }
      case 'pct': {
        const n = Number(v.replace('%', ''));
        if (Number.isNaN(n) || n < 0 || n > 100) {
          setEditing({ ...editing, error: 'Enter 0 to 100.' });
          return false;
        }
        st().setTaskField(uid, 'percentComplete', Math.round(n));
        break;
      }
      case 'start': {
        if (!v) {
          st().patchTask(uid, { constraintType: 'ASAP', constraintDate: undefined });
          break;
        }
        const day = parseUserDate(v, Number(project.startDate.slice(0, 4)));
        if (!day) {
          setEditing({ ...editing, error: 'Enter a date like 9/17 or 2026-09-17.' });
          return false;
        }
        st().patchTask(uid, { constraintType: 'SNET', constraintDate: makeDateTime(day, 8) });
        break;
      }
      case 'finish': {
        if (!v) {
          st().patchTask(uid, { constraintType: 'ASAP', constraintDate: undefined });
          break;
        }
        const day = parseUserDate(v, Number(project.startDate.slice(0, 4)));
        if (!day) {
          setEditing({ ...editing, error: 'Enter a date like 9/17 or 2026-09-17.' });
          return false;
        }
        st().patchTask(uid, { constraintType: 'FNET', constraintDate: makeDateTime(day, 17) });
        break;
      }
      case 'pred': {
        const parsed = parsePredecessors(v, maps.uidById, uid);
        if (parsed.error) {
          setEditing({ ...editing, error: parsed.error });
          return false;
        }
        const err = st().setPredecessors(uid, parsed.links);
        if (err) {
          setEditing({ ...editing, error: err });
          return false;
        }
        break;
      }
      default:
        break;
    }
    setEditing(null);
    return true;
  };

  const moveActive = (dRow: number, extend: boolean) => {
    const i = rowIndexOf(activeUid);
    const ni = Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + dRow));
    const uid = rows[ni]?.task.uid;
    if (uid === undefined) return;
    if (extend) {
      const anchor = selection.length ? selection[0] : uid;
      const ai = rowIndexOf(anchor);
      const [a, b] = ai < ni ? [ai, ni] : [ni, ai];
      st().select([anchor, ...rows.slice(a, b + 1).map((r) => r.task.uid).filter((u) => u !== anchor)], uid);
    } else {
      st().select([uid], uid);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (commitEdit()) {
          moveActive(e.shiftKey ? -1 : 1, false);
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (commitEdit()) {
          const ci = cols.findIndex((c) => c.id === activeCol);
          const next = cols[ci + (e.shiftKey ? -1 : 1)];
          if (next && ALL_COLUMNS[next.id].editable) {
            setActiveCol(next.id);
            startEdit(editing.uid, next.id);
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(null);
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(1, e.shiftKey); break;
      case 'ArrowUp': e.preventDefault(); moveActive(-1, e.shiftKey); break;
      case 'PageDown': e.preventDefault(); moveActive(20, e.shiftKey); break;
      case 'PageUp': e.preventDefault(); moveActive(-20, e.shiftKey); break;
      case 'Home': if (mod) { e.preventDefault(); moveActive(-rows.length, e.shiftKey); } break;
      case 'End': if (mod) { e.preventDefault(); moveActive(rows.length, e.shiftKey); } break;
      case 'ArrowRight': {
        if (e.altKey) return;
        e.preventDefault();
        const ci = cols.findIndex((c) => c.id === activeCol);
        if (cols[ci + 1]) setActiveCol(cols[ci + 1].id);
        break;
      }
      case 'ArrowLeft': {
        if (e.altKey) return;
        e.preventDefault();
        const ci = cols.findIndex((c) => c.id === activeCol);
        if (cols[ci - 1]) setActiveCol(cols[ci - 1].id);
        break;
      }
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (activeUid !== null) startEdit(activeUid, activeCol);
        break;
      case 'Delete':
      case 'Backspace':
        if (e.key === 'Backspace' && !mod) return;
        e.preventDefault();
        if (selection.length) st().deleteTasks(selection);
        break;
      case ' ':
        if (activeUid !== null) {
          const r = rows.find((x) => x.task.uid === activeUid);
          if (r?.s.hasChildren) {
            e.preventDefault();
            st().toggleExpand(activeUid);
          }
        }
        break;
      case 'a':
        if (mod) {
          e.preventDefault();
          st().select(rows.map((r) => r.task.uid), activeUid);
        }
        break;
      default:
        if (e.key.length === 1 && !mod && !e.altKey && activeUid !== null) {
          const def = ALL_COLUMNS[activeCol];
          if (def.editable) {
            e.preventDefault();
            startEdit(activeUid, activeCol, e.key);
          }
        }
    }
  };

  const onRowMouseDown = (e: React.MouseEvent, r: Row, col: ColumnId) => {
    if (e.button !== 0) return;
    const uid = r.task.uid;
    if (editing && editing.uid !== uid) {
      if (!commitEdit()) return;
    } else if (editing && editing.col !== col) {
      if (!commitEdit()) return;
    }
    setActiveCol(col);
    if (e.shiftKey && activeUid !== null) {
      const a = rowIndexOf(activeUid);
      const b = rowIndexOf(uid);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      st().select(rows.slice(lo, hi + 1).map((x) => x.task.uid), uid);
    } else if (e.ctrlKey || e.metaKey) {
      const next = selSet.has(uid) ? selection.filter((u) => u !== uid) : [...selection, uid];
      st().select(next, uid);
    } else if (!selSet.has(uid) || selection.length === 1) {
      st().select([uid], uid);
    } else {
      st().select([uid], uid);
    }
  };

  const totalWidth = cols.reduce((a, c) => a + c.width, 0);

  return (
    <div
      className="grid"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(e) => onScroll?.((e.target as HTMLDivElement).scrollTop)}
      onMouseDown={(e) => {
        // Clicking blank space below rows deselects.
        if (e.target === e.currentTarget) st().select([], null);
      }}
    >
      <table style={{ width: totalWidth }}>
        <colgroup>
          {cols.map((c) => <col key={c.id} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c) => <th key={c.id} className={`c-${c.id}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const { task: t, s } = r;
            const isSel = selSet.has(t.uid);
            const isActive = activeUid === t.uid;
            const cls = [
              isSel ? 'selected' : '',
              isActive ? 'active' : '',
              s.hasChildren ? 'summary' : '',
              t.milestone && !s.hasChildren ? 'milestone' : '',
              s.critical && !s.hasChildren ? 'critical' : '',
              t.percentComplete >= 100 && !s.hasChildren ? 'done' : '',
            ].filter(Boolean).join(' ');
            return (
              <tr key={t.uid} data-uid={t.uid} className={cls} style={{ height: 'var(--row-h)' }}>
                {cols.map((c) => {
                  const isEditing = editing?.uid === t.uid && editing.col === c.id;
                  const focus = isActive && activeCol === c.id && !isEditing;
                  return (
                    <td
                      key={c.id}
                      className={`c-${c.id} ${focus ? 'focus' : ''}`}
                      onMouseDown={(e) => onRowMouseDown(e, r, c.id)}
                      onDoubleClick={() => {
                        if (c.id === 'id') st().toggleFlag('detailsOpen');
                        else startEdit(t.uid, c.id);
                      }}
                      title={c.id === 'name' || c.id === 'notes' || c.id === 'resource' ? cellValue(r, c.id) : undefined}
                    >
                      {isEditing ? (
                        <>
                          <input
                            ref={inputRef}
                            className={`cell-edit ${c.mono ? 'mono' : ''}`}
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value, error: undefined })}
                            onBlur={() => commitEdit()}
                            spellCheck={false}
                          />
                          {editing.error && <div className="cell-error">{editing.error}</div>}
                        </>
                      ) : c.id === 'name' ? (
                        <div className="cell-name">
                          <span className="indent" style={{ width: (s.level - 1) * 16 }} />
                          <button
                            className={`chev ${s.hasChildren ? (t.expanded ? '' : 'collapsed') : 'leaf'}`}
                            tabIndex={-1}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); st().toggleExpand(t.uid); }}
                          >
                            <ChevronDown />
                          </button>
                          {t.milestone && !s.hasChildren && <Diamond className="ms-icon" />}
                          <span className={`txt ${t.name ? '' : 'empty'}`}>{t.name || 'Untitled task'}</span>
                        </div>
                      ) : c.id === 'pct' ? (
                        <>
                          {cellValue(r, c.id)}
                          {t.percentComplete > 0 && !s.hasChildren && <i className="pct-bar" style={{ width: `${t.percentComplete}%` }} />}
                        </>
                      ) : (
                        cellValue(r, c.id)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="add-row" onClick={() => { const uid = st().insertTask({ afterUid: project.tasks.length ? project.tasks[project.tasks.length - 1].uid : null }); if (uid !== null) pendingEdit.current = { uid, col: 'name' }; }}>
            <td className="c-id" />
            <td colSpan={cols.length - 1}>+ Add task</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
