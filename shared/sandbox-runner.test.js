import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const runnerPath = join(__dirname, 'sandbox-runner.js');
const testCacheBase = mkdtempSync(join(tmpdir(), 'npxall-runner-test-'));

/** Install a package into a per-package cache dir for testing */
function installTestPkg(name) {
  const dir = join(testCacheBase, name);
  spawnSync('mkdir', ['-p', dir]);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `test-${name}`, version: '1.0.0', private: true }));
  spawnSync('npm', ['install', name, '--no-save', '--silent', '--ignore-scripts'], {
    cwd: dir, stdio: 'pipe', timeout: 60000,
  });
  return dir;
}

/** Run the sandbox runner with given input JSON, returns parsed result from fd 3 */
function runRunner(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, fd3
      timeout: 10000,
    });

    let fd3Data = '';
    let stdout = '';
    let stderr = '';
    child.stdio[3].on('data', (chunk) => { fd3Data += chunk; });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      try {
        resolve({ code, result: fd3Data ? JSON.parse(fd3Data) : null, stdout, stderr });
      } catch (e) {
        reject(new Error(`Failed to parse fd3 output: ${fd3Data}`));
      }
    });
    child.on('error', reject);

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

let msCacheDir;
let lodashCacheDir;

beforeAll(() => {
  msCacheDir = installTestPkg('ms');
  lodashCacheDir = installTestPkg('lodash');
}, 120000);

describe('sandbox-runner', () => {
  it('executes a bare function (ms)', async () => {
    const { result } = await runRunner({ cacheDir: msCacheDir, package: 'ms', args: [60000] });
    expect(result).toEqual({ result: '1m' });
  });

  it('executes a named method (lodash.camelCase)', async () => {
    const { result } = await runRunner({ cacheDir: lodashCacheDir, package: 'lodash', method: 'camelCase', args: ['hello world'] });
    expect(result).toEqual({ result: 'helloWorld' });
  });

  it('returns error for missing method', async () => {
    const { result } = await runRunner({ cacheDir: msCacheDir, package: 'ms', method: 'noSuchMethod', args: [] });
    expect(result.error).toMatch(/not a function/);
  });

  it('returns error for invalid input', async () => {
    const { result } = await runRunner({});
    expect(result.error).toBeDefined();
  });

  it('handles undefined results as null', async () => {
    // lodash.noop returns undefined
    const { result } = await runRunner({ cacheDir: lodashCacheDir, package: 'lodash', method: 'noop', args: [] });
    expect(result).toEqual({ result: null });
  });

  it('executes pipeline steps', async () => {
    const { result } = await runRunner({
      cacheDir: lodashCacheDir,
      package: 'lodash',
      steps: [
        { method: 'camelCase', args: ['hello world'] },
        { method: 'toUpperCase', args: [] },
      ],
    });
    expect(result).toEqual({ result: 'HELLOWORLD' });
  });

  it('handles bare function in pipeline mode', async () => {
    // /ms/60000 → steps: [{ method: '60000', args: [] }]
    const { result } = await runRunner({
      cacheDir: msCacheDir,
      package: 'ms',
      steps: [{ method: '60000', args: [] }],
    });
    expect(result).toEqual({ result: '1m' });
  });
});
