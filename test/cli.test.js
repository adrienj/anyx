import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { join } from 'path';

// Direct imports — tests compare CLI output against native function calls
import _ from 'lodash';
import * as turf from '@turf/turf';
import isBooleanObject from 'is-boolean-object';
import * as changeCase from 'change-case';
import semver from 'semver';
import ms from 'ms';
import validator from 'validator';
import * as dateFns from 'date-fns';
import * as mathjs from 'mathjs';

const CLI = join(import.meta.dirname, '..', 'cli.js');

function run(...args) {
  const result = spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function runWithStdin(input, ...args) {
  const result = spawnSync('node', [CLI, ...args], { input, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function json(...args) { return JSON.parse(run(...args)); }
function jsonStdin(input, ...args) { return JSON.parse(runWithStdin(input, ...args)); }

// ─── is-boolean-object ────────────────────────────────────────────────────────
describe('is-boolean-object', () => {
  it('number → false', () => expect(json('is-boolean-object', '3')).toBe(isBooleanObject(3)));
  it('boolean → true',  () => expect(json('is-boolean-object', 'true')).toBe(isBooleanObject(true)));
  it('string → false',  () => expect(json('is-boolean-object', '"hello"')).toBe(isBooleanObject('hello')));
});

// ─── lodash ───────────────────────────────────────────────────────────────────
describe('lodash', () => {
  it('concat',     () => expect(json('lodash', 'concat', '[1]', '2', '[3]', '[[4]]')).toEqual(_.concat([1], 2, [3], [[4]])));
  it('chunk',      () => expect(json('lodash', 'chunk', '["a","b","c","d"]', '2')).toEqual(_.chunk(['a','b','c','d'], 2)));
  it('compact',    () => expect(json('lodash', 'compact', '[0,1,false,2,"",3]')).toEqual(_.compact([0,1,false,2,'',3])));
  it('difference', () => expect(json('lodash', 'difference', '[2,1]', '[2,3]')).toEqual(_.difference([2,1],[2,3])));
  it('drop',       () => expect(json('lodash', 'drop', '[1,2,3]', '2')).toEqual(_.drop([1,2,3], 2)));
  it('flatten',    () => expect(json('lodash', 'flatten', '[1,[2,[3,[4]],5]]')).toEqual(_.flatten([1,[2,[3,[4]],5]])));
  it('head',       () => expect(json('lodash', 'head', '[1,2,3]')).toBe(_.head([1,2,3])));
  it('last',       () => expect(json('lodash', 'last', '[1,2,3]')).toBe(_.last([1,2,3])));
  it('uniq',       () => expect(json('lodash', 'uniq', '[2,1,2]')).toEqual(_.uniq([2,1,2])));
  it('zip',        () => expect(json('lodash', 'zip', '["a","b"]', '[1,2]')).toEqual(_.zip(['a','b'],[1,2])));
  it('keys',       () => expect(json('lodash', 'keys', '{"a":1,"b":2}')).toEqual(_.keys({a:1,b:2})));
  it('values',     () => expect(json('lodash', 'values', '{"a":1,"b":2}')).toEqual(_.values({a:1,b:2})));
  it('assign',     () => expect(json('lodash', 'assign', '{"a":1}', '{"b":2}')).toEqual(_.assign({a:1},{b:2})));
  it('camelCase',  () => expect(run('lodash', 'camelCase', 'foo bar')).toBe(_.camelCase('foo bar')));
  it('split',      () => expect(json('lodash', 'split', 'a-b-c', '"-"')).toEqual(_.split('a-b-c', '-')));
  it('startsWith', () => expect(json('lodash', 'startsWith', 'abc', '"a"')).toBe(_.startsWith('abc', 'a')));
});

// ─── lodash chaining ──────────────────────────────────────────────────────────
describe('lodash chaining', () => {
  it('flatten → uniq (explicit)',   () => expect(json('lodash', '[[1,1],[2,2]]', '.', 'flatten', '.', 'uniq')).toEqual(_.uniq(_.flatten([[1,1],[2,2]]))));
  it('flatten → uniq (shorthand)',  () => expect(json('lodash', '[[1,1],[2,2]]', 'flatten.uniq')).toEqual(_.uniq(_.flatten([[1,1],[2,2]]))));
  it('reverse → head (shorthand)',  () => expect(json('lodash', '[1,2,3]', 'reverse.head')).toBe(_.head(_.reverse([1,2,3]))));
  it('range → chunk (explicit)',    () => expect(json('lodash', '.', 'range', '6', '.', 'chunk', '2')).toEqual(_.chunk(_.range(6), 2)));
  it('range → reverse → head',     () => expect(json('lodash', '.', 'range', '5', '.', 'reverse', '.', 'head')).toBe(_.head(_.reverse(_.range(5)))));
});

// ─── stdin pipe ───────────────────────────────────────────────────────────────
describe('stdin -', () => {
  it('chunk via stdin',   () => expect(jsonStdin('[0,1,2,3,4]', 'lodash', 'chunk', '-', '2')).toEqual(_.chunk([0,1,2,3,4], 2)));
  it('uniq via stdin',    () => expect(jsonStdin('[1,2,2,3,3,3]', 'lodash', 'uniq', '-')).toEqual(_.uniq([1,2,2,3,3,3])));
  it('flatten via stdin', () => expect(jsonStdin('[[1,2],[3,4]]', 'lodash', 'flatten', '-')).toEqual(_.flatten([[1,2],[3,4]])));
});

// ─── change-case ─────────────────────────────────────────────────────────────
describe('change-case', () => {
  it('camelCase',  () => expect(run('change-case', 'camelCase', 'hello world')).toBe(changeCase.camelCase('hello world')));
  it('snakeCase',  () => expect(run('change-case', 'snakeCase', 'Hello World')).toBe(changeCase.snakeCase('Hello World')));
  it('pascalCase', () => expect(run('change-case', 'pascalCase', 'hello world')).toBe(changeCase.pascalCase('hello world')));
  it('kebabCase',  () => expect(run('change-case', 'kebabCase', 'Hello World')).toBe(changeCase.kebabCase('Hello World')));
  it('constantCase', () => expect(run('change-case', 'constantCase', 'hello world')).toBe(changeCase.constantCase('hello world')));
});

// ─── semver ───────────────────────────────────────────────────────────────────
describe('semver', () => {
  it('gt',    () => expect(json('semver', 'gt', '"2.0.0"', '"1.0.0"')).toBe(semver.gt('2.0.0', '1.0.0')));
  it('lt',    () => expect(json('semver', 'lt', '"1.0.0"', '"2.0.0"')).toBe(semver.lt('1.0.0', '2.0.0')));
  it('valid', () => expect(run('semver', 'valid', '"1.2.3"')).toBe(String(semver.valid('1.2.3'))));
  it('major', () => expect(json('semver', 'major', '"3.5.1"')).toBe(semver.major('3.5.1')));
  it('satisfies', () => expect(json('semver', 'satisfies', '"1.5.0"', '"^1.0.0"')).toBe(semver.satisfies('1.5.0', '^1.0.0')));
  it('coerce', () => expect(json('semver', 'coerce', '"v4"').version).toBe(semver.coerce('v4').version));
});

// ─── ms ───────────────────────────────────────────────────────────────────────
describe('ms', () => {
  it('string to ms', () => expect(json('ms', '"2 days"')).toBe(ms('2 days')));
  it('ms to string', () => expect(run('ms', '86400000')).toBe(String(ms(86400000))));
  it('hours',        () => expect(json('ms', '"3h"')).toBe(ms('3h')));
});

// ─── validator ────────────────────────────────────────────────────────────────
describe('validator', () => {
  it('isEmail valid',   () => expect(json('validator', 'isEmail', '"test@example.com"')).toBe(validator.isEmail('test@example.com')));
  it('isEmail invalid', () => expect(json('validator', 'isEmail', '"notanemail"')).toBe(validator.isEmail('notanemail')));
  it('isURL valid',     () => expect(json('validator', 'isURL', '"https://example.com"')).toBe(validator.isURL('https://example.com')));
  it('isIP v4',         () => expect(json('validator', 'isIP', '"192.168.1.1"')).toBe(validator.isIP('192.168.1.1')));
  it('isJSON valid',    () => expect(json('validator', 'isJSON', '"{\\"a\\":1}"')).toBe(validator.isJSON('{"a":1}')));
  it('isNumeric',       () => expect(json('validator', 'isNumeric', '"12345"')).toBe(validator.isNumeric('12345')));
});

// ─── @turf/turf ───────────────────────────────────────────────────────────────
describe('@turf/turf', () => {
  const ptA = { type: 'Feature', geometry: { type: 'Point', coordinates: [-75.343, 39.984] }, properties: {} };
  const ptB = { type: 'Feature', geometry: { type: 'Point', coordinates: [-75.534, 39.123] }, properties: {} };
  const lineF = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-74,40],[-78,42],[-82,35]] }, properties: {} };

  it('bearing',       () => expect(json('@turf/turf', 'bearing', JSON.stringify(ptA), JSON.stringify(ptB))).toBeCloseTo(turf.bearing(ptA, ptB), 8));
  it('distance km',   () => expect(json('@turf/turf', 'distance', JSON.stringify(ptA), JSON.stringify(ptB))).toBeCloseTo(turf.distance(ptA, ptB), 8));
  it('distance mi',   () => expect(json('@turf/turf', 'distance', JSON.stringify(ptA), JSON.stringify(ptB), '{"units":"miles"}')).toBeCloseTo(turf.distance(ptA, ptB, { units: 'miles' }), 8));
  it('bbox',          () => expect(json('@turf/turf', 'bbox', JSON.stringify(lineF))).toEqual(turf.bbox(lineF)));
  it('circle polygon',() => {
    const result = json('@turf/turf', 'circle', JSON.stringify(ptA), '5', '{"steps":10,"units":"kilometers"}');
    expect(result.type).toBe('Feature');
    expect(result.geometry.type).toBe('Polygon');
  });
});

// ─── date-fns ─────────────────────────────────────────────────────────────────
// Date results are serialized as UTC ISO strings by the CLI; compare via timestamp
const ts = s => new Date(JSON.parse(s)).getTime();

describe('date-fns', () => {
  const d1 = '2024-01-15';
  const d2 = '2024-06-01';

  it('addDays',          () => expect(ts(run('date-fns', 'addDays', `"${d1}"`, '7'))).toBe(dateFns.addDays(new Date(d1), 7).getTime()));
  it('subMonths',        () => expect(ts(run('date-fns', 'subMonths', `"${d2}"`, '2'))).toBe(dateFns.subMonths(new Date(d2), 2).getTime()));
  it('differenceInDays', () => expect(json('date-fns', 'differenceInDays', `"${d2}"`, `"${d1}"`)).toBe(dateFns.differenceInDays(new Date(d2), new Date(d1))));
  it('isAfter',          () => expect(json('date-fns', 'isAfter', `"${d2}"`, `"${d1}"`)).toBe(dateFns.isAfter(new Date(d2), new Date(d1))));
  it('isBefore',         () => expect(json('date-fns', 'isBefore', `"${d1}"`, `"${d2}"`)).toBe(dateFns.isBefore(new Date(d1), new Date(d2))));
  it('isWeekend',        () => expect(json('date-fns', 'isWeekend', '"2024-01-20"')).toBe(dateFns.isWeekend(new Date('2024-01-20'))));
  it('startOfMonth',     () => expect(ts(run('date-fns', 'startOfMonth', `"${d2}"`))).toBe(dateFns.startOfMonth(new Date(d2)).getTime()));
  it('endOfWeek',        () => expect(ts(run('date-fns', 'endOfWeek', `"${d1}"`))).toBe(dateFns.endOfWeek(new Date(d1)).getTime()));
  it('getDay',           () => expect(json('date-fns', 'getDay', `"${d1}"`)).toBe(dateFns.getDay(new Date(d1))));
  it('getDaysInMonth',   () => expect(json('date-fns', 'getDaysInMonth', '"2024-02-01"')).toBe(dateFns.getDaysInMonth(new Date('2024-02-01'))));
  it('isLeapYear',       () => expect(json('date-fns', 'isLeapYear', '"2024-01-01"')).toBe(dateFns.isLeapYear(new Date('2024-01-01'))));
});

// ─── sub-expressions [ pkg method args ] ─────────────────────────────────────
describe('sub-expressions', () => {
  // semver: coerce returns a SemVer instance — JSON boundary would strip prototype
  it('semver gt with coerced version', () =>
    expect(json('semver', 'gt', '[', 'semver', 'coerce', 'v4.2', ']', '"3.0.0"'))
      .toBe(semver.gt(semver.coerce('v4.2'), '3.0.0')));

  it('semver satisfies with coerced version', () =>
    expect(json('semver', 'satisfies', '[', 'semver', 'coerce', 'v1.5', ']', '"^1.0.0"'))
      .toBe(semver.satisfies(semver.coerce('v1.5'), '^1.0.0')));

  // lodash: sub-expression as argument
  it('lodash head of sub-expression flatten', () =>
    expect(json('lodash', 'head', '[', 'lodash', 'flatten', '[[1,2],[3,4]]', ']'))
      .toBe(_.head(_.flatten([[1,2],[3,4]]))));

  it('lodash uniq of sub-expression concat', () =>
    expect(json('lodash', 'uniq', '[', 'lodash', 'concat', '[1,2]', '[2,3]', ']'))
      .toEqual(_.uniq(_.concat([1,2], [2,3]))));

  // date-fns: differenceInDays with addDays sub-expression
  it('date-fns differenceInDays with addDays sub-expression', () => {
    const base = '2024-01-01';
    const result = json('date-fns', 'differenceInDays',
      '[', 'date-fns', 'addDays', `"${base}"`, '10', ']',
      `"${base}"`);
    expect(result).toBe(dateFns.differenceInDays(dateFns.addDays(new Date(base), 10), new Date(base)));
  });

  // ms: sub-expression result used as number arg
  it('lodash chunk with ms-computed size', () =>
    expect(json('lodash', 'chunk', '[1,2,3,4,5,6]',
      '[', 'ms', '"2s"', ']'))
      .toEqual(_.chunk([1,2,3,4,5,6], ms('2s'))));
});

// ─── mathjs ───────────────────────────────────────────────────────────────────
describe('mathjs', () => {
  it('evaluate expression',  () => expect(json('mathjs', 'evaluate', '"sqrt(144)"')).toBe(mathjs.evaluate('sqrt(144)')));
  it('evaluate addition',    () => expect(json('mathjs', 'evaluate', '"2 + 3 * 4"')).toBe(mathjs.evaluate('2 + 3 * 4')));
  it('round',                () => expect(json('mathjs', 'round', '3.14159', '2')).toBe(mathjs.round(3.14159, 2)));
  it('factorial',            () => expect(json('mathjs', 'factorial', '6')).toBe(mathjs.factorial(6)));
  it('gcd',                  () => expect(json('mathjs', 'gcd', '12', '8')).toBe(mathjs.gcd(12, 8)));
  it('lcm',                  () => expect(json('mathjs', 'lcm', '4', '6')).toBe(mathjs.lcm(4, 6)));
  it('log',                  () => expect(json('mathjs', 'log', '100', '10')).toBeCloseTo(mathjs.log(100, 10), 8));
  it('combinations',         () => expect(json('mathjs', 'combinations', '5', '2')).toBe(mathjs.combinations(5, 2)));
  it('mean of array',        () => expect(json('mathjs', 'mean', '[1,2,3,4,5]')).toBe(mathjs.mean([1,2,3,4,5])));
  it('std deviation',        () => expect(json('mathjs', 'std', '[2,4,4,4,5,5,7,9]')).toBeCloseTo(mathjs.std([2,4,4,4,5,5,7,9]), 8));
});
