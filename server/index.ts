import express, { type Request, type Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { APP_ROOT, DIST_DIR, HOME, PORT, TMP_DIR, expandHome } from './paths';
import { javaAvailable, readWithMpxj } from './mpxj';
import { listDirectory, places, pushRecent, readRecent, removeRecent } from './files';
import { aiStatus, runStructuredWithRetry, testAiConnection } from './ai';
import { publicAiConfig, updateAiConfig } from './aiConfig';
import { factsConfigured, formatFacts, gatherFacts, instructionWantsFacts, NO_FACTS_NOTE } from './plugins/facts';
import {
  EDIT_RULES, EDIT_SCHEMA, GENERATE_RULES, GENERATE_SCHEMA, REVIEW_RULES, REVIEW_SCHEMA,
  buildGeneratePrompt, type GenerateInput,
} from './aiPrompts';
import { createPrintJob, findChromium, getPrintJob, renderPdf } from './pdf';
import { attachFromPath, attachFromUpload, attachmentsToPrompt, type Attachment, type AttachmentMode } from './attachments';
import { importMpxj } from '../src/engine/mpxjImport';
import { computeSchedule } from '../src/engine/schedule';
import { exportMspdi } from '../src/engine/mspdi';
import type { Project } from '../src/engine/types';

const app = express();
app.use(express.json({ limit: '200mb' }));

const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { version?: string }).version || '0.2.1';
  } catch {
    return '0.2.1';
  }
})();

const ok = (res: Response, data: unknown) => res.json({ ok: true, ...(data as object) });
const fail = (res: Response, message: string, status = 400) => res.status(status).json({ ok: false, error: message });

app.get('/api/health', async (_req, res) => {
  const ai = aiStatus();
  ok(res, {
    version: VERSION,
    java: await javaAvailable(),
    ai: ai.enabled,
    aiProvider: ai.provider,
    aiLabel: ai.label,
    aiSource: ai.source,
    model: ai.model,
    facts: factsConfigured(),
    chromium: !!findChromium(),
  });
});

// ---------- Files ----------

app.get('/api/fs/places', async (_req, res) => {
  ok(res, { places: places(), recent: await readRecent() });
});

app.get('/api/fs/list', async (req, res) => {
  try {
    const path = String(req.query.path || HOME);
    const all = req.query.all === '1';
    ok(res, await listDirectory(path, { all }));
  } catch (err) {
    fail(res, `Can't open that folder: ${(err as Error).message}`);
  }
});

app.post('/api/fs/mkdir', async (req, res) => {
  try {
    const path = resolve(expandHome(String(req.body.path || '')));
    await mkdir(path, { recursive: true });
    ok(res, { path });
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.delete('/api/recent', async (req, res) => {
  await removeRecent(String(req.query.path || ''));
  ok(res, {});
});

// ---------- Project open / save ----------

app.post('/api/project/open', async (req, res) => {
  const path = resolve(expandHome(String(req.body.path || '')));
  if (!existsSync(path)) return fail(res, 'That file does not exist anymore.', 404);
  try {
    const ext = extname(path).toLowerCase();
    let project: Project;
    if (ext === '.datum' || ext === '.json') {
      project = JSON.parse(await readFile(path, 'utf8')) as Project;
      project.filePath = path;
    } else {
      const json = await readWithMpxj(path);
      project = importMpxj(json, path);
    }
    await pushRecent(path, project.name);
    ok(res, { project });
  } catch (err) {
    fail(res, (err as Error).message, 500);
  }
});

app.post('/api/project/save', async (req, res) => {
  const project = req.body.project as Project;
  let path = resolve(expandHome(String(req.body.path || project?.filePath || '')));
  if (!project || !path) return fail(res, 'Nothing to save.');
  try {
    const ext = extname(path).toLowerCase();
    if (ext === '.mpp') {
      // Project's binary format cannot be written; save alongside as XML instead.
      path = path.slice(0, -4) + '.xml';
    } else if (!ext) {
      path += '.xml';
    }
    await mkdir(dirname(path), { recursive: true });
    const schedule = computeSchedule(project);
    const xml = exportMspdi({ ...project, filePath: path }, schedule);
    await writeFile(path, xml, 'utf8');
    await pushRecent(path, project.name);
    ok(res, { path });
  } catch (err) {
    fail(res, `Save failed: ${(err as Error).message}`, 500);
  }
});

app.post('/api/project/exists', async (req, res) => {
  const path = resolve(expandHome(String(req.body.path || '')));
  ok(res, { exists: existsSync(path) });
});

// ---------- Print / PDF ----------

app.post('/api/print/job', (req, res) => {
  const token = createPrintJob(req.body.project, req.body.options);
  ok(res, { token });
});

app.get('/api/print/job/:token', (req, res) => {
  const job = getPrintJob(req.params.token);
  if (!job) return fail(res, 'Print job expired.', 404);
  ok(res, { project: job.project, options: job.options });
});

app.post('/api/print/pdf', async (req, res) => {
  const { project, options } = req.body as { project: Project; options: { outPath?: string } & Record<string, unknown> };
  if (!project) return fail(res, 'Nothing to print.');
  const token = createPrintJob(project, options);
  let outPath = options.outPath ? resolve(expandHome(String(options.outPath))) : join(TMP_DIR, `datum-${token}.pdf`);
  if (!outPath.toLowerCase().endsWith('.pdf')) outPath += '.pdf';
  try {
    const result = await renderPdf(token, outPath);
    ok(res, { path: result.path, bytes: result.bytes, token });
  } catch (err) {
    fail(res, (err as Error).message, 500);
  }
});

app.get('/api/print/file', async (req, res) => {
  const path = resolve(expandHome(String(req.query.path || '')));
  if (!existsSync(path) || !path.toLowerCase().endsWith('.pdf')) return fail(res, 'Not found', 404);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${basename(path)}"`);
  res.send(await readFile(path));
});

app.post('/api/open-external', (req, res) => {
  const path = resolve(expandHome(String(req.body.path || '')));
  if (!existsSync(path)) return fail(res, 'Not found', 404);
  const os = platform();
  const cmd = os === 'darwin' ? 'open' : os === 'win32' ? 'cmd' : 'xdg-open';
  const args = os === 'win32' ? ['/c', 'start', '', path] : [path];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
  ok(res, {});
});

// ---------- AI reference attachments ----------

type AttachmentWire = Omit<Attachment, 'project'>;
const wire = (a: Attachment): AttachmentWire => { const { project: _p, ...rest } = a; return rest; };

app.post('/api/ai/attach', async (req, res) => {
  const { path, name, base64, mode } = req.body as { path?: string; name?: string; base64?: string; mode?: AttachmentMode };
  try {
    const a = path ? await attachFromPath(path, mode) : name && base64 ? await attachFromUpload(name, base64, mode) : null;
    if (!a) return fail(res, 'Send a file path or file contents.');
    ok(res, { attachment: wire(a) });
  } catch (err) {
    fail(res, (err as Error).message, 500);
  }
});

// ---------- AI ----------

app.get('/api/ai/config', (_req, res) => {
  ok(res, publicAiConfig());
});

app.put('/api/ai/config', (req, res) => {
  try {
    ok(res, updateAiConfig(req.body));
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.post('/api/ai/test', async (req, res) => {
  const result = await testAiConnection(req.body ?? {});
  if (!result.ok) return fail(res, result.error);
  ok(res, { provider: result.provider, model: result.model, detail: result.detail });
});


function sse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  return (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.post('/api/ai/generate', async (req: Request, res: Response) => {
  const input = req.body as GenerateInput & { attachments?: AttachmentWire[] };
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  if (!input?.brief?.trim() && !attachments.length) return fail(res, 'Describe the project or attach a schedule first.');
  if (!input.brief?.trim()) input.brief = 'Build the schedule from the attached file(s).';
  input.attachmentsPrompt = attachmentsToPrompt(attachments);
  const send = sse(res);
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  send({ type: 'status', data: attachments.length ? `Reading your brief and ${attachments.length} attached file${attachments.length === 1 ? '' : 's'}…` : 'Reading your brief…' });
  await runStructuredWithRetry({
    prompt: buildGeneratePrompt(input),
    rules: GENERATE_RULES,
    schema: GENERATE_SCHEMA,
    onEvent: send,
    signal: controller.signal,
    timeoutMs: 600_000,
    effort: process.env.DATUM_AI_EFFORT_BUILD || 'medium',
    label: 'build',
  });
  res.end();
});

app.post('/api/ai/review', async (req: Request, res: Response) => {
  const project = req.body.project as Project;
  if (!project?.tasks?.length) return fail(res, 'There is nothing to review yet.');
  const send = sse(res);
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const schedule = computeSchedule(project);
  const lines = project.tasks.map((t, i) => {
    const s = schedule.byUid.get(t.uid)!;
    const preds = t.predecessors
      .map((l) => {
        const idx = project.tasks.findIndex((x) => x.uid === l.predUid);
        return `${idx + 1}${l.type !== 'FS' || l.lagDays ? l.type : ''}${l.lagDays ? (l.lagDays > 0 ? '+' : '') + l.lagDays + 'd' : ''}`;
      })
      .join(',');
    const indent = '  '.repeat(Math.max(0, s.level - 1));
    return `${i + 1}\t${indent}${t.name}${s.summary ? ' [SUMMARY]' : t.milestone ? ' [MILESTONE]' : ''}\t${s.summary ? s.durationDays : t.durationDays}d\t${s.start.slice(0, 10)}\t${s.finish.slice(0, 10)}\tpreds:${preds || '-'}\tslack:${s.totalSlackDays}${s.critical ? '\tCRITICAL' : ''}${t.resourceNames ? '\t' + t.resourceNames : ''}${t.constraintType !== 'ASAP' ? '\t' + t.constraintType + ' ' + (t.constraintDate ?? '') : ''}`;
  });
  const prompt = [
    `Review this construction schedule: "${project.name}". Project start ${project.startDate.slice(0, 10)}, finish ${schedule.projectFinish.slice(0, 10)}, ${schedule.durationDays} working days.`,
    'Columns: ID, Name, Duration, Start, Finish, Predecessors (ID+type+lag), Total slack, flags, Responsible, Constraint.',
    '',
    ...lines,
  ].join('\n');
  send({ type: 'status', data: 'Reading the schedule…' });
  await runStructuredWithRetry({ prompt, rules: REVIEW_RULES, schema: REVIEW_SCHEMA, onEvent: send, signal: controller.signal, effort: process.env.DATUM_AI_EFFORT || 'low', label: 'review' });
  res.end();
});

app.post('/api/ai/edit', async (req: Request, res: Response) => {
  const { project, instruction, attachments: rawAtt } = req.body as { project: Project; instruction: string; attachments?: AttachmentWire[] };
  const attachments = Array.isArray(rawAtt) ? rawAtt : [];
  if (!project?.tasks?.length || !instruction?.trim()) return fail(res, 'Tell Datum what to change.');
  const send = sse(res);
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const schedule = computeSchedule(project);
  const lines = project.tasks.map((t, i) => {
    const s = schedule.byUid.get(t.uid)!;
    const preds = t.predecessors
      .map((l) => {
        const idx = project.tasks.findIndex((x) => x.uid === l.predUid);
        return `${idx + 1}${l.type !== 'FS' || l.lagDays ? l.type : ''}${l.lagDays ? (l.lagDays > 0 ? '+' : '') + l.lagDays + 'd' : ''}`;
      })
      .join(',');
    const extras = [
      t.resourceNames ? t.resourceNames : '',
      t.constraintType !== 'ASAP' ? `constraint:${t.constraintType}${t.constraintDate ? ' ' + t.constraintDate.slice(0, 10) : ''}` : '',
      t.actualStart ? `actualStart:${t.actualStart.slice(0, 10)}` : '',
      t.actualFinish ? `actualFinish:${t.actualFinish.slice(0, 10)}` : '',
      t.percentComplete ? `${t.percentComplete}%` : '',
    ].filter(Boolean);
    return `${i + 1}\tL${s.level}\t${t.name}${s.summary ? ' [SUMMARY]' : t.milestone ? ' [MILESTONE]' : ''}\t${t.durationDays}d\t${s.start.slice(0, 10)}\t${s.finish.slice(0, 10)}\tpreds:${preds || '-'}${extras.length ? '\t' + extras.join('\t') : ''}`;
  });
  const today = new Date().toISOString().slice(0, 10);
  const promptParts = [
    `Schedule "${project.name}". Project start ${project.startDate.slice(0, 10)}, status date ${project.statusDate ?? today}, today ${today}.`,
    'Columns: ID, outline level, name, duration, start, finish, predecessors (ID+type+lag), then responsible / constraint / actual dates / % complete where set.',
    ...lines,
  ];
  if (instructionWantsFacts(instruction)) {
    if (factsConfigured()) {
      send({ type: 'status', data: 'Checking the optional facts source…' });
      const facts = await gatherFacts({ projectName: project.name, instruction });
      send({
        type: 'status',
        data: facts.items.length
          ? `Facts source returned ${facts.items.length} item${facts.items.length === 1 ? '' : 's'}. Working out the changes…`
          : 'Facts source returned nothing usable. Working from the schedule alone…',
      });
      promptParts.push('', formatFacts(facts));
    } else {
      send({ type: 'status', data: 'No facts source is configured. Working from the schedule alone…' });
      promptParts.push('', NO_FACTS_NOTE);
    }
  } else {
    send({ type: 'status', data: 'Working out the changes…' });
  }
  if (attachments.length) promptParts.push('', attachmentsToPrompt(attachments));
  promptParts.push('', `INSTRUCTION: ${instruction.trim()}`);
  const prompt = promptParts.join('\n');
  // Schema lives in the rules for edits. Constrained decoding has been unreliable
  // on date-heavy change lists; the model is asked for one JSON object instead.
  await runStructuredWithRetry({ prompt, rules: EDIT_RULES, schema: EDIT_SCHEMA, onEvent: send, signal: controller.signal, effort: process.env.DATUM_AI_EFFORT || 'low', label: 'edit', noSchema: true, timeoutMs: 480_000 });
  res.end();
});

// ---------- Static ----------

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false }));
  app.get(/^(?!\/api\/).*/, async (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.send('Datum server running. Frontend is served by Vite in development.'));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Datum server listening on http://127.0.0.1:${PORT}`);
});

// Keep the process alive but exit cleanly if the temp dir vanishes (e.g. cleanup).
setInterval(async () => {
  try {
    await stat(TMP_DIR);
  } catch {
    await mkdir(TMP_DIR, { recursive: true });
  }
}, 60_000).unref();
