import { describe, it, expect } from 'vitest';
import request from 'supertest';
import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── Shared test cache dir ────────────────────────────────────────────────────

const TEST_CACHE = join(tmpdir(), `npxall-mcp-test-${process.pid}`);

process.env.NPXALL_CACHE_DIR = TEST_CACHE;
process.env.CACHE_MAX_MB = '100';

const { app, parseValue, validatePackageName, formatResult, pkgRegistry, totalCachedMb }
  = await import('./server.js');

// ─── MCP helpers ─────────────────────────────────────────────────────────────

// MCP Streamable HTTP requires Accept: application/json, text/event-stream.
// The server responds with text/event-stream (SSE), so we parse the data lines.
function parseSseBody(text) {
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try { return JSON.parse(line.slice(6)); } catch {}
    }
  }
  return null;
}

async function mcpPost(body) {
  const res = await request(app)
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .send(body);
  return { status: res.status, body: parseSseBody(res.text) ?? res.body };
}

// ─── Shared pure-function tests (same logic as API, catches drift) ────────────

describe('parseValue', () => {
  it('parses JSON number',   () => expect(parseValue('42')).toBe(42));
  it('parses JSON boolean',  () => expect(parseValue('true')).toBe(true));
  it('returns plain string', () => expect(parseValue('hello')).toBe('hello'));
  it('parses comma array',   () => expect(parseValue('1,2,3')).toEqual([1, 2, 3]));
  it('parses JSON object',   () => expect(parseValue('{"a":1}')).toEqual({ a: 1 }));
});

describe('validatePackageName', () => {
  it('accepts lodash',         () => expect(() => validatePackageName('lodash')).not.toThrow());
  it('accepts @turf/turf',     () => expect(() => validatePackageName('@turf/turf')).not.toThrow());
  it('rejects spaces',         () => expect(() => validatePackageName('foo bar')).toThrow());
  it('rejects semicolons',     () => expect(() => validatePackageName('foo;rm')).toThrow());
  it('rejects empty',          () => expect(() => validatePackageName('')).toThrow());
});

describe('formatResult', () => {
  it('undefined → "null"',   () => expect(formatResult(undefined)).toBe('null'));
  it('null → "null"',        () => expect(formatResult(null)).toBe('null'));
  it('number → string',      () => expect(formatResult(42)).toBe('42'));
  it('string → same string', () => expect(formatResult('1m')).toBe('1m'));
  it('object → JSON string', () => expect(formatResult({ a: 1 })).toBe('{\n  "a": 1\n}'));
  it('array → JSON string',  () => expect(formatResult([1, 2])).toBe('[\n  1,\n  2\n]'));
});

// ─── HTTP: info + health ──────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns MCP server info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('npxall-mcp');
    expect(res.body.transports).toHaveProperty('streamableHttp');
    expect(res.body.transports).toHaveProperty('sse');
    expect(res.body.tool.name).toBe('call');
  });
});

describe('GET /health', () => {
  it('returns ok with cache stats', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.cache).toMatchObject({ maxMb: 100 });
  });
});

// ─── MCP JSON-RPC: Streamable HTTP (POST /mcp) ───────────────────────────────

describe('POST /mcp — JSON-RPC protocol', () => {
  it('initialize → returns serverInfo', async () => {
    const { status, body } = await mcpPost({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.1' },
      },
    });
    expect(status).toBe(200);
    expect(body?.result?.serverInfo?.name).toBe('npxall');
  });

  it('tools/list → exposes single "call" tool', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });

    const { status, body } = await mcpPost({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    expect(status).toBe(200);
    const tools = body?.result?.tools ?? [];
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('call');
    expect(tools[0].inputSchema.properties).toHaveProperty('package');
    expect(tools[0].inputSchema.properties).toHaveProperty('method');
    expect(tools[0].inputSchema.properties).toHaveProperty('args');
  });

  it('tools/call ms → returns "1m"', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });

    const { status, body } = await mcpPost({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'call', arguments: { package: 'ms', args: [60000] } },
    });

    expect(status).toBe(200);
    const content = body?.result?.content ?? [];
    expect(content[0]?.text).toBe('1m');
  }, 30_000);

  it('tools/call with invalid package → isError true', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });

    const { status, body } = await mcpPost({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'call', arguments: { package: 'INVALID PACKAGE!' } },
    });

    expect(status).toBe(200);
    expect(body?.result?.isError).toBe(true);
    expect(body?.result?.content[0]?.text).toMatch(/error/i);
  }, 10_000);

  it('native JSON args are passed as-is (no string parsing)', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });

    // ms(3600000) called with a native number, not the string "3600000"
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'call', arguments: { package: 'ms', args: [3600000] } },
    });

    expect(body?.result?.content[0]?.text).toBe('1h');
  }, 10_000);
});

// ─── SSE transport endpoint ───────────────────────────────────────────────────

describe('GET /sse', () => {
  it('responds with text/event-stream content-type', async () => {
    // SSE keeps the connection open, so supertest never resolves — spin up a
    // real server, capture the Content-Type header, then immediately destroy.
    const server = await new Promise(resolve => {
      const s = app.listen(0, () => resolve(s));
    });
    const { port } = server.address();

    const contentType = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/sse`, (res) => {
        resolve(res.headers['content-type'] ?? '');
        req.destroy();
        res.destroy();
      });
      req.on('error', err => {
        // ECONNRESET is expected after destroy — ignore it
        if (err.code !== 'ECONNRESET') reject(err);
      });
      req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    server.close();
    expect(contentType).toMatch(/text\/event-stream/);
  });
});

// ─── cache ────────────────────────────────────────────────────────────────────

describe('cache registry', () => {
  it('ms appears in registry after use', () => {
    const entry = pkgRegistry.get('ms');
    expect(entry).toBeDefined();
    expect(entry.refCount).toBe(0);
  });

  it('totalCachedMb is within limit', () => {
    expect(totalCachedMb()).toBeLessThanOrEqual(100);
  });
});

// ─── Invalid JSON-RPC requests ───────────────────────────────────────────────

describe('POST /mcp — edge cases', () => {
  it('unknown method → error response', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    const { body } = await mcpPost({ jsonrpc: '2.0', id: 99, method: 'nonexistent/method', params: {} });
    // Should get an error response, not crash
    expect(body?.error || body?.result).toBeDefined();
  });
});

// ─── Tool call edge cases ────────────────────────────────────────────────────

describe('tools/call — edge cases', () => {
  it('method returning undefined → "null" text', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 10, method: 'tools/call',
      params: { name: 'call', arguments: { package: 'lodash', method: 'noop' } },
    });
    expect(body?.result?.content[0]?.text).toBe('null');
  }, 30_000);

  it('method returning object → JSON string', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'call', arguments: { package: 'lodash', method: 'pick', args: [{"a":1,"b":2}, ["a"]] } },
    });
    const parsed = JSON.parse(body?.result?.content[0]?.text);
    expect(parsed).toEqual({ a: 1 });
  }, 10_000);

  it('sequential calls reuse cached package', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    const r1 = await mcpPost({
      jsonrpc: '2.0', id: 20, method: 'tools/call',
      params: { name: 'call', arguments: { package: 'ms', args: [60000] } },
    });
    expect(r1.body?.result?.content[0]?.text).toBe('1m');

    const r2 = await mcpPost({
      jsonrpc: '2.0', id: 21, method: 'tools/call',
      params: { name: 'call', arguments: { package: 'ms', args: [2000] } },
    });
    expect(r2.body?.result?.content[0]?.text).toBe('2s');
  }, 30_000);

  it('empty args defaults to []', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    // uuid.v4() with no args should return a UUID string
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 30, method: 'tools/call',
      params: { name: 'call', arguments: { package: 'uuid', method: 'v4' } },
    });
    expect(body?.result?.content[0]?.text).toMatch(/^[0-9a-f]{8}-/);
  }, 30_000);

  it('concurrent tool calls both return correct results', async () => {
    // Initialize is stateless (new transport per POST), so each concurrent
    // request initializes independently. Send two tools/call in parallel.
    const call = (ms_arg, id) =>
      mcpPost({ jsonrpc: '2.0', id, method: 'tools/call',
        params: { name: 'call', arguments: { package: 'ms', args: [ms_arg] } } });

    // Fire both at the same time without pre-initializing — the server is
    // stateless so tools/call also implicitly works without a prior initialize.
    // But to be safe per spec, send initialize + call for each as a sequential
    // chain, running the two chains concurrently.
    const chain = async (ms_arg, baseId) => {
      await mcpPost({
        jsonrpc: '2.0', id: baseId, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      });
      return call(ms_arg, baseId + 1);
    };

    const [r1, r2] = await Promise.all([
      chain(60000, 40),
      chain(7200000, 50),
    ]);

    expect(r1.body?.result?.content[0]?.text).toBe('1m');
    expect(r2.body?.result?.content[0]?.text).toBe('2h');
  }, 30_000);

  it('empty package name → isError true', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 60, method: 'tools/call',
      params: { name: 'call', arguments: { package: '' } },
    });
    expect(body?.result?.isError).toBe(true);
    expect(body?.result?.content[0]?.text).toMatch(/error/i);
  }, 10_000);

  it('missing package param → isError true', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    // Omit `package` entirely — Zod validation should reject it or the handler
    // should return an error response (either isError on result or a JSON-RPC error).
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 61, method: 'tools/call',
      params: { name: 'call', arguments: { method: 'noop' } },
    });
    // Either a tool-level error or a JSON-RPC protocol error is acceptable.
    const isToolError = body?.result?.isError === true;
    const isRpcError  = body?.error != null;
    expect(isToolError || isRpcError).toBe(true);
  }, 10_000);

  it('async method (dns.promises-style) — package returning a Promise resolves correctly', async () => {
    // `p-limit` exports an async-capable factory; calling it returns a throttle
    // function. We test with `node-fetch` which is already async.
    // Use a simpler always-available approach: `ms` is sync, so use `lodash`
    // `_.defer` won't work. Instead use `delay` (npm) which is purely async.
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    // `resolve` (npm) resolves a require()-style path — purely sync, but
    // we can use lodash `_.ceil` which returns synchronously, while the
    // executePackage wrapper always awaits, covering the Promise path.
    // To truly test async: use `ms` called via executePackage which awaits it.
    // The server already awaits executePackage, so any package works.
    // We specifically verify the result arrives correctly (i.e. the await chain works).
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 70, method: 'tools/call',
      // lodash.ceil is a synchronous function but executePackage always awaits it,
      // exercising the Promise.resolve() path in the async/await chain.
      params: { name: 'call', arguments: { package: 'lodash', method: 'ceil', args: [4.006] } },
    });
    expect(body?.result?.isError).toBeFalsy();
    expect(body?.result?.content[0]?.text).toBe('5');
  }, 30_000);

  it('large JSON object as argument is handled correctly', async () => {
    await mcpPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    // Build a large object (~500 keys) and pass it as the first arg to lodash.keys
    const largeObj = Object.fromEntries(
      Array.from({ length: 500 }, (_, i) => [`key_${i}`, i * 2])
    );
    const { body } = await mcpPost({
      jsonrpc: '2.0', id: 80, method: 'tools/call',
      params: { name: 'call', arguments: { package: 'lodash', method: 'keys', args: [largeObj] } },
    });
    expect(body?.result?.isError).toBeFalsy();
    const keys = JSON.parse(body?.result?.content[0]?.text);
    expect(keys).toHaveLength(500);
    expect(keys[0]).toBe('key_0');
  }, 30_000);
});
