import { describe, expect, it, vi } from 'vitest';
import type { FileTarget, MenuEnv } from '../menu/menuEnv';
import { buildMenu } from '../menu/registry';
import './gitignore';

const api = vi.hoisted(() => ({ addToGitignore: vi.fn(async () => ({ outcome: { patterns: ['/a.txt'] } })) }));
vi.mock('../api/client', () => ({ api }));
vi.mock('../write/client', () => ({ runWrite: vi.fn(async (_ctx: unknown, send: () => Promise<{ outcome: { patterns: string[] } }>) => (await send()).outcome) }));
const show = vi.hoisted(() => vi.fn());
vi.mock('../ui/toastStore', () => ({ useToast: { getState: () => ({ show }) } }));
vi.mock('../debug/errorToast', () => ({ toastActionError: vi.fn() }));

const env = { write: { tabId: 't', repoId: 1, worktree: '/r' } } as unknown as MenuEnv;
const target = (selection?: string[]): FileTarget => ({
  path: 'a.txt', root: '/r', sha: null, upstream: null, diff: {} as never, changed: true, deleted: false, list: 'wip',
  openIn: {} as never, wip: { worktree: '/r', staged: false, oldPath: null, status: 'M' }, selection,
});
const row = (t: FileTarget) => buildMenu('file', t, env).find((r) => r.kind === 'action' && r.id === 'file.gitignore') as Extract<ReturnType<typeof buildMenu>[number], { kind: 'action' }>;

describe('Add to .gitignore', () => {
  it('is offered for a changed working-tree file and for its selection', () => {
    expect(row(target())).toMatchObject({ label: 'Add to .gitignore' });
    expect(row(target(['a.txt', 'b.txt']))).toMatchObject({ label: 'Add 2 files to .gitignore' });
    expect(buildMenu('file', { ...target(), wip: null }, env).some((r) => r.kind === 'action' && r.id === 'file.gitignore')).toBe(false);
  });

  it('adds the row’s path and says what happened', async () => {
    row(target()).run();
    await vi.waitFor(() => expect(api.addToGitignore).toHaveBeenCalledWith(1, '/r', ['a.txt']));
    await vi.waitFor(() => expect(show).toHaveBeenCalledWith('Added a.txt to .gitignore'));
  });
});
