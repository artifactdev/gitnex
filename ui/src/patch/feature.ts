import { FileInput } from 'lucide-react';
import { activeRuntime, registerActions } from '../app/actions';
import { worktreeOf } from '../app/runtime';
import { useApplyPatch } from './store';

/** Repository ▸ Apply patch… (and the palette): a `.patch`/`.diff` file into the active worktree. */
registerActions([
  {
    id: 'repository.applyPatch',
    label: 'Apply patch…',
    group: 'Repository',
    icon: FileInput,
    tooltip: 'Apply a .patch or .diff file to the current working tree (git apply)',
    when: () => !!worktreeOf(activeRuntime() ?? undefined),
    run: () => {
      const rt = activeRuntime();
      const worktree = worktreeOf(rt ?? undefined);
      if (rt?.repo && worktree) useApplyPatch.getState().open({ repo: rt.repo.id, worktree });
    },
  },
]);
