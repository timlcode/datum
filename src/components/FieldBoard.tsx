import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useStore, type BoardName } from '../state/store';
import { BUYOUT_AWARDED, BUYOUT_COLUMNS, DECISION_CLOSED, DECISION_COLUMNS, buyoutSummary, money } from '@engine/boards';
import { todayLocal } from '@engine/dates';
import type { BoardCard, CardPriority } from '@engine/types';

const PRIORITIES: CardPriority[] = ['low', 'normal', 'high'];

export function FieldBoard({ workflow }: { workflow: BoardName }) {
  const project = useStore((s) => s.project)!;
  const addCard = useStore((s) => s.addCard);
  const moveCard = useStore((s) => s.moveCard);
  const patchCard = useStore((s) => s.patchCard);
  const removeCard = useStore((s) => s.removeCard);
  const setBuyoutTarget = useStore((s) => s.setBuyoutTarget);
  const columns = workflow === 'decisions' ? DECISION_COLUMNS : BUYOUT_COLUMNS;
  const cards = (workflow === 'decisions' ? project.decisions : project.buyout) ?? [];
  const [editing, setEditing] = useState<BoardCard | null>(null);
  const [draftNew, setDraftNew] = useState(false);
  const today = todayLocal();
  const summary = useMemo(() => (workflow === 'buyout' ? buyoutSummary(cards, project.buyoutTarget) : null), [workflow, cards, project.buyoutTarget]);
  const [targetText, setTargetText] = useState(summary?.target?.toString() ?? '');
  useEffect(() => { setTargetText(summary?.target?.toString() ?? ''); }, [summary?.target]);

  const byColumn = (name: string) => cards.filter((c) => c.column === name);

  return (
    <div className={`field-board ${workflow}`}>
      <div className="board-head">
        <div>
          <h2>{workflow === 'decisions' ? 'Decisions' : 'Buyout'}</h2>
          <p>
            {workflow === 'decisions'
              ? 'The questions that hold the schedule. Drag a card when the answer moves.'
              : 'Packages from scope to mobilization. Dollars are the bid, not a hope.'}
          </p>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setDraftNew(true); }}>
          <Plus /> {workflow === 'decisions' ? 'Decision' : 'Package'}
        </button>
      </div>

      {summary && (
        <div className="buyout-stats">
          <label>
            Target
            <input
              type="number"
              min={0}
              value={targetText}
              placeholder="0"
              onChange={(e) => setTargetText(e.target.value)}
              onBlur={() => setBuyoutTarget(targetText === '' ? undefined : Number(targetText))}
            />
          </label>
          <Stat label="Concept" value={money(summary.concept)} />
          <Stat label="Proposals" value={money(summary.proposal)} tone={summary.gap !== undefined && summary.gap < 0 ? 'bad' : 'ok'} />
          <Stat label="Awarded" value={money(summary.awarded)} />
          <Stat label="Gap to target" value={summary.gap === undefined ? '—' : money(summary.gap)} tone={summary.gap !== undefined && summary.gap < 0 ? 'bad' : 'ok'} />
        </div>
      )}

      <div className="kanban">
        {columns.map((column) => {
          const list = byColumn(column);
          return (
            <section
              key={column}
              className="kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) moveCard(workflow, id, column);
              }}
            >
              <header>
                <span>{column}</span>
                <b>{list.length}</b>
              </header>
              <div className="kanban-cards">
                {list.map((card) => {
                  const late = !!card.dueDate && card.dueDate < today && !(workflow === 'decisions' && DECISION_CLOSED.has(card.column));
                  return (
                    <article
                      key={card.id}
                      className={`kcard pri-${card.priority} ${late ? 'late' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', card.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => { setDraftNew(false); setEditing(card); }}
                    >
                      <div className="k-top">
                        <span className={`pri ${card.priority}`}>{card.priority}</span>
                        {late && <span className="late-tag">overdue</span>}
                        {workflow === 'buyout' && BUYOUT_AWARDED.has(column) && <span className="awarded-tag">awarded</span>}
                      </div>
                      <h3>{card.title}</h3>
                      {card.owner && <div className="owner">{card.owner}</div>}
                      <div className="k-foot">
                        <span>{card.dueDate || 'No date'}</span>
                        {workflow === 'buyout' && <span>{money(card.budgetProposal || card.budgetConcept)}</span>}
                      </div>
                    </article>
                  );
                })}
                {list.length === 0 && <div className="col-empty">Drop a card here.</div>}
              </div>
            </section>
          );
        })}
      </div>

      {(draftNew || editing) && (
        <CardDialog
          workflow={workflow}
          card={editing}
          onClose={() => { setEditing(null); setDraftNew(false); }}
          onSave={(patch) => {
            if (editing) patchCard(workflow, editing.id, patch);
            else addCard(workflow, patch);
            setEditing(null);
            setDraftNew(false);
          }}
          onDelete={editing ? () => { removeCard(workflow, editing.id); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className={`bstat ${tone ?? ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function CardDialog({
  workflow,
  card,
  onClose,
  onSave,
  onDelete,
}: {
  workflow: BoardName;
  card: BoardCard | null;
  onClose: () => void;
  onSave: (patch: Partial<BoardCard>) => void;
  onDelete?: () => void;
}) {
  const columns = workflow === 'decisions' ? DECISION_COLUMNS : BUYOUT_COLUMNS;
  const [title, setTitle] = useState(card?.title ?? '');
  const [column, setColumn] = useState(card?.column ?? columns[0]);
  const [priority, setPriority] = useState<CardPriority>(card?.priority ?? 'normal');
  const [owner, setOwner] = useState(card?.owner ?? '');
  const [due, setDue] = useState(card?.dueDate ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [tags, setTags] = useState((card?.tags ?? []).join(', '));
  const [concept, setConcept] = useState(card?.budgetConcept?.toString() ?? '');
  const [proposal, setProposal] = useState(card?.budgetProposal?.toString() ?? '');

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog">
        <div className="d-head">
          <h2>{card ? 'Edit card' : workflow === 'decisions' ? 'New decision' : 'New package'}</h2>
          <button className="icon-btn x" onClick={onClose}><X /></button>
        </div>
        <div className="d-body">
          <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={workflow === 'decisions' ? 'Brick blend at the classroom wing' : 'Structural steel'} /></div>
          <div className="fields-2">
            <div className="field">
              <label>Column</label>
              <select value={column} onChange={(e) => setColumn(e.target.value)}>
                {columns.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as CardPriority)}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="fields-2">
            <div className="field"><label>Owner</label><input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner, architect, sub" /></div>
            <div className="field"><label>Due</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          {workflow === 'buyout' && (
            <div className="fields-2">
              <div className="field"><label>Concept budget</label><input type="number" min={0} value={concept} onChange={(e) => setConcept(e.target.value)} /></div>
              <div className="field"><label>Proposal</label><input type="number" min={0} value={proposal} onChange={(e) => setProposal(e.target.value)} /></div>
            </div>
          )}
          <div className="field"><label>Notes</label><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="field"><label>Tags</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="envelope, long-lead" /><div className="hint">Comma-separated.</div></div>
        </div>
        <div className="d-foot">
          {onDelete && <button className="btn" onClick={onDelete}><Trash2 /> Delete</button>}
          <span className="left" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={!title.trim()}
            onClick={() => onSave({
              title,
              column,
              priority,
              owner,
              dueDate: due || undefined,
              description,
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              budgetConcept: concept === '' ? undefined : Number(concept),
              budgetProposal: proposal === '' ? undefined : Number(proposal),
            })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
