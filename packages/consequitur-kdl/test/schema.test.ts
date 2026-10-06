// A schema in KDL: each case's `schema.kdl` reads to the object its `schema.json` holds, and is what the
// writer writes of it; a condition of every node comes back as it went; the reader says where the text
// is wrong, and the writer refuses what this form cannot hold.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_KIT, readSchema, type Condition, type Json } from 'consequitur';
import { fromKdl, toKdl } from '../src/index.ts';

const casePath = (domain: string, file: string) => join(import.meta.dirname, '..', '..', '..', 'cases', domain, file);

describe('the cases', () => {
  for (const domain of ['sibar-activity', 'editorial-review', 'warehouse-arrival']) {
    const json = JSON.parse(readFileSync(casePath(domain, 'schema.json'), 'utf8')) as Record<string, Json>;
    const kdl = readFileSync(casePath(domain, 'schema.kdl'), 'utf8');

    it(`${domain}: schema.kdl reads to the same object as schema.json, which the base kit reads`, () => {
      const { json: read, problems } = fromKdl(kdl);
      expect(problems).toEqual([]);
      expect(read).toEqual(json);
      expect(readSchema(read, BASE_KIT).problems).toEqual([]);
    });

    it(`${domain}: schema.kdl is what the writer writes of schema.json`, () => {
      expect(toKdl(json)).toBe(kdl);
    });
  }
});

describe('conditions', () => {
  /** A schema of one guard holding the condition, written and read back. */
  const roundTrip = (condition: Condition) => fromKdl(toKdl({ guards: { probe: condition as unknown as Json } }));

  it('come back as they went, every node and every reference', () => {
    const every: Condition = {
      any: [
        { is: { $writer: 'id' }, values: [{ $set: 'reviewers' }, 'drusso', 3, true, null] },
        { has: { $draft: 'version' } },
        { not: { all: [{ guard: 'reviewer' }, { is: { $value: 'late' }, values: [true] }] } },
        { not: { guard: 'reviewer' } },
        { atLeast: 2, of: [{ line: { gist: 'approve', writer: 'user::bgalli', payload: { version: { $value: 'version' }, n: 1 } } }, { line: { kin: 'system' } }, { line: { gist: 'x' } }] },
      ],
    };
    expect(roundTrip(every)).toEqual({ json: { guards: { probe: every }, gists: [] }, problems: [] });
  });

  it('write a reference in a check as a tagged property of its payload', () => {
    expect(toKdl({ guards: { probe: { line: { gist: 'approve', payload: { version: { $value: 'version' } } } } } })).toBe(
      ['guard probe {', '    line gist=approve {', '        payload version=(value)version', '    }', '}', ''].join('\n'),
    );
  });

  it('read several conditions in one body as all of them', () => {
    const { json, problems } = fromKdl('guard probe {\n  has (value)a\n  has (value)b\n}');
    expect(problems).toEqual([]);
    expect(json.guards).toEqual({ probe: { all: [{ has: { $value: 'a' } }, { has: { $value: 'b' } }] } });
  });
});

describe('what the reader refuses', () => {
  const problemsOf = (text: string) => fromKdl(text).problems;

  it.each([
    ['text that is not KDL', 'gist {', 1],
    ['a node a schema does not take', 'colour red', 1],
    ['an opening written twice', 'opening a\nopening b', 2],
    ['a gist with properties', 'gist a user k=1', 1],
    ['a guard with no name', 'guard {\n  has (value)a\n}', 1],
    ['a when with an argument', 'gist a user {\n  when x {\n    has (value)a\n  }\n}', 2],
    ['an empty when', 'gist a user {\n  when\n}', 2],
    ['a reference of another kind', 'guard g {\n  has (input)a\n}', 2],
    ['a word consequitur does not register', 'guard g {\n  between 1 2\n}', 2],
    ['a check with an argument', 'guard g {\n  line memo\n}', 2],
    ['a check with a key it does not have', 'guard g {\n  line gist=memo not=#true\n}', 2],
    ['a payload value tagged as another reference', 'guard g {\n  line gist=memo {\n    payload who=(set)team\n  }\n}', 3],
    ['a law with no kind', 'law strength=refuse', 1],
    ['a binding key written twice', 'gist a user {\n  revoke from=x {\n    from y\n  }\n}', 3],
  ])('%s, and says on which line', (_, text, line) => {
    const problems = problemsOf(text);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].line).toBe(line);
    expect(problems[0].message).toMatch(/^\S/);
  });
});

describe('what the writer refuses', () => {
  it('a value inside a value of a binding, and a list in a check\'s payload, with a RangeError', () => {
    expect(() => toKdl({ gists: [{ gist: 'a', writers: ['user'], rules: [{ rule: 'value', key: 'k', value: { deep: [1] } }] }] })).toThrow(RangeError);
    expect(() => toKdl({ guards: { g: { line: { payload: { list: [1, 2] } } } } })).toThrow(RangeError);
  });
});
