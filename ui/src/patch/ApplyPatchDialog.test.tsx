// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast } from '../ui/toastStore';

const applyPatch = vi.fn(async (..._a: unknown[]) => ({ journal: null, staging: null, wip: null }));
vi.mock('../api/client', () => ({ api: { applyPatch: (...a: unknown[]) => applyPatch(...a) }, errorMessage: (e: unknown) => (e as Error).message }));

const { ApplyPatchDialog } = await import('./ApplyPatchDialog');
const { useApplyPatch } = await import('./store');

describe('ApplyPatchDialog', () => {
  beforeEach(() => {
    applyPatch.mockClear();
    useApplyPatch.getState().close();
    useToast.getState().dismiss();
  });

  it('applies the pasted patch to the dialog’s worktree and closes', async () => {
    useApplyPatch.getState().open({ repo: 7, worktree: '/r' });
    render(<ApplyPatchDialog />);
    fireEvent.change(screen.getByLabelText('Patch'), { target: { value: 'diff --git a/a b/a\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(applyPatch).toHaveBeenCalledWith(7, '/r', 'diff --git a/a b/a\n'));
    expect(useApplyPatch.getState().target).toBeNull();
    expect(useToast.getState().message).toBe('Patch applied');
  });

  it('keeps the dialog open and shows git’s reason when the patch does not fit', async () => {
    applyPatch.mockRejectedValueOnce(new Error('patch does not apply'));
    useApplyPatch.getState().open({ repo: 7, worktree: '/r' });
    render(<ApplyPatchDialog />);
    fireEvent.change(screen.getByLabelText('Patch'), { target: { value: 'bad patch' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });
    expect((await screen.findByRole('alert')).textContent).toBe('patch does not apply');
    expect(useApplyPatch.getState().target).not.toBeNull();
  });
});
