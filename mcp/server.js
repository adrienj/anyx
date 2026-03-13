import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_DIR = process.env.NPXALL_CACHE_DIR || '/app/cache';
const CACHE_PKG = join(CACHE_DIR, 'package.json');

const argMaxMb = process.argv.find(a => a.startsWith('--max-cache-mb='));
const MAX_CACHE_MB = argMaxMb
  ? parseInt(argMaxMb.split('=')[1], 10)
  : parseInt(process.env.CACHE_MAX_MB || '500', 10);

// Timeouts: prevent runaway installs or long-running user functions
const INSTALL_TIMEOUT_MS = parseInt(process.env.INSTALL_TIMEOUT_MS || '60000', 10); // 60s
const EXEC_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS || '20000', 10);       // 20s

// ─── In-memory LRU package registry ──────────────────────────────────────────
// { sizeMb, lastUsed, refCount }
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
    writeFileSync(CACHE_PKG, JSON.stringify({ name: 'npxall-mcp-cache', version: '1.0.0', private: true }));
  }
}

function pkgDir(name) {
  const parts = name.startsWith('@') ? name.split('/').slice(0, 2) : [name];
  return join(CACHE_DIR, 'node_modules', ...parts);
}

function isInstalled(name) { return existsSync(pkgDir(name)); }

function measureSizeMb(name) {
  const result = spawnSync('du', ['-sm', pkgDir(name)], { stdio: 'pipe' });
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
    if (existsSync(pkgDir(name))) rmSync(pkgDir(name), { recursive: true, force: true });
    console.log(`[cache] Evicted ${name} (${entry.sizeMb} MB, LRU)`);
    freed += entry.sizeMb;
    pkgRegistry.delete(name);
  }
  return freed;
}

// ─── Package install ──────────────────────────────────────────────────────────

const installing = new Set();

function install(name) {
  ensureCache();
  const result = spawnSync('npm', ['install', name, '--no-save', '--silent'], {
    cwd: CACHE_DIR, stdio: 'pipe', timeout: INSTALL_TIMEOUT_MS,
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`Install of '${name}' timed out after ${INSTALL_TIMEOUT_MS / 1000}s`);
  }
  if (result.status !== 0) throw new Error(`Failed to install '${name}': ${result.stderr?.toString()}`);
}

function installWithCacheCheck(name) {
  if (installing.has(name)) return;
  installing.add(name);
  try {
    if (isInstalled(name)) return;
    if (totalCachedMb() >= MAX_CACHE_MB) {
      evictLRU(MAX_CACHE_MB * 0.8);
    }
    if (totalCachedMb() >= MAX_CACHE_MB) {
      const err = new Error(`Cache full (${totalCachedMb()}/${MAX_CACHE_MB} MB). All packages in use — retry later.`);
      err.status = 507;
      throw err;
    }
    install(name);
    const sizeMb = measureSizeMb(name);
    pkgRegistry.set(name, { sizeMb, lastUsed: Date.now(), refCount: 0 });
    console.log(`[cache] Installed ${name} (${sizeMb} MB) | total: ${totalCachedMb()}/${MAX_CACHE_MB} MB`);
    if (totalCachedMb() > MAX_CACHE_MB) evictLRU(MAX_CACHE_MB * 0.9);
  } finally {
    installing.delete(name);
  }
}

// ─── Package load ─────────────────────────────────────────────────────────────

async function loadPackage(name) {
  const req = createRequire(CACHE_PKG);
  let cjsError;
  try { return req(name); } catch (e) { cjsError = e; }
  try {
    const dir = pkgDir(name);
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
    throw new Error(`Failed to load '${name}': ${cjsError?.message ?? e.message}`);
  }
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseValue(val) {
  try { return JSON.parse(val); } catch {}
  if (val.includes(',')) {
    const parts = val.split(',').map(p => p.trim()).filter(p => p !== '');
    if (parts.length > 1) return parts.map(p => { try { return JSON.parse(p); } catch { return p; } });
  }
  return val;
}

// ─── Package name validation ──────────────────────────────────────────────────

const PKG_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
function validatePackageName(name) {
  if (!PKG_NAME_RE.test(name)) throw new Error(`Invalid package name: ${name}`);
}

// ─── Execute (args are already native JSON — no string parsing) ───────────────

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Execution timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function executePackage(pkgName, methodName, args) {
  validatePackageName(pkgName);

  if (!isInstalled(pkgName)) installWithCacheCheck(pkgName);

  if (!pkgRegistry.has(pkgName)) {
    pkgRegistry.set(pkgName, { sizeMb: measureSizeMb(pkgName), lastUsed: Date.now(), refCount: 0 });
  }
  const entry = pkgRegistry.get(pkgName);
  entry.refCount++;
  entry.lastUsed = Date.now();

  try {
    const raw = await loadPackage(pkgName);
    const mod = raw?.default ?? raw;

    if (methodName) {
      if (typeof mod[methodName] !== 'function') {
        const available = Object.keys(mod).filter(k => typeof mod[k] === 'function').slice(0, 10);
        throw new Error(`'${methodName}' is not a function in '${pkgName}'. Available: ${available.join(', ')}`);
      }
      return mod[methodName].apply(mod, args);
    }

    if (typeof mod === 'function') return mod.apply(null, args);
    return mod;
  } finally {
    entry.refCount--;
  }
}

function formatResult(result) {
  if (result === undefined || result === null) return 'null';
  if (typeof result === 'object') return JSON.stringify(result, null, 2);
  return String(result);
}

// ─── MCP server factory ───────────────────────────────────────────────────────
// Create a new McpServer per connection to avoid shared state across transports.

function createMcpServer() {
  const server = new McpServer({
    name: 'npxall',
    version: '0.1.0',
  });

  server.tool(
    'call',
    'Call any function from any npm package. ' +
    'Packages are installed on first use and cached (LRU, size-bounded). ' +
    'Args are native JSON — pass numbers, arrays, objects directly without quoting. ' +
    'Never write a utility script again. (Fine print: not for production critical paths.)',
    {
      package: z.string().describe(
        'npm package name, e.g. "lodash", "ms", "date-fns", "change-case", "@turf/turf"'
      ),
      method: z.string().optional().describe(
        'Function or method name on the package export, e.g. "camelCase", "format", "chunk"'
      ),
      args: z.array(z.unknown()).optional().describe(
        'Arguments as native JSON values — numbers, strings, arrays, objects. No quoting needed.'
      ),
    },
    async ({ package: pkgName, method, args = [] }) => {
      try {
        const result = await withTimeout(executePackage(pkgName, method, args), EXEC_TIMEOUT_MS);
        return { content: [{ type: 'text', text: formatResult(result) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  return server;
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── Modern: Streamable HTTP transport (MCP spec 2025-03-26) ──────────────────
// Stateless — new transport per POST. No sessions, no GET/DELETE needed.
app.post('/mcp', async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on('finish', () => transport.close().catch(() => {}));
});

// ── Legacy: SSE transport (Claude Desktop, older MCP clients) ────────────────
const sseTransports = new Map(); // sessionId → { transport, createdAt }
const SSE_MAX_AGE_MS = 30 * 60 * 1000; // 30 min TTL
const SSE_MAX_SESSIONS = 100;

function cleanStaleSse() {
  const now = Date.now();
  for (const [id, entry] of sseTransports) {
    if (now - entry.createdAt > SSE_MAX_AGE_MS) {
      entry.transport.close().catch(() => {});
      sseTransports.delete(id);
    }
  }
}

app.get('/sse', async (req, res) => {
  cleanStaleSse();
  if (sseTransports.size >= SSE_MAX_SESSIONS) {
    return res.status(503).json({ error: 'Too many SSE sessions' });
  }
  const server = createMcpServer();
  const transport = new SSEServerTransport('/messages', res);
  sseTransports.set(transport.sessionId, { transport, createdAt: Date.now() });
  await server.connect(transport);
  res.on('close', () => sseTransports.delete(transport.sessionId));
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const entry = sseTransports.get(sessionId);
  if (!entry) return res.status(404).json({ error: 'Session not found' });
  await entry.transport.handlePostMessage(req, res, req.body);
});

// ── Info & health ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cache: { usedMb: totalCachedMb(), maxMb: MAX_CACHE_MB, packages: pkgRegistry.size },
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'npxall-mcp',
    version: '0.1.0',
    description: 'MCP server — call any npm function from your LLM. No auth required.',
    transports: {
      streamableHttp: 'POST https://mcp.npxall.com/mcp',
      sse: 'GET https://mcp.npxall.com/sse  (POST https://mcp.npxall.com/messages)',
    },
    tool: {
      name: 'call',
      params: {
        package: 'string — npm package name',
        method: 'string? — function/method to call',
        args: 'unknown[]? — native JSON arguments',
      },
    },
    cache: { usedMb: totalCachedMb(), maxMb: MAX_CACHE_MB, packages: pkgRegistry.size },
  });
});

// ─── Exports (for testing) ────────────────────────────────────────────────────

export { app, createMcpServer, parseValue, validatePackageName, formatResult, pkgRegistry, totalCachedMb };

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootClean();
  ensureCache();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`npxall MCP server on port ${PORT} | cache limit: ${MAX_CACHE_MB} MB`);
    console.log(`  Streamable HTTP : POST http://localhost:${PORT}/mcp`);
    console.log(`  SSE (legacy)    : GET  http://localhost:${PORT}/sse`);
  });
}
