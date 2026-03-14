import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Create a cache manager for npxall package caching.
 * Each package is installed in its own isolated directory to prevent
 * cross-package require() attacks.
 *
 * @param {object} opts
 * @param {string} opts.baseDir - root cache directory (e.g. '/app/cache')
 * @param {number} [opts.maxCacheMb=500] - max total cache size in MB
 * @param {number} [opts.installTimeoutMs=60000] - npm install timeout in ms
 * @returns {object} cache manager API
 */
export function createCacheManager({ baseDir, maxCacheMb = 500, installTimeoutMs = 60000 }) {
  /** @type {Map<string, { sizeMb: number, lastUsed: number, refCount: number }>} */
  const registry = new Map();

  /** @type {Map<string, Promise<void>>} */
  const installing = new Map();

  // ── Path helpers ─────────────────────────────────────────────────────────

  /** Per-package cache directory: baseDir/<name>/ */
  function pkgCacheDir(name) {
    const parts = name.startsWith('@') ? name.split('/').slice(0, 2) : [name];
    return join(baseDir, ...parts);
  }

  /** Installed package path: baseDir/<name>/node_modules/<name>/ */
  function pkgDir(name) {
    const parts = name.startsWith('@') ? name.split('/').slice(0, 2) : [name];
    return join(baseDir, ...parts, 'node_modules', ...parts);
  }

  function isInstalled(name) {
    return existsSync(pkgDir(name));
  }

  // ── Registry helpers ─────────────────────────────────────────────────────

  function totalCachedMb() {
    let total = 0;
    for (const e of registry.values()) total += e.sizeMb;
    return total;
  }

  function measureSizeMb(name) {
    const result = spawnSync('du', ['-sm', pkgCacheDir(name)], { stdio: 'pipe' });
    if (result.status !== 0) return 0;
    return parseInt(result.stdout.toString().split('\t')[0], 10) || 0;
  }

  /** Track a package in the registry (for pre-existing installs) */
  function ensureRegistered(name) {
    if (!registry.has(name)) {
      registry.set(name, { sizeMb: measureSizeMb(name), lastUsed: Date.now(), refCount: 0 });
    }
  }

  /** Increment refCount while a package is in use (prevents eviction) */
  function acquire(name) {
    ensureRegistered(name);
    const entry = registry.get(name);
    entry.refCount++;
    entry.lastUsed = Date.now();
    return entry;
  }

  /** Decrement refCount after use */
  function release(name) {
    const entry = registry.get(name);
    if (entry) entry.refCount--;
  }

  // ── Eviction ─────────────────────────────────────────────────────────────

  function evictLRU(targetMb) {
    const evictable = [...registry.entries()]
      .filter(([, e]) => e.refCount === 0)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    for (const [name, entry] of evictable) {
      if (totalCachedMb() <= targetMb) break;
      const dir = pkgCacheDir(name);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      console.log(`[cache] Evicted ${name} (${entry.sizeMb} MB, LRU)`);
      registry.delete(name);
    }
  }

  // ── Install ──────────────────────────────────────────────────────────────

  /** Ensure a per-package cache directory exists with its own package.json */
  function ensurePkgCache(name) {
    const dir = pkgCacheDir(name);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const pkg = join(dir, 'package.json');
    if (!existsSync(pkg)) {
      const safeName = name.replace(/[^a-z0-9-]/g, '-');
      writeFileSync(pkg, JSON.stringify({ name: `npxall-cache-${safeName}`, version: '1.0.0', private: true }));
    }
  }

  /** Run npm install in the package's own cache directory */
  function install(name) {
    ensurePkgCache(name);
    const result = spawnSync('npm', ['install', name, '--no-save', '--silent', '--ignore-scripts'], {
      cwd: pkgCacheDir(name), stdio: 'pipe', timeout: installTimeoutMs,
    });
    if (result.error?.code === 'ETIMEDOUT') {
      throw new Error(`Install of '${name}' timed out after ${installTimeoutMs / 1000}s`);
    }
    if (result.status !== 0) {
      throw new Error(`Failed to install '${name}': ${result.stderr?.toString()}`);
    }
  }

  /**
   * Install a package if not cached, with LRU eviction and deduplication.
   * Concurrent calls for the same package share a single install Promise.
   * @param {string} name
   * @returns {Promise<void>}
   */
  async function installWithCacheCheck(name) {
    if (isInstalled(name)) return;
    if (installing.has(name)) return installing.get(name);

    const promise = (async () => {
      try {
        if (isInstalled(name)) return; // re-check after dedup
        if (totalCachedMb() >= maxCacheMb) evictLRU(maxCacheMb * 0.8);
        if (totalCachedMb() >= maxCacheMb) {
          const err = new Error(`Cache full (${totalCachedMb()}/${maxCacheMb} MB). Retry later.`);
          err.status = 507;
          throw err;
        }
        install(name);
        const sizeMb = measureSizeMb(name);
        registry.set(name, { sizeMb, lastUsed: Date.now(), refCount: 0 });
        console.log(`[cache] Installed ${name} (${sizeMb} MB) | total: ${totalCachedMb()}/${maxCacheMb} MB`);
        if (totalCachedMb() > maxCacheMb) evictLRU(maxCacheMb * 0.9);
      } finally {
        installing.delete(name);
      }
    })();

    installing.set(name, promise);
    return promise;
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  /** Wipe all cached packages (called on server start) */
  function bootClean() {
    if (existsSync(baseDir)) {
      rmSync(baseDir, { recursive: true, force: true });
      console.log(`[cache] Boot wipe: removed ${baseDir}`);
    }
    mkdirSync(baseDir, { recursive: true });
    registry.clear();
  }

  return {
    registry,
    pkgCacheDir,
    pkgDir,
    isInstalled,
    totalCachedMb,
    measureSizeMb,
    acquire,
    release,
    install,
    installWithCacheCheck,
    evictLRU,
    bootClean,
  };
}
