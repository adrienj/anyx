import express from 'express';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_DIR = process.env.NPXALL_CACHE_DIR || '/app/cache';
const CACHE_PKG = join(CACHE_DIR, 'package.json');

// --max-cache-mb=N or env CACHE_MAX_MB (default 500 MB)
const argMaxMb = process.argv.find(a => a.startsWith('--max-cache-mb='));
const MAX_CACHE_MB = argMaxMb
  ? parseInt(argMaxMb.split('=')[1], 10)
  : parseInt(process.env.CACHE_MAX_MB || '500', 10);

// Timeouts: prevent runaway installs or long-running user functions
const INSTALL_TIMEOUT_MS = parseInt(process.env.INSTALL_TIMEOUT_MS || '60000', 10); // 60s
const EXEC_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS || '20000', 10);       // 20s

// ─── In-memory package registry ───────────────────────────────────────────────
// pkgRegistry: Map<name, { sizeMb: number, lastUsed: number, refCount: number }>
const pkgRegistry = new Map();

function totalCachedMb() {
  let total = 0;
  for (const e of pkgRegistry.values()) total += e.sizeMb;
  return total;
}

// ─── Boot: wipe all cached packages ───────────────────────────────────────────

function bootClean() {
  const modules = join(CACHE_DIR, 'node_modules');
  if (existsSync(modules)) {
    rmSync(modules, { recursive: true, force: true });
    console.log(`[cache] Boot wipe: removed ${modules}`);
  }
  pkgRegistry.clear();
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function ensureCache() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(CACHE_PKG)) {
    writeFileSync(CACHE_PKG, JSON.stringify({ name: 'npxall-cache', version: '1.0.0', private: true }));
  }
}

function pkgDir(packageName) {
  const parts = packageName.startsWith('@') ? packageName.split('/').slice(0, 2) : [packageName];
  return join(CACHE_DIR, 'node_modules', ...parts);
}

function isInstalled(packageName) {
  return existsSync(pkgDir(packageName));
}

function measureSizeMb(packageName) {
  const dir = pkgDir(packageName);
  const result = spawnSync('du', ['-sm', dir], { stdio: 'pipe' });
  if (result.status !== 0) return 0;
  return parseInt(result.stdout.toString().split('\t')[0], 10) || 0;
}

function evictLRU(targetMb) {
  const evictable = [...pkgRegistry.entries()]
    .filter(([, e]) => e.refCount === 0)
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

  let freed = 0;
  for (const [name, entry] of evictable) {
    if (totalCachedMb() <= targetMb) break;
    const dir = pkgDir(name);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`[cache] Evicted ${name} (${entry.sizeMb} MB, LRU)`);
    }
    freed += entry.sizeMb;
    pkgRegistry.delete(name);
  }
  return freed;
}

// ─── Package install ──────────────────────────────────────────────────────────

const installing = new Set(); // guards against concurrent installs of the same package

function install(packageName) {
  ensureCache();
  const result = spawnSync('npm', ['install', packageName, '--no-save', '--silent'], {
    cwd: CACHE_DIR,
    stdio: 'pipe',
    timeout: INSTALL_TIMEOUT_MS,
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`Install of '${packageName}' timed out after ${INSTALL_TIMEOUT_MS / 1000}s`);
  }
  if (result.status !== 0) {
    throw new Error(`Failed to install '${packageName}': ${result.stderr?.toString()}`);
  }
}

function installWithCacheCheck(packageName) {
  if (installing.has(packageName)) return; // another request is already installing it
  installing.add(packageName);
  try {
    if (isInstalled(packageName)) return; // re-check after acquiring the lock
    if (totalCachedMb() >= MAX_CACHE_MB) {
      evictLRU(MAX_CACHE_MB * 0.8);
    }
    if (totalCachedMb() >= MAX_CACHE_MB) {
      const err = new Error(
        `Cache full (${totalCachedMb()}/${MAX_CACHE_MB} MB). All cached packages are currently in use — retry later.`
      );
      err.status = 507;
      throw err;
    }
    install(packageName);
    const sizeMb = measureSizeMb(packageName);
    pkgRegistry.set(packageName, { sizeMb, lastUsed: Date.now(), refCount: 0 });
    console.log(`[cache] Installed ${packageName} (${sizeMb} MB) | total: ${totalCachedMb()}/${MAX_CACHE_MB} MB`);
    if (totalCachedMb() > MAX_CACHE_MB) {
      evictLRU(MAX_CACHE_MB * 0.9);
    }
  } finally {
    installing.delete(packageName);
  }
}

// ─── Package load ─────────────────────────────────────────────────────────────

async function loadPackage(packageName) {
  const req = createRequire(CACHE_PKG);
  let cjsError;
  try {
    return req(packageName);
  } catch (e) {
    cjsError = e;
  }
  try {
    const dir = pkgDir(packageName);
    const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const exp = meta.exports;
    const mainField =
      (typeof exp === 'string' ? exp : null)
      ?? (typeof exp === 'object' && exp !== null
        ? exp['.']?.import ?? exp['.']?.default ?? (typeof exp['.'] === 'string' ? exp['.'] : null)
        : null)
      ?? meta.module ?? meta.main ?? 'index.js';
    return await import(pathToFileURL(join(dir, mainField)).href);
  } catch (e) {
    throw new Error(`Failed to load '${packageName}': ${cjsError?.message ?? e.message}`);
  }
}

// ─── Smart arg splitting (respects JSON depth) ───────────────────────────────

function splitArgs(str) {
  if (!str) return [];
  const args = [];
  let depth = 0, inStr = false, current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && inStr) { current += ch + (str[++i] ?? ''); continue; }
    if (ch === '"') { inStr = !inStr; current += ch; continue; }
    if (inStr) { current += ch; continue; }
    if (ch === '{' || ch === '[') { depth++; current += ch; continue; }
    if (ch === '}' || ch === ']') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) { args.push(current); current = ''; continue; }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseValue(val) {
  try { return JSON.parse(val); } catch {}
  return val;
}

// ─── Package name validation ──────────────────────────────────────────────────

const PKG_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
function validatePackageName(name) {
  if (!PKG_NAME_RE.test(name)) throw new Error(`Invalid package name: ${name}`);
}

// ─── Custom URL parser ───────────────────────────────────────────────────────
// URL pattern: /package/method/args/method/args/...
// Scoped:      /@org/package/method/args/...
// Dot chain:   /lodash/concat/[1,2],3/reverse.slice/0,1/
//   Dot shorthand chains no-arg methods: reverse.join means call reverse(), then join()
//   Only the last method in a dot chain receives the URL args.
// Note: // (double slash) also means "empty args" in parseUrl, but reverse proxies
//   (Traefik, nginx) normalize // to /, breaking step alignment. Use dot shorthand instead.
// Prototype methods: after any step, JS prototype methods work on the result
//   (e.g. .reverse, .join, .toUpperCase, .split, .slice on arrays/strings)

function parseUrl(rawUrl) {
  const path = decodeURIComponent(rawUrl.split('?')[0]);
  const segments = path.split('/').slice(1); // remove leading empty
  if (segments.length > 0 && segments[segments.length - 1] === '') segments.pop();

  let pkgName, startIdx;
  if (segments[0]?.startsWith('@') && segments.length >= 2) {
    pkgName = `${segments[0]}/${segments[1]}`;
    startIdx = 2;
  } else {
    pkgName = segments[0];
    startIdx = 1;
  }

  const steps = [];
  for (let i = startIdx; i < segments.length; i += 2) {
    const method = segments[i];
    const argsRaw = segments[i + 1] ?? '';
    if (method !== undefined) steps.push({ method, argsRaw });
  }

  return { pkgName, steps };
}

// ─── Pipeline executor ───────────────────────────────────────────────────────

function formatResult(result) {
  if (result === undefined || result === null) return null;
  return result;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Execution timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function executePipeline(pkgName, steps, bodyArgs) {
  validatePackageName(pkgName);

  if (!isInstalled(pkgName)) installWithCacheCheck(pkgName);

  // Ensure registry entry exists (package may have been installed externally or before boot)
  if (!pkgRegistry.has(pkgName)) {
    pkgRegistry.set(pkgName, { sizeMb: measureSizeMb(pkgName), lastUsed: Date.now(), refCount: 0 });
  }
  const entry = pkgRegistry.get(pkgName);
  entry.refCount++;
  entry.lastUsed = Date.now();

  try {
    const raw = await loadPackage(pkgName);
    const mod = raw?.default ?? raw;

    // If POST body provided and no URL steps, use body as args for direct call
    if (steps.length === 0 && bodyArgs && bodyArgs.length > 0) {
      if (typeof mod === 'function') return mod.apply(null, bodyArgs);
      throw new Error(`'${pkgName}' is not a function and no method specified`);
    }

    if (steps.length === 0) {
      throw new Error(`No method or arguments specified for '${pkgName}'`);
    }

    let acc = undefined;

    for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const { method, argsRaw } = steps[stepIdx];
      // URL args take priority; fall back to POST body args for the first step
      const urlArgs = splitArgs(argsRaw).map(parseValue);
      const explicitArgs = (urlArgs.length === 0 && stepIdx === 0 && bodyArgs && bodyArgs.length > 0)
        ? bodyArgs
        : urlArgs;

      // Expand dot shorthand: "reverse.slice" → [reverse, slice]
      const dotMethods = method.split('.');

      for (let di = 0; di < dotMethods.length; di++) {
        const m = dotMethods[di];
        const isLastDot = di === dotMethods.length - 1;

        // Build args for this sub-method call
        let callArgs;
        if (isLastDot) {
          if (stepIdx === 0 && acc === undefined) {
            callArgs = explicitArgs;
          } else {
            callArgs = [acc, ...explicitArgs];
          }
        } else {
          callArgs = acc !== undefined ? [acc] : [];
        }

        // First step: detect bare function vs method call
        if (stepIdx === 0 && di === 0 && acc === undefined) {
          if (typeof mod[m] === 'function') {
            // Method exists on module → call it
            acc = mod[m].apply(mod, callArgs);
          } else if (typeof mod === 'function') {
            // Module IS a function and m isn't a method on it → treat m as arg
            acc = mod.apply(null, [parseValue(m), ...explicitArgs]);
            break; // bare function with arg — skip remaining dot methods
          } else {
            const available = Object.keys(mod).filter(k => typeof mod[k] === 'function').slice(0, 10);
            throw new Error(`'${m}' is not a function in '${pkgName}'. Available: ${available.join(', ')}`);
          }
        } else {
          // Subsequent steps: call method on accumulator or on module
          if (acc !== null && acc !== undefined && typeof acc[m] === 'function') {
            acc = acc[m].apply(acc, isLastDot ? explicitArgs : []);
          } else if (typeof mod[m] === 'function') {
            acc = mod[m].apply(mod, callArgs);
          } else {
            throw new Error(`'${m}' is not a function on the result or '${pkgName}'`);
          }
        }
      }
    }

    return acc;
  } finally {
    entry.refCount--;
  }
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();

// Default Content-Type to application/json if not set
app.use((req, res, next) => {
  if (!req.headers['content-type']) {
    req.headers['content-type'] = 'application/json';
  }
  next();
});

app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cache: {
      usedMb: totalCachedMb(),
      maxMb: MAX_CACHE_MB,
      packages: pkgRegistry.size,
      entries: Object.fromEntries(
        [...pkgRegistry.entries()].map(([k, v]) => [k, { sizeMb: v.sizeMb, refCount: v.refCount }])
      ),
    },
  });
});

// ── Root info ────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    name: 'npxall-api',
    version: '2.0.0',
    cache: { usedMb: totalCachedMb(), maxMb: MAX_CACHE_MB, packages: pkgRegistry.size },
    usage: {
      pattern: 'GET /:package/:method/:args/:method/:args/...',
      chaining: '/lodash/concat/[1,2],3/reverse.slice/0,1/ → [3]',
      scoped: '/@turf/turf/bearing/pointA,pointB',
      bare: '/ms/60000 → "1m"',
      post: 'POST /:package/:method with JSON array body as args',
    },
    examples: [
      'GET /ms/60000',
      'GET /lodash/camelCase/hello world',
      'GET /lodash/chunk/[1,2,3,4],2',
      'GET /lodash/concat/[1,2],3/reverse/',
    ],
  });
});

// ── Pipeline route (catch-all) ───────────────────────────────────────────────

app.all('*', async (req, res) => {
  try {
    const { pkgName, steps } = parseUrl(req.url);

    if (!pkgName) {
      return res.status(400).json({ error: 'No package specified' });
    }

    // POST body: expect a JSON array of args
    const bodyArgs = Array.isArray(req.body) ? req.body : null;

    const result = await withTimeout(executePipeline(pkgName, steps, bodyArgs), EXEC_TIMEOUT_MS);
    res.json(formatResult(result));
  } catch (error) {
    const status = error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

// ─── Exports (for testing) ────────────────────────────────────────────────────

export { app, splitArgs, parseUrl, parseValue, validatePackageName, pkgRegistry, totalCachedMb };

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootClean();
  ensureCache();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`npxall API v2 running on port ${PORT} | cache limit: ${MAX_CACHE_MB} MB`);
  });
}
