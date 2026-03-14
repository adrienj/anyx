#!/usr/bin/env node

/**
 * npxall sandbox runner — executes inside a bubblewrap sandbox.
 *
 * Protocol:
 *   stdin  ← JSON: { cacheDir, package, method?, args?, steps? }
 *   fd 3   → JSON: { result } or { error }
 *   stdout → captured console.log output (not used for results)
 *
 * This script is spawned per-request by shared/sandbox.js.
 * It runs with no network, read-only filesystem, and minimal env.
 */

import { loadPackage } from './loader.js';
import { createWriteStream } from 'fs';

// ── Capture console output to prevent result corruption ─────────────────

const capturedLogs = [];
console.log = (...args) => capturedLogs.push(['log', args.join(' ')]);
console.warn = (...args) => capturedLogs.push(['warn', args.join(' ')]);
console.error = (...args) => capturedLogs.push(['err', args.join(' ')]);

// ── Write result to fd 3 ───────────────────────────────────────────────

const fd3 = createWriteStream(null, { fd: 3 });

function writeResult(obj) {
  fd3.write(JSON.stringify(obj));
  fd3.end();
}

// ── Read stdin ──────────────────────────────────────────────────────────

let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(inputData);

    // Validate input
    if (!input.cacheDir || !input.package) {
      writeResult({ error: 'Missing required fields: cacheDir, package' });
      return;
    }

    const raw = await loadPackage(input.package, input.cacheDir);
    const mod = raw?.default ?? raw;

    // Pipeline mode (API)
    if (input.steps && Array.isArray(input.steps)) {
      let acc = undefined;
      for (let i = 0; i < input.steps.length; i++) {
        const { method, args = [] } = input.steps[i];
        if (i === 0 && acc === undefined) {
          // First step: try module method, then bare function.
          // For bare functions (like ms), the "method" from URL parsing is
          // actually the first argument (e.g. /ms/60000 → method='60000')
          if (typeof mod[method] === 'function') {
            acc = mod[method].apply(mod, args);
          } else if (typeof mod === 'function') {
            const parsedMethod = (() => { try { return JSON.parse(method); } catch { return method; } })();
            acc = mod.apply(null, [parsedMethod, ...args]);
          } else {
            throw new Error(`'${method}' is not a function in '${input.package}'`);
          }
        } else {
          // Subsequent steps: try on accumulator (prototype methods), then on module
          if (acc !== null && acc !== undefined && typeof acc[method] === 'function') {
            acc = acc[method].apply(acc, args);
          } else if (typeof mod[method] === 'function') {
            acc = mod[method].apply(mod, [acc, ...args]);
          } else {
            throw new Error(`'${method}' is not a function on the result or '${input.package}'`);
          }
        }
      }
      writeResult({ result: acc === undefined ? null : acc });
      return;
    }

    // Single method mode (MCP)
    let result;
    const args = input.args || [];
    if (input.method) {
      if (typeof mod[input.method] !== 'function') {
        const available = Object.keys(mod).filter(k => typeof mod[k] === 'function').slice(0, 10);
        throw new Error(`'${input.method}' is not a function in '${input.package}'. Available: ${available.join(', ')}`);
      }
      result = mod[input.method].apply(mod, args);
    } else if (typeof mod === 'function') {
      result = mod.apply(null, args);
    } else {
      result = mod;
    }

    // Await if promise
    if (result && typeof result.then === 'function') {
      result = await result;
    }

    writeResult({ result: result === undefined ? null : result });
  } catch (err) {
    writeResult({ error: err.message });
  }
});
