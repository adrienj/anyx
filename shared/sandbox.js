import { spawn, spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RUNNER_PATH = join(__dirname, 'sandbox-runner.js');

/** Check if bubblewrap is available on this system */
let _bwrapAvailable;
export function isBwrapAvailable() {
  if (_bwrapAvailable === undefined) {
    // Test an actual sandbox operation, not just --version.
    // bwrap --version succeeds even when namespace operations are denied
    // (e.g. Docker without proper permissions).
    const result = spawnSync('bwrap', [
      '--ro-bind', '/', '/',
      '--unshare-pid',
      '--die-with-parent',
      '--', '/bin/true',
    ], { stdio: 'pipe', timeout: 5000 });
    _bwrapAvailable = result.status === 0;
    if (_bwrapAvailable) {
      // Also check if --unshare-net works (requires CAP_NET_ADMIN)
      const netResult = spawnSync('bwrap', [
        '--ro-bind', '/', '/',
        '--unshare-net',
        '--unshare-pid',
        '--die-with-parent',
        '--', '/bin/true',
      ], { stdio: 'pipe', timeout: 5000 });
      _bwrapNetAvailable = netResult.status === 0;
    }
    if (!_bwrapAvailable) {
      console.log('[sandbox] WARNING: bwrap unavailable — running without namespace isolation');
    } else if (!_bwrapNetAvailable) {
      console.log('[sandbox] WARNING: bwrap --unshare-net unavailable — running without network isolation');
    }
  }
  return _bwrapAvailable;
}

let _bwrapNetAvailable = false;

/**
 * Execute a package function in a sandboxed subprocess.
 *
 * Uses bubblewrap (bwrap) for namespace isolation when available:
 * - No network (--unshare-net) when CAP_NET_ADMIN is present
 * - No PID visibility (--unshare-pid)
 * - Read-only filesystem (--ro-bind)
 * - Sanitized environment (no secrets)
 *
 * Falls back to plain Node.js subprocess when bwrap is unavailable
 * (macOS, Windows, Docker without CAP_SYS_ADMIN).
 *
 * @param {object} opts
 * @param {string} opts.cacheDir - per-package cache directory
 * @param {string} opts.packageName - npm package name
 * @param {string} [opts.method] - method name to call
 * @param {unknown[]} [opts.args] - arguments to pass
 * @param {Array<{method: string, args: unknown[]}>} [opts.steps] - pipeline steps (API mode)
 * @param {number} [opts.timeoutMs=5000] - execution timeout in ms
 * @returns {Promise<unknown>} the function's return value
 */
export function spawnSandboxed({ cacheDir, packageName, method, args, steps, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const input = { cacheDir, package: packageName };
    if (steps) {
      input.steps = steps;
    } else {
      if (method) input.method = method;
      input.args = args || [];
    }

    // Minimal environment — no secrets leak
    const env = {
      NODE_PATH: join(cacheDir, 'node_modules'),
      HOME: '/tmp',
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    };

    // Use process.execPath for the full path to the node binary —
    // the sanitized PATH may not include nvm/fnm/homebrew locations
    const nodeBin = process.execPath;

    let cmd, cmdArgs;
    if (isBwrapAvailable()) {
      cmd = 'bwrap';
      cmdArgs = [
        '--ro-bind', '/', '/',
        '--tmpfs', '/tmp',
        '--proc', '/proc',
        '--unshare-pid',
        '--die-with-parent',
      ];
      if (_bwrapNetAvailable) {
        cmdArgs.push('--unshare-net');
      }
      cmdArgs.push('--', nodeBin, RUNNER_PATH);
    } else {
      cmd = nodeBin;
      cmdArgs = [RUNNER_PATH];
    }

    const child = spawn(cmd, cmdArgs, {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, fd3
      env,
      timeout: timeoutMs,
    });

    let fd3Data = '';
    let stderr = '';
    child.stdio[3].on('data', (chunk) => { fd3Data += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      reject(new Error(`Sandbox spawn failed: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        reject(new Error(`Execution timed out after ${timeoutMs / 1000}s`));
        return;
      }

      if (!fd3Data) {
        reject(new Error(`Sandbox produced no output (exit ${code}): ${stderr}`));
        return;
      }

      try {
        const parsed = JSON.parse(fd3Data);
        if (parsed.error) {
          reject(new Error(parsed.error));
        } else {
          resolve(parsed.result);
        }
      } catch (e) {
        reject(new Error(`Sandbox output parse error: ${fd3Data.slice(0, 200)}`));
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
