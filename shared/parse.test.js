import { describe, it, expect } from 'vitest';
import { parseValue, parseValueWithCommaSplit, splitArgs, validatePackageName } from './parse.js';

describe('parseValue', () => {
  it('parses JSON numbers', () => expect(parseValue('42')).toBe(42));
  it('parses JSON arrays', () => expect(parseValue('[1,2,3]')).toEqual([1, 2, 3]));
  it('parses JSON objects', () => expect(parseValue('{"a":1}')).toEqual({ a: 1 }));
  it('parses JSON booleans', () => expect(parseValue('true')).toBe(true));
  it('returns plain strings as-is', () => expect(parseValue('hello')).toBe('hello'));
  it('returns non-JSON strings as-is', () => expect(parseValue('not json {')).toBe('not json {'));
});

describe('parseValueWithCommaSplit', () => {
  it('parses JSON first', () => expect(parseValueWithCommaSplit('[1,2]')).toEqual([1, 2]));
  it('splits comma-separated numbers', () => expect(parseValueWithCommaSplit('1,2,3')).toEqual([1, 2, 3]));
  it('splits comma-separated strings', () => expect(parseValueWithCommaSplit('a,b,c')).toEqual(['a', 'b', 'c']));
  it('returns single values as-is', () => expect(parseValueWithCommaSplit('hello')).toBe('hello'));
  it('does not split single-element', () => expect(parseValueWithCommaSplit('42')).toBe(42));
});

describe('splitArgs', () => {
  it('returns empty array for empty string', () => expect(splitArgs('')).toEqual([]));
  it('splits simple comma-separated', () => expect(splitArgs('1,2,3')).toEqual(['1', '2', '3']));
  it('respects JSON object depth', () => expect(splitArgs('{"a":1},2')).toEqual(['{"a":1}', '2']));
  it('respects JSON array depth', () => expect(splitArgs('[1,2],3')).toEqual(['[1,2]', '3']));
  it('respects quoted strings', () => expect(splitArgs('"a,b",c')).toEqual(['"a,b"', 'c']));
  it('handles nested structures', () => expect(splitArgs('{"a":[1,2]},3')).toEqual(['{"a":[1,2]}', '3']));
  it('handles undefined input', () => expect(splitArgs(undefined)).toEqual([]));
  it('handles single value', () => expect(splitArgs('hello')).toEqual(['hello']));
});

describe('validatePackageName', () => {
  it('accepts simple names', () => expect(() => validatePackageName('lodash')).not.toThrow());
  it('accepts scoped names', () => expect(() => validatePackageName('@sindresorhus/slugify')).not.toThrow());
  it('accepts names with dots and hyphens', () => expect(() => validatePackageName('chroma-js')).not.toThrow());
  it('rejects empty string', () => expect(() => validatePackageName('')).toThrow('Invalid package name'));
  it('rejects uppercase', () => expect(() => validatePackageName('Lodash')).toThrow('Invalid package name'));
  it('rejects spaces', () => expect(() => validatePackageName('my package')).toThrow('Invalid package name'));
  it('rejects path traversal', () => expect(() => validatePackageName('../etc/passwd')).toThrow('Invalid package name'));
});
