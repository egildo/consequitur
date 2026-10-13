// The schema derived from two sources: equal schemas are one, the parts the sources
// state differently are conflicts a person answers, and the result is a schema of
// its own under a name. The cases are read from their own files.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_KIT, canonical, readSchema, type GistSchema, type Json, type LawBinding, type Schema } from '../src/index.ts';
import { deriveSchema, type Answer, type DerivedSchema, type SchemaConflict } from '../src/derive.ts';
import { schemaJson } from '../src/schema.ts';
import { SIBAR, SIBAR_JSON, sibar, strict } from './helpers.ts';

/** A case as its file holds it. */
const caseJson = (name: string): { [key: string]: Json } =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'cases', name, 'schema.json'), 'utf8')) as { [key: string]: Json };

const ACTIVITY = strict(caseJson('sibar-activity'));
const EDITORIAL = strict(caseJson('editorial-review'));
const WAREHOUSE = strict(caseJson('warehouse-arrival'));

/** A JSON value with every object's keys in reverse order, at every depth: the same value, written in other order. */
const reversedKeys = (value: Json): Json => {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, part]) => [key, reversedKeys(part)]));
  }
  return value;
};

/** The conflicts as `part:name`, in order: what a person is shown. */
const keysOf = (derived: DerivedSchema): string[] => derived.conflicts.map((c) => `${c.part}:${c.name}`);

/** The derived schema; the test fails when there is none. */
const schemaOf = (derived: DerivedSchema): Schema => {
  if (derived.schema === undefined) throw new Error(`There is no derived schema: ${derived.problems.join(' ')}`);
  return derived.schema;
};

/** One answer for every conflict. */
const everyAnswer = (conflicts: SchemaConflict[], answer: Answer): Answer[] => conflicts.map(() => answer);

/** The given answer for each conflict of one part, and the first's part for the rest. */
const answerPart = (conflicts: SchemaConflict[], part: SchemaConflict['part'], answer: Answer): Answer[] =>
  conflicts.map((c): Answer => (c.part === part ? answer : 'first'));

/** A law's identity: its canonical form without its strength. */
const identityOf = (law: LawBinding): string => {
  const { strength: _strength, ...rest } = law;
  return canonical(JSON.parse(JSON.stringify(rest)));
};

describe('deriveSchema', () => {
  describe('when the sources are the same schema', () => {
    it('is the same, with no conflicts and the first schema itself', () => {
      const derived = deriveSchema(SIBAR, sibar());
      expect(derived.same).toBe(true);
      expect(derived.conflicts).toEqual([]);
      expect(derived.schema).toBe(SIBAR);
      expect(derived.problems).toEqual([]);
    });

    it('is the same even when one source is read from JSON whose keys come in another order', () => {
      const reordered = strict(reversedKeys(caseJson('sibar-activity')));
      const derived = deriveSchema(ACTIVITY, reordered);
      expect(derived.same).toBe(true);
      expect(derived.conflicts).toEqual([]);
      expect(derived.schema).toBe(ACTIVITY);
    });
  });

  describe('when the sources differ', () => {
    it('is not the same, and without a name has no schema and no problems while conflicts are unanswered', () => {
      const derived = deriveSchema(ACTIVITY, EDITORIAL);
      expect(derived.same).toBe(false);
      expect(derived.conflicts.length).toBeGreaterThan(0);
      expect(derived.schema).toBeUndefined();
      expect(derived.problems).toEqual([]);
    });

    it('lists the conflicts of sibar-activity and editorial-review, in order', () => {
      expect(keysOf(deriveSchema(ACTIVITY, EDITORIAL))).toEqual([
        'opening:',
        'authority:',
        'record:value',
        'record:join',
        'record:leave',
        'gist:comment',
        'gist:set_goal',
        'gist:set_goal_revoke',
      ]);
    });

    it('lists the conflicts of sibar-activity and warehouse-arrival, in order', () => {
      expect(keysOf(deriveSchema(ACTIVITY, WAREHOUSE))).toEqual([
        'opening:',
        'authority:',
        'gist:memo',
        'gist:comment',
        'gist:set_goal',
        'gist:set_goal_revoke',
        'gist:closed',
      ]);
    });

    it('lists the conflicts of warehouse-arrival and editorial-review, in order', () => {
      expect(keysOf(deriveSchema(WAREHOUSE, EDITORIAL))).toEqual([
        'opening:',
        'authority:',
        'record:value',
        'record:join',
        'record:leave',
        'gist:set_goal',
        'gist:set_goal_revoke',
      ]);
    });

    it('lists the same conflicts whatever the answers and the name', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const firsts = deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'first'), name: 'activity-review' });
      const seconds = deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'second') });
      expect(firsts.conflicts).toEqual(open.conflicts);
      expect(seconds.conflicts).toEqual(open.conflicts);
    });

    it('names a guard the two sources state differently, and only that guard', () => {
      const changed = sibar({ head: { guards: { ...SIBAR_JSON.guards, assignee: { is: 'x', values: ['x'] } } } });
      expect(keysOf(deriveSchema(SIBAR, changed))).toEqual(['guard:assignee']);
    });

    it('names a law the two sources state at different strengths by its identity', () => {
      const laws = SIBAR_JSON.laws as LawBinding[];
      const flip = (law: LawBinding): LawBinding => ({ ...law, strength: law.strength === 'refuse' ? 'confirm' : 'refuse' });
      const changed = sibar({ laws: [flip(laws[0]), ...laws.slice(1)] });
      const derived = deriveSchema(SIBAR, changed);
      expect(derived.conflicts.map((c) => c.part)).toEqual(['law']);
      expect(derived.conflicts[0].name).toBe(identityOf(laws[0]));
    });
  });

  describe('parts only one source has, or that are unions', () => {
    it('unions the sets and the judged kins: the first in its order, then the second\'s additions, never a conflict', () => {
      const more = sibar({ head: { sets: ['extra_set', ...SIBAR.sets], judged: [...SIBAR.judged, 'kin_extra'] } });
      const derived = deriveSchema(SIBAR, more, { name: 'more-sets' });
      expect(derived.conflicts).toEqual([]);
      const schema = schemaOf(derived);
      expect(schema.sets).toEqual([...SIBAR.sets, 'extra_set']);
      expect(schema.judged).toEqual([...SIBAR.judged, 'kin_extra']);
    });

    it('adds a gist, a guard and a law that only the second has, once and with no conflict', () => {
      const extraGist: GistSchema = { gist: 'extra_note', writers: ['user'], rules: [] };
      const extraLaw = { law: 'keeps-set', set: 'assignees', strength: 'confirm' } as LawBinding;
      const second = sibar({
        add: [extraGist],
        laws: [...SIBAR_JSON.laws, extraLaw],
        head: { guards: { ...SIBAR_JSON.guards, extra_guard: { guard: 'assignee' } } },
      });
      const derived = deriveSchema(SIBAR, second, { name: 'with-note' });
      expect(derived.conflicts).toEqual([]);
      const schema = schemaOf(derived);
      expect(schema.gists).toEqual([...SIBAR.gists, extraGist]);
      expect(schema.guards).toEqual({ ...SIBAR.guards, extra_guard: { guard: 'assignee' } });
      expect(schema.laws).toEqual([...SIBAR.laws, extraLaw]);
    });
  });

  describe('answers', () => {
    it('with every answer the first, keeps the first parts and adds the second\'s additions', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'first'), name: 'activity-review' }));
      expect(schema.opening).toBe(ACTIVITY.opening);
      expect(schema.authority).toBe(ACTIVITY.authority);
      expect(schema.records).toEqual(ACTIVITY.records);
      expect(schema.gists).toEqual([...ACTIVITY.gists, ...EDITORIAL.gists.filter((g) => !ACTIVITY.gists.some((a) => a.gist === g.gist))]);
      expect(schema.laws).toEqual([...ACTIVITY.laws, ...EDITORIAL.laws.filter((l) => !ACTIVITY.laws.some((a) => identityOf(a) === identityOf(l)))]);
      expect(schema.guards).toEqual({ ...ACTIVITY.guards, ...EDITORIAL.guards });
      expect(schema.sets).toEqual([...ACTIVITY.sets, ...EDITORIAL.sets.filter((s) => !ACTIVITY.sets.includes(s))]);
    });

    it('with every answer the second, takes the second part of each conflict', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'second'), name: 'activity-review' }));
      expect(schema.opening).toBe(EDITORIAL.opening);
      expect(schema.authority).toBe(EDITORIAL.authority);
      expect(schema.records).toEqual(EDITORIAL.records);
      for (const name of ['comment', 'set_goal', 'set_goal_revoke']) {
        expect(schema.gists.find((g) => g.gist === name)).toEqual(EDITORIAL.gists.find((g) => g.gist === name));
      }
    });

    it('takes a part written by hand, as the answer to its conflict', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers: answerPart(open.conflicts, 'opening', { by: EDITORIAL.opening }), name: 'activity-review' }));
      expect(schema.opening).toBe(EDITORIAL.opening);
      expect(schema.authority).toBe(ACTIVITY.authority);
    });

    it('gives the reader\'s problem and no schema when a part written by hand does not read as an opening', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers: answerPart(open.conflicts, 'opening', { by: 'not a gist name' }), name: 'activity-review' });
      expect(derived.schema).toBeUndefined();
      expect(derived.problems).toEqual(['opening must name a gist, in lower snake case.']);
    });

    it('gives the reader\'s problem and no schema when a gist written by hand lacks a key', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const answers: Answer[] = open.conflicts.map((c): Answer => (c.part === 'gist' && c.name === 'comment' ? { by: { gist: 'comment', writers: ['user'] } } : 'first'));
      const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
      expect(derived.schema).toBeUndefined();
      expect(derived.problems.join(' ')).toMatch(/must have the keys gist, writers and rules/);
    });
  });

  describe('the name', () => {
    it('is needed when every conflict is answered and the sources differ: the problem says so', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'first') });
      expect(derived.same).toBe(false);
      expect(derived.schema).toBeUndefined();
      expect(derived.problems).toEqual(['The derived schema needs a name: the sources are read by different schemas.']);
    });

    it('must be in lower kebab case: the reader\'s problem says so', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'first'), name: 'Not Kebab' });
      expect(derived.schema).toBeUndefined();
      expect(derived.problems.join(' ')).toMatch(/lower kebab case/);
    });

    it('gives the derived schema the name at version 1, the first kit, and it reads and round-trips', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'first'), name: 'activity-review' }));
      expect(schema.name).toBe('activity-review');
      expect(schema.version).toBe(1);
      expect(schema.kit).toBe(BASE_KIT);
      const read = readSchema(schemaJson(schema), BASE_KIT);
      expect(read.problems).toEqual([]);
      expect(canonical(schemaJson(read.schema))).toBe(canonical(schemaJson(schema)));
    });
  });

  describe('purity', () => {
    it('does not mutate the sources', () => {
      const before = [canonical(schemaJson(ACTIVITY)), canonical(schemaJson(EDITORIAL))];
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      deriveSchema(ACTIVITY, EDITORIAL, { answers: everyAnswer(open.conflicts, 'second'), name: 'activity-review' });
      expect([canonical(schemaJson(ACTIVITY)), canonical(schemaJson(EDITORIAL))]).toEqual(before);
    });

    it('gives equal results when derived twice from the same inputs', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const answers = everyAnswer(open.conflicts, 'second');
      const a = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
      const b = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
      expect(a.conflicts).toEqual(b.conflicts);
      expect(schemaJson(schemaOf(a))).toEqual(schemaJson(schemaOf(b)));
    });
  });
});
