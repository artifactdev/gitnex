import type { ForgeId } from '../api/gen/ForgeId';

export function numericForgeId(id: ForgeId): number {
  if (typeof id !== 'number') throw new Error('This forge operation requires a numeric ID');
  return id;
}
