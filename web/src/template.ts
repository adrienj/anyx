import type { ParamInfo } from './parser';

const EXACT: Record<string, string> = {
  string:      '"example"',
  number:      '42',
  boolean:     'true',
  object:      '{}',
  Date:        '"2024-01-01"',
  any:         'value',
  unknown:     'value',
  never:       'value',
  void:        'value',
  null:        'null',
  undefined:   'undefined',
  'string[]':  '["a","b"]',
  'number[]':  '[1,2,3]',
  'boolean[]': '[true,false]',
};

export function typeToArg(type: string): string {
  const t = type.trim();
  if (t.includes('|')) return typeToArg(t.split('|')[0].trim());
  if (EXACT[t]) return EXACT[t];
  if (t.endsWith('[]') || t.startsWith('Array<')) return '[]';
  if (t.startsWith('Record<') || t.startsWith('{')) return '{}';
  return 'value';
}

function argForParam(p: ParamInfo): string {
  const n = p.name.toLowerCase();
  if (p.type === 'string') {
    if (n === 'v1' || n.includes('version')) return '"1.0.0"';
    if (n === 'v2') return '"2.0.0"';
    if (n.includes('email')) return '"user@example.com"';
    if (n.includes('url'))   return '"https://example.com"';
    if (n.includes('range')) return '"^1.0.0"';
  }
  return typeToArg(p.type);
}

export function buildCliString(pkg: string, fn: string, params: ParamInfo[]): string {
  const args = params.filter(p => !p.optional).map(argForParam);
  return `npxall ${pkg} ${fn}${args.length ? ' ' + args.join(' ') : ''}`;
}
