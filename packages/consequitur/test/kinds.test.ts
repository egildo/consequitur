// What round 3 added: kinds registered in a kit and named by a schema, the reader
// for the whole schema, the policy, the diff, the empty state, and the offers
// computed once. The semantics of the ported engine are in `thread.test.ts`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_KIT,
  answer,
  compare,
  diff,
  dryRun,
  emptyState,
  inForce,
  keysAre,
  kinOf,
  lockedBy,
  offers,
  post,
  readPolicy,
  readSchema,
  consequitur,
  settle,
  stamp,
  whenHolds,
  type EventLine,
  type HandleDenunciation,
  type HandleKind,
  type Handles,
  type Json,
  type Kit,
  type LawKind,
  type LineDraft,
  type LineId,
  type Offer,
  type Policy,
  type RuleKind,
  type Schema,
  type ThreadState,
  type Writer,
} from '../src/index.ts';
import { PLAIN, SIBAR, SIBAR_JSON, SYSTEM_WRITER, hold, membersOf, sibar, valuesOf } from './helpers.ts';

const NOW = '2026-10-03T10:00:00.000Z';

const by = (writer: Writer, gist: string, payload: LineDraft['payload']): LineDraft => ({ gist, writer, payload });
const mrossi = (gist: string, payload: LineDraft['payload']) => by('user::mrossi', gist, payload);
const lbianchi = (gist: string, payload: LineDraft['payload']) => by('user::lbianchi', gist, payload);
const gistsOf = (lines: EventLine[]) => lines.map((l) => l.gist);

/** Posts each draft to the state the one before left, and fails the test on a refusal. */
async function posted(schema: Schema, drafts: LineDraft[], from: ThreadState = emptyState(schema), options: { policy?: Policy } = {}): Promise<ThreadState> {
  let state = from;
  for (const draft of drafts) {
    const out = await post(state, draft, schema, NOW, options);
    expect(out.refusal, `${draft.gist}`).toBeUndefined();
    state = out.state;
  }
  return state;
}

// --- a toy: a handle kind, a rule kind and a law kind that are not the library's ---------------------------

/** What the toy's rule states: how many lines in force tally a counter, and the last of them. */
type CounterAcc = Map<string, { n: number; line: LineId }>;

const recordOf = (handle: Json | undefined): { [key: string]: Json } => (typeof handle === 'object' && handle !== null && !Array.isArray(handle) ? handle : {});

/** The `counter` handle: a number under each name. A name nobody tallies is expected to be 0. */
const counterHandle: HandleKind = {
  kind: 'counter',
  roles: ['count'],
  empty: () => ({}),
  start: (): CounterAcc => new Map(),
  expected: (acc) => Object.fromEntries([...(acc as CounterAcc)].sort(([a], [b]) => compare(a, b)).map(([name, tally]) => [name, tally.n])),
  compare(acc, found) {
    const tallies = acc as CounterAcc;
    const held = recordOf(found);
    const out: HandleDenunciation[] = [];
    for (const key of [...new Set([...tallies.keys(), ...Object.keys(held)])].sort(compare)) {
      const expected = tallies.get(key)?.n ?? 0;
      const found = typeof held[key] === 'number' ? held[key] : 0;
      if (expected !== found) out.push({ sort: 'handle', kind: 'counter', key, expected, found });
    }
    return out;
  },
  answer: (d, found) => ({ handle: { ...recordOf(found), [d.key]: d.expected as number }, role: 'count', payload: { key: d.key, count: d.expected as number } }),
  diff(before, after) {
    const was = recordOf(before);
    const is = recordOf(after);
    return [...new Set([...Object.keys(was), ...Object.keys(is)])]
      .sort(compare)
      .filter((key) => was[key] !== is[key])
      .map((key) => ({ kind: 'counter', key, before: was[key], after: is[key] }));
  },
};

/** The `tally` rule: each line in force adds one to a named counter. */
const tallyRule: RuleKind = {
  rule: 'tally',
  handles: ['counter'],
  read: (binding) => (keysAre(binding, ['counter']) && typeof binding.counter === 'string' ? { rule: 'tally', counter: binding.counter } : 'a tally binding names a counter.'),
  admit: () => undefined,
  expect(binding, line, acc) {
    const tallies = acc('counter') as CounterAcc;
    const name = binding.counter as string;
    tallies.set(name, { n: (tallies.get(name)?.n ?? 0) + 1, line: line.id });
  },
};

/** The `cap` law: a counter may not pass a limit. */
const capLaw: LawKind = {
  law: 'cap',
  read: (binding) =>
    keysAre(binding, ['counter', 'limit', 'strength']) && typeof binding.counter === 'string' && typeof binding.limit === 'number'
      ? { law: 'cap', counter: binding.counter, limit: binding.limit, strength: binding.strength === 'confirm' ? 'confirm' : 'refuse' }
      : 'a cap law names a counter and a limit.',
  judge: (binding, _before, after) => {
    const count = recordOf(after.handles.counter)[binding.counter as string];
    return typeof count === 'number' && count > (binding.limit as number) ? [{ detail: `The counter "${binding.counter}" would pass ${binding.limit}.` }] : [];
  },
};

const TOY_KIT: Kit = {
  handles: [...BASE_KIT.handles, counterHandle],
  rules: [...BASE_KIT.rules, tallyRule],
  laws: [...BASE_KIT.laws, capLaw],
};

const TOY = {
  opening: 'open',
  authority: 'system::toy',
  sets: [],
  records: { value: 'value_set', join: 'joined', leave: 'left', count: 'counted' },
  judged: ['user'],
  gists: [
    { gist: 'open', writers: ['user'], rules: [{ rule: 'value', key: 'title', from: 'title', required: true }] },
    { gist: 'vote', writers: ['user'], rules: [{ rule: 'tally', counter: 'votes' }] },
    { gist: 'vote_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['vote'] }] },
    { gist: 'value_set', writers: ['system'], rules: [] },
    { gist: 'joined', writers: ['system'], rules: [] },
    { gist: 'left', writers: ['system'], rules: [] },
    { gist: 'counted', writers: ['system'], rules: [] },
  ],
  laws: [{ law: 'cap', counter: 'votes', limit: 2, strength: 'refuse' }],
};

const toy = (): Schema => {
  const { schema, problems } = readSchema(TOY, TOY_KIT);
  expect(problems).toEqual([]);
  return schema;
};

describe('a kit with kinds of its own', () => {
  const open = mrossi('open', { title: 'Which colour?' });
  const vote = mrossi('vote', {});

  it('reads a schema that uses them, and refuses it where the kit lacks them', () => {
    const schema = toy();
    expect(schema.kit).toBe(TOY_KIT);
    expect(schema.laws).toEqual(TOY.laws);

    // the head names a record role the base kit has no handle kind for: nothing can be read
    const refused = readSchema(TOY, BASE_KIT);
    expect(refused.schema.gists).toEqual([]);
    expect(refused.problems.join(' ')).toMatch(/count/);
    // with the role dropped, the gist that tallies and the law that caps name kinds the kit lacks: each named, and nothing read
    const { count: _count, ...records } = TOY.records;
    const lacking = readSchema({ ...TOY, records }, BASE_KIT);
    expect(lacking.problems).toHaveLength(2);
    expect(lacking.problems[0]).toMatch(/"vote".*tally/);
    expect(lacking.problems[1]).toMatch(/cap/);
    expect(lacking.schema.gists).toEqual([]);
    expect(lacking.schema.laws).toEqual([]);
  });

  it('refuses a rule whose handle kind the kit lacks', () => {
    const kit: Kit = { ...BASE_KIT, rules: [...BASE_KIT.rules, tallyRule] };
    const { count: _count, ...records } = TOY.records;
    const { problems, schema } = readSchema({ ...TOY, records, laws: [] }, kit);
    expect(schema.gists.map((g) => g.gist)).not.toContain('vote');
    expect(problems.join(' ')).toMatch(/handle kind counter/);
  });

  it('starts from the kind\'s empty handle', () => {
    expect(emptyState(toy())).toEqual({ lines: [], handles: { value: {}, set: {}, counter: {} } });
  });

  it('states into its handle, compares it, and records the answer under the role the schema names', async () => {
    const schema = toy();
    const state = await posted(schema, [open, vote, vote]);
    expect(state.handles).toEqual({ value: { title: 'Which colour?' }, set: {}, counter: { votes: 2 } });
    const counted = state.lines.filter((l) => l.gist === 'counted');
    expect(counted.map((l) => [l.writer, l.payload])).toEqual([
      ['system::toy', { key: 'votes', count: 1 }],
      ['system::toy', { key: 'votes', count: 2 }],
    ]);
    const reading = consequitur(state.lines, state.handles, schema);
    expect(reading.settled).toBe(true);
    expect(reading.expected).toEqual(state.handles);
    // what is not the thread's is denounced, in the kit's order after the other kinds
    const stray = consequitur(state.lines, { ...state.handles, counter: { votes: 5, other: 1 } }, schema);
    expect(stray.denunciations).toEqual([
      { sort: 'handle', kind: 'counter', key: 'other', expected: 0, found: 1 },
      { sort: 'handle', kind: 'counter', key: 'votes', expected: 2, found: 5 },
    ]);
  });

  it('withdraws what a revoked line stated', async () => {
    const schema = toy();
    const state = await posted(schema, [open, vote, vote]);
    const first = state.lines.find((l) => l.gist === 'vote')!;
    const out = await post(state, mrossi('vote_revoke', { target: first.id }), schema, NOW);
    expect(out.refusal).toBeUndefined();
    expect(out.state.handles.counter).toEqual({ votes: 1 });
    expect(gistsOf(out.added)).toEqual(['vote_revoke', 'counted']);
  });

  it('judges with its law, which refuses the line that passes the limit', async () => {
    const schema = toy();
    const state = await posted(schema, [open, vote, vote]);
    const dry = await dryRun(state, vote, schema, NOW);
    expect(dry.verdicts).toEqual([{ law: 'cap', strength: 'refuse', detail: 'The counter "votes" would pass 2.' }]);
    const out = await post(state, vote, schema, NOW);
    expect(out.refusal?.code).toBe('law');
    expect(out.state).toBe(state);
  });

  it('says what changed, kind by kind, in the order of the kit', async () => {
    const schema = toy();
    const before = await posted(schema, [open, vote]);
    const after = await posted(schema, [vote], before);
    expect(diff(before.handles, after.handles, TOY_KIT)).toEqual([{ kind: 'counter', key: 'votes', before: 1, after: 2 }]);
    expect(diff(emptyState(schema).handles, after.handles, TOY_KIT)).toEqual([
      { kind: 'value', key: 'title', after: 'Which colour?' },
      { kind: 'counter', key: 'votes', before: undefined, after: 2 },
    ]);
  });
});

describe('readSchema', () => {
  const read = (json: unknown) => readSchema(json, BASE_KIT);

  it('reads the case: its head, nineteen gists and three laws, no problem', () => {
    const { schema, problems } = read(SIBAR_JSON);
    expect(problems).toEqual([]);
    expect(schema.opening).toBe('create');
    expect(schema.authority).toBe('system::sibardoc');
    expect(schema.sets).toEqual(['assignees']);
    expect(schema.records).toEqual({ value: 'metadata_set', join: 'assigned', leave: 'unassigned', warning: 'goal_warning' });
    expect(schema.judged).toEqual(['user']);
    expect(Object.keys(schema.guards)).toEqual(['assignee', 'open_assignee']);
    expect(schema.gists).toHaveLength(19);
    expect(schema.laws).toHaveLength(3);
    expect(schema.kit).toBe(BASE_KIT);
  });

  it('changes nothing it is given', () => {
    const json = structuredClone(SIBAR_JSON);
    read(json);
    expect(json).toEqual(SIBAR_JSON);
  });

  it('never throws, and answers an empty schema and a problem to anything that is not one', () => {
    for (const value of [undefined, null, 3, 'create', [], {}, { opening: 1 }, { ...SIBAR_JSON, gists: 'x' }, { ...SIBAR_JSON, records: null }]) {
      const out = read(value);
      expect(out.problems.length).toBeGreaterThan(0);
      expect(out.schema.gists).toEqual([]);
      expect(out.schema.laws).toEqual([]);
    }
  });

  const brokenHeads: Array<[string, Record<string, unknown>, RegExp]> = [
    ['no opening', { opening: undefined }, /opening/],
    ['an opening that is not a gist name', { opening: 'Create' }, /opening/],
    ['no authority', { authority: undefined }, /authority/],
    ['an authority that is not a writer', { authority: 'sibardoc' }, /authority/],
    ['an authority with no id', { authority: 'system::' }, /authority/],
    ['sets that repeat a name', { sets: ['assignees', 'assignees'] }, /sets/],
    ['sets that are not names', { sets: [1] }, /sets/],
    ['judged kins that are not kins', { judged: [1] }, /judged/],
    ['a key the schema may not have', { colour: 'red' }, /colour/],
    ['records that are not an object', { records: 'x' }, /records/],
    ['records that lack a role', { records: { value: 'metadata_set', join: 'assigned' } }, /leave/],
    ['records that name a role no handle kind has', { records: { ...SIBAR_JSON.records, mood: 'comment' } }, /mood/],
    ['guards that are not an object', { guards: [] }, /guards/],
    ['a guard that is not a condition', { guards: { ...SIBAR_JSON.guards, odd: { maybe: true } } }, /guard "odd"/],
    ['a guard that names a guard the head lacks', { guards: { ...SIBAR_JSON.guards, odd: { guard: 'nobody' } } }, /guard "odd"/],
    ['two guards that depend on each other', { guards: { a: { guard: 'b' }, b: { not: { guard: 'a' } } } }, /depends on itself/],
    ['a guard that reads a set the head does not declare', { guards: { odd: { has: { $set: 'owners' } } } }, /owners/],
  ];

  it.each(brokenHeads)('a head with %s gives an empty schema, and says why', (_, change, why) => {
    const out = read({ ...SIBAR_JSON, ...change });
    expect(out.schema.gists).toEqual([]);
    expect(out.problems.join(' ')).toMatch(why);
  });

  it('reads a schema with no guards as one whose guards are none, and a when that names a guard it lacks is a problem', () => {
    const { guards: _guards, ...json } = SIBAR_JSON;
    expect(read({ ...json, gists: [] }).problems.join(' ')).not.toMatch(/guards/);
    const out = read(json);
    expect(out.schema.gists).toEqual([]);
    expect(out.problems.join(' ')).toMatch(/the guard "open_assignee" is not one the schema names/);
    expect(read({ ...json, gists: SIBAR_JSON.gists.map(({ when: _when, ...g }) => g) }).schema.guards).toEqual({});
  });

  it('a record whose gist has no schema gives an empty schema, and names the gist', () => {
    const out = read({ ...SIBAR_JSON, gists: SIBAR_JSON.gists.filter((g) => g.gist !== 'assigned') });
    expect(out.schema.gists).toEqual([]);
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toMatch(/"assigned"/);
  });

  it('a record whose gist the authority may not write gives an empty schema', () => {
    const wrong = SIBAR_JSON.gists.map((g) => (g.gist === 'unassigned' ? { ...g, writers: ['user'] } : g));
    const out = read({ ...SIBAR_JSON, gists: wrong });
    expect(out.schema.gists).toEqual([]);
    expect(out.problems[0]).toMatch(/"unassigned".*system/);
  });

  it('a warning gist that the goal kin may not write gives an empty schema', () => {
    const wrong = SIBAR_JSON.gists.map((g) => (g.gist === 'goal_warning' ? { ...g, writers: ['system'] } : g));
    const out = read({ ...SIBAR_JSON, gists: wrong });
    expect(out.schema.gists).toEqual([]);
    expect(out.problems[0]).toMatch(/"goal_warning".*goal/);
  });

  it('a record gist that has rules gives an empty schema, since a record states nothing', () => {
    for (const [name, rules] of [
      ['metadata_set', [{ rule: 'value', key: 'log', collect: 'value' }]],
      ['goal_warning', [{ rule: 'join', set: 'assignees', from: 'check' }]],
    ] as const) {
      const wrong = SIBAR_JSON.gists.map((g) => (g.gist === name ? { ...g, rules } : g));
      const out = read({ ...SIBAR_JSON, gists: wrong });
      expect(out.schema.gists, name).toEqual([]);
      expect(out.problems, name).toHaveLength(1);
      expect(out.problems[0]).toMatch(new RegExp(`"${name}".*rules`));
    }
  });

  it('a record gist that failed its own reading is a record gist with no schema', () => {
    const wrong = SIBAR_JSON.gists.map((g) => (g.gist === 'metadata_set' ? { ...g, label: 'x' } : g));
    const out = read({ ...SIBAR_JSON, gists: wrong });
    expect(out.schema.gists).toEqual([]);
    expect(out.problems).toHaveLength(2);
  });

  it('an opening gist with no schema gives an empty schema', () => {
    const out = read({ ...SIBAR_JSON, opening: 'begin' });
    expect(out.schema.gists).toEqual([]);
    expect(out.problems.join(' ')).toMatch(/"begin"/);
  });

  it('a rule or a law of a kind the kit lacks is a problem, and the schema is read as the empty one', () => {
    const gists = [...SIBAR_JSON.gists, { gist: 'odd', writers: ['user'], rules: [{ rule: 'tally', counter: 'c' }] }];
    const laws = [...SIBAR_JSON.laws, { law: 'cap', counter: 'c', limit: 1, strength: 'refuse' }];
    const out = read({ ...SIBAR_JSON, gists, laws });
    expect(out.problems).toHaveLength(2);
    expect(out.problems[0]).toMatch(/"odd".*tally/);
    expect(out.problems[1]).toMatch(/cap/);
    expect(out.schema.gists).toEqual([]);
    expect(out.schema.laws).toEqual([]);
  });

  it('a join that names a set the schema does not declare is a problem, and the schema is read as the empty one', () => {
    const gists = [...SIBAR_JSON.gists, { gist: 'odd', writers: ['user'], rules: [{ rule: 'join', set: 'owners', from: 'x' }] }];
    const out = read({ ...SIBAR_JSON, gists });
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toMatch(/"odd".*owners/);
    expect(out.schema.gists).toEqual([]);
  });

  it('a mistyped word in one gist leaves nothing to read, so no post can erase what that gist stated', async () => {
    const typo = SIBAR_JSON.gists.map((g) => (g.gist === 'stage' ? { ...g, rules: [{ rule: 'value', key: 'stage', form: 'stage' }] } : g));
    const out = read({ ...SIBAR_JSON, gists: typo });
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toMatch(/"stage"/);
    expect(out.schema.gists).toEqual([]);
    // read partially, the next comment on a thread with a stage used to erase it from the handles
    const state = await posted(PLAIN, [mrossi('create', { name: 'x', assignTo: ['mrossi'] }), mrossi('stage', { stage: 'review' })]);
    const after = await post(state, mrossi('comment', { text: 'hi' }), out.schema, NOW);
    expect(after.refusal?.code).toBe('unknown-gist');
    expect(after.state).toBe(state);
  });

  it('a set the head declares can be joined, and is in the empty state', () => {
    const json = { ...SIBAR_JSON, sets: ['assignees', 'owners'], gists: [...SIBAR_JSON.gists, { gist: 'own', writers: ['user'], rules: [{ rule: 'join', set: 'owners', from: 'who' }] }] };
    const out = read(json);
    expect(out.problems).toEqual([]);
    expect(emptyState(out.schema).handles.set).toEqual({ assignees: [], owners: [] });
  });

  it('laws are optional, and a schema with none judges nothing', async () => {
    const { laws: _laws, ...noLaws } = SIBAR_JSON;
    const out = read(noLaws);
    expect(out.problems).toEqual([]);
    expect(out.schema.laws).toEqual([]);
  });
});

describe('emptyState', () => {
  it('holds no lines, and each handle kind\'s empty handle: a set for every set the schema declares', () => {
    expect(emptyState(SIBAR)).toEqual({ lines: [], handles: { value: {}, set: { assignees: [] } } });
    const two = sibar({ head: { sets: ['assignees', 'owners'] } });
    expect(emptyState(two).handles).toEqual({ value: {}, set: { assignees: [], owners: [] } });
  });

  it('is what a thread starts from: its reading holds only the opening rule', () => {
    const state = emptyState(SIBAR);
    const reading = consequitur(state.lines, state.handles, SIBAR);
    expect(reading.denunciations).toEqual([{ sort: 'thread', rule: 'one-opening', found: 0 }]);
    expect(reading.expected).toEqual(state.handles);
  });

  it('follows the kit: a kit with one handle kind gives one handle', () => {
    const kit: Kit = { handles: [BASE_KIT.handles[0]], rules: [BASE_KIT.rules[0]], laws: [] };
    const { schema, problems } = readSchema({ ...TOY, records: { value: 'value_set' }, sets: [], gists: TOY.gists.filter((g) => g.gist !== 'vote' && g.gist !== 'vote_revoke'), laws: [] }, kit);
    expect(problems).toEqual([]);
    expect(emptyState(schema).handles).toEqual({ value: {} });
  });
});

describe('the policy', () => {
  /** The case's own example: a quit on a closed activity is not answered. */
  const QUIT_WHEN_CLOSED: Policy = [{ leave: { kind: 'set', key: 'assignees' }, while: { values: { status: 'closed' } } }];

  /** mrossi and lbianchi assigned, the activity open. */
  const open = () => posted(PLAIN, [mrossi('create', { name: 'Richiesta', assignTo: ['mrossi'] }), mrossi('memo', { assignTo: ['lbianchi'] })]);
  const closed = async () => posted(PLAIN, [mrossi('closed', {})], await open());

  it('leaves unanswered a quit on a closed activity, and the reading counts as settled', async () => {
    const state = await closed();
    expect(valuesOf(state.handles).status).toBe('closed');

    const out = await post(state, lbianchi('quit', {}), PLAIN, NOW, { policy: QUIT_WHEN_CLOSED });
    expect(out.refusal).toBeUndefined();
    // the line is in the thread, and nothing records it: the set still holds him
    expect(gistsOf(out.added)).toEqual(['quit']);
    expect(out.rounds).toEqual([]);
    expect(membersOf(out.state.handles)).toEqual(['lbianchi', 'mrossi']);
    expect(out.reading.settled).toBe(true);
    // the denunciation is still there to be read: the policy leaves it, it does not hide it
    expect(out.reading.denunciations).toEqual([{ sort: 'handle', kind: 'set', key: 'assignees', member: 'lbianchi', expected: false }]);
    expect(answer(out.reading, out.state.handles, QUIT_WHEN_CLOSED)).toEqual([]);
    expect(answer(out.reading, out.state.handles)).toEqual(out.reading.denunciations);
  });

  it('without the policy the same quit is answered: the authority records it', async () => {
    const out = await post(await closed(), lbianchi('quit', {}), PLAIN, NOW);
    expect(gistsOf(out.added)).toEqual(['quit', 'unassigned']);
    expect(membersOf(out.state.handles)).toEqual(['mrossi']);
    expect(out.reading.settled).toBe(true);
  });

  it('answers the quit on an open activity even with the policy: its condition does not hold', async () => {
    const out = await post(await open(), lbianchi('quit', {}), PLAIN, NOW, { policy: QUIT_WHEN_CLOSED });
    expect(gistsOf(out.added)).toEqual(['quit', 'unassigned']);
    expect(membersOf(out.state.handles)).toEqual(['mrossi']);
  });

  it('a dry run applies the policy as post does, so the preview is the post', async () => {
    const state = await closed();
    const options = { policy: QUIT_WHEN_CLOSED };
    const dry = await dryRun(state, lbianchi('quit', {}), PLAIN, NOW, options);
    const out = await post(state, lbianchi('quit', {}), PLAIN, NOW, options);
    expect(dry.state).toEqual(out.state);
    expect(dry.added).toEqual(out.added);
    expect(dry.reading).toEqual(out.reading);
  });

  it('settle takes it too, and a law that asks the thread to settle accepts the left denunciation', async () => {
    const state = await closed();
    const quit = await stamp(lbianchi('quit', {}), state.lines, NOW);
    const out = await settle({ lines: [...state.lines, quit], handles: state.handles }, PLAIN, NOW, QUIT_WHEN_CLOSED);
    expect(out.rounds).toEqual([]);
    expect(out.reading.settled).toBe(true);
    // and the lawful schema does not refuse the quit as unsettled
    const lawful = await post(state, lbianchi('quit', {}), SIBAR, NOW, { policy: QUIT_WHEN_CLOSED });
    expect(lawful.refusal).toBeUndefined();
    const without = await dryRun(state, lbianchi('quit', {}), sibar({ laws: [{ law: 'settles', strength: 'refuse' }] }), NOW, { policy: QUIT_WHEN_CLOSED });
    expect(without.verdicts).toEqual([]);
  });

  it('reads the handles as they stand: once the activity reopens, the left quit is answered', async () => {
    const state = await closed();
    const quitted = (await post(state, lbianchi('quit', {}), PLAIN, NOW, { policy: QUIT_WHEN_CLOSED })).state;
    const closedLine = quitted.lines.find((l) => l.gist === 'closed')!;
    const reopened = await post(quitted, mrossi('closed_revoke', { target: closedLine.id }), PLAIN, NOW, { policy: QUIT_WHEN_CLOSED });
    expect(reopened.refusal).toBeUndefined();
    // round one answers the status (the policy still left the quit: the handle said closed), round two the quit
    expect(reopened.rounds.map((r) => r.map((d) => (d.sort === 'handle' ? `${d.kind} ${d.key}` : d.sort)))).toEqual([['value status'], ['set assignees']]);
    expect(gistsOf(reopened.added)).toEqual(['closed_revoke', 'metadata_set', 'unassigned']);
    expect(membersOf(reopened.state.handles)).toEqual(['mrossi']);
    expect(reopened.reading.settled).toBe(true);
  });

  const handleSet: Handles = hold({ status: 'closed' }, ['a']);
  const reading = (denunciations: HandleDenunciation[]) => ({ ...consequitur([], handleSet, PLAIN), denunciations });
  const joined: HandleDenunciation = { sort: 'handle', kind: 'set', key: 'assignees', member: 'a', expected: false };
  const valued: HandleDenunciation = { sort: 'handle', kind: 'value', key: 'status', expected: 'open', found: 'closed' };

  it('matches a denunciation on every part the entry states, and on none it does not', () => {
    const left = (leave: Policy[number]['leave']) => answer(reading([joined, valued]), handleSet, [{ leave }]);
    expect(left({})).toEqual([]);
    expect(left({ kind: 'set' })).toEqual([valued]);
    expect(left({ kind: 'value' })).toEqual([joined]);
    expect(left({ sort: 'handle', key: 'status' })).toEqual([joined]);
    expect(left({ kind: 'set', member: 'a' })).toEqual([valued]);
    expect(left({ kind: 'set', member: 'b' })).toEqual([joined, valued]);
    expect(left({ sort: 'line' })).toEqual([joined, valued]);
    expect(left({ gist: 'closed' })).toEqual([joined, valued]);
  });

  it('a line denunciation is matched by its gist, and a denunciation of the thread is never left', () => {
    const owed: Policy[number]['leave'] = { sort: 'line', gist: 'closed' };
    const line = { sort: 'line' as const, gist: 'closed', writer: 'goal::x' as Writer, line: 'x', payload: {} };
    const thread = { sort: 'thread' as const, rule: 'one-opening' as const, found: 0 };
    const all = { ...reading([]), denunciations: [thread, line] };
    expect(answer(all, handleSet, [{ leave: owed }])).toEqual([]);
    expect(answer(all, handleSet, [{ leave: {} }])).toEqual([]);
    expect(answer({ ...all, denunciations: [line] }, handleSet, [{ leave: { gist: 'other' } }])).toEqual([line]);
  });

  it('a condition is read on the value handle: every key must hold, by canonical form', () => {
    const entry = (values: Record<string, Json>): Policy => [{ leave: { kind: 'set' }, while: { values } }];
    expect(answer(reading([joined]), handleSet, entry({ status: 'closed' }))).toEqual([]);
    expect(answer(reading([joined]), handleSet, entry({ status: 'open' }))).toEqual([joined]);
    expect(answer(reading([joined]), handleSet, entry({ status: 'closed', other: 1 }))).toEqual([joined]);
    expect(answer(reading([joined]), hold({ status: { b: 1, a: 2 } }, ['a']), entry({ status: { a: 2, b: 1 } }))).toEqual([]);
  });
});

describe('readPolicy', () => {
  const read = (json: unknown) => readPolicy(json, SIBAR);

  it('reads the case\'s policy file with no problem, as the file holds it', () => {
    const json: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'cases', 'sibar-activity', 'policy.json'), 'utf8'));
    expect(read(json)).toEqual({ policy: json, problems: [] });
    expect(read([])).toEqual({ policy: [], problems: [] });
  });

  it('reads every part an entry may state', () => {
    const policy = [
      { leave: {} },
      { leave: { sort: 'line', gist: 'closed' } },
      { leave: { sort: 'handle', kind: 'set', key: 'assignees', member: 'mrossi' }, while: { values: { status: 'closed', stage: { a: [1] } } } },
    ];
    expect(read(policy)).toEqual({ policy, problems: [] });
  });

  const broken: Array<[string, unknown, RegExp]> = [
    ['no list', { leave: {} }, /list/],
    ['an entry that is not an object', [null], /entry 0/],
    ['an entry with no leave', [{ while: { values: { status: 'closed' } } }], /leave/],
    ['a mistyped while', [{ leave: { kind: 'set' }, whlie: { values: { status: 'closed' } } }], /entry 0.*leave.*while/],
    ['a leave that is not an object', [{ leave: 'set' }], /leave/],
    ['a mistyped part of leave', [{ leave: { knid: 'set' } }], /sort, kind, key, member and gist/],
    ['a sort of the thread', [{ leave: { sort: 'thread' } }], /sort/],
    ['a kind the kit lacks', [{ leave: { kind: 'counter' } }], /kind/],
    ['a gist the schema lacks', [{ leave: { gist: 'mystery' } }], /gist/],
    ['a key that is not a string', [{ leave: { key: 1 } }], /key/],
    ['a member that is not a string', [{ leave: { member: null } }], /member/],
    ['a while that is not an object', [{ leave: {}, while: 'closed' }], /while/],
    ['a mistyped part of while', [{ leave: {}, while: { value: { status: 'closed' } } }], /while/],
    ['a while with no value', [{ leave: {}, while: { values: {} } }], /while/],
    ['a while whose values JSON cannot hold', [{ leave: {}, while: { values: { status: undefined } } }], /while/],
  ];

  it.each(broken)('a policy with %s is read as the empty policy, and says why', (_, json, why) => {
    const out = read(json);
    expect(out.policy).toEqual([]);
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toMatch(why);
  });

  it('a problem in one entry leaves the whole policy empty, and names each entry that has one', () => {
    const out = read([{ leave: { kind: 'set' } }, { leave: { gist: 'mystery' } }, { leave: { sort: 'thread' } }]);
    expect(out.policy).toEqual([]);
    expect(out.problems).toHaveLength(2);
    expect(out.problems[0]).toMatch(/entry 1/);
    expect(out.problems[1]).toMatch(/entry 2/);
  });

  it('never throws, and changes nothing it is given', () => {
    for (const json of [undefined, null, 5, 'x', [[]], [{ leave: null }], [{ leave: [] }], [{ leave: {}, while: null }]]) {
      const copy = structuredClone(json);
      expect(() => read(json)).not.toThrow();
      expect(json).toEqual(copy);
    }
  });
});

describe('diff', () => {
  it('lists what the post changed: values first, then sets, each kind in its own order', async () => {
    const empty = emptyState(PLAIN);
    const out = await post(empty, mrossi('create', { name: 'Richiesta parere', assignTo: ['mrossi'] }), PLAIN, NOW);
    expect(diff(empty.handles, out.state.handles, BASE_KIT)).toEqual([
      { kind: 'value', key: 'name', after: 'Richiesta parere' },
      { kind: 'value', key: 'status', after: 'open' },
      { kind: 'set', key: 'assignees', member: 'mrossi', change: 'join' },
    ]);
  });

  it('says before and after for a value that changed, and before alone for one that went', () => {
    const before = hold({ a: 1, b: 2, c: 3, d: { x: 1, y: 2 } }, []);
    const after = hold({ a: 1, b: 5, d: { y: 2, x: 1 }, e: null }, []);
    expect(diff(before, after, BASE_KIT)).toEqual([
      { kind: 'value', key: 'b', before: 2, after: 5 },
      { kind: 'value', key: 'c', before: 3 },
      { kind: 'value', key: 'e', after: null },
    ]);
  });

  it('says who joined and who left a set, in set and name order, and nothing for who stayed', () => {
    const before = { value: {}, set: { assignees: ['a', 'b', 'c'], owners: [] } };
    const after = { value: {}, set: { assignees: ['b', 'c', 'd'], owners: ['z'] } };
    expect(diff(before, after, BASE_KIT)).toEqual([
      { kind: 'set', key: 'assignees', member: 'a', change: 'leave' },
      { kind: 'set', key: 'assignees', member: 'd', change: 'join' },
      { kind: 'set', key: 'owners', member: 'z', change: 'join' },
    ]);
  });

  it('is empty between equal handles, and reads a handle that is missing or odd as empty', () => {
    const same = hold({ a: 1 }, ['x']);
    expect(diff(same, structuredClone(same), BASE_KIT)).toEqual([]);
    expect(diff({}, hold({ a: 1 }, ['x']), BASE_KIT)).toEqual([
      { kind: 'value', key: 'a', after: 1 },
      { kind: 'set', key: 'assignees', member: 'x', change: 'join' },
    ]);
    expect(diff({ value: 3, set: 'x' }, {}, BASE_KIT)).toEqual([]);
  });

  it('changes none of its arguments', () => {
    const before = hold({ a: 1 }, ['x']);
    const after = hold({ a: 2 }, ['y']);
    const copies = [structuredClone(before), structuredClone(after)];
    diff(before, after, BASE_KIT);
    expect([before, after]).toEqual(copies);
  });

  it('applying the changes to a copy of the old handles gives the new ones', async () => {
    const schema = PLAIN;
    let state = emptyState(schema);
    const copy = { values: {} as Record<string, Json>, members: new Set<string>() };
    for (const draft of [mrossi('create', { name: 'A', assignTo: ['mrossi'] }), mrossi('memo', { assignTo: ['lbianchi'], text: 'x' }), mrossi('doc_ref', { document: '1' }), lbianchi('quit', {})]) {
      const out = await post(state, draft, schema, NOW);
      for (const change of diff(state.handles, out.state.handles, BASE_KIT)) {
        if (change.kind === 'value') {
          if ('after' in change) copy.values[change.key] = change.after as Json;
          else delete copy.values[change.key];
        } else if (change.change === 'join') copy.members.add(change.member as string);
        else copy.members.delete(change.member as string);
      }
      state = out.state;
    }
    expect(copy.values).toEqual(valuesOf(state.handles));
    expect([...copy.members].sort()).toEqual(membersOf(state.handles));
  });
});

describe('offers, with the expectations computed once', () => {
  /** What `offers` was before: the expectations read again for each gist, through `whenHolds`. */
  function offersPerGist(lines: EventLine[], writer: Writer, schema: Schema): Offer[] {
    const kin = kinOf(writer);
    const standing = inForce(lines, schema.gists).inForce;
    const openings = standing.filter((l) => l.gist === schema.opening).length;
    const seen = new Set<string>();
    const out: Offer[] = [];
    for (const gist of schema.gists) {
      if (seen.has(gist.gist)) continue;
      seen.add(gist.gist);
      if (kin === undefined || !gist.writers.includes(kin)) continue;
      // a goal's lines and the records are the engine's own
      if (kin === 'goal' || Object.values(schema.records).includes(gist.gist)) continue;
      if (!whenHolds(lines, writer, gist, schema)) continue;
      if (gist.gist === schema.opening ? openings !== 0 : openings !== 1) continue;
      const revoking = gist.rules.find((r) => r.rule === 'revoke');
      if (!revoking) {
        out.push({ gist: gist.gist });
        continue;
      }
      const listed = (revoking.gists as string[]) ?? [];
      const targets = standing.filter((l) => listed.includes(l.gist) && lockedBy(l, lines) === undefined).map((l) => l.id);
      if (targets.length > 0) out.push({ gist: gist.gist, targets });
    }
    return out;
  }

  /** The scenario of the brief, line by line, and each state it passed through. */
  async function states(): Promise<ThreadState[]> {
    const out: ThreadState[] = [emptyState(PLAIN)];
    const step = async (draft: LineDraft) => out.push(await posted(PLAIN, [draft], out[out.length - 1]));
    await step(mrossi('create', { name: 'Richiesta parere', assignTo: ['mrossi'] }));
    await step(mrossi('memo', { text: 'Serve un parere', assignTo: ['lbianchi'] }));
    const memoId = out[out.length - 1].lines.find((l) => l.gist === 'memo')!.id;
    await step(lbianchi('doc_ref', { document: '34132412', direction: 'outbound', about: memoId }));
    await step(
      mrossi('set_goal', {
        name: 'done',
        then: 'closed',
        final: true,
        when: {
          all: [
            { line: { gist: 'got_it', writer: 'user::lbianchi', payload: { about: memoId } } },
            { line: { gist: 'doc_signed', kin: 'system', payload: { document: '34132412' } } },
          ],
        },
      }),
    );
    await step(lbianchi('got_it', { about: memoId }));
    await step(lbianchi('quit', {}));
    await step(mrossi('memo', { text: 'Ancora una cosa', assignTo: ['lbianchi'] }));
    await step(by(SYSTEM_WRITER, 'doc_signed', { document: '34132412', signedAt: '2026-09-30' }));
    return out;
  }

  const writers: Writer[] = ['user::mrossi', 'user::lbianchi', 'user::gverdi', 'system::sibardoc', 'goal::x', 'nobody' as Writer];

  it('gives, in every state of the scenario and for every writer, what the per-gist reading gave', async () => {
    let compared = 0;
    let offered = 0;
    for (const state of await states()) {
      for (const writer of writers) {
        const once = offers(state.lines, writer, PLAIN);
        expect(once, writer).toEqual(offersPerGist(state.lines, writer, PLAIN));
        compared++;
        offered += once.length;
      }
    }
    expect(compared).toBe(9 * writers.length);
    expect(offered).toBeGreaterThan(40);
  });

  it('gives the same on a reversed thread, and with a final goal that locks its outcome', async () => {
    const [, , , , , , , , final] = await states();
    expect(offers([...final.lines].reverse(), 'user::mrossi', PLAIN)).toEqual(offers(final.lines, 'user::mrossi', PLAIN));
    expect(offers(final.lines, 'user::mrossi', PLAIN).map((o) => o.gist)).not.toContain('closed_revoke');
  });

  it('reads the thread\'s expectations once per call, not once per gist', async () => {
    let starts = 0;
    const counting: Kit = { ...BASE_KIT, handles: [{ ...BASE_KIT.handles[0], start: (schema) => (starts++, BASE_KIT.handles[0].start(schema)) }, BASE_KIT.handles[1]] };
    const schema = sibar({ laws: [], kit: counting });
    const [, , , , , , , , final] = await states();
    offers(final.lines, 'user::mrossi', schema);
    expect(starts).toBe(1);
    // the per-gist reading reads it again for each gist that has a `when`
    offersPerGist(final.lines, 'user::mrossi', schema);
    expect(starts).toBeGreaterThan(5);
  });
});
