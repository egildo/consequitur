// The schema derived from two sources: equal schemas are one, the parts the sources
// state differently, and the laws only one of them has, are conflicts a person answers,
// and the result is a schema of its own under a name. The cases are read from their own files.

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

/** The answer that takes one source's part of a conflict: a law only that source has is kept, a law only the other has is dropped. */
const fromSource = (conflict: SchemaConflict, source: 'first' | 'second'): Answer => {
  if (conflict.part !== 'one-sided-law') return source;
  const has = source === 'first' ? conflict.first !== null : conflict.second !== null;
  return has ? 'keep' : 'drop';
};

/** Every conflict answered as one source has it. */
const bySource = (conflicts: SchemaConflict[], source: 'first' | 'second'): Answer[] => conflicts.map((c) => fromSource(c, source));

/** The given answer for each conflict of one part, and the first source's for the rest. */
const answerPart = (conflicts: SchemaConflict[], part: SchemaConflict['part'], answer: Answer): Answer[] =>
  conflicts.map((c): Answer => (c.part === part ? answer : fromSource(c, 'first')));

/** The given answer for the conflict of one law, found by its identity, and the first source's for the rest. */
const answerLaw = (conflicts: SchemaConflict[], identity: string, answer: Answer): Answer[] =>
  conflicts.map((c): Answer => (c.part === 'one-sided-law' && c.name === identity ? answer : fromSource(c, 'first')));

/** A law's identity: its canonical form without its strength. */
const identityOf = (law: LawBinding): string => {
  const { strength: _strength, ...rest } = law;
  return canonical(JSON.parse(JSON.stringify(rest)));
};

/** The identities of a schema's laws, in its order. */
const lawIdentities = (schema: Schema): string[] => schema.laws.map(identityOf);

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
        `one-sided-law:${identityOf(ACTIVITY.laws[0])}`,
        `one-sided-law:${identityOf(EDITORIAL.laws[0])}`,
        `one-sided-law:${identityOf(EDITORIAL.laws[1])}`,
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
        `one-sided-law:${identityOf(ACTIVITY.laws[0])}`,
        `one-sided-law:${identityOf(ACTIVITY.laws[1])}`,
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
        `one-sided-law:${identityOf(EDITORIAL.laws[0])}`,
        `one-sided-law:${identityOf(EDITORIAL.laws[1])}`,
        `one-sided-law:${identityOf(EDITORIAL.laws[2])}`,
      ]);
    });

    it('lists the same conflicts whatever the answers and the name', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const firsts = deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'first'), name: 'activity-review' });
      const seconds = deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'second') });
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

    it('adds a gist and a guard that only the second has, once and with no conflict, and asks about a law only the second has', () => {
      const extraGist: GistSchema = { gist: 'extra_note', writers: ['user'], rules: [] };
      const extraLaw = { law: 'keeps-set', set: 'assignees', strength: 'confirm' } as LawBinding;
      const second = sibar({
        add: [extraGist],
        laws: [...SIBAR_JSON.laws, extraLaw],
        head: { guards: { ...SIBAR_JSON.guards, extra_guard: { guard: 'assignee' } } },
      });
      expect(keysOf(deriveSchema(SIBAR, second))).toEqual([`one-sided-law:${identityOf(extraLaw)}`]);
      const derived = deriveSchema(SIBAR, second, { answers: ['keep'], name: 'with-note' });
      const schema = schemaOf(derived);
      expect(schema.gists).toEqual([...SIBAR.gists, extraGist]);
      expect(schema.guards).toEqual({ ...SIBAR.guards, extra_guard: { guard: 'assignee' } });
      expect(schema.laws).toEqual([...SIBAR.laws, extraLaw]);
    });

    it('asks nothing about a law when the only difference is a gist, a guard, a set, a judged kin or a record role', () => {
      const extraGist: GistSchema = { gist: 'extra_note', writers: ['user'], rules: [] };
      const { warning: _warning, ...records } = SIBAR_JSON.records;
      const withoutWarning = sibar({ head: { records } });
      const pairs: Array<[Schema, Schema]> = [
        [SIBAR, sibar({ add: [extraGist] })],
        [SIBAR, sibar({ head: { guards: { ...SIBAR_JSON.guards, extra_guard: { guard: 'assignee' } } } })],
        [SIBAR, sibar({ head: { sets: ['extra_set', ...SIBAR.sets] } })],
        [SIBAR, sibar({ head: { judged: [...SIBAR.judged, 'kin_extra'] } })],
        [withoutWarning, SIBAR],
      ];
      for (const [first, second] of pairs) {
        expect(deriveSchema(first, second).conflicts).toEqual([]);
      }
    });
  });

  describe('a law only one source has', () => {
    it('is a conflict of its own, with the law on its source\'s side and null on the other', () => {
      const asked = deriveSchema(ACTIVITY, EDITORIAL).conflicts.filter((c) => c.part === 'one-sided-law');
      expect(asked.map((c) => c.name)).toEqual([identityOf(ACTIVITY.laws[0]), identityOf(EDITORIAL.laws[0]), identityOf(EDITORIAL.laws[1])]);
      for (const c of asked) expect([c.first, c.second].filter((part) => part === null)).toHaveLength(1);
      expect(asked[0].first).toEqual(ACTIVITY.laws[0]);
      expect(asked[1].second).toEqual(EDITORIAL.laws[0]);
      expect(asked[2].second).toEqual(EDITORIAL.laws[1]);
    });

    it('is in the derived schema when the second\'s is kept', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const answers = answerLaw(open.conflicts, identityOf(EDITORIAL.laws[0]), 'keep');
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' }));
      expect(lawIdentities(schema)).toEqual([identityOf(ACTIVITY.laws[0]), identityOf(ACTIVITY.laws[1]), identityOf(ACTIVITY.laws[2]), identityOf(EDITORIAL.laws[0])]);
    });

    it('is left out of the derived schema when the second\'s is dropped', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const answers = answerLaw(open.conflicts, identityOf(EDITORIAL.laws[0]), 'drop');
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' }));
      expect(lawIdentities(schema)).toEqual([identityOf(ACTIVITY.laws[0]), identityOf(ACTIVITY.laws[1]), identityOf(ACTIVITY.laws[2])]);
    });

    it('is taken out of the derived schema when the first\'s is dropped', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const answers = answerLaw(open.conflicts, identityOf(ACTIVITY.laws[0]), 'drop');
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' }));
      expect(lawIdentities(schema)).toEqual([identityOf(ACTIVITY.laws[1]), identityOf(ACTIVITY.laws[2])]);
    });

    it('stays in the derived schema when the first\'s is kept', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const answers = answerLaw(open.conflicts, identityOf(ACTIVITY.laws[0]), 'keep');
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' }));
      expect(lawIdentities(schema)).toEqual([identityOf(ACTIVITY.laws[0]), identityOf(ACTIVITY.laws[1]), identityOf(ACTIVITY.laws[2])]);
    });
  });

  describe('answers', () => {
    it('with every answer the first, keeps the first parts, the first\'s laws and adds the second\'s additions', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'first'), name: 'activity-review' }));
      expect(schema.opening).toBe(ACTIVITY.opening);
      expect(schema.authority).toBe(ACTIVITY.authority);
      expect(schema.records).toEqual(ACTIVITY.records);
      expect(schema.gists).toEqual([...ACTIVITY.gists, ...EDITORIAL.gists.filter((g) => !ACTIVITY.gists.some((a) => a.gist === g.gist))]);
      expect(schema.laws).toEqual(ACTIVITY.laws);
      expect(schema.guards).toEqual({ ...ACTIVITY.guards, ...EDITORIAL.guards });
      expect(schema.sets).toEqual([...ACTIVITY.sets, ...EDITORIAL.sets.filter((s) => !ACTIVITY.sets.includes(s))]);
    });

    it('with every answer the second, takes the second part of each conflict', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'second'), name: 'activity-review' }));
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
      const answers: Answer[] = open.conflicts.map((c): Answer => (c.part === 'gist' && c.name === 'comment' ? { by: { gist: 'comment', writers: ['user'] } } : fromSource(c, 'first')));
      const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
      expect(derived.schema).toBeUndefined();
      expect(derived.problems.join(' ')).toMatch(/must have the keys gist, writers and rules/);
    });

    it('gives a problem and no schema, and does not throw, when a law only one source has is answered first, second or by hand', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const at = open.conflicts.findIndex((c) => c.part === 'one-sided-law');
      const misfits: Answer[] = ['first', 'second', { by: 'keeps-set' }];
      for (const answer of misfits) {
        const answers = bySource(open.conflicts, 'first');
        answers[at] = answer;
        const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
        expect(derived.schema).toBeUndefined();
        expect(derived.conflicts).toEqual(open.conflicts);
        expect(derived.problems).toEqual([`The answer to conflict ${at} (one-sided-law ${open.conflicts[at].name}) does not fit it: a law only one source has takes 'keep' or 'drop'.`]);
      }
    });

    it('gives a problem and no schema, and does not throw, when a gist is answered keep or drop', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const at = open.conflicts.findIndex((c) => c.part === 'gist');
      for (const answer of ['keep', 'drop'] as const) {
        const answers = bySource(open.conflicts, 'first');
        answers[at] = answer;
        const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
        expect(derived.schema).toBeUndefined();
        expect(derived.problems).toEqual([`The answer to conflict ${at} (gist ${open.conflicts[at].name}) does not fit it: this conflict takes 'first', 'second' or a part written by hand.`]);
      }
    });
  });

  describe('the name', () => {
    it('is needed when every conflict is answered and the sources differ: the problem says so', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'first') });
      expect(derived.same).toBe(false);
      expect(derived.schema).toBeUndefined();
      expect(derived.problems).toEqual(['The derived schema needs a name: the sources are read by different schemas.']);
    });

    it('must be in lower kebab case: the reader\'s problem says so', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const derived = deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'first'), name: 'Not Kebab' });
      expect(derived.schema).toBeUndefined();
      expect(derived.problems.join(' ')).toMatch(/lower kebab case/);
    });

    it('gives the derived schema the name at version 1, the first kit, and it reads and round-trips', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const schema = schemaOf(deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'first'), name: 'activity-review' }));
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
      deriveSchema(ACTIVITY, EDITORIAL, { answers: bySource(open.conflicts, 'second'), name: 'activity-review' });
      expect([canonical(schemaJson(ACTIVITY)), canonical(schemaJson(EDITORIAL))]).toEqual(before);
    });

    it('gives equal results when derived twice from the same inputs', () => {
      const open = deriveSchema(ACTIVITY, EDITORIAL);
      const answers = bySource(open.conflicts, 'second');
      const a = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
      const b = deriveSchema(ACTIVITY, EDITORIAL, { answers, name: 'activity-review' });
      expect(a.conflicts).toEqual(b.conflicts);
      expect(schemaJson(schemaOf(a))).toEqual(schemaJson(schemaOf(b)));
    });
  });
});
