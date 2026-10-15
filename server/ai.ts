// Optional schedule AI. Nothing is configured by default.
//
// HTTP (OpenAI-compatible chat completions):
//   DATUM_AI_BASE_URL   e.g. https://example.com/v1
//   DATUM_AI_API_KEY    optional bearer token
//   DATUM_AI_MODEL      model name the endpoint expects
//
// Command (any local program):
//   DATUM_AI_COMMAND    executable path
//   DATUM_AI_ARGS       optional extra arguments
// The process reads one JSON object from stdin
//   { prompt, rules, schema, model, effort }
// and writes either a single JSON result, or newline-delimited events
//   { "type": "status"|"thought"|"text", "data": "..." }
//   { "type": "result", "result": { ... } }
// to stdout.

import { spawn } from 'node:child_process';

export interface AiEvent {
  type: 'thought' | 'text' | 'status' | 'result' | 'error';
  data?: string;
  result?: unknown;
  usage?: { input?: number; output?: number; reasoning?: number };
  code?: 'unconfigured' | 'spawn' | 'timeout' | 'aborted' | 'cli' | 'stopped' | 'bad_output';
}

export interface RunOptions {
  prompt: string;
  rules: string;
  schema: object;
  model?: string;
  effort?: string;
  timeoutMs?: number;
  label?: string;
  noSchema?: boolean;
  onEvent: (e: AiEvent) => void;
  signal?: AbortSignal;
}

export interface AiStatus {
  enabled: boolean;
  provider: 'none' | 'http' | 'command';
  model: string;
}

export function aiStatus(): AiStatus {
  const base = process.env.DATUM_AI_BASE_URL?.trim();
  const command = process.env.DATUM_AI_COMMAND?.trim();
  const model = process.env.DATUM_AI_MODEL?.trim() || '';
  if (base) return { enabled: true, provider: 'http', model: model || 'endpoint default' };
  if (command) return { enabled: true, provider: 'command', model: model || 'command' };
  return { enabled: false, provider: 'none', model: '' };
}

function log(label: string, msg: string) {
  console.log(`[ai:${label}] ${new Date().toISOString()} ${msg}`);
}

export function runStructured(opts: RunOptions): Promise<void> {
  const status = aiStatus();
  if (!status.enabled) {
    opts.onEvent({
      type: 'error',
      code: 'unconfigured',
      data: 'AI is optional and not configured. Set DATUM_AI_BASE_URL for an OpenAI-compatible endpoint, or DATUM_AI_COMMAND for a local program. See the README.',
    });
    return Promise.resolve();
  }
  return status.provider === 'http' ? runHttp(opts) : runCommand(opts);
}

const EFFORT_LADDER = ['low', 'medium', 'high'];

export async function runStructuredWithRetry(opts: RunOptions): Promise<void> {
  const first = opts.effort ?? 'low';
  const next = EFFORT_LADDER[EFFORT_LADDER.indexOf(first) + 1];
  let failure: AiEvent | undefined;
  await runStructured({
    ...opts,
    onEvent: (e) => {
      if (e.type === 'error' && e.code === 'bad_output' && next && !opts.signal?.aborted) failure = e;
      else opts.onEvent(e);
    },
  });
  if (!failure || !next) return;
  log(opts.label ?? 'ai', `retrying at effort=${next} after bad_output`);
  opts.onEvent({ type: 'status', data: 'First pass came back garbled — thinking harder…' });
  await runStructured({ ...opts, effort: next, label: `${opts.label ?? 'ai'}:retry` });
}

function rulesFor(opts: RunOptions): string {
  if (!opts.noSchema) return opts.rules;
  return `${opts.rules}\n\nOutput must be a single JSON object matching this JSON Schema, with no prose before or after it:\n${JSON.stringify(opts.schema)}`;
}

async function runHttp(opts: RunOptions): Promise<void> {
  const label = opts.label ?? 'ai';
  const startedAt = Date.now();
  const base = process.env.DATUM_AI_BASE_URL!.trim().replace(/\/$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const model = opts.model || process.env.DATUM_AI_MODEL?.trim() || 'default';
  const key = process.env.DATUM_AI_API_KEY?.trim();
  opts.onEvent({ type: 'status', data: 'Asking the model…' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  const messages = [
    { role: 'system', content: rulesFor(opts) },
    { role: 'user', content: opts.prompt },
  ];
  try {
    let parsed = await postChat(url, key, { model, messages, temperature: 0.2, response_format: { type: 'json_object' } }, controller.signal);
    if (parsed.httpStatus === 400) {
      log(label, 'endpoint rejected response_format; retrying without it');
      parsed = await postChat(url, key, { model, messages, temperature: 0.2 }, controller.signal);
    }
    if (!parsed.ok) {
      opts.onEvent({ type: 'error', code: 'cli', data: parsed.error || 'The model endpoint rejected the request.' });
      return;
    }
    const result = extractJson(parsed.text);
    if (result === undefined) {
      opts.onEvent({ type: 'error', code: 'bad_output', data: 'The model returned something that was not valid JSON. Try again.' });
      return;
    }
    log(label, `result in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    opts.onEvent({ type: 'result', result, usage: parsed.usage });
  } catch (err) {
    const e = err as Error;
    const aborted = opts.signal?.aborted || e.name === 'AbortError';
    opts.onEvent({
      type: 'error',
      code: opts.signal?.aborted ? 'aborted' : aborted ? 'timeout' : 'spawn',
      data: opts.signal?.aborted
        ? 'Cancelled.'
        : aborted
          ? 'The AI request timed out. Try a shorter brief or try again.'
          : `Could not reach the model endpoint: ${e.message}`,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

async function postChat(
  url: string,
  key: string | undefined,
  body: unknown,
  signal: AbortSignal,
): Promise<{ ok: boolean; httpStatus: number; text: string; error?: string; usage?: AiEvent['usage'] }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  const raw = await res.text();
  if (!res.ok) return { ok: false, httpStatus: res.status, text: '', error: `The model endpoint returned ${res.status}. ${raw.slice(0, 280)}`.trim() };
  let json: { choices?: { message?: { content?: unknown } }[]; content?: unknown; output?: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: true, httpStatus: res.status, text: raw };
  }
  const content = json.choices?.[0]?.message?.content ?? json.content ?? json.output ?? raw;
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const usage = json.usage ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } : undefined;
  return { ok: true, httpStatus: res.status, text, usage };
}

function runCommand(opts: RunOptions): Promise<void> {
  return new Promise((resolve) => {
    const label = opts.label ?? 'ai';
    const startedAt = Date.now();
    const bin = process.env.DATUM_AI_COMMAND!.trim();
    const args = (process.env.DATUM_AI_ARGS || '').split(/\s+/).filter(Boolean);
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      opts.onEvent({ type: 'error', code: 'spawn', data: `Could not start the AI command: ${(err as Error).message}` });
      resolve();
      return;
    }
    log(label, `command pid=${child.pid} ${bin}`);
    opts.onEvent({ type: 'status', data: 'Asking the local AI command…' });
    const payload = JSON.stringify({
      prompt: opts.prompt,
      rules: rulesFor(opts),
      schema: opts.schema,
      model: opts.model || process.env.DATUM_AI_MODEL || '',
      effort: opts.effort || '',
    });
    child.stdin?.write(payload);
    child.stdin?.end();

    let stdout = '';
    let stderr = '';
    let ended = false;
    const finish = (e: AiEvent) => {
      log(label, `${e.type} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s${e.type === 'error' ? ` msg="${e.data}"` : ''}`);
      opts.onEvent(e);
    };
    const timer = setTimeout(() => {
      if (ended) return;
      ended = true;
      child.kill('SIGTERM');
      finish({ type: 'error', code: 'timeout', data: 'The AI request timed out. Try a shorter brief or try again.' });
    }, opts.timeoutMs ?? 300_000);
    const onAbort = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
    };
    opts.signal?.addEventListener('abort', onAbort);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (c: string) => {
      stdout += c;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (c: string) => {
      stderr += c;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (ended) return;
      ended = true;
      finish({ type: 'error', code: 'spawn', data: `Could not start the AI command: ${err.message}` });
      resolve();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (ended) {
        resolve();
        return;
      }
      ended = true;
      if (opts.signal?.aborted) {
        resolve();
        return;
      }
      const streamed = emitCommandEvents(stdout, opts.onEvent);
      if (streamed === 'result') {
        resolve();
        return;
      }
      if (streamed === 'error') {
        resolve();
        return;
      }
      const parsed = extractJson(stdout);
      if (parsed !== undefined) finish({ type: 'result', result: parsed });
      else {
        const hint = stderr.split('\n').map((l) => l.trim()).filter(Boolean).slice(-2).join(' ');
        finish({
          type: 'error',
          code: code === 0 ? 'bad_output' : 'cli',
          data: code === 0 ? 'The AI command returned something that was not valid JSON. Try again.' : `The AI command failed (exit ${code}). ${hint}`.trim(),
        });
      }
      resolve();
    });
  });
}

/** If stdout is a stream of typed events, forward them. Returns how it ended. */
function emitCommandEvents(stdout: string, onEvent: (e: AiEvent) => void): 'result' | 'error' | 'plain' {
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 'plain';
  const events: { type?: string; data?: string; result?: unknown }[] = [];
  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as { type?: string; data?: string; result?: unknown };
      if (!ev || typeof ev.type !== 'string') return 'plain';
      events.push(ev);
    } catch {
      return 'plain';
    }
  }
  let sawResult = false;
  for (const ev of events) {
    if (ev.type === 'result' && ev.result !== undefined) {
      onEvent({ type: 'result', result: ev.result });
      sawResult = true;
    } else if (ev.type === 'error') {
      onEvent({ type: 'error', code: 'cli', data: ev.data || 'The AI command failed.' });
      return 'error';
    } else if (ev.type === 'thought' || ev.type === 'text' || ev.type === 'status') {
      onEvent({ type: ev.type, data: ev.data });
    }
  }
  return sawResult ? 'result' : 'plain';
}

export function extractJson(text: string): unknown | undefined {
  const t = text.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}
