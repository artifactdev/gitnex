import { expect, it } from 'vitest';
import { numericForgeId } from './ids';

it('preserves numeric forge IDs and explicitly refuses GUIDs in numeric-only operations', () => {
  expect(numericForgeId(42)).toBe(42);
  expect(() => numericForgeId('11111111-2222-3333-4444-555555555555')).toThrow('numeric ID');
});
