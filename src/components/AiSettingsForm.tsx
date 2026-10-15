import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AI_CONFIG_EVENT, api, type AiConfigView, type AiProviderId } from '../api';

const CUSTOM_MODEL = '__custom';

const PROVIDER_ORDER: AiProviderId[] = ['off', 'anthropic', 'grok', 'deepseek', 'custom'];

function notify() {
  window.dispatchEvent(new CustomEvent(AI_CONFIG_EVENT));
}

export function AiSettingsForm() {
  const [config, setConfig] = useState<AiConfigView | null>(null);
  const [provider, setProvider] = useState<AiProviderId>('off');
  const [modelChoice, setModelChoice] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | 'forget' | null>(null);
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = () => {
    api.aiConfig().then((cfg) => {
      setConfig(cfg);
      setLoadError('');
      applyProvider(cfg, cfg.activeProvider, true);
    }).catch((err: Error) => setLoadError(err.message));
  };

  useEffect(() => { load(); }, []);

  const preset = config?.presets.find((p) => p.id === provider);
  const stored = provider === 'off' ? undefined : config?.providers[provider];
  const chosenModel = modelChoice === CUSTOM_MODEL ? customModel.trim() : modelChoice;

  const modelOptions = useMemo(() => preset?.models ?? [], [preset]);

  const applyProvider = (cfg: AiConfigView, id: AiProviderId, resetKey: boolean) => {
    setProvider(id);
    if (resetKey) setApiKey('');
    if (id === 'off') return;
    const row = cfg.providers[id];
    const models = cfg.presets.find((p) => p.id === id)?.models ?? [];
    const model = row?.model || '';
    if (model && !models.includes(model)) {
      setModelChoice(CUSTOM_MODEL);
      setCustomModel(model);
    } else {
      setModelChoice(model);
      setCustomModel('');
    }
    setBaseUrl(id === 'custom' ? row?.baseUrl || '' : '');
  };

  const say = (text: string, ok: boolean) => {
    setMessage(text);
    setMessageOk(ok);
  };

  const save = async (next: AiProviderId, extra?: { clearKey?: boolean; intent?: 'save' | 'clear' }) => {
    setBusy(extra?.clearKey ? 'forget' : extra?.intent === 'clear' ? 'clear' : 'save');
    try {
      const saved = await api.aiSave({
        activeProvider: next,
        provider: next === 'off' ? undefined : {
          model: chosenModel,
          baseUrl: next === 'custom' ? baseUrl.trim() : undefined,
          apiKey: apiKey.trim() || undefined,
          clearKey: extra?.clearKey,
        },
      });
      setConfig(saved);
      setApiKey('');
      applyProvider(saved, saved.activeProvider, false);
      notify();
      if (extra?.clearKey) say('Saved key forgotten on this computer.', true);
      else if (next === 'off') say('AI is off. Saved keys are still on this computer.', true);
      else if (saved.effective.enabled && saved.effective.source !== 'env') say(`${saved.effective.label} is ready.`, true);
      else if (saved.envOverride) say('Saved. Environment variables still override this panel.', true);
      else if (next === 'custom') say('Saved. Set a base URL to turn this endpoint on.', true);
      else say('Saved. Add an API key to turn this provider on.', true);
    } catch (err) {
      say((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    if (provider === 'off') {
      say('Pick a provider before testing.', false);
      return;
    }
    setBusy('test');
    try {
      const result = await api.aiTest({
        provider,
        model: chosenModel || undefined,
        baseUrl: provider === 'custom' ? baseUrl.trim() : undefined,
        apiKey: apiKey.trim() || undefined,
      });
      say(result.detail || 'Connection ok.', true);
    } catch (err) {
      say((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  if (loadError) return <div className="hint">{loadError}</div>;
  if (!config) return <div className="hint">Loading AI settings…</div>;

  return (
    <div className="ai-settings">
      <p className="hint ai-lead">Paste a key from the provider's console. Datum stores it on this computer and sends it only to that provider, when you run AI.</p>
      {config.envNote && <div className="ai-env">{config.envNote}</div>}
      <div className="ai-providers" role="radiogroup" aria-label="AI provider">
        {PROVIDER_ORDER.map((id) => {
          const meta = id === 'off' ? { label: 'Off', hint: 'AI stays optional' } : config.presets.find((p) => p.id === id);
          if (!meta) return null;
          const on = provider === id;
          return (
            <label key={id} className={on ? 'on' : ''}>
              <input type="radio" name="ai-provider" checked={on} onChange={() => applyProvider(config, id, true)} />
              <b>{meta.label}</b>
              <span>{meta.hint}</span>
            </label>
          );
        })}
      </div>

      {provider !== 'off' && preset && (
        <>
          {preset.needsBaseUrl && (
            <div className="field">
              <label htmlFor="ai-base">Base URL</label>
              <input id="ai-base" value={baseUrl} placeholder="https://example.com/v1" onChange={(e) => setBaseUrl(e.target.value)} autoComplete="off" spellCheck={false} />
              <div className="hint">Datum posts to this address plus /chat/completions.</div>
            </div>
          )}
          <div className="field">
            <label htmlFor="ai-key">API key</label>
            <input id="ai-key" type="password" value={apiKey} placeholder={stored?.keySet ? 'Key saved — paste to replace' : 'Paste API key'} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} />
            <div className="hint">{stored?.keySet ? `A key is saved (${stored.keyHint}). Leave this blank to keep it.` : 'Shown once by the provider. Datum never writes it into the schedule.'}</div>
          </div>
          <div className="field">
            <label htmlFor="ai-model">Model</label>
            {modelOptions.length > 0 && (
              <select id="ai-model" value={modelChoice || preset.defaultModel} onChange={(e) => setModelChoice(e.target.value)}>
                {modelOptions.map((m) => <option key={m} value={m}>{m}{m === preset.defaultModel ? ' (default)' : ''}</option>)}
                <option value={CUSTOM_MODEL}>Custom model id…</option>
              </select>
            )}
            {(modelOptions.length === 0 || modelChoice === CUSTOM_MODEL) && (
              <input id={modelOptions.length === 0 ? 'ai-model' : undefined} value={customModel} placeholder="model id" onChange={(e) => setCustomModel(e.target.value)} autoComplete="off" spellCheck={false} />
            )}
          </div>
        </>
      )}

      <div className="ai-settings-actions">
        <span className={`msg ${message ? (messageOk ? 'ok' : 'bad') : ''}`}>{message}</span>
        {provider !== 'off' && stored?.keySet && (
          <button className="btn sm ghost" type="button" disabled={!!busy} onClick={() => save(provider, { clearKey: true })}>Forget key</button>
        )}
        <button className="btn sm" type="button" disabled={!!busy || provider === 'off'} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
        <button className="btn sm" type="button" disabled={!!busy || (provider === 'off' && config.activeProvider === 'off')} onClick={() => save('off', { intent: 'clear' })}>{busy === 'clear' ? 'Clearing…' : 'Clear'}</button>
        <button className="btn sm primary" type="button" disabled={!!busy} onClick={() => save(provider, { intent: 'save' })}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-labelledby="ai-settings-title">
        <div className="d-head"><Sparkles /><h2 id="ai-settings-title">AI provider</h2><button className="icon-btn x" onClick={onClose}><X /></button></div>
        <div className="d-body">
          <AiSettingsForm />
        </div>
      </div>
    </div>
  );
}
