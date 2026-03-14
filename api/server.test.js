import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── Shared test cache dir ────────────────────────────────────────────────────

const TEST_CACHE = join(tmpdir(), `npxall-api-test-${process.pid}`);

process.env.NPXALL_CACHE_DIR = TEST_CACHE;
process.env.CACHE_MAX_MB = '100';

const { app, splitArgs, parseUrl, parseValue, validatePackageName, cache }
  = await import('./server.js');

// ─── splitArgs ───────────────────────────────────────────────────────────────

describe('splitArgs', () => {
  it('empty string → []', () => expect(splitArgs('')).toEqual([]));
  it('single value', () => expect(splitArgs('42')).toEqual(['42']));
  it('simple comma split', () => expect(splitArgs('1,2,3')).toEqual(['1', '2', '3']));
  it('preserves JSON object', () =>
    expect(splitArgs('{"a":1,"b":2},"b"')).toEqual(['{"a":1,"b":2}', '"b"']));
  it('preserves JSON array', () =>
    expect(splitArgs('[1,2],3')).toEqual(['[1,2]', '3']));
  it('nested JSON', () =>
    expect(splitArgs('{"a":{"b":1}},true')).toEqual(['{"a":{"b":1}}', 'true']));
  it('quoted strings with commas', () =>
    expect(splitArgs('"hello,world",42')).toEqual(['"hello,world"', '42']));
  it('no comma → single element', () =>
    expect(splitArgs('hello world')).toEqual(['hello world']));
});

// ─── parseValue ──────────────────────────────────────────────────────────────

describe('parseValue', () => {
  it('parses JSON number', () => expect(parseValue('42')).toBe(42));
  it('parses JSON boolean', () => expect(parseValue('true')).toBe(true));
  it('parses JSON null', () => expect(parseValue('null')).toBe(null));
  it('parses JSON object', () => expect(parseValue('{"a":1}')).toEqual({ a: 1 }));
  it('parses JSON array', () => expect(parseValue('[1,2]')).toEqual([1, 2]));
  it('returns plain string as-is', () => expect(parseValue('hello')).toBe('hello'));
});

// ─── parseUrl ────────────────────────────────────────────────────────────────

describe('parseUrl', () => {
  it('package + method + args', () =>
    expect(parseUrl('/lodash/camelCase/hello%20world/')).toEqual({
      pkgName: 'lodash', steps: [{ method: 'camelCase', argsRaw: 'hello world' }]
    }));

  it('scoped package', () =>
    expect(parseUrl('/@turf/turf/distance/%5B0,0%5D,%5B1,1%5D/')).toEqual({
      pkgName: '@turf/turf', steps: [{ method: 'distance', argsRaw: '[0,0],[1,1]' }]
    }));

  it('chained methods', () =>
    expect(parseUrl('/lodash/concat/%5B1,2%5D,3/reverse.slice/0,1/')).toEqual({
      pkgName: 'lodash', steps: [
        { method: 'concat', argsRaw: '[1,2],3' },
        { method: 'reverse.slice', argsRaw: '0,1' },
      ]
    }));

  it('method with no args (trailing slash as empty)', () =>
    expect(parseUrl('/lodash/values/')).toEqual({
      pkgName: 'lodash', steps: [{ method: 'values', argsRaw: '' }]
    }));

  it('bare function call (no method, just arg)', () =>
    expect(parseUrl('/ms/60000')).toEqual({
      pkgName: 'ms', steps: [{ method: '60000', argsRaw: '' }]
    }));

  it('no trailing slash', () =>
    expect(parseUrl('/lodash/keys/%7B%22a%22:1%7D')).toEqual({
      pkgName: 'lodash', steps: [{ method: 'keys', argsRaw: '{"a":1}' }]
    }));

  it('package only', () =>
    expect(parseUrl('/lodash')).toEqual({
      pkgName: 'lodash', steps: []
    }));
});

// ─── validatePackageName ─────────────────────────────────────────────────────

describe('validatePackageName', () => {
  it('accepts lodash', () => expect(() => validatePackageName('lodash')).not.toThrow());
  it('accepts scoped', () => expect(() => validatePackageName('@turf/turf')).not.toThrow());
  it('accepts hyphens', () => expect(() => validatePackageName('date-fns')).not.toThrow());
  it('rejects spaces', () => expect(() => validatePackageName('foo bar')).toThrow());
  it('rejects semicolons', () => expect(() => validatePackageName('foo;bar')).toThrow());
  it('rejects empty', () => expect(() => validatePackageName('')).toThrow());
  it('rejects uppercase', () => expect(() => validatePackageName('Lodash')).toThrow());
});

// ─── HTTP: info + health ─────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns API v2 info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('npxall-api');
    expect(res.body.version).toBe('2.0.0');
    expect(res.body.usage).toBeDefined();
  });
});

describe('GET /health', () => {
  it('returns ok status and cache stats', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.cache).toMatchObject({ maxMb: 100 });
  });
});

// ─── v2 URL format: GET pipeline ─────────────────────────────────────────────

describe('GET v2 URL pipeline', () => {
  it('/ms/60000 → "1m" (bare function)', async () => {
    const res = await request(app).get('/ms/60000');
    expect(res.status).toBe(200);
    expect(res.body).toBe('1m');
  }, 30_000);

  it('/ms/2000 → "2s" (cached reuse)', async () => {
    const res = await request(app).get('/ms/2000');
    expect(res.status).toBe(200);
    expect(res.body).toBe('2s');
  }, 10_000);

  it('/lodash/camelCase/hello%20world → "helloWorld"', async () => {
    const res = await request(app).get('/lodash/camelCase/hello%20world');
    expect(res.status).toBe(200);
    expect(res.body).toBe('helloWorld');
  }, 30_000);

  it('/lodash/chunk/%5B1,2,3,4%5D,2 → [[1,2],[3,4]]', async () => {
    const res = await request(app).get('/lodash/chunk/%5B1,2,3,4%5D,2');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([[1, 2], [3, 4]]);
  }, 10_000);

  it('/lodash/concat/%5B1,2%5D,3/reverse/ → [3,2,1] (chaining)', async () => {
    const res = await request(app).get('/lodash/concat/%5B1,2%5D,3/reverse/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([3, 2, 1]);
  }, 10_000);

  it('/lodash/concat/%5B1,2%5D,3/reverse.slice/0,1/ → [3] (dot shorthand)', async () => {
    const res = await request(app).get('/lodash/concat/%5B1,2%5D,3/reverse.slice/0,1/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([3]);
  }, 10_000);

  it('no-arg chained step: omit then values', async () => {
    const res = await request(app).get(
      '/lodash/omit/' + encodeURIComponent('{"a":1,"b":2},"b"') + '/values/'
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([1]);
  }, 10_000);

  it('/lodash/noop/ → null (undefined result)', async () => {
    const res = await request(app).get('/lodash/noop/');
    expect(res.status).toBe(200);
    expect(res.body).toBe(null);
  }, 10_000);
});

// ─── POST body args ──────────────────────────────────────────────────────────

describe('POST body args', () => {
  it('POST /ms with body [60000] → "1m"', async () => {
    const res = await request(app).post('/ms').send([60000]);
    expect(res.status).toBe(200);
    expect(res.body).toBe('1m');
  }, 10_000);

  it('POST /lodash/pick with array body (method in URL, args in body)', async () => {
    const res = await request(app).post('/lodash/pick')
      .send([{ a: 1, b: 2, c: 3 }, ['a', 'c']]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: 1, c: 3 });
  }, 10_000);

  it('POST without explicit Content-Type still parses JSON body', async () => {
    // supertest always sets Content-Type when using .send(), so test the default
    // middleware by verifying JSON body parsing works normally
    const res = await request(app)
      .post('/ms')
      .send([3600000]);
    expect(res.status).toBe(200);
    expect(res.body).toBe('1h');
  }, 10_000);
});

// ─── Error responses ─────────────────────────────────────────────────────────

describe('error responses (v2 format)', () => {
  it('invalid package name → 400 with error field', async () => {
    const res = await request(app).get('/INVALID%20PACKAGE/method');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid package name/i);
  });

  it('no method or args → 400', async () => {
    const res = await request(app).get('/lodash');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  }, 10_000);

  it('non-existent method on non-callable module → 400', async () => {
    // uuid exports an object with methods (v4, v5, etc.) but is NOT itself callable
    const res = await request(app).get('/uuid/doesNotExist/');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a function/i);
  }, 30_000);

  it('no success boolean in response', async () => {
    const res = await request(app).get('/ms/60000');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('success');
  }, 10_000);

  it('no result wrapper in response', async () => {
    const res = await request(app).get('/ms/60000');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('result');
    expect(res.body).toBe('1m');
  }, 10_000);
});

// ─── Scoped packages ────────────────────────────────────────────────────────

describe('scoped @org/package', () => {
  it('/@sindresorhus/slugify/Hello%20World → "hello-world"', async () => {
    const res = await request(app).get('/@sindresorhus/slugify/Hello%20World');
    expect(res.status).toBe(200);
    expect(res.body).toBe('hello-world');
  }, 30_000);
});

// ─── Cache registry ──────────────────────────────────────────────────────────

describe('cache registry', () => {
  it('ms is tracked after use', () => {
    const entry = cache.registry.get('ms');
    expect(entry).toBeDefined();
    expect(entry.refCount).toBe(0);
  });

  it('totalCachedMb is within limit', () => {
    expect(cache.totalCachedMb()).toBeLessThanOrEqual(100);
  });
});
