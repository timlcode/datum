import type { Project } from '@engine/types';

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modified?: number;
  ext?: string;
}

export interface Place {
  name: string;
  path: string;
}

export type AttachmentMode = 'baseline' | 'reference' | 'verify';
export interface Attachment {
  id: string;
  name: string;
  path: string;
  kind: 'schedule' | 'pdf' | 'text';
  mode: AttachmentMode;
  text: string;
  truncated: boolean;
  chars: number;
  summary: string;
}

export interface RecentEntry {
  path: string;
  name: string;
  openedAt: number;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => call<{ version: string; java: boolean; ai: boolean; aiProvider: string; aiLabel: string; aiSource: string; chromium: boolean; model: string; facts: boolean }>('/api/health'),
  places: () => call<{ places: Place[]; recent: RecentEntry[] }>('/api/fs/places'),
  list: (path: string, all = false) => call<{ path: string; parent: string | null; entries: FsEntry[] }>(`/api/fs/list?path=${encodeURIComponent(path)}${all ? '&all=1' : ''}`),
  mkdir: (path: string) => call<{ path: string }>('/api/fs/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),
  removeRecent: (path: string) => call('/api/recent?path=' + encodeURIComponent(path), { method: 'DELETE' }),
  open: (path: string) => call<{ project: Project }>('/api/project/open', { method: 'POST', body: JSON.stringify({ path }) }),
  save: (project: Project, path?: string) => call<{ path: string }>('/api/project/save', { method: 'POST', body: JSON.stringify({ project, path }) }),
  exists: (path: string) => call<{ exists: boolean }>('/api/project/exists', { method: 'POST', body: JSON.stringify({ path }) }),
  printJob: (project: Project, options: unknown) => call<{ token: string }>('/api/print/job', { method: 'POST', body: JSON.stringify({ project, options }) }),
  printPdf: (project: Project, options: Record<string, unknown>) => call<{ path: string; bytes: number }>('/api/print/pdf', { method: 'POST', body: JSON.stringify({ project, options }) }),
  openExternal: (path: string) => call('/api/open-external', { method: 'POST', body: JSON.stringify({ path }) }),
  aiConfig: () => call<AiConfigView>('/api/ai/config'),
  aiSave: (body: AiConfigUpdate) => call<AiConfigView>('/api/ai/config', { method: 'PUT', body: JSON.stringify(body) }),
  aiTest: (body: AiTestRequest) => call<{ provider: string; model: string; detail: string }>('/api/ai/test', { method: 'POST', body: JSON.stringify(body) }),
  attachPath: (path: string, mode: AttachmentMode) => call<{ attachment: Attachment }>('/api/ai/attach', { method: 'POST', body: JSON.stringify({ path, mode }) }),
  attachFile: async (file: File, mode: AttachmentMode) => {
    const buf = await file.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    return call<{ attachment: Attachment }>('/api/ai/attach', { method: 'POST', body: JSON.stringify({ name: file.name, base64: btoa(bin), mode }) });
  },
};

export type AiProviderId = 'off' | 'anthropic' | 'grok' | 'deepseek' | 'custom';

export interface AiPreset {
  id: Exclude<AiProviderId, 'off'>;
  label: string;
  hint: string;
  models: string[];
  defaultModel: string;
  needsBaseUrl: boolean;
  needsKey: boolean;
}

export interface AiProviderView {
  model: string;
  baseUrl: string;
  keySet: boolean;
  keyHint: string;
}

export interface AiConfigView {
  activeProvider: AiProviderId;
  providers: Record<string, AiProviderView>;
  presets: AiPreset[];
  effective: { enabled: boolean; provider: string; model: string; label: string; source: string };
  envOverride: boolean;
  envNote: string;
}

export interface AiConfigUpdate {
  activeProvider: AiProviderId;
  provider?: { apiKey?: string; model?: string; baseUrl?: string; clearKey?: boolean };
}

export interface AiTestRequest {
  provider?: AiProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export const AI_CONFIG_EVENT = 'datum-ai-config';

export interface AiEvent {
  type: 'thought' | 'text' | 'status' | 'result' | 'error';
  data?: string;
  result?: unknown;
  usage?: { input?: number; output?: number; reasoning?: number };
}

/** Streams server-sent events from an AI endpoint. Resolves with the final result. */
export async function streamAi<T>(url: string, body: unknown, onEvent: (e: AiEvent) => void, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let result: T | undefined;
  let error: string | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as AiEvent;
        onEvent(ev);
        if (ev.type === 'result') result = ev.result as T;
        if (ev.type === 'error') error = ev.data;
      } catch {
        /* partial */
      }
    }
  }
  if (error) throw new Error(error);
  if (result === undefined) throw new Error('The AI did not return a result.');
  return result;
}
