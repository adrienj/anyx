import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

/**
 * Load an npm package from a cache directory.
 * Tries CJS require() first, falls back to ESM import() using the
 * package's exports/module/main fields.
 *
 * @param {string} packageName - npm package name (e.g. 'lodash', '@turf/turf')
 * @param {string} cacheDir - path to cache directory containing node_modules/
 * @returns {Promise<unknown>} the package's module export
 */
export async function loadPackage(packageName, cacheDir) {
  const cachePkg = join(cacheDir, 'package.json');
  const req = createRequire(cachePkg);

  // Try CJS first (most npm packages)
  let cjsError;
  try { return req(packageName); } catch (e) { cjsError = e; }

  // Fall back to ESM: resolve entry point from package.json fields
  try {
    const parts = packageName.startsWith('@') ? packageName.split('/').slice(0, 2) : [packageName];
    const pkgDir = join(cacheDir, 'node_modules', ...parts);
    const meta = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const exp = meta.exports;
    const mainField =
      (typeof exp === 'string' ? exp : null)
      ?? (typeof exp === 'object' && exp !== null
        ? exp['.']?.import ?? exp['.']?.default ?? (typeof exp['.'] === 'string' ? exp['.'] : null)
        : null)
      ?? meta.module ?? meta.main ?? 'index.js';
    return await import(pathToFileURL(join(pkgDir, mainField)).href);
  } catch (e) {
    throw new Error(`Failed to load '${packageName}': ${cjsError?.message ?? e.message}`);
  }
}
