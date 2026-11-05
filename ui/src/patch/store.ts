import { create } from 'zustand';

/** Where an applied patch goes: the active tab's repository and worktree. */
export interface PatchTarget {
  repo: number;
  worktree: string;
}

interface ApplyPatchState {
  target: PatchTarget | null;
  open(target: PatchTarget): void;
  close(): void;
}

/** The one Apply patch… dialog (AppShell mounts it; the palette and the WIP menu open it). */
export const useApplyPatch = create<ApplyPatchState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
