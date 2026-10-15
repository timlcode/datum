// Optional schedule AI. Nothing is configured by default.
//
// Saved in DATUM_DATA_DIR/ai-config.json (mode 0600), or overridden by env:
//   DATUM_AI_BASE_URL   OpenAI-compatible chat completions (wins over the file)
//   DATUM_AI_API_KEY    bearer token, or the key for the saved provider
//   DATUM_AI_MODEL      model id
//   DATUM_AI_COMMAND    local program (wins over the file when BASE_URL is unset)
//   DATUM_AI_ARGS       optional extra arguments
//
// Built-in providers: Anthropic Messages, xAI Grok, DeepSeek, and a custom
// OpenAI-compatible base URL. Env wins over the file. See server/aiConfig.ts.

import { spawn } from 'node:child_process';
import {
  ANTHROPIC_VERSION,
  anthropicMessagesUrl,
  chatCompletionsUrl,
  resolveAiRuntime,
  resolveTestTarget,
  type AiRuntime,
} from './aiConfig';

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
  provider: AiRuntime['provider'];
  model: string;
  label: string;
  source: AiRuntime['source'];
}

const ANTHROPIC_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function displayModel(runtime: AiRuntime): string {
  if (runtime.model) return runtime.model;
  if (runtime.provider === 'command') return 'command';
  if (runtime.provider === 'http' || runtime.provider === 'custom') return 'endpoint default';
  return '';
}

export function aiStatus(): AiStatus {
  const runtime = resolveAiRuntime();
  return {
    enabled: runtime.enabled,
    provider: runtime.enabled ? runtime.provider : 'none',
    model: runtime.enabled ? displayModel(runtime) : '',
    label: runtime.enabled ? runtime.label : 'Off',
    source: runtime.source,
  };
}

function log(label: string, msg: string) {
  console.log(`[ai:${label}] ${new Date().toISOString()} ${msg}`);
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    const t = secret.trim();
    if (t.length >= 6) out = out.split(t).join('[redacted]');
  }
  return out.slice(0, 280);
}

export function runStructured(opts: RunOptions): Promise<void> {
  const runtime = resolveAiRuntime();
  if (!runtime.enabled) {
    opts.onEvent({
      type: 'error',
      code: 'unconfigured',
      data: 'AI is optional and not configured. Open Set up AI on the home screen, or set DATUM_AI_BASE_URL / DATUM_AI_COMMAND. See the README.',
    });
    return Promise.resolve();
  }
  if (runtime.transport === 'anthropic') return runAnthropic(opts, runtime);
  if (runtime.transport === 'openai') return runHttp(opts, runtime);
  return runCommand(opts, runtime);
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

/** Anthropic structured outputs require closed objects. Does not mutate the input. */
export function closeJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map((item) => closeJsonSchema(item));
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    out[key] = value && typeof value === 'object' ? closeJsonSchema(value) : value;
  }
  const isObject = out.type === 'object' || (out.properties !== undefined && typeof out.properties === 'object' && !Array.isArray(out.properties));
  if (isObject && out.additionalProperties === undefined) out.additionalProperties = false;
  return out;
}

export interface AnthropicRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    max_tokens: number;
    system: string;
    messages: { role: 'user'; content: string }[];
    output_config?: {
      effort?: string;
      format?: { type: 'json_schema'; schema: unknown };
    };
  };
}

export function buildAnthropicRequest(opts: {
  baseUrl?: string;
  apiKey: string;
  model: string;
  rules: string;
  prompt: string;
  schema?: object;
  noSchema?: boolean;
  effort?: string;
  maxTokens?: number;
}): AnthropicRequest {
  const output: AnthropicRequest['body']['output_config'] = {};
  if (opts.effort && ANTHROPIC_EFFORTS.has(opts.effort)) output.effort = opts.effort;
  if (!opts.noSchema && opts.schema) {
    output.format = { type: 'json_schema', schema: closeJsonSchema(opts.schema) };
  }
  const body: AnthropicRequest['body'] = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 32_000,
    system: opts.rules,
    messages: [{ role: 'user', content: opts.prompt }],
  };
  if (output.effort || output.format) body.output_config = output;
  return {
    url: anthropicMessagesUrl(opts.baseUrl),
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body,
  };
}

export function anthropicResultText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const content = (payload as { content?: unknown }).content;
  if (typeof content === 'string') return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const row = block as { type?: string; text?: unknown; input?: unknown };
    if (row.type === 'text' && typeof row.text === 'string' && row.text.trim()) parts.push(row.text);
    else if (row.type === 'tool_use' && row.input && typeof row.input === 'object') parts.push(JSON.stringify(row.input));
  }
  const text = parts.join('\n').trim();
  return text || undefined;
}

function anthropicUsage(payload: unknown): AiEvent['usage'] | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const usage = (payload as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  if (!usage) return undefined;
  return { input: usage.input_tokens, output: usage.output_tokens };
}

async function runAnthropic(opts: RunOptions, runtime: AiRuntime): Promise<void> {
  const label = opts.label ?? 'ai';
  const startedAt = Date.now();
  const model = opts.model || runtime.model;
  opts.onEvent({ type: 'status', data: 'Asking the model…' });
  const bound = bindAbort(opts, opts.timeoutMs ?? 300_000);
  try {
    let request = buildAnthropicRequest({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model,
      rules: rulesFor(opts),
      prompt: opts.prompt,
      schema: opts.schema,
      noSchema: opts.noSchema,
      effort: opts.effort,
    });
    let parsed = await postJson(request.url, request.headers, request.body, bound.signal);
    if (parsed.httpStatus === 400 && request.body.output_config?.format) {
      log(label, 'endpoint rejected json_schema output; retrying with a JSON prompt');
      request = buildAnthropicRequest({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model,
        rules: `${opts.rules}\n\nOutput must be a single JSON object matching this JSON Schema, with no prose before or after it:\n${JSON.stringify(opts.schema)}`,
        prompt: opts.prompt,
        noSchema: true,
        effort: opts.effort,
      });
      parsed = await postJson(request.url, request.headers, request.body, bound.signal);
    }
    if (!parsed.ok) {
      opts.onEvent({ type: 'error', code: 'cli', data: providerError(parsed, runtime.apiKey) });
      return;
    }
    const text = anthropicResultText(parsed.json) || parsed.raw;
    const stop = parsed.json && typeof parsed.json === 'object' ? (parsed.json as { stop_reason?: string }).stop_reason : undefined;
    if (stop === 'max_tokens') {
      opts.onEvent({ type: 'error', code: 'bad_output', data: 'The model stopped before the JSON finished. Try again.' });
      return;
    }
    const result = extractJson(text);
    if (result === undefined) {
      opts.onEvent({ type: 'error', code: 'bad_output', data: 'The model returned something that was not valid JSON. Try again.' });
      return;
    }
    log(label, `result in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    opts.onEvent({ type: 'result', result, usage: anthropicUsage(parsed.json) });
  } catch (err) {
    opts.onEvent(abortEvent(opts, err));
  } finally {
    bound.cancel();
  }
}

async function runHttp(opts: RunOptions, runtime: AiRuntime): Promise<void> {
  const label = opts.label ?? 'ai';
  const startedAt = Date.now();
  const url = chatCompletionsUrl(runtime.baseUrl);
  const model = opts.model || runtime.model || 'default';
  const key = runtime.apiKey;
  opts.onEvent({ type: 'status', data: 'Asking the model…' });
  const bound = bindAbort(opts, opts.timeoutMs ?? 300_000);
  const messages = [
    { role: 'system', content: rulesFor(opts) },
    { role: 'user', content: opts.prompt },
  ];
  try {
    let parsed = await postJson(
      url,
      { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      { model, messages, temperature: 0.2, response_format: { type: 'json_object' } },
      bound.signal,
    );
    if (parsed.httpStatus === 400) {
      log(label, 'endpoint rejected response_format; retrying without it');
      parsed = await postJson(
        url,
        { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        { model, messages, temperature: 0.2 },
        bound.signal,
      );
    }
    if (!parsed.ok) {
      opts.onEvent({ type: 'error', code: 'cli', data: providerError(parsed, key) });
      return;
    }
    const text = openAiText(parsed);
    const result = extractJson(text);
    if (result === undefined) {
      opts.onEvent({ type: 'error', code: 'bad_output', data: 'The model returned something that was not valid JSON. Try again.' });
      return;
    }
    log(label, `result in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    opts.onEvent({ type: 'result', result, usage: openAiUsage(parsed.json) });
  } catch (err) {
    opts.onEvent(abortEvent(opts, err));
  } finally {
    bound.cancel();
  }
}

function openAiText(parsed: ParsedResponse): string {
  const json = parsed.json as { choices?: { message?: { content?: unknown } }[]; content?: unknown; output?: unknown } | undefined;
  if (!json || typeof json !== 'object') return parsed.raw;
  const content = json.choices?.[0]?.message?.content ?? json.content ?? json.output ?? parsed.raw;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function openAiUsage(json: unknown): AiEvent['usage'] | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  if (!usage) return undefined;
  return { input: usage.prompt_tokens, output: usage.completion_tokens };
}

interface ParsedResponse {
  ok: boolean;
  httpStatus: number;
  raw: string;
  json?: unknown;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<ParsedResponse> {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  const raw = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  return { ok: res.ok, httpStatus: res.status, raw, json };
}

function providerError(parsed: ParsedResponse, secret: string): string {
  const fallback = `The model endpoint returned ${parsed.httpStatus}.`;
  const detail = redactSecrets(providerMessage(parsed), [secret]);
  return detail ? `${fallback} ${detail}`.trim() : fallback;
}

function providerMessage(parsed: ParsedResponse): string {
  const json = parsed.json;
  if (json && typeof json === 'object') {
    const body = json as { error?: { message?: unknown } | string; message?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
    if (body.error && typeof body.error === 'object' && typeof body.error.message === 'string' && body.error.message.trim()) return body.error.message.trim();
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  }
  return parsed.raw.trim();
}

function bindAbort(opts: RunOptions, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    },
  };
}

function abortEvent(opts: RunOptions, err: unknown): AiEvent {
  const e = err as Error;
  const aborted = opts.signal?.aborted || e.name === 'AbortError';
  return {
    type: 'error',
    code: opts.signal?.aborted ? 'aborted' : aborted ? 'timeout' : 'spawn',
    data: opts.signal?.aborted
      ? 'Cancelled.'
      : aborted
        ? 'The AI request timed out. Try a shorter brief or try again.'
        : `Could not reach the model endpoint: ${e.message}`,
  };
}

export async function testAiConnection(input: unknown): Promise<{ ok: true; provider: string; model: string; detail: string } | { ok: false; error: string; provider: string; model: string }> {
  const target = resolveTestTarget(input);
  if (target.error || !target.runtime.enabled) {
    return { ok: false, error: target.error || 'AI is not configured yet.', provider: target.runtime.provider, model: target.runtime.model };
  }
  const runtime = target.runtime;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    if (runtime.transport === 'anthropic') {
      const request = buildAnthropicRequest({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model: runtime.model,
        rules: 'Reply with a short JSON object and nothing else.',
        prompt: 'Return {"ok":true}.',
        maxTokens: 64,
        noSchema: true,
      });
      const parsed = await postJson(request.url, request.headers, request.body, controller.signal);
      if (!parsed.ok) return { ok: false, error: providerError(parsed, runtime.apiKey), provider: runtime.provider, model: runtime.model };
      return { ok: true, provider: runtime.provider, model: runtime.model, detail: 'Anthropic answered.' };
    }
    const url = chatCompletionsUrl(runtime.baseUrl);
    const headers = { 'Content-Type': 'application/json', ...(runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {}) };
    const body = {
      model: runtime.model || 'default',
      messages: [
        { role: 'system', content: 'Reply with JSON only.' },
        { role: 'user', content: 'Return {"ok":true}.' },
      ],
      max_tokens: 32,
      temperature: 0,
    };
    const parsed = await postJson(url, headers, body, controller.signal);
    if (!parsed.ok) return { ok: false, error: providerError(parsed, runtime.apiKey), provider: runtime.provider, model: runtime.model };
    return { ok: true, provider: runtime.provider, model: runtime.model, detail: 'The endpoint answered.' };
  } catch (err) {
    const e = err as Error;
    const timedOut = e.name === 'AbortError';
    return {
      ok: false,
      error: timedOut ? 'The connection test timed out.' : `Could not reach the provider: ${redactSecrets(e.message, [runtime.apiKey])}`,
      provider: runtime.provider,
      model: runtime.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

function runCommand(opts: RunOptions, runtime: AiRuntime): Promise<void> {
  return new Promise((resolve) => {
    const label = opts.label ?? 'ai';
    const startedAt = Date.now();
    const bin = runtime.command.trim();
    const args = (runtime.commandArgs || '').split(/\s+/).filter(Boolean);
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      opts.onEvent({ type: 'error', code: 'spawn', data: `Could not start the AI command: ${(err as Error).message}` });
      resolve();
      return;
    }
    log(label, `command pid=${child.pid}`);
    opts.onEvent({ type: 'status', data: 'Asking the local AI command…' });
    const payload = JSON.stringify({
      prompt: opts.prompt,
      rules: rulesFor(opts),
      schema: opts.schema,
      model: opts.model || runtime.model || '',
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
