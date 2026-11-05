// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyStoreKeys } from './legacyStoreKeys';

describe('GitVolt localStorage keys', () => {
  beforeEach(() => localStorage.clear());

  it('copies old keys to GitNex names once, without overwriting the new ones', () => {
    localStorage.setItem('gitvolt.theme', 'dark');
    localStorage.setItem('gitvolt.wipDraft.v2', '{"a":1}');
    localStorage.setItem('gitnex.theme', 'light');
    migrateLegacyStoreKeys();
    expect(localStorage.getItem('gitnex.theme')).toBe('light');
    expect(localStorage.getItem('gitnex.wipDraft.v2')).toBe('{"a":1}');
    expect(localStorage.getItem('gitvolt.theme')).toBe('dark');
  });
});
