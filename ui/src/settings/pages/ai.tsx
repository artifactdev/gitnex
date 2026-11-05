import { RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../../api/client';
import type { AiCommitSettings } from '../../api/gen/AiCommitSettings';
import type { AiDetected } from '../../api/gen/AiDetected';
import { useAppState } from '../../app/state';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { profileField } from '../bindings';
import { TextField } from '../frame/fields';
import { PageGroups, SettingsGroup } from '../frame/SettingsPage';
import { registerSettings, registerSettingsPage, type SettingsCtx } from '../registry';
import './ai.css';

const DEFAULT: AiCommitSettings = { enabled: false, provider: 'openai', endpoint: 'https://api.openai.com/v1', model: '', command: '' };

const updateAi = (patch: Partial<AiCommitSettings>) => useAppState.getState().updateProfile((p) => ({ ...p, aiCommit: { ...(p.aiCommit ?? DEFAULT), ...patch } }));

/** The registered `aiCommit` row's control: the master switch. */
function AiEnabledSwitch() {
  const enabled = useAppState((s) => s.profile.aiCommit?.enabled ?? false);
  return <Switch id="input-aiCommit" checked={enabled} onChange={(on) => updateAi({ enabled: on })} label="Generate commit messages with AI" />;
}

/** One label/description/control row, in Settings' own grid. */
function AiRow({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-head"><span className="setting-label">{label}</span></div>
        {desc && <p className="setting-desc">{desc}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function OpenAiSection({ cfg, set }: { cfg: AiCommitSettings; set: (patch: Partial<AiCommitSettings>) => void }) {
  const profileId = useAppState((s) => s.profile.id);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [endpointDraft, setEndpointDraft] = useState(cfg.endpoint);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setHasToken(false);
    api.aiTokenStatus().then((v) => { if (live) setHasToken(v); }, () => undefined);
    return () => { live = false; };
  }, [profileId]);
  useEffect(() => setEndpointDraft(cfg.endpoint), [cfg.endpoint]);
  const saveToken = async () => {
    if (!token.trim()) return;
    setError(null);
    try {
      await api.aiSetToken(token.trim());
      setHasToken(true);
      setToken('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const clearToken = async () => {
    setError(null);
    try {
      await api.aiClearToken();
      setHasToken(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const loadModels = async () => {
    setError(null);
    setLoading(true);
    try {
      if (token.trim()) {
        await api.aiSetToken(token.trim());
        setHasToken(true);
        setToken('');
      }
      const list = await api.aiModels(endpointDraft.trim() || cfg.endpoint);
      setModels(list);
      if (!cfg.model && list[0]) set({ model: list[0] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <SettingsGroup title="OpenAI-compatible endpoint">
      <AiRow label="Endpoint" desc="The API base, for example https://api.openai.com/v1 or http://localhost:11434/v1 for Ollama.">
        <TextField id="aiEndpoint" value={cfg.endpoint} placeholder="https://api.openai.com/v1" label="API endpoint" onDraft={setEndpointDraft} onCommit={(v) => { setEndpointDraft(v); set({ endpoint: v }); }} />
      </AiRow>
      <AiRow label="API token" desc="Optional. It is kept in the system keyring, never in the settings file.">
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={hasToken ? 'A token is saved' : 'sk-…'} aria-label="API token" autoComplete="off" spellCheck={false} />
        <button type="button" onClick={() => void saveToken()} disabled={!token.trim()}>Save token</button>
        {hasToken && <button type="button" onClick={() => void clearToken()}>Forget</button>}
        <span className="ai-token-state">{hasToken ? 'Saved' : 'None'}</span>
      </AiRow>
      <AiRow label="Model" desc="Load the endpoint's models, then pick one (or type an id).">
        <TextField id="aiModel" value={cfg.model} placeholder="gpt-4o-mini" label="Model" onCommit={(v) => set({ model: v })} />
        <button type="button" onClick={() => void loadModels()} disabled={loading || !(endpointDraft.trim() || cfg.endpoint)}>
          <RefreshCw size={12} aria-hidden /> {loading ? 'Loading…' : 'Load models'}
        </button>
        {models.length > 0 && (
          <Select<string> value={cfg.model} options={[['', 'Choose a model…'], ...models.map((m) => [m, m] as const)]} onChange={(m) => set({ model: m })} aria-label="Available models" />
        )}
      </AiRow>
      {error && <p className="setting-error" role="alert">{error}</p>}
    </SettingsGroup>
  );
}

function CliSection({ cfg, set }: { cfg: AiCommitSettings; set: (patch: Partial<AiCommitSettings>) => void }) {
  return (
    <SettingsGroup title="Local command-line tool">
      <AiRow label="Command" desc="Run in the repository with the prompt as one argument. {prompt} is required; {model} is replaced by the model. No shell is involved.">
        <TextField id="aiCommand" value={cfg.command} placeholder="copilot -s -p {prompt}" label="Command" onCommit={(v) => set({ command: v })} />
      </AiRow>
      <AiRow label="Model" desc="Optional. Required by a command that uses {model}.">
        <TextField id="aiCliModel" value={cfg.model} placeholder="auto" label="CLI model" onCommit={(v) => set({ model: v })} />
      </AiRow>
    </SettingsGroup>
  );
}

function DetectedSection({ set }: { set: (patch: Partial<AiCommitSettings>) => void }) {
  const [found, setFound] = useState<AiDetected[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detect = async () => {
    setBusy(true);
    setError(null);
    try {
      setFound(await api.aiDetect());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void detect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const use = (d: AiDetected) => {
    if (d.provider === 'openai') set({ provider: 'openai', endpoint: d.endpoint, model: d.models[0] ?? '' });
    else set({ provider: 'cli', command: d.command, model: d.models[0] ?? '' });
  };
  return (
    <SettingsGroup title="Detected on this machine" hint="local servers and CLIs">
      <div className="ai-detected">
        <div className="ai-detected-head">
          <button type="button" onClick={() => void detect()} disabled={busy}>
            <RefreshCw size={12} aria-hidden /> {busy ? 'Searching…' : 'Detect local AI'}
          </button>
          <span className="dim">Checks common local OpenAI servers and CLIs on your PATH.</span>
        </div>
        {error && <p className="setting-error" role="alert">{error}</p>}
        {found && found.length === 0 && <p className="dim">Nothing found. You can still enter an endpoint or a command above.</p>}
        {found && found.length > 0 && (
          <ul className="ai-detected-list" aria-label="Detected AI providers">
            {found.map((d) => (
              <li key={d.id} className="ai-detected-item">
                <div className="ai-detected-main">
                  <span className="ai-detected-name">{d.name}</span>
                  <span className="ai-detected-meta">{d.provider === 'openai' ? d.endpoint : d.command}{d.models.length > 0 ? ` · ${d.models.length} model${d.models.length === 1 ? '' : 's'}` : ''}</span>
                </div>
                <button type="button" onClick={() => use(d)}>Use</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsGroup>
  );
}

export function AiSection({ ctx }: { ctx: SettingsCtx }) {
  const current = useAppState((s) => s.profile.aiCommit);
  const cfg = current ?? DEFAULT;
  const set = (patch: Partial<AiCommitSettings>) => updateAi(patch);
  return (
    <div className="ai-settings">
      <PageGroups pageId="ai" ctx={ctx} />
      {cfg.enabled && (
        <>
          <SettingsGroup title="Provider">
            <AiRow label="Provider" desc="An OpenAI-compatible HTTP endpoint, or a local command-line tool.">
              <Select<AiCommitSettings['provider']> value={cfg.provider} options={[['openai', 'OpenAI-compatible endpoint'], ['cli', 'Local command-line tool']]} onChange={(provider) => set({ provider })} aria-label="AI provider" />
            </AiRow>
          </SettingsGroup>
          {cfg.provider === 'openai' ? <OpenAiSection cfg={cfg} set={set} /> : <CliSection cfg={cfg} set={set} />}
          <DetectedSection set={set} />
        </>
      )}
    </div>
  );
}

const offs = [
  registerSettingsPage({ id: 'ai', label: 'AI', scope: 'profile', order: 35, icon: Sparkles, summary: 'Generate commit messages with an OpenAI-compatible endpoint or a local CLI.', Body: (props) => <AiSection ctx={props.ctx} /> }),
  registerSettings([
    {
      id: 'aiCommit', label: 'AI commit messages', page: 'ai', group: 'AI',
      keywords: 'ai commit message generate openai ollama lm studio copilot cli model token endpoint sparkles',
      description: 'Generate a commit message from the staged changes with an OpenAI-compatible endpoint or a local command-line tool.',
      Control: AiEnabledSwitch,
      binding: profileField('aiCommit', undefined),
    },
  ]),
];
import.meta.hot?.dispose(() => offs.forEach((off) => off()));
