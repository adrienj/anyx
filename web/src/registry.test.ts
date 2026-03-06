import { describe, it, expect } from 'vitest';
import { resolveTypesEntry } from './registry';

describe('resolveTypesEntry', () => {
  it('returns types field when package has it (@types/lodash has types: index.d.ts)', async () => {
    const entry = await resolveTypesEntry('@types/lodash');
    expect(entry).toEqual({ pkg: '@types/lodash', file: 'index.d.ts' });
  });

  it('falls back to @types/{name} for packages without types field (semver)', async () => {
    const entry = await resolveTypesEntry('semver');
    expect(entry).toEqual({ pkg: '@types/semver', file: 'index.d.ts' });
  });

  it('returns null for package with no types and no @types', async () => {
    const entry = await resolveTypesEntry('__nonexistent_pkg_xyz__');
    expect(entry).toBeNull();
  });
});
