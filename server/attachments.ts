// Reference attachments for the AI build / edit dialogs.
//
// A vendor, sub, or PM schedule (.mpp/.xml/.xer/...), a PDF, or a plain
// text / CSV file is turned into compact text the model can read alongside
// the brief or instruction. Schedules go through MPXJ and the Datum engine so
// the model sees the same IDs, durations and logic Datum would.

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DATA_DIR, expandHome } from './paths';
import { READABLE_EXTENSIONS, readWithMpxj } from './mpxj';
import { importMpxj } from '../src/engine/mpxjImport';
import { computeSchedule } from '../src/engine/schedule';
import type { Project } from '../src/engine/types';

const execFileAsync = promisify(execFile);

export const ATTACH_DIR = join(DATA_DIR, 'attachments');
const MAX_TEXT = 60_000;
const SCHEDULE_EXTS = new Set(READABLE_EXTENSIONS);
const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.tsv', '.json']);

export type AttachmentMode = 'baseline' | 'reference' | 'verify';

export interface Attachment {
  id: string;
  name: string;
  path: string;
  kind: 'schedule' | 'pdf' | 'text';
  mode: AttachmentMode;
  /** Compact text handed to the model. */
  text: string;
  truncated: boolean;
  chars: number;
  summary: string;
  /** For schedules: parsed project so a build can mirror it exactly if asked. */
  project?: Project;
}

function projectToText(p: Project): { text: string; summary: string } {
  const s = computeSchedule(p);
  const lines = p.tasks.map((t, i) => {
    const row = s.byUid.get(t.uid)!;
    const preds = t.predecessors
      .map((l) => {
        const idx = p.tasks.findIndex((x) => x.uid === l.predUid);
        return `${idx + 1}${l.type !== 'FS' || l.lagDays ? l.type : ''}${l.lagDays ? (l.lagDays > 0 ? '+' : '') + l.lagDays + 'd' : ''}`;
      })
      .join(',');
    const flags = row.summary ? ' [SUMMARY]' : t.milestone ? ' [MILESTONE]' : '';
    const extras = [
      t.resourceNames || '',
      t.constraintType !== 'ASAP' ? `constraint:${t.constraintType}${t.constraintDate ? ' ' + t.constraintDate.slice(0, 10) : ''}` : '',
      t.actualStart ? `actualStart:${t.actualStart.slice(0, 10)}` : '',
      t.actualFinish ? `actualFinish:${t.actualFinish.slice(0, 10)}` : '',
      t.percentComplete ? `${t.percentComplete}%` : '',
    ].filter(Boolean);
    return `${i + 1}\tL${row.level}\t${t.name}${flags}\t${row.summary ? row.durationDays : t.durationDays}d\t${row.start.slice(0, 10)}\t${row.finish.slice(0, 10)}\tpreds:${preds || '-'}${extras.length ? '\t' + extras.join('\t') : ''}`;
  });
  const head = [
    `Schedule "${p.name}". Start ${p.startDate.slice(0, 10)}, finish ${s.projectFinish.slice(0, 10)}, ${s.durationDays} working days, ${p.tasks.length} rows.`,
    'Columns: ID, outline level, name, duration (working days), start, finish, predecessors (ID+type+lag), then responsible / constraint / actual dates / % complete where set.',
  ];
  const summary = `${p.tasks.length} rows · ${p.startDate.slice(0, 10)} → ${s.projectFinish.slice(0, 10)}`;
  return { text: [...head, ...lines].join('\n'), summary };
}

async function pdfToText(path: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', '-l', '60', path, '-'], { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 });
    // Collapse the wide whitespace pdftotext -layout produces on drawing sheets.
    return stdout.replace(/[ \t]{3,}/g, '  ').replace(/\n{3,}/g, '\n\n');
  } catch (err) {
    throw new Error(`Could not read the PDF (pdftotext): ${(err as Error).message}`);
  }
}

function clamp(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT) + '\n[… truncated …]', truncated: true };
}

/** Parse a file already on disk into an attachment. */
export async function attachFromPath(rawPath: string, mode: AttachmentMode = 'reference'): Promise<Attachment> {
  const path = resolve(expandHome(rawPath));
  if (!existsSync(path)) throw new Error('That file does not exist.');
  const name = basename(path);
  const ext = extname(name).toLowerCase();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  if (SCHEDULE_EXTS.has(ext) && ext !== '.zip') {
    const project = importMpxj(await readWithMpxj(path), path);
    const { text, summary } = projectToText(project);
    const c = clamp(text);
    return { id, name, path, kind: 'schedule', mode, text: c.text, truncated: c.truncated, chars: c.text.length, summary, project };
  }
  if (ext === '.pdf') {
    const c = clamp(await pdfToText(path));
    return { id, name, path, kind: 'pdf', mode, text: c.text, truncated: c.truncated, chars: c.text.length, summary: `PDF · ${Math.round(c.text.length / 1000)}k chars${c.truncated ? ' (truncated)' : ''}` };
  }
  if (TEXT_EXTS.has(ext)) {
    const c = clamp(await readFile(path, 'utf8'));
    return { id, name, path, kind: 'text', mode, text: c.text, truncated: c.truncated, chars: c.text.length, summary: `Text · ${Math.round(c.text.length / 1000)}k chars` };
  }
  throw new Error(`Datum can't read ${ext || 'that'} files as a reference. Use a schedule (.mpp, .xml, .xer …), a PDF, or CSV/text.`);
}

/** Save uploaded bytes under the data dir, then parse. */
export async function attachFromUpload(name: string, base64: string, mode: AttachmentMode = 'reference'): Promise<Attachment> {
  await mkdir(ATTACH_DIR, { recursive: true });
  const safe = basename(name).replace(/[^\w.\- ()&]+/g, '_');
  const path = join(ATTACH_DIR, `${Date.now().toString(36)}-${safe}`);
  await writeFile(path, Buffer.from(base64, 'base64'));
  return attachFromPath(path, mode);
}

const MODE_TEXT: Record<AttachmentMode, string> = {
  baseline:
    'Treat this file as the BASELINE. Mirror its phases, task names, order, durations and logic as the starting point. Fix only what is clearly wrong (zero-duration work items that are not milistones, dangling logic, closeout tasks that run before the work they test, missing inspections or cure times) and say what you changed in each affected task\'s notes and in the summary.',
  reference:
    'Use this file as REFERENCE material for scope, durations, sequencing and dates. You may reorganize, but keep its committed dates and long-lead realities in view.',
  verify:
    'Use this file to VERIFY the schedule you are working on. Compare task by task: flag durations, dates, logic or missing scope that disagree, and prefer the file where it carries a committed or contractual date. State each disagreement you acted on.',
};

/** Formats attachments as prompt blocks. */
export function attachmentsToPrompt(list: Pick<Attachment, 'name' | 'kind' | 'mode' | 'text'>[]): string {
  if (!list?.length) return '';
  const out: string[] = [];
  list.forEach((a, i) => {
    out.push(`=== ATTACHED FILE ${i + 1}: "${a.name}" (${a.kind}, mode: ${a.mode.toUpperCase()}) ===`);
    out.push(MODE_TEXT[a.mode] ?? MODE_TEXT.reference);
    out.push('--- content ---');
    out.push(a.text);
    out.push(`=== END OF FILE ${i + 1} ===`, '');
  });
  return out.join('\n');
}
