import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSandboxed, isBwrapAvailable } from './sandbox.js';
import { createCacheManager } from './cache.js';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const baseDir = mkdtempSync(join(tmpdir(), 'npxall-sandbox-test-'));
const cache = createCacheManager({ baseDir, maxCacheMb: 100, installTimeoutMs: 60000 });

beforeAll(async () => {
  await cache.installWithCacheCheck('ms');
  await cache.installWithCacheCheck('lodash');
}, 120000);

describe('spawnSandboxed', () => {
  it('executes a bare function', async () => {
    const result = await spawnSandboxed({
      cacheDir: cache.pkgCacheDir('ms'),
      packageName: 'ms',
      args: [60000],
      timeoutMs: 10000,
    });
    expect(result).toBe('1m');
  });

  it('executes a named method', async () => {
    const result = await spawnSandboxed({
      cacheDir: cache.pkgCacheDir('lodash'),
      packageName: 'lodash',
      method: 'camelCase',
      args: ['hello world'],
      timeoutMs: 10000,
    });
    expect(result).toBe('helloWorld');
  });

  it('returns error for invalid method', async () => {
    await expect(
      spawnSandboxed({
        cacheDir: cache.pkgCacheDir('ms'),
        packageName: 'ms',
        method: 'noSuchMethod',
        args: [],
        timeoutMs: 10000,
      }),
    ).rejects.toThrow(/not a function/);
  });

  it('executes pipeline steps', async () => {
    const result = await spawnSandboxed({
      cacheDir: cache.pkgCacheDir('lodash'),
      packageName: 'lodash',
      steps: [
        { method: 'camelCase', args: ['hello world'] },
        { method: 'toUpperCase', args: [] },
      ],
      timeoutMs: 10000,
    });
    expect(result).toBe('HELLOWORLD');
  });

  it('handles bare function via pipeline', async () => {
    const result = await spawnSandboxed({
      cacheDir: cache.pkgCacheDir('ms'),
      packageName: 'ms',
      steps: [{ method: '60000', args: [] }],
      timeoutMs: 10000,
    });
    expect(result).toBe('1m');
  });
});

describe('isBwrapAvailable', () => {
  it('returns a boolean', () => {
    expect(typeof isBwrapAvailable()).toBe('boolean');
  });
});
