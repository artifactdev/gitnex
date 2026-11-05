import { Ban } from 'lucide-react';
import { api } from '../api/client';
import type { FileTarget, MenuEnv } from '../menu/menuEnv';
import { registerMenu } from '../menu/registry';
import { useToast } from '../ui/toastStore';
import { runWrite } from '../write/client';
import { toastActionError } from '../debug/errorToast';

/** Add a changed file (or the selected files) to the repository's `.gitignore`: one journaled
 * save of `.gitignore`, so Undo puts it back. */
async function addToGitignore(env: MenuEnv, paths: string[]): Promise<void> {
  const ctx = env.write;
  if (!ctx) return;
  try {
    const out = await runWrite(ctx, () => api.addToGitignore(ctx.repoId, ctx.worktree, paths));
    if (!out) return;
    const n = out.patterns.length;
    useToast.getState().show(n === 0 ? 'Already in .gitignore' : n === 1 ? `Added ${paths[0]} to .gitignore` : `Added ${n} files to .gitignore`);
  } catch (e) {
    toastActionError(e, { retry: () => addToGitignore(env, paths) });
  }
}

const offGitignoreMenu = registerMenu<FileTarget, MenuEnv>({
  id: 'file.gitignore', kind: 'file', group: 'ignore', order: 0,
  when: (t, env) => !!env.write && t.changed && t.list === 'wip' && t.wip !== null,
  rows: (t, env) => {
    const paths = t.selection?.length ? t.selection : [t.path];
    if (!env.write || paths.length === 0) return [];
    const label = paths.length === 1 ? 'Add to .gitignore' : `Add ${paths.length} files to .gitignore`;
    return [{
      kind: 'action', id: 'file.gitignore', label, icon: Ban,
      tooltip: paths.length === 1 ? `Ignore ${paths[0]} in this repository` : `Ignore the ${paths.length} selected files in this repository`,
      run: () => { void addToGitignore(env, paths); },
    }];
  },
});
import.meta.hot?.dispose(offGitignoreMenu);
