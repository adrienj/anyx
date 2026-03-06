import { describe, it, expect } from 'vitest';
import { parseExports } from './parser';

describe('parseExports', () => {
  it('extracts a simple export function', () => {
    const fns = parseExports({ 'index.d.ts': `export function gt(v1: string, v2: string): boolean {}` });
    expect(fns).toContainEqual(expect.objectContaining({
      name: 'gt',
      params: [
        { name: 'v1', type: 'string', optional: false },
        { name: 'v2', type: 'string', optional: false },
      ],
    }));
  });

  it('marks optional params', () => {
    const fns = parseExports({ 'index.d.ts': `export function chunk<T>(array: T[], size?: number): T[][] {}` });
    const chunk = fns.find(f => f.name === 'chunk')!;
    expect(chunk.params[1].optional).toBe(true);
    expect(chunk.params[1].type).toBe('number');
  });

  it('deduplicates across multiple files', () => {
    const files = {
      'index.d.ts': `export function gt(v1: string, v2: string): boolean {}`,
      'other.d.ts': `export function gt(v1: string, v2: string): boolean {}`,
    };
    expect(parseExports(files).filter(f => f.name === 'gt').length).toBe(1);
  });

  it('handles named re-exports', () => {
    const src = `export { _gt as gt };`;
    const fns = parseExports({ 'index.d.ts': src });
    expect(fns.map(f => f.name)).toContain('gt');
  });
});
