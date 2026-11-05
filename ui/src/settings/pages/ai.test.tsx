import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  aiTokenStatus: vi.fn(async () => false),
  aiDetect: vi.fn(async () => []),
  aiModels: vi.fn(async () => []),
  aiSetToken: vi.fn(async () => null),
  aiClearToken: vi.fn(async () => null),
}));
vi.mock('../../api/client', () => ({ api, errorMessage: (e: unknown) => String((e as { message?: string }).message ?? e) }));

import { EMPTY_PROFILE, useAppState } from '../../app/state';
import { ContextMenu } from '../../menu/ContextMenu';
import { useMenu } from '../../menu/menuStore';
import { AiSection } from './ai';

const ctx = { repoPath: null, repoName: null, tabId: null };
const reset = () => useAppState.setState({ loaded: true, profile: { ...EMPTY_PROFILE, id: 'p' } });
const renderIt = () => render(<><ContextMenu /><AiSection ctx={ctx} /></>);

describe('Settings › AI', () => {
  beforeEach(() => { vi.clearAllMocks(); useMenu.getState().close(); reset(); });
  afterEach(() => act(() => useMenu.getState().close()));

  it('turns generation on, edits the endpoint and switches to a command-line tool', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('switch', { name: 'Generate commit messages with AI' }));
    expect(useAppState.getState().profile.aiCommit).toMatchObject({ enabled: true, provider: 'openai', endpoint: 'https://api.openai.com/v1' });
    const endpoint = screen.getByLabelText('API endpoint') as HTMLInputElement;
    fireEvent.change(endpoint, { target: { value: 'http://localhost:11434/v1' } });
    fireEvent.blur(endpoint);
    expect(useAppState.getState().profile.aiCommit?.endpoint).toBe('http://localhost:11434/v1');
    fireEvent.click(screen.getByRole('button', { name: 'AI provider' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Local command-line tool' }));
    expect(useAppState.getState().profile.aiCommit?.provider).toBe('cli');
    const command = screen.getByLabelText('Command') as HTMLInputElement;
    fireEvent.change(command, { target: { value: 'copilot -s -p {prompt}' } });
    fireEvent.blur(command);
    expect(useAppState.getState().profile.aiCommit?.command).toBe('copilot -s -p {prompt}');
  });

  it('saves and forgets a token without putting it in the profile', async () => {
    useAppState.setState({ profile: { ...EMPTY_PROFILE, id: 'p', aiCommit: { enabled: true, provider: 'openai', endpoint: 'https://api.openai.com/v1', model: '', command: '' } } });
    api.aiTokenStatus.mockResolvedValueOnce(true);
    renderIt();
    expect(await screen.findByText('Saved')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
    await vi.waitFor(() => expect(api.aiSetToken).toHaveBeenCalledWith('sk-test'));
    expect(JSON.stringify(useAppState.getState().profile)).not.toContain('sk-test');
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    await vi.waitFor(() => expect(api.aiClearToken).toHaveBeenCalled());
  });
});
