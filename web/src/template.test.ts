import { describe, it, expect } from 'vitest';
import { typeToArg, buildCliString } from './template';
import type { ParamInfo } from './parser';

describe('typeToArg', () => {
  it('string',      () => expect(typeToArg('string')).toBe('"example"'));
  it('number',      () => expect(typeToArg('number')).toBe('42'));
  it('boolean',     () => expect(typeToArg('boolean')).toBe('true'));
  it('T[]',         () => expect(typeToArg('T[]')).toBe('[]'));
  it('Array<T>',    () => expect(typeToArg('Array<string>')).toBe('[]'));
  it('string[]',    () => expect(typeToArg('string[]')).toBe('["a","b"]'));
  it('number[]',    () => expect(typeToArg('number[]')).toBe('[1,2,3]'));
  it('object',      () => expect(typeToArg('object')).toBe('{}'));
  it('Date',        () => expect(typeToArg('Date')).toBe('"2024-01-01"'));
  it('union picks first concrete', () => expect(typeToArg('string | null')).toBe('"example"'));
});

describe('buildCliString', () => {
  it('builds full anyx invocation with all required params', () => {
    const params: ParamInfo[] = [
      { name: 'v1', type: 'string', optional: false },
      { name: 'v2', type: 'string', optional: false },
    ];
    expect(buildCliString('semver', 'gt', params)).toBe('anyx semver gt "1.0.0" "2.0.0"');
  });

  it('omits optional params', () => {
    const params: ParamInfo[] = [
      { name: 'array', type: 'T[]',    optional: false },
      { name: 'size',  type: 'number', optional: true },
    ];
    expect(buildCliString('lodash', 'chunk', params)).toBe('anyx lodash chunk []');
  });
});
