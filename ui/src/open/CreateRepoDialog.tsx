import { FolderOpen, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client';
import { joinPath } from '../app/osPath';
import { openPathInTab } from '../app/runtime';
import { useAppState } from '../app/state';
import { useModalKeys } from '../app/modalKeys';
import { cloneDestProblem } from './cloneInput';

/** The Open screen's Create action: a new local repository, made with `git init` and opened. */
export function CreateRepoDialog({ tabId, startFolder, onClose }: { tabId: string; startFolder: string; onClose: () => void }) {
  const reposFolder = useAppState((s) => s.profile.reposFolder);
  const [name, setName] = useState('');
  const [parent, setParent] = useState(startFolder || reposFolder || '');
  const [branch, setBranch] = useState('main');
  const [readme, setReadme] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useModalKeys<HTMLFormElement>(true, onClose);

  const trimmed = name.trim();
  const nameProblem = !trimmed
    ? 'Give the repository a name'
    : trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed)
      ? 'The name cannot contain / or \\'
      : null;
  const parentProblem = !parent.trim() ? 'Choose where to create it' : cloneDestProblem(parent);
  const problem = nameProblem ?? parentProblem;
  const full = trimmed && parent.trim() ? joinPath(parent, trimmed) : parent.trim();

  const chooseFolder = async () => {
    try {
      const picked = await api.pickFolder(parent || reposFolder || null);
      if (picked) setParent(picked);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || problem) return;
    setBusy(true);
    setError(null);
    try {
      const repo = await api.initRepo(full, branch.trim() || null, readme);
      await openPathInTab(repo.path, tabId);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <form ref={ref} className="modal open-modal open-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-repo-title" onSubmit={(e) => void create(e)} onPointerDown={(e) => e.stopPropagation()}>
        <div className="open-modal-head">
          <h2 id="create-repo-title">Create a repository</h2>
          <button type="button" className="open-icon-btn" aria-label="Close create repository" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="open-modal-body">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="project" aria-label="Repository name" autoFocus spellCheck={false} disabled={busy} />
          </label>
          <label>
            Create in
            <div className="open-create-row">
              <input value={parent} onChange={(e) => setParent(e.target.value)} placeholder="/path/to/folder" aria-label="Create in" spellCheck={false} disabled={busy} />
              <button type="button" className="open-btn" onClick={() => void chooseFolder()} disabled={busy} aria-label="Choose create folder">
                <FolderOpen size={14} aria-hidden /> Choose…
              </button>
            </div>
          </label>
          {full && <p className="dim open-create-path">Full path: <span className="open-path-mono">{full}</span></p>}
          <label>
            Default branch
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" aria-label="Default branch" spellCheck={false} disabled={busy} />
          </label>
          <label className="open-create-check">
            <input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} disabled={busy} />
            Initialize with a README.md
          </label>
          <p className="dim open-create-hint">
            {readme ? 'README.md is added and committed; that first commit creates the branch.' : 'An empty initial commit creates the branch; no files are added.'}
          </p>
          <p className="dim open-create-hint">The folder must be new or empty. The first commit is yours to make next.</p>
          {problem && !busy && <p className="open-error" role="alert">{problem}</p>}
          {error && <p className="open-error" role="alert">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy || problem !== null}>Create repository</button>
        </div>
      </form>
    </div>
  );
}
