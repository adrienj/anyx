import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCacheManager } from './cache.js';

describe('createCacheManager', () => {
  let cache;
  let baseDir;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'npxall-cache-test-'));
    cache = createCacheManager({ baseDir, maxCacheMb: 100, installTimeoutMs: 60000 });
  });

  describe('pkgCacheDir', () => {
    it('returns per-package directory for simple names', () => {
      expect(cache.pkgCacheDir('lodash')).toBe(join(baseDir, 'lodash'));
    });

    it('returns per-package directory for scoped names', () => {
      expect(cache.pkgCacheDir('@sindresorhus/slugify')).toBe(join(baseDir, '@sindresorhus', 'slugify'));
    });
  });

  describe('pkgDir', () => {
    it('returns node_modules path for simple names', () => {
      expect(cache.pkgDir('lodash')).toBe(join(baseDir, 'lodash', 'node_modules', 'lodash'));
    });

    it('returns node_modules path for scoped names', () => {
      expect(cache.pkgDir('@sindresorhus/slugify')).toBe(
        join(baseDir, '@sindresorhus', 'slugify', 'node_modules', '@sindresorhus', 'slugify'),
      );
    });
  });

  describe('isInstalled', () => {
    it('returns false for uninstalled packages', () => {
      expect(cache.isInstalled('lodash')).toBe(false);
    });
  });

  describe('totalCachedMb', () => {
    it('returns 0 when empty', () => {
      expect(cache.totalCachedMb()).toBe(0);
    });
  });

  describe('install', () => {
    it('installs a real package with --ignore-scripts', () => {
      cache.install('ms');
      expect(cache.isInstalled('ms')).toBe(true);
      expect(existsSync(cache.pkgDir('ms'))).toBe(true);
    }, 30000);

    it('uses per-package isolation', () => {
      cache.install('ms');
      expect(existsSync(join(cache.pkgCacheDir('ms'), 'node_modules', 'ms'))).toBe(true);
      expect(existsSync(cache.pkgCacheDir('lodash'))).toBe(false);
    }, 30000);
  });

  describe('installWithCacheCheck', () => {
    it('deduplicates concurrent installs', async () => {
      const p1 = cache.installWithCacheCheck('ms');
      const p2 = cache.installWithCacheCheck('ms');
      await Promise.all([p1, p2]);
      expect(cache.isInstalled('ms')).toBe(true);
    }, 30000);
  });

  describe('bootClean', () => {
    it('wipes and recreates the cache directory', () => {
      cache.install('ms');
      expect(cache.isInstalled('ms')).toBe(true);
      cache.bootClean();
      expect(cache.isInstalled('ms')).toBe(false);
      expect(existsSync(baseDir)).toBe(true);
      expect(cache.registry.size).toBe(0);
    }, 30000);
  });

  describe('acquire/release', () => {
    it('tracks reference counts', () => {
      cache.install('ms');
      const entry = cache.acquire('ms');
      expect(entry.refCount).toBe(1);
      cache.release('ms');
      expect(entry.refCount).toBe(0);
    }, 30000);
  });
});
