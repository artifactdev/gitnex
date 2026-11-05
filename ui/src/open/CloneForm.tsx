import { examplePath, joinPath } from '../app/osPath';
import { FolderOpen, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { ForgeRepoHit } from '../api/gen/ForgeRepoHit';
import type { GbError } from '../api/gen/GbError';
import { useOps } from '../app/ops';
import { openPathInTab } from '../app/runtime';
import { useAppState } from '../app/state';
import { cloneDestProblem, cloneUrlProblem } from './cloneInput';
import { repoNameFromUrl } from './repoName';
import { RepoSearch } from './RepoSearch';

/** Spec §13: the URL, a destination that follows it until edited, progress, Cancel, inline errors.
 * The folder picker chooses the parent: the repository goes into a new folder named after it. */
export function CloneForm({ tabId, autoFocus }: { tabId: string; autoFocus: boolean }) {
  const reposFolder = useAppState((s) => s.profile.reposFolder);
  const [url, setUrl] = useState('');
  const [dest, setDest] = useState('');
  const [destEdited, setDestEdited] = useState(false);
  /** The folder the picker chose (or a search hits), else the profile's repos folder. */
  const [parent, setParent] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) urlRef.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    if (destEdited) return;
    const name = repoNameFromUrl(url);
    const base = parent ?? reposFolder;
    setDest(base && name ? joinPath(base, name) : '');
  }, [url, reposFolder, parent, destEdited]);
  // The clone's op is labelled with its destination (`opStarted.label`).
  const op = useOps((s) => (busy ? Object.values(s.ops).find((o) => o.kind === 'clone' && o.label === dest.trim()) : undefined));

  const clone = async (remote: string, target: string) => {
    setDest(target);
    setBusy(true);
    setError(null);
    try {
      const repo = await api.clone(remote, target);
      // The tab that started the clone may be gone (closed) or no longer an Open tab: the
      // result then opens in a tab of its own instead of applying to a dead tab id.
      const here = useAppState.getState().profile.tabs.find((t) => t.id === tabId);
      await openPathInTab(repo.path, here?.kind === 'open' ? tabId : undefined);
    } catch (e) {
      const kind = (e as GbError | null)?.kind;
      setError(kind === 'AuthFailed' ? 'Authentication failed or was cancelled' : kind === 'Cancelled' ? 'Clone cancelled' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => { if (!busy) await clone(url.trim(), dest.trim()); };
  const chooseFolder = async () => {
    setPicking(true);
    setError(null);
    try {
      const picked = await api.pickFolder(parent ?? reposFolder ?? null);
      if (picked) {
        setParent(picked);
        setDestEdited(false);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPicking(false);
    }
  };
  /** A forge search hit: clone it into the chosen folder, in a folder named after it. */
  const cloneHit = async (hit: ForgeRepoHit) => {
    const remote = hit.project.cloneSsh.trim() || hit.project.cloneHttps.trim();
    if (!remote) {
      setError(`No clone URL for ${hit.project.path}`);
      return;
    }
    let base = parent ?? reposFolder;
    if (!base) {
      try {
        base = (await api.pickFolder(null)) ?? '';
      } catch (e) {
        setError(errorMessage(e));
        return;
      }
      if (!base) {
        setError('Choose a folder to clone it into');
        return;
      }
      setParent(base);
    }
    const name = repoNameFromUrl(remote) || repoNameFromUrl(hit.project.cloneHttps) || hit.project.name;
    if (!name) {
      setError(`Couldn't name a folder for ${hit.project.path}`);
      return;
    }
    setUrl(remote);
    setDestEdited(false);
    await clone(remote, joinPath(base, name));
  };

  const problem = cloneUrlProblem(url) ?? cloneDestProblem(dest);
  const percent = op?.percent ?? null;
  const name = repoNameFromUrl(url);
  return (
    <>
      <form className="clone-form" onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }}>
        <label>Repository URL <input ref={urlRef} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="git@gitlab.example.com:group/project.git" aria-label="Repository URL" disabled={busy} spellCheck={false} /></label>
        <label>
          Destination
          <div className="clone-dest">
            <input value={dest} onChange={(e) => { setDest(e.target.value); setDestEdited(true); setParent(null); }} placeholder={examplePath('repos/project')} aria-label="Destination" disabled={busy} spellCheck={false} />
            <button type="button" className="open-btn" onClick={() => void chooseFolder()} disabled={busy || picking} aria-label="Choose destination folder">
              <FolderOpen size={14} aria-hidden /> Choose…
            </button>
          </div>
          <span className="clone-hint">A folder named {name ? `“${name}”` : 'after the repository'} is created inside the folder you choose.</span>
        </label>
        {busy && (
          <div className="clone-progress">
            <LoaderCircle size={14} className="spin" />
            <span>{op?.phase ?? 'Starting…'}{percent !== null ? ` ${percent}%` : ''}</span>
            <progress max={100} value={percent ?? undefined} aria-label="Clone progress" />
            {op && <button type="button" className="open-btn" onClick={() => void api.cancelOp(op.op)}>Cancel</button>}
          </div>
        )}
        {problem && !busy && <p className="open-error" role="alert">{problem}</p>}
        {error && !busy && <p className="open-error" role="alert">{error}</p>}
        <div className="open-actions"><button type="submit" className="open-btn primary" disabled={busy || !url.trim() || !dest.trim() || problem !== null}>Clone</button></div>
      </form>
      <RepoSearch disabled={busy || picking} onClone={(hit) => void cloneHit(hit)} />
    </>
  );
}
