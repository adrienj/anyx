import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

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
import yaml from 'yaml';
import { marked } from 'marked';
import slugify from 'slugify';
import qs from 'qs';
import he from 'he';
import * as uuid from 'uuid';
import prettyBytes from 'pretty-bytes';
import chroma from 'chroma-js';
import jsonpath from 'jsonpath';
import * as flat from 'flat';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'cli.js');

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

// ─── error handling ───────────────────────────────────────────────────────────

function runRaw(...args) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
}

describe('error handling', () => {
  it('no args → exit 1 with usage message', () => {
    const r = runRaw();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Usage:');
  });

  it('invalid package name (path traversal) → exit 1', () => {
    const r = runRaw('../evil');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('invalid package name');
  });

  it('invalid package name (uppercase) → exit 1', () => {
    const r = runRaw('BadPkg');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('invalid package name');
  });

  it('unknown method in chain → exit 1 with available methods hint', () => {
    // callMethod (used in chaining) errors on unknown methods
    const r = runRaw('lodash', '[1,2,3]', '.', 'nonExistentMethod123');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('nonExistentMethod123');
    expect(r.stderr).toContain('Available:');
  });
});

// ─── quoted subexpression string (shell-word form) ────────────────────────────
describe('quoted subexpression strings', () => {
  it('semver coerce via quoted bracket string', () =>
    expect(json('semver', 'gt', '[ semver coerce v4.2 ]', '"3.0.0"'))
      .toBe(semver.gt(semver.coerce('v4.2'), '3.0.0')));

  it('lodash flatten via quoted bracket string', () =>
    expect(json('lodash', 'head', '[ lodash flatten [[1,2],[3,4]] ]'))
      .toBe(_.head(_.flatten([[1,2],[3,4]]))));
});

// ─── chaining edge cases ──────────────────────────────────────────────────────
describe('chaining edge cases', () => {
  it('three-step chain (range → reverse → head)', () =>
    expect(json('lodash', '.', 'range', '5', '.', 'reverse', '.', 'head'))
      .toBe(_.head(_.reverse(_.range(5)))));

  it('value passes through chained call as first arg', () =>
    expect(json('lodash', '"a,b,c"', '.', 'split', '","'))
      .toEqual(_.split('a,b,c', ',')));
});

// ─── stdin edge cases ─────────────────────────────────────────────────────────
describe('stdin edge cases', () => {
  it('plain string (non-JSON) stdin passed as -', () => {
    const result = spawnSync('node', [CLI, 'lodash', 'camelCase', '-'], {
      input: 'hello world',
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(_.camelCase('hello world'));
  });

  it('JSON array from stdin used in chain', () => {
    const result = spawnSync('node', [CLI, 'lodash', 'flatten', '-', '.', 'uniq'], {
      input: '[[1,2],[2,3]]',
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual(_.uniq(_.flatten([[1,2],[2,3]])));
  });

  it('change-case: plain string stdin', () => {
    const result = spawnSync('node', [CLI, 'change-case', 'snakeCase', '-'], {
      input: 'Hello World',
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(changeCase.snakeCase('Hello World'));
  });

  it('mathjs: JSON number stdin', () => {
    const result = spawnSync('node', [CLI, 'mathjs', 'factorial', '-'], {
      input: '5',
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toBe(mathjs.factorial(5));
  });
});

// ─── chaining with non-lodash libraries ───────────────────────────────────────
describe('chaining with non-lodash libraries', () => {
  it('date-fns: addDays → getDay (explicit dot)', () =>
    expect(json('date-fns', '.', 'addDays', '"2024-01-01"', '10', '.', 'getDay'))
      .toBe(dateFns.getDay(dateFns.addDays(new Date('2024-01-01'), 10))));

  it('mathjs: abs → factorial (explicit dot)', () =>
    expect(json('mathjs', '.', 'abs', '-5', '.', 'factorial'))
      .toBe(mathjs.factorial(mathjs.abs(-5))));

  it('change-case: camelCase → pascalCase (chain two string transforms)', () =>
    expect(run('change-case', '.', 'camelCase', '"hello world"', '.', 'pascalCase'))
      .toBe(changeCase.pascalCase(changeCase.camelCase('hello world'))));

  it('semver: coerce → major (explicit dot chain)', () =>
    expect(json('semver', '.', 'coerce', '"v3.2.1"', '.', 'major'))
      .toBe(semver.major(semver.coerce('v3.2.1').version)));
});

// ─── nested sub-expressions ───────────────────────────────────────────────────
describe('nested sub-expressions', () => {
  it('semver gt with doubly-nested coerce', () =>
    expect(json('semver', 'gt',
      '[', 'semver', 'coerce', '[', 'semver', 'valid', '"5.0.0"', ']', ']',
      '"4.0.0"'))
      .toBe(semver.gt(semver.coerce(semver.valid('5.0.0')), '4.0.0')));

  it('lodash head of nested flatten+uniq', () =>
    expect(json('lodash', 'head',
      '[', 'lodash', 'uniq', '[', 'lodash', 'flatten', '[[3,3],[1,2]]', ']', ']'))
      .toBe(_.head(_.uniq(_.flatten([[3,3],[1,2]])))));

  it('mathjs evaluate nested abs result', () =>
    expect(json('mathjs', 'factorial',
      '[', 'mathjs', 'abs', '-4', ']'))
      .toBe(mathjs.factorial(mathjs.abs(-4))));
});

// ─── yaml ─────────────────────────────────────────────────────────────────────
describe('yaml', () => {
  it('parse flat object',  () => expect(json('yaml', 'parse', 'name: Alice\nage: 30')).toEqual(yaml.parse('name: Alice\nage: 30')));
  it('parse nested',       () => expect(json('yaml', 'parse', 'db:\n  host: localhost\n  port: 5432')).toEqual(yaml.parse('db:\n  host: localhost\n  port: 5432')));
  it('parse list',         () => expect(json('yaml', 'parse', 'roles:\n  - admin\n  - user')).toEqual(yaml.parse('roles:\n  - admin\n  - user')));
  it('stringify object',   () => expect(run('yaml', 'stringify', '{"host":"localhost","port":5432}')).toBe(yaml.stringify({host:'localhost',port:5432}).trim()));
});

// ─── marked ───────────────────────────────────────────────────────────────────
describe('marked', () => {
  it('h1 heading',    () => expect(run('marked', 'parse', '"# Hello World"')).toBe(marked.parse('# Hello World').trim()));
  it('bold text',     () => expect(run('marked', 'parse', '"**bold**"')).toBe(marked.parse('**bold**').trim()));
  it('inline code',   () => expect(run('marked', 'parse', '"`code`"')).toBe(marked.parse('`code`').trim()));
  it('link',          () => expect(run('marked', 'parse', '"[text](https://example.com)"')).toBe(marked.parse('[text](https://example.com)').trim()));
});

// ─── slugify ──────────────────────────────────────────────────────────────────
describe('slugify', () => {
  it('basic slug',           () => expect(run('slugify', 'Hello World')).toBe(slugify('Hello World')));
  it('lowercase + strict',   () => expect(run('slugify', 'Hello World! 2024', '{"lower":true,"strict":true}')).toBe(slugify('Hello World! 2024', {lower:true,strict:true})));
  it('custom replacement',   () => expect(run('slugify', 'Hello World', '{"replacement":"_","lower":true}')).toBe(slugify('Hello World', {replacement:'_',lower:true})));
});

// ─── qs ───────────────────────────────────────────────────────────────────────
describe('qs', () => {
  it('stringify flat object', () => expect(run('qs', 'stringify', '{"name":"alice","active":true}')).toBe(qs.stringify({name:'alice',active:true})));
  it('stringify nested',      () => expect(run('qs', 'stringify', '{"filter":{"status":"open","priority":"high"}}')).toBe(qs.stringify({filter:{status:'open',priority:'high'}})));
  it('parse query string',    () => expect(json('qs', 'parse', '"name=alice&active=true"')).toEqual(qs.parse('name=alice&active=true')));
  it('parse nested brackets', () => expect(json('qs', 'parse', '"filter%5Bstatus%5D=open"')).toEqual(qs.parse('filter%5Bstatus%5D=open')));
});

// ─── he ───────────────────────────────────────────────────────────────────────
describe('he', () => {
  it('encode HTML tags',      () => expect(run('he', 'encode', '"<b>Hello & World</b>"')).toBe(he.encode('<b>Hello & World</b>')));
  it('encode quotes',         () => expect(run('he', 'encode', '"She said \\"hello\\""')).toBe(he.encode('She said "hello"')));
  it('decode entities',       () => expect(run('he', 'decode', '"&lt;b&gt;Hello&lt;/b&gt;"')).toBe(he.decode('&lt;b&gt;Hello&lt;/b&gt;')));
  it('escape (minimal)',      () => expect(run('he', 'escape', '"<script>alert(1)</script>"')).toBe(he.escape('<script>alert(1)</script>')));
});

// ─── uuid ─────────────────────────────────────────────────────────────────────
const KNOWN_V4 = '550e8400-e29b-41d4-a716-446655440000';
describe('uuid', () => {
  it('v4 matches UUID format', () => expect(run('uuid', 'v4')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  it('v4 unique on each call', () => expect(run('uuid', 'v4')).not.toBe(run('uuid', 'v4')));
  it('validate known UUID',    () => expect(json('uuid', 'validate', `"${KNOWN_V4}"`)).toBe(uuid.validate(KNOWN_V4)));
  it('validate bad string',    () => expect(json('uuid', 'validate', '"not-a-uuid"')).toBe(uuid.validate('not-a-uuid')));
  it('version of known UUID',  () => expect(json('uuid', 'version', `"${KNOWN_V4}"`)).toBe(uuid.version(KNOWN_V4)));
});

// ─── pretty-bytes ─────────────────────────────────────────────────────────────
describe('pretty-bytes', () => {
  it('megabytes',            () => expect(run('pretty-bytes', '1048576')).toBe(prettyBytes(1048576)));
  it('kilobytes',            () => expect(run('pretty-bytes', '1500')).toBe(prettyBytes(1500)));
  it('bytes',                () => expect(run('pretty-bytes', '512')).toBe(prettyBytes(512)));
  it('binary (KiB) option',  () => expect(run('pretty-bytes', '1024', '{"binary":true}')).toBe(prettyBytes(1024, {binary:true})));
  it('gigabytes',            () => expect(run('pretty-bytes', '1073741824')).toBe(prettyBytes(1073741824)));
});

// ─── chroma-js ────────────────────────────────────────────────────────────────
describe('chroma-js', () => {
  it('valid hex color',       () => expect(json('chroma-js', 'valid', '"#ff0000"')).toBe(chroma.valid('#ff0000')));
  it('invalid color string',  () => expect(json('chroma-js', 'valid', '"notacolor"')).toBe(chroma.valid('notacolor')));
  it('valid named color',     () => expect(json('chroma-js', 'valid', '"red"')).toBe(chroma.valid('red')));
  it('contrast red/white',    () => expect(json('chroma-js', 'contrast', '"#ff0000"', '"#ffffff"')).toBeCloseTo(chroma.contrast('#ff0000', '#ffffff'), 4));
  it('contrast black/white',  () => expect(json('chroma-js', 'contrast', '"#000000"', '"#ffffff"')).toBeCloseTo(chroma.contrast('#000000', '#ffffff'), 4));
  it('distance similar',      () => expect(json('chroma-js', 'distance', '"#ff0000"', '"#ff1000"')).toBeCloseTo(chroma.distance('#ff0000', '#ff1000'), 4));
});

// ─── jsonpath ─────────────────────────────────────────────────────────────────
describe('jsonpath', () => {
  const data = { store: { books: [{ title: 'A', price: 10 }, { title: 'B', price: 20 }], owner: 'Alice' } };
  it('query simple path',     () => expect(json('jsonpath', 'query', JSON.stringify(data), '"$.store.owner"')).toEqual(jsonpath.query(data, '$.store.owner')));
  it('query array elements',  () => expect(json('jsonpath', 'query', JSON.stringify(data), '"$.store.books[*].title"')).toEqual(jsonpath.query(data, '$.store.books[*].title')));
  it('query filtered price',  () => expect(json('jsonpath', 'query', JSON.stringify(data), '"$.store.books[?(@.price>15)].title"')).toEqual(jsonpath.query(data, '$.store.books[?(@.price>15)].title')));
  it('value (single result)', () => expect(run('jsonpath', 'value', JSON.stringify(data), '"$.store.owner"')).toBe(jsonpath.value(data, '$.store.owner')));
});

// ─── flat ─────────────────────────────────────────────────────────────────────
describe('flat', () => {
  it('flatten deep object',   () => expect(json('flat', 'flatten', '{"a":{"b":{"c":1}}}')).toEqual(flat.flatten({a:{b:{c:1}}})));
  it('flatten mixed',         () => expect(json('flat', 'flatten', '{"x":{"y":1},"z":2}')).toEqual(flat.flatten({x:{y:1},z:2})));
  it('unflatten dotted keys', () => expect(json('flat', 'unflatten', '{"a.b.c":1,"a.b.d":2}')).toEqual(flat.unflatten({'a.b.c':1,'a.b.d':2})));
  it('round-trip flatten → unflatten', () => {
    const original = {a:{b:{c:1,d:2}},e:3};
    const flattened = json('flat', 'flatten', JSON.stringify(original));
    const restored  = json('flat', 'unflatten', JSON.stringify(flattened));
    expect(restored).toEqual(original);
  });
});

// ─── shell $(cat file) — parametrized across available shells ─────────────────
// Each shell evaluates $(cat file) natively; no JS simulation.
// fish uses (cat file | string collect) — different syntax, see README.
// Windows cmd.exe has no substitution — use Git Bash, WSL, or PowerShell.

function detectShell(bin) {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [bin], { encoding: 'utf8', stdio: 'pipe' })
    : spawnSync('which', [bin], { encoding: 'utf8', stdio: 'pipe' });
  return probe.status === 0;
}

const POSIX_SHELLS = ['sh', 'bash', 'zsh', 'dash'].filter(detectShell);
const PWSH        = ['pwsh', 'powershell'].find(detectShell) ?? null;

// One set of test cases, run for every shell found
const SHELL_CASES = [
  {
    label:   'yaml parse "$(cat config.yaml)" — YAML config to JSON',
    file:    'config.yaml',
    content: 'host: localhost\nport: 5432\nssl: true',
    cmd:     file => `node "${CLI}" yaml parse "$(cat '${file}')"`,
    pwshCmd: file => `node "${CLI}" yaml parse "$(Get-Content -Raw '${file}')"`,
    assert:  (out, content) => expect(JSON.parse(out)).toEqual(yaml.parse(content)),
  },
  {
    label:   'jsonpath query "$(cat data.json)" — extract field',
    file:    'data.json',
    content: JSON.stringify({ users: [{ name: 'Alice' }, { name: 'Bob' }] }),
    cmd:     file => `node "${CLI}" jsonpath query "$(cat '${file}')" '"$.users[0].name"'`,
    pwshCmd: file => `node "${CLI}" jsonpath query "$(Get-Content -Raw '${file}')" '"$.users[0].name"'`,
    assert:  out => expect(JSON.parse(out)).toEqual(['Alice']),
  },
  {
    label:   'marked parse "$(cat README.md)" — markdown to HTML',
    file:    'README.md',
    content: '# Hello\n\nSome **bold** text.',
    cmd:     file => `node "${CLI}" marked parse "$(cat '${file}')"`,
    pwshCmd: file => `node "${CLI}" marked parse "$(Get-Content -Raw '${file}')"`,
    assert:  (out, content) => expect(out).toBe(marked.parse(content).trim()),
  },
  {
    label:   'he encode "$(cat template.html)" — HTML-encode a file',
    file:    'template.html',
    content: '<section>\n  <p>Hello & World</p>\n</section>',
    cmd:     file => `node "${CLI}" he encode "$(cat '${file}')"`,
    pwshCmd: file => `node "${CLI}" he encode "$(Get-Content -Raw '${file}')"`,
    assert:  (out, content) => expect(out).toBe(he.encode(content)),
  },
  {
    label:   'qs stringify "$(cat filter.json)" — JSON to query string',
    file:    'filter.json',
    content: JSON.stringify({ status: 'open', page: 1 }),
    cmd:     file => `node "${CLI}" qs stringify "$(cat '${file}')"`,
    pwshCmd: file => `node "${CLI}" qs stringify "$(Get-Content -Raw '${file}')"`,
    assert:  (out, content) => expect(out).toBe(qs.stringify(JSON.parse(content))),
  },
];

function withTmpFile(name, content, fn) {
  const file = join(tmpdir(), `npxall-test-${name}`);
  writeFileSync(file, content, 'utf8');
  try { return fn(file); }
  finally { unlinkSync(file); }
}

function runInShell(bin, flag, cmd) {
  const r = spawnSync(bin, [flag, cmd], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

// POSIX shells: sh, bash, zsh, dash — identical $() syntax
for (const shell of POSIX_SHELLS) {
  describe(`shell $(cat file) — ${shell}`, () => {
    for (const { label, file, content, cmd, assert } of SHELL_CASES) {
      it(label, () =>
        withTmpFile(`${shell}-${file}`, content, path =>
          assert(runInShell(shell, '-c', cmd(path)), content)));
    }
  });
}

// PowerShell (pwsh / powershell) — uses -Command flag and Get-Content -Raw to preserve newlines.
describe(`shell $(cat file) — ${PWSH ?? 'pwsh (not installed)'}`, () => {
  for (const { label, file, content, pwshCmd, assert } of SHELL_CASES) {
    const testFn = PWSH ? it : it.skip;
    testFn(label, () =>
      withTmpFile(`pwsh-${file}`, content, path =>
        assert(runInShell(PWSH, '-Command', pwshCmd(path)), content)));
  }
});

// fish uses (cat file | string collect) — POSIX $() syntax does not apply.
// Windows cmd.exe has no command substitution — use Git Bash, WSL, or PowerShell.
describe('shell $(cat file) — unsupported shells', () => {
  it.skip('fish: use (cat file | string collect) instead of $(cat file)');
  it.skip('cmd.exe: no substitution support — use Git Bash, WSL, or PowerShell');
});
