import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aiStatus,
  anthropicResultText,
  buildAnthropicRequest,
  closeJsonSchema,
  redactSecrets,
  runStructured,
  testAiConnection,
} from './ai';
import {
  AI_PRESETS,
  anthropicMessagesUrl,
  chatCompletionsUrl,
  loadAiConfig,
  maskSecret,
  publicAiConfig,
  resolveAiRuntime,
  saveAiConfig,
  updateAiConfig,
  type AiFileConfig,
} from './aiConfig';

const ENV_KEYS = ['DATUM_DATA_DIR', 'DATUM_AI_BASE_URL', 'DATUM_AI_API_KEY', 'DATUM_AI_MODEL', 'DATUM_AI_COMMAND', 'DATUM_AI_ARGS'] as const;
const SECRET = 'sk-datum-test-key-9f3a';

let priorEnv: Record<string, string | undefined> = {};
let dir = '';
const originalFetch = globalThis.fetch;

beforeEach(() => {
  priorEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  dir = mkdtempSync(join(tmpdir(), 'datum-ai-'));
  process.env.DATUM_DATA_DIR = dir;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (priorEnv[key] === undefined) delete process.env[key];
    else process.env[key] = priorEnv[key];
  }
});

function save(config: AiFileConfig) {
  saveAiConfig(config);
}

describe('ai config precedence', () => {
  it('is off when nothing is configured', () => {
    const status = aiStatus();
    expect(status.enabled).toBe(false);
    expect(status.provider).toBe('none');
    expect(status.source).toBe('none');
  });

  it('uses the file when no env endpoint is set', () => {
    save({
      activeProvider: 'anthropic',
      providers: { anthropic: { apiKey: SECRET, model: 'claude-sonnet-5-5' } },
    });
    const status = aiStatus();
    expect(status.enabled).toBe(true);
    expect(status.provider).toBe('anthropic');
    expect(status.label).toBe('Anthropic');
    expect(status.model).toBe('claude-sonnet-5-5');
    expect(status.source).toBe('file');
  });

  it('lets DATUM_AI_BASE_URL override the file', () => {
    save({
      activeProvider: 'grok',
      providers: { grok: { apiKey: SECRET, model: 'grok-4.7' } },
    });
    process.env.DATUM_AI_BASE_URL = 'https://example.test/v1';
    process.env.DATUM_AI_MODEL = 'env-model';
    process.env.DATUM_AI_API_KEY = 'env-key-value';
    const runtime = resolveAiRuntime();
    expect(runtime.source).toBe('env');
    expect(runtime.provider).toBe('http');
    expect(runtime.model).toBe('env-model');
    expect(runtime.baseUrl).toBe('https://example.test/v1');
    expect(runtime.apiKey).toBe('env-key-value');
    expect(aiStatus().enabled).toBe(true);
  });

  it('lets DATUM_AI_COMMAND override the file when no base URL is set', () => {
    save({
      activeProvider: 'deepseek',
      providers: { deepseek: { apiKey: SECRET, model: 'deepseek-flash' } },
    });
    process.env.DATUM_AI_COMMAND = '/usr/bin/true';
    const status = aiStatus();
    expect(status.source).toBe('env');
    expect(status.provider).toBe('command');
    expect(status.label).toBe('Local command');
  });

  it('lets DATUM_AI_MODEL and DATUM_AI_API_KEY override the saved provider fields', () => {
    save({
      activeProvider: 'anthropic',
      providers: { anthropic: { apiKey: SECRET, model: 'claude-sonnet-5-5' } },
    });
    process.env.DATUM_AI_MODEL = 'claude-haiku-5-5';
    process.env.DATUM_AI_API_KEY = 'env-overlay-key';
    const runtime = resolveAiRuntime();
    expect(runtime.source).toBe('file');
    expect(runtime.provider).toBe('anthropic');
    expect(runtime.model).toBe('claude-haiku-5-5');
    expect(runtime.apiKey).toBe('env-overlay-key');
  });

  it('stays off when the active provider has no key', () => {
    save({ activeProvider: 'grok', providers: { grok: { apiKey: '', model: 'grok-4.7' } } });
    expect(aiStatus().enabled).toBe(false);
  });
});

describe('ai config file', () => {
  it('writes ai-config.json as mode 0600 and masks the key', () => {
    updateAiConfig({
      activeProvider: 'anthropic',
      provider: { apiKey: SECRET, model: 'claude-sonnet-5-5' },
    });
    const mode = statSync(join(dir, 'ai-config.json')).mode & 0o777;
    expect(mode).toBe(0o600);
    const view = publicAiConfig();
    const serialized = JSON.stringify(view);
    expect(view.providers.anthropic.keySet).toBe(true);
    expect(view.providers.anthropic.keyHint).toBe(maskSecret(SECRET));
    expect(view.providers.anthropic.keyHint).toBe('••••9f3a');
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('sk-datum-test-key');
    expect(loadAiConfig().providers.anthropic?.apiKey).toBe(SECRET);
  });

  it('keeps the saved key when the update omits it or echoes the mask', () => {
    updateAiConfig({ activeProvider: 'deepseek', provider: { apiKey: SECRET, model: 'deepseek-chat' } });
    updateAiConfig({ activeProvider: 'deepseek', provider: { model: 'deepseek-reasoner' } });
    expect(loadAiConfig().providers.deepseek?.apiKey).toBe(SECRET);
    expect(loadAiConfig().providers.deepseek?.model).toBe('deepseek-reasoner');
    updateAiConfig({ activeProvider: 'deepseek', provider: { apiKey: maskSecret(SECRET), model: 'deepseek-flash' } });
    expect(loadAiConfig().providers.deepseek?.apiKey).toBe(SECRET);
    updateAiConfig({ activeProvider: 'off' });
    expect(loadAiConfig().activeProvider).toBe('off');
    expect(loadAiConfig().providers.deepseek?.apiKey).toBe(SECRET);
  });

  it('does not log the key while saving', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    updateAiConfig({ activeProvider: 'grok', provider: { apiKey: SECRET, model: 'grok-4.7' } });
    const dumped = [...spy.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(dumped).not.toContain(SECRET);
  });
});

describe('provider request shaping', () => {
  it('builds an Anthropic Messages request without putting the key in the body', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' }, nested: { type: 'object', properties: { n: { type: 'integer' } } } },
      required: ['name'],
    };
    const req = buildAnthropicRequest({
      apiKey: SECRET,
      model: 'claude-sonnet-5-5',
      rules: 'Return JSON only.',
      prompt: 'Build a schedule.',
      schema,
      effort: 'medium',
    });
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['x-api-key']).toBe(SECRET);
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(req.body)).not.toContain(SECRET);
    expect(req.body.messages).toEqual([{ role: 'user', content: 'Build a schedule.' }]);
    expect(req.body.system).toContain('Return JSON only.');
    expect(req.body.output_config?.format?.type).toBe('json_schema');
    expect(req.body.output_config?.effort).toBe('medium');
    const sent = req.body.output_config?.format?.schema as { additionalProperties?: boolean; properties?: { nested?: { additionalProperties?: boolean } } };
    expect(sent.additionalProperties).toBe(false);
    expect(sent.properties?.nested?.additionalProperties).toBe(false);
    expect(schema).not.toHaveProperty('additionalProperties');
    expect(closeJsonSchema(schema)).not.toBe(schema);
  });

  it('reads JSON from Anthropic text and tool_use blocks', () => {
    expect(anthropicResultText({ content: [{ type: 'text', text: '{"ok":true}' }] })).toBe('{"ok":true}');
    expect(anthropicResultText({ content: [{ type: 'tool_use', input: { ok: true } }] })).toBe('{"ok":true}');
  });

  it('uses preset chat-completions URLs', () => {
    expect(chatCompletionsUrl(AI_PRESETS.grok.baseUrl)).toBe('https://api.x.ai/v1/chat/completions');
    expect(chatCompletionsUrl(AI_PRESETS.deepseek.baseUrl)).toBe('https://api.deepseek.com/chat/completions');
    expect(chatCompletionsUrl('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(anthropicMessagesUrl()).toBe('https://api.anthropic.com/v1/messages');
  });

  it('posts Grok and DeepSeek through the OpenAI-compatible path', async () => {
    const seen: { url: string; authorization?: string; body: { model?: string } }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      seen.push({ url: String(url), authorization: headers.Authorization, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 2, completion_tokens: 1 } }), { status: 200 });
    }) as typeof fetch;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    save({ activeProvider: 'grok', providers: { grok: { apiKey: SECRET, model: 'grok-4.7' } } });
    const grokEvents: { type: string; result?: unknown }[] = [];
    await runStructured({ prompt: 'ping', rules: 'json', schema: { type: 'object' }, onEvent: (e) => grokEvents.push(e) });

    save({ activeProvider: 'deepseek', providers: { deepseek: { apiKey: SECRET, model: 'deepseek-chat' } } });
    await runStructured({ prompt: 'ping', rules: 'json', schema: { type: 'object' }, onEvent: () => {} });

    save({ activeProvider: 'custom', providers: { custom: { apiKey: '', model: 'local-model', baseUrl: 'https://llm.example/v1' } } });
    await runStructured({ prompt: 'ping', rules: 'json', schema: { type: 'object' }, onEvent: () => {} });

    expect(seen.map((call) => call.url)).toEqual([
      'https://api.x.ai/v1/chat/completions',
      'https://api.deepseek.com/chat/completions',
      'https://llm.example/v1/chat/completions',
    ]);
    expect(seen[0].authorization).toBe(`Bearer ${SECRET}`);
    expect(seen[0].body.model).toBe('grok-4.7');
    expect(seen[1].body.model).toBe('deepseek-chat');
    expect(seen[2].authorization).toBeUndefined();
    expect(seen[2].body.model).toBe('local-model');
    expect(grokEvents.some((e) => e.type === 'result' && (e.result as { ok?: boolean }).ok === true)).toBe(true);
    expect(log.mock.calls.flat().join(' ')).not.toContain(SECRET);
  });

  it('posts Anthropic with the Messages headers and returns the JSON object', async () => {
    save({ activeProvider: 'anthropic', providers: { anthropic: { apiKey: SECRET, model: 'claude-sonnet-5-5' } } });
    let headers: Record<string, string> = {};
    let body = '';
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      body = String(init?.body);
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '{"projectName":"Cedar"}' }],
        usage: { input_tokens: 5, output_tokens: 6 },
      }), { status: 200 });
    }) as typeof fetch;
    const events: { type: string; result?: unknown; usage?: { input?: number } }[] = [];
    await runStructured({
      prompt: 'Build it',
      rules: 'JSON only',
      schema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] },
      onEvent: (e) => events.push(e),
    });
    expect(headers['x-api-key']).toBe(SECRET);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(body).not.toContain(SECRET);
    expect(body).toContain('json_schema');
    const result = events.find((e) => e.type === 'result');
    expect((result?.result as { projectName?: string } | undefined)?.projectName).toBe('Cedar');
    expect(result?.usage?.input).toBe(5);
  });

  it('redacts the key from a failed connection test', async () => {
    save({ activeProvider: 'anthropic', providers: { anthropic: { apiKey: SECRET, model: 'claude-sonnet-5-5' } } });
    globalThis.fetch = (async () => new Response(`bad key ${SECRET}`, { status: 401 })) as typeof fetch;
    const result = await testAiConnection({ provider: 'anthropic' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain(SECRET);
      expect(result.error).toContain('[redacted]');
    }
    expect(redactSecrets(`see ${SECRET}`, [SECRET])).not.toContain(SECRET);
  });

  it('uses the provider error message instead of the raw JSON body', async () => {
    save({ activeProvider: 'grok', providers: { grok: { apiKey: SECRET, model: 'grok-4.7' } } });
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: `invalid key ${SECRET}` } }), { status: 401 })) as typeof fetch;
    const result = await testAiConnection({ provider: 'grok' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalid key [redacted]');
      expect(result.error).not.toContain(SECRET);
      expect(result.error).not.toContain('"error"');
    }
  });
});

describe('preset defaults', () => {
  it('matches the documented default model ids', () => {
    expect(AI_PRESETS.anthropic.defaultModel).toBe('claude-sonnet-5-5');
    expect(AI_PRESETS.grok.defaultModel).toBe('grok-4.7');
    expect(AI_PRESETS.deepseek.defaultModel).toBe('deepseek-flash');
    expect(AI_PRESETS.deepseek.models).toEqual(expect.arrayContaining(['deepseek-chat', 'deepseek-reasoner']));
  });
});
