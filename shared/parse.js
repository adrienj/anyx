/** Regex for valid npm package names (lowercase, optional @scope/) */
const PKG_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Validate an npm package name.
 * @param {string} name
 * @throws {Error} if name doesn't match npm naming rules
 */
export function validatePackageName(name) {
  if (!PKG_NAME_RE.test(name)) throw new Error(`Invalid package name: ${name}`);
}

/**
 * Parse a string value as JSON if possible, otherwise return as-is.
 * @param {string} val
 * @returns {unknown}
 */
export function parseValue(val) {
  try { return JSON.parse(val); } catch { return val; }
}

/**
 * Like parseValue, but also splits comma-separated values into arrays.
 * Used by CLI and MCP where args may come as comma-delimited strings.
 * @param {string} val
 * @returns {unknown}
 */
export function parseValueWithCommaSplit(val) {
  try { return JSON.parse(val); } catch {}
  if (val.includes(',')) {
    const parts = val.split(',').map(p => p.trim()).filter(p => p !== '');
    if (parts.length > 1) return parts.map(p => { try { return JSON.parse(p); } catch { return p; } });
  }
  return val;
}

/**
 * Split a string of arguments respecting JSON depth (braces, brackets, quotes).
 * "{"a":1},2" → ['{"a":1}', '2']
 * @param {string} str
 * @returns {string[]}
 */
export function splitArgs(str) {
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
