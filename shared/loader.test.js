import { describe, it, expect, beforeAll } from 'vitest';
import { loadPackage } from './loader.js';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testCacheDir = mkdtempSync(join(tmpdir(), 'npxall-loader-test-'));

beforeAll(() => {
  writeFileSync(
    join(testCacheDir, 'package.json'),
    JSON.stringify({ name: 'test-cache', version: '1.0.0', private: true }),
  );
  spawnSync('npm', ['install', 'ms', '--no-save', '--silent', '--ignore-scripts'], {
    cwd: testCacheDir, stdio: 'pipe', timeout: 60000,
  });
}, 60000);

describe('loadPackage', () => {
  it('loads a CJS package', async () => {
    const mod = await loadPackage('ms', testCacheDir);
    expect(typeof mod).toBe('function');
    expect(mod(60000)).toBe('1m');
  });

  it('throws for non-existent package', async () => {
    await expect(loadPackage('this-package-does-not-exist-xyz', testCacheDir))
      .rejects.toThrow(/Failed to load/);
  });
});
