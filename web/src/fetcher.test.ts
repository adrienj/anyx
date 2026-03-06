import { describe, it, expect } from 'vitest';
import { fetchDts, fetchDtsRecursive } from './fetcher';

describe('fetchDts', () => {
  it('fetches a single .d.ts file from unpkg', async () => {
    const src = await fetchDts('@types/semver', 'index.d.ts');
    expect(typeof src).toBe('string');
    expect(src).toContain('export');
  });
});

describe('fetchDtsRecursive', () => {
  it('collects all files for @types/semver', async () => {
    const files = await fetchDtsRecursive('@types/semver', 'index.d.ts');
    const paths = Object.keys(files);
    // semver has individual files per function under functions/
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.some(p => p.includes('functions/'))).toBe(true);
  });
});
