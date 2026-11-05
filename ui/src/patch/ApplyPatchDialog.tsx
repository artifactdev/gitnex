import { FileInput, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useModalKeys } from '../app/modalKeys';
import { useToast } from '../ui/toastStore';
import { useApplyPatch } from './store';
import './patch.css';

/** The largest patch the backend accepts (core `patch::MAX_PATCH_BYTES`). */
const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Apply a `.patch`/`.diff` file, or one pasted in, with `git apply` in the active worktree. A
 * patch that doesn't fit fails with git's reason and leaves the working tree as it was.
 */
export function ApplyPatchDialog() {
  const target = useApplyPatch((s) => s.target);
  const close = useApplyPatch((s) => s.close);
  const toast = useToast((s) => s.show);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const form = useModalKeys<HTMLFormElement>(!!target, close);
  if (!target) return null;

  const choose = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError('That patch is over 16 MiB');
      return;
    }
    try {
      setText(await f.text());
      setFileName(f.name);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const apply = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.applyPatch(target.repo, target.worktree, text);
      toast('Patch applied');
      setText('');
      setFileName(null);
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <form
        ref={form}
        className="modal patch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-patch-title"
        onSubmit={(e) => { e.preventDefault(); void apply(); }}
      >
        <h2 id="apply-patch-title">Apply patch</h2>
        <p className="dim">
          A unified diff (<code>git diff</code> or <code>git format-patch</code> output) applied to
          the working tree with <code>git apply</code>. Untracked files aren’t in a diff.
        </p>
        <div className="patch-file">
          <button type="button" className="open-btn" onClick={() => file.current?.click()} disabled={busy}>
            <FileInput size={14} aria-hidden /> Choose patch file…
          </button>
          <span className="patch-file-name">{fileName ?? 'or paste a patch below'}</span>
          <input
            ref={file}
            type="file"
            accept=".patch,.diff,text/x-diff,text/plain"
            hidden
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setFileName(null); }}
          placeholder={'diff --git a/src/file.ts b/src/file.ts\n…'}
          aria-label="Patch"
          spellCheck={false}
          disabled={busy}
        />
        {error && <p className="open-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy || !text.trim()}>
            {busy && <LoaderCircle size={14} className="spin" aria-hidden />} Apply
          </button>
        </div>
      </form>
    </div>
  );
}
