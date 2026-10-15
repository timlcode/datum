// Local AI provider settings. The file lives in DATUM_DATA_DIR (mode 0600).
// Environment variables override it. See README "Optional AI".
//
// Precedence:
//   1. DATUM_AI_BASE_URL  — OpenAI-compatible HTTP. Ignores the file.
//   2. DATUM_AI_COMMAND   — local program. Ignores the file.
//   3. ai-config.json     — provider chosen in the settings panel.
// DATUM_AI_API_KEY and DATUM_AI_MODEL override the saved key and model
// when the base URL and command are unset.

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const AI_PROVIDER_IDS = ['off', 'anthropic', 'grok', 'deepseek', 'custom'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
export type StoredProviderId = Exclude<AiProviderId, 'off'>;

export const ANTHROPIC_BASE = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';
export const XAI_BASE = 'https://api.x.ai/v1';
export const DEEPSEEK_BASE = 'https://api.deepseek.com';

export interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AiFileConfig {
  activeProvider: AiProviderId;
  providers: Partial<Record<StoredProviderId, ProviderSettings>>;
  lastUpdated?: string;
}

export interface AiPreset {
  id: StoredProviderId;
  label: string;
  hint: string;
  transport: 'anthropic' | 'openai';
  baseUrl: string;
  defaultModel: string;
  models: string[];
  needsBaseUrl: boolean;
  needsKey: boolean;
}

/** Model ids documented as current on each provider's public docs (October 2026). */
export const AI_PRESETS: Record<StoredProviderId, AiPreset> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    hint: 'Claude via the Messages API',
    transport: 'anthropic',
    baseUrl: ANTHROPIC_BASE,
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
    needsBaseUrl: false,
    needsKey: true,
  },
  grok: {
    id: 'grok',
    label: 'Grok',
    hint: 'xAI, OpenAI-compatible chat completions',
    transport: 'openai',
    baseUrl: XAI_BASE,
    defaultModel: 'grok-4.7',
    models: ['grok-4.7', 'grok-4.6', 'grok-4.5'],
    needsBaseUrl: false,
    needsKey: true,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: 'OpenAI-compatible chat completions',
    transport: 'openai',
    baseUrl: DEEPSEEK_BASE,
    defaultModel: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    needsBaseUrl: false,
    needsKey: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    hint: 'Any OpenAI-compatible /chat/completions endpoint',
    transport: 'openai',
    baseUrl: '',
    defaultModel: '',
    models: [],
    needsBaseUrl: true,
    needsKey: false,
  },
};

export const STORED_PROVIDER_IDS = Object.keys(AI_PRESETS) as StoredProviderId[];

export interface AiRuntime {
  enabled: boolean;
  source: 'env' | 'file' | 'none';
  provider: 'none' | 'http' | 'command' | StoredProviderId;
  label: string;
  model: string;
  transport: 'none' | 'openai' | 'anthropic' | 'command';
  baseUrl: string;
  apiKey: string;
  command: string;
  commandArgs: string;
}

export interface PublicProvider {
  model: string;
  baseUrl: string;
  keySet: boolean;
  keyHint: string;
}

export interface PublicAiConfig {
  activeProvider: AiProviderId;
  providers: Record<StoredProviderId, PublicProvider>;
  presets: AiPreset[];
  effective: {
    enabled: boolean;
    provider: AiRuntime['provider'];
    model: string;
    label: string;
    source: AiRuntime['source'];
  };
  envOverride: boolean;
  envNote: string;
}

const NONE: AiRuntime = {
  enabled: false,
  source: 'none',
  provider: 'none',
  label: 'Off',
  model: '',
  transport: 'none',
  baseUrl: '',
  apiKey: '',
  command: '',
  commandArgs: '',
};

export function aiConfigPath(): string {
  const dir = process.env.DATUM_DATA_DIR?.trim() || join(homedir(), '.local', 'share', 'datum');
  return join(dir, 'ai-config.json');
}

export function emptyAiConfig(): AiFileConfig {
  return { activeProvider: 'off', providers: {} };
}

export function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isStoredProviderId(value: unknown): value is StoredProviderId {
  return typeof value === 'string' && value in AI_PRESETS;
}

/** Last four characters only, and never the whole secret. */
export function maskSecret(secret: string): string {
  const t = secret.trim();
  if (!t) return '';
  if (t.length <= 8) return '••••';
  return `••••${t.slice(-4)}`;
}

export function isMaskedSecret(value: string): boolean {
  return value.includes('•') || value.trim() === '••••';
}

export function providerLabel(id: string): string {
  if (id === 'http') return 'OpenAI-compatible';
  if (id === 'command') return 'Local command';
  if (isStoredProviderId(id)) return AI_PRESETS[id].label;
  return 'Off';
}

export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/$/, '');
  if (!base) return '';
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

export function anthropicMessagesUrl(baseUrl = ANTHROPIC_BASE): string {
  const base = baseUrl.trim().replace(/\/$/, '');
  if (base.endsWith('/v1/messages')) return base;
  if (base.endsWith('/v1')) return `${base}/messages`;
  return `${base}/v1/messages`;
}

export function loadAiConfig(): AiFileConfig {
  try {
    const raw = readFileSync(aiConfigPath(), 'utf8');
    return normalizeAiConfig(JSON.parse(raw));
  } catch {
    return emptyAiConfig();
  }
}

export function saveAiConfig(config: AiFileConfig): void {
  const path = aiConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const body = JSON.stringify(config, null, 2);
  writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

export function envOverrideKind(): 'endpoint' | 'command' | null {
  if (process.env.DATUM_AI_BASE_URL?.trim()) return 'endpoint';
  if (process.env.DATUM_AI_COMMAND?.trim()) return 'command';
  return null;
}

export function envNote(): string {
  const kind = envOverrideKind();
  if (kind === 'endpoint') {
    return 'DATUM_AI_BASE_URL is set, so that endpoint is used instead of the saved provider. Unset it to use this panel.';
  }
  if (kind === 'command') {
    return 'DATUM_AI_COMMAND is set, so that local program is used instead of the saved provider. Unset it to use this panel.';
  }
  const bits: string[] = [];
  if (process.env.DATUM_AI_API_KEY?.trim()) bits.push('DATUM_AI_API_KEY');
  if (process.env.DATUM_AI_MODEL?.trim()) bits.push('DATUM_AI_MODEL');
  if (bits.length) return `${bits.join(' and ')} override the saved key or model.`;
  return '';
}

export function resolveAiRuntime(): AiRuntime {
  const envModel = process.env.DATUM_AI_MODEL?.trim() || '';
  const envKey = process.env.DATUM_AI_API_KEY?.trim() || '';
  const base = process.env.DATUM_AI_BASE_URL?.trim();
  if (base) {
    return {
      enabled: true,
      source: 'env',
      provider: 'http',
      label: 'OpenAI-compatible',
      model: envModel,
      transport: 'openai',
      baseUrl: base,
      apiKey: envKey,
      command: '',
      commandArgs: '',
    };
  }
  const command = process.env.DATUM_AI_COMMAND?.trim();
  if (command) {
    return {
      enabled: true,
      source: 'env',
      provider: 'command',
      label: 'Local command',
      model: envModel,
      transport: 'command',
      baseUrl: '',
      apiKey: '',
      command,
      commandArgs: process.env.DATUM_AI_ARGS || '',
    };
  }
  return runtimeFromFile(loadAiConfig(), { envKey, envModel });
}

export function publicAiConfig(): PublicAiConfig {
  const file = loadAiConfig();
  const runtime = resolveAiRuntime();
  const providers = {} as Record<StoredProviderId, PublicProvider>;
  for (const id of STORED_PROVIDER_IDS) {
    const stored = file.providers[id];
    const preset = AI_PRESETS[id];
    providers[id] = {
      model: stored?.model || preset.defaultModel,
      baseUrl: id === 'custom' ? stored?.baseUrl || '' : preset.baseUrl,
      keySet: Boolean(stored?.apiKey?.trim()),
      keyHint: stored?.apiKey ? maskSecret(stored.apiKey) : '',
    };
  }
  return {
    activeProvider: file.activeProvider,
    providers,
    presets: STORED_PROVIDER_IDS.map((id) => AI_PRESETS[id]),
    effective: {
      enabled: runtime.enabled,
      provider: runtime.provider,
      model: runtime.model,
      label: runtime.label,
      source: runtime.source,
    },
    envOverride: envOverrideKind() !== null,
    envNote: envNote(),
  };
}

export function updateAiConfig(input: unknown): PublicAiConfig {
  if (!input || typeof input !== 'object') throw new Error('Missing AI settings.');
  const body = input as Record<string, unknown>;
  if (!isProviderId(body.activeProvider)) throw new Error('Pick a provider.');
  const current = loadAiConfig();
  const next: AiFileConfig = {
    activeProvider: body.activeProvider,
    providers: { ...current.providers },
    lastUpdated: new Date().toISOString(),
  };
  if (body.activeProvider !== 'off') {
    const id = body.activeProvider;
    const prev = current.providers[id] || { apiKey: '', model: AI_PRESETS[id].defaultModel };
    const patch = body.provider && typeof body.provider === 'object' ? (body.provider as Record<string, unknown>) : {};
    let apiKey = prev.apiKey || '';
    if (patch.clearKey === true) apiKey = '';
    else if (typeof patch.apiKey === 'string') {
      const incoming = patch.apiKey.trim();
      if (incoming && !isMaskedSecret(incoming)) apiKey = sanitizeSecret(incoming);
    }
    const model = sanitizeModel(
      typeof patch.model === 'string' && patch.model.trim() ? patch.model : prev.model || AI_PRESETS[id].defaultModel,
    );
    const stored: ProviderSettings = { apiKey, model };
    if (id === 'custom') {
      const rawUrl = typeof patch.baseUrl === 'string' ? patch.baseUrl : prev.baseUrl || '';
      const baseUrl = sanitizeBaseUrl(rawUrl);
      if (baseUrl) stored.baseUrl = baseUrl;
    }
    next.providers[id] = stored;
  }
  saveAiConfig(next);
  return publicAiConfig();
}

export interface TestTarget {
  runtime: AiRuntime;
  error?: string;
}

/** Resolve a connection test. An explicit provider uses the form/file, not the env endpoint override. */
export function resolveTestTarget(input: unknown): TestTarget {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (body.provider === 'off') return { runtime: NONE, error: 'Pick a provider before testing.' };
  if (isStoredProviderId(body.provider)) {
    const id = body.provider;
    const file = loadAiConfig();
    const stored = file.providers[id];
    const preset = AI_PRESETS[id];
    let apiKey = stored?.apiKey?.trim() || '';
    if (typeof body.apiKey === 'string' && body.apiKey.trim() && !isMaskedSecret(body.apiKey)) {
      try {
        apiKey = sanitizeSecret(body.apiKey);
      } catch (err) {
        return { runtime: NONE, error: (err as Error).message };
      }
    }
    let model = '';
    try {
      model = sanitizeModel(typeof body.model === 'string' && body.model.trim() ? body.model : stored?.model || preset.defaultModel);
    } catch (err) {
      return { runtime: NONE, error: (err as Error).message };
    }
    let baseUrl = preset.baseUrl;
    if (id === 'custom') {
      try {
        baseUrl = sanitizeBaseUrl(typeof body.baseUrl === 'string' ? body.baseUrl : stored?.baseUrl || '');
      } catch (err) {
        return { runtime: NONE, error: (err as Error).message };
      }
      if (!baseUrl) return { runtime: { ...NONE, provider: id, label: preset.label }, error: 'Set a base URL first.' };
    }
    if (preset.needsKey && !apiKey) {
      return { runtime: { ...NONE, provider: id, label: preset.label, model }, error: 'Paste an API key first.' };
    }
    return {
      runtime: {
        enabled: true,
        source: 'file',
        provider: id,
        label: preset.label,
        model,
        transport: preset.transport,
        baseUrl,
        apiKey,
        command: '',
        commandArgs: '',
      },
    };
  }
  const runtime = resolveAiRuntime();
  if (!runtime.enabled) return { runtime, error: 'AI is not configured yet.' };
  if (runtime.transport === 'command') {
    return { runtime, error: 'A local command has no connection test. Run a build to try it.' };
  }
  return { runtime };
}

function runtimeFromFile(file: AiFileConfig, overlay: { envKey: string; envModel: string }): AiRuntime {
  const id = file.activeProvider;
  if (!isStoredProviderId(id)) return { ...NONE, source: 'none' };
  const preset = AI_PRESETS[id];
  const stored = file.providers[id];
  const apiKey = overlay.envKey || stored?.apiKey?.trim() || '';
  const model = overlay.envModel || stored?.model?.trim() || preset.defaultModel;
  const baseUrl = id === 'custom' ? stored?.baseUrl?.trim() || '' : preset.baseUrl;
  const enabled = preset.needsKey ? Boolean(apiKey) : Boolean(baseUrl);
  if (!enabled) {
    return {
      ...NONE,
      source: 'file',
      provider: id,
      label: preset.label,
      model: '',
      transport: 'none',
      baseUrl,
    };
  }
  return {
    enabled: true,
    source: 'file',
    provider: id,
    label: preset.label,
    model,
    transport: preset.transport,
    baseUrl,
    apiKey,
    command: '',
    commandArgs: '',
  };
}

function normalizeAiConfig(value: unknown): AiFileConfig {
  if (!value || typeof value !== 'object') return emptyAiConfig();
  const raw = value as Record<string, unknown>;
  const activeProvider = isProviderId(raw.activeProvider) ? raw.activeProvider : 'off';
  const providers: AiFileConfig['providers'] = {};
  const rawProviders = raw.providers && typeof raw.providers === 'object' ? (raw.providers as Record<string, unknown>) : {};
  for (const id of STORED_PROVIDER_IDS) {
    const item = rawProviders[id];
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const apiKey = typeof row.apiKey === 'string' ? row.apiKey.trim() : '';
    const model = typeof row.model === 'string' ? row.model.trim().slice(0, 128) : '';
    const stored: ProviderSettings = { apiKey, model };
    if (id === 'custom' && typeof row.baseUrl === 'string' && row.baseUrl.trim()) stored.baseUrl = row.baseUrl.trim();
    if (apiKey || model || stored.baseUrl) providers[id] = stored;
  }
  const lastUpdated = typeof raw.lastUpdated === 'string' ? raw.lastUpdated : undefined;
  return { activeProvider, providers, ...(lastUpdated ? { lastUpdated } : {}) };
}

function sanitizeSecret(value: string): string {
  const t = value.trim();
  if (!t) return '';
  if (t.length > 512) throw new Error('That API key is too long.');
  if (/[\r\n]/.test(t)) throw new Error('The API key cannot contain a line break.');
  return t;
}

function sanitizeModel(value: string): string {
  const t = value.trim();
  if (!t) return '';
  if (t.length > 128) throw new Error('That model id is too long.');
  if (/[\r\n]/.test(t)) throw new Error('The model id cannot contain a line break.');
  return t;
}

function sanitizeBaseUrl(value: string): string {
  const t = value.trim();
  if (!t) return '';
  if (t.length > 300) throw new Error('That base URL is too long.');
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    throw new Error('The base URL must be an http or https address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('The base URL must be an http or https address.');
  if (url.username || url.password) throw new Error('Put the API key in the key field, not in the URL.');
  return t.replace(/\/$/, '');
}
