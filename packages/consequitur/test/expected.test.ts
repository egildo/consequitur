// Expected lines: a gist's `expect` names the kin the thread expects a line of the gist from, and the
// condition under `while` for as long as it does. The reading denounces each with the kin that answers
// it, last; the engine never answers one, so the thread stays settled. A toy schema isolates each
// behaviour; the case that runs one past a revoke is in `editorial.test.ts`.

import { describe, expect, it } from 'vitest';
import {
  answer,
  consequitur,
  dryRun,
  emptyState,
  expectations,
  post,
  readSchema,
  reconcile,
  settle,
  stamp,
  BASE_KIT,
  type Condition,
  type Denunciation,
  type EventLine,
  type GistSchema,
  type LineDraft,
  type Payload,
  type Reading,
  type Schema,
  type ThreadState,
  type Writer,
} from '../src/index.ts';
import { HEAD, RECORD_GISTS, custom, hold } from './helpers.ts';

const NOW = '2026-10-20T10:00:00.000Z';

/** The release, made small: an approved tag is expected published by the system while it is not, and was not retracted. */
const PUBLISHING: Condition = {
  all: [
    { has: { $value: 'approved' } },
    { not: { is: { $value: 'approved' }, values: [{ $value: 'published' }] } },
    { not: { line: { gist: 'retracted', payload: { tag: { $value: 'approved' } } } } },
  ],
};

const GISTS: GistSchema[] = [
  { gist: 'create', writers: ['user'], rules: [{ rule: 'value', key: 'name', from: 'name', required: true }, { rule: 'join', set: 'assignees', from: 'assignTo' }] },
  { gist: 'approved', writers: ['user'], rules: [{ rule: 'value', key: 'approved', from: 'tag', required: true }] },
  { gist: 'approved_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['approved'] }] },
  {
    gist: 'published',
    writers: ['system', 'user'],
    rules: [{ rule: 'value', key: 'published', from: 'tag', required: true }],
    when: { is: { $draft: 'tag' }, values: [{ $value: 'approved' }] },
    expect: { kin: 'system', while: PUBLISHING },
  },
  { gist: 'published_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['published'] }] },
  { gist: 'retracted', writers: ['user'], rules: [] },
  { gist: 'publish_failed', writers: ['system'], rules: [] },
  // a person's to-do, listed after the system's because its gist comes after in the schema
  { gist: 'signed', writers: ['user'], rules: [{ rule: 'value', key: 'signed', value: true }], expect: { kin: 'user', while: { all: [{ has: { $value: 'published' } }, { not: { has: { $value: 'signed' } } }] } } },
  { gist: 'set_goal', writers: ['user'], rules: [{ rule: 'goal' }] },
  { gist: 'notice', writers: ['goal'], rules: [{ rule: 'value', key: 'notice', from: 'text' }] },
];

const SCHEMA: Schema = custom(GISTS);
const LAWFUL: Schema = custom(GISTS, { laws: [{ law: 'settles', strength: 'refuse' }] });

const mrossi: Writer = 'user::mrossi';
const tabularium: Writer = 'system::tabularium';
const draft = (gist: string, payload: Payload = {}, writer: Writer = mrossi): LineDraft => ({ gist, writer, payload });
const create = draft('create', { name: 'Rilascio', assignTo: ['mrossi'] });
const approve = (tag: string) => draft('approved', { tag });
const publish = (tag: string) => draft('published', { tag }, tabularium);

const PUBLISHED: Denunciation = { sort: 'line', gist: 'published', kin: 'system' };
const SIGNED: Denunciation = { sort: 'line', gist: 'signed', kin: 'user' };

/** Posts each draft in turn, and fails the test on a refusal. */
async function played(drafts: LineDraft[], schema: Schema = SCHEMA, from: ThreadState = emptyState(schema)): Promise<ThreadState> {
  let state = from;
  for (const next of drafts) {
    const out = await post(state, next, schema, NOW);
    expect(out.refusal, `${next.gist} ${JSON.stringify(next.payload)}`).toBeUndefined();
    state = out.state;
  }
  return state;
}

const read = (state: ThreadState, schema: Schema = SCHEMA): Reading => consequitur(state.lines, state.handles, schema);
const kinned = (reading: Reading) => reading.denunciations.filter((d) => 'kin' in d);

describe('readSchema, of an expect', () => {
  /** The problems of the toy schema with one gist changed or added. */
  const problemsOf = (gists: GistSchema[] | unknown[], head: Record<string, unknown> = {}) =>
    readSchema({ ...HEAD, records: { value: 'metadata_set', join: 'assigned', leave: 'unassigned' }, gists: [...RECORD_GISTS, ...gists], ...head }, BASE_KIT).problems;
  const withExpect = (expectation: unknown, writers = ['system', 'user']) => [GISTS[0], { gist: 'published', writers, rules: [], expect: expectation }];

  it('reads a kin among the writers and a condition a goal may hold, and keeps it as written', () => {
    const { schema, problems } = readSchema({ ...HEAD, records: { value: 'metadata_set', join: 'assigned', leave: 'unassigned' }, gists: [...RECORD_GISTS, ...GISTS] }, BASE_KIT);
    expect(problems).toEqual([]);
    expect(schema.gists.find((g) => g.gist === 'published')?.expect).toEqual({ kin: 'system', while: PUBLISHING });
  });

  it('names a kin the gist\'s writers do not list', () => {
    expect(problemsOf(withExpect({ kin: 'mac', while: { has: { $value: 'x' } } }))).toEqual(['gist "published": expect: the kin "mac" is not among the gist\'s writers.']);
    expect(problemsOf(withExpect({ kin: 3, while: { has: { $value: 'x' } } }))).toEqual(['gist "published": expect: the kin 3 is not among the gist\'s writers.']);
  });

  it('names the kin goal, a writer of the gist or not', () => {
    const problem = 'gist "published": expect: the kin goal cannot be expected: the engine writes a goal\'s lines.';
    expect(problemsOf(withExpect({ kin: 'goal', while: { has: { $value: 'x' } } }, ['goal', 'system']))).toEqual([problem]);
    expect(problemsOf(withExpect({ kin: 'goal', while: { has: { $value: 'x' } } }))).toEqual([problem]);
  });

  it('names an expect on a record gist', () => {
    const records = RECORD_GISTS.map((g) => (g.gist === 'assigned' ? { ...g, expect: { kin: 'system', while: { has: { $value: 'x' } } } } : g));
    const { problems } = readSchema({ ...HEAD, records: { value: 'metadata_set', join: 'assigned', leave: 'unassigned' }, gists: [...records, GISTS[0]] }, BASE_KIT);
    expect(problems).toEqual(['The record "join" is the gist "assigned", which has an expect: the engine writes a record.']);
  });

  it('names an expect on the opening gist', () => {
    expect(problemsOf([{ ...GISTS[0], expect: { kin: 'user', while: { has: { $value: 'x' } } } }])).toEqual(['The opening gist "create" has an expect: a second opening line is refused.']);
  });

  it('names a while that is not a condition', () => {
    expect(problemsOf(withExpect({ kin: 'system', while: { maybe: true } }))).toEqual([expect.stringMatching(/^gist "published": expect: while: a condition has exactly one of/)]);
    expect(problemsOf(withExpect({ kin: 'system', while: { guard: 'nowhere' } }))).toEqual(['gist "published": expect: while: the guard "nowhere" is not one the schema names.']);
  });

  it.each([
    ['$writer', { is: { $writer: 'id' }, values: ['mrossi'] }],
    ['$draft', { has: { $draft: 'tag' } }],
    ['$now', { after: [{ $now: 'instant' }, '2026-10-20T00:00:00.000Z'] }],
  ])('names a while that reads %s', (word, condition) => {
    expect(problemsOf(withExpect({ kin: 'system', while: condition }))).toEqual([`gist "published": expect: while: ${word} may stand only in a when.`]);
  });

  it('names a while that reads the writer through a guard', () => {
    expect(problemsOf(withExpect({ kin: 'system', while: { guard: 'open_assignee' } }))).toEqual(['gist "published": expect: while: $writer may stand only in a when.']);
  });

  it.each([
    ['another key', { kin: 'system', while: { has: { $value: 'x' } }, after: 'built' }],
    ['no while', { kin: 'system' }],
    ['no kin', { while: { has: { $value: 'x' } } }],
    ['a rule key', { kin: 'system', while: { has: { $value: 'x' } }, rule: 'expect' }],
    ['not an object', 'system'],
  ])('names an expect with %s', (_, expectation) => {
    expect(problemsOf(withExpect(expectation))).toEqual(['gist "published": expect: it must have exactly the keys kin and while.']);
  });

  it('names a gist schema with a key that is neither when nor expect', () => {
    expect(problemsOf([GISTS[0], { gist: 'published', writers: ['system'], rules: [], expects: {} }])).toEqual([
      'gist "published": must have the keys gist, writers and rules, and may have when and expect, and no other.',
    ]);
  });
});

describe('the reading, of an expected line', () => {
  it('lists the gist in owed while its condition holds, and not before', async () => {
    const opened = await played([create]);
    expect(expectations(opened.lines, SCHEMA).owed).toEqual([]);
    const approved = await played([approve('R2.0')], SCHEMA, opened);
    expect(expectations(approved.lines, SCHEMA).owed).toEqual([PUBLISHED]);
  });

  it('denounces it with the kin, the gist and nothing else, and the thread is settled', async () => {
    const reading = read(await played([create, approve('R2.0')]));
    expect(reading.denunciations).toEqual([PUBLISHED]);
    expect(Object.keys(reading.denunciations[0]).sort()).toEqual(['gist', 'kin', 'sort']);
    expect(reading.settled).toBe(true);
  });

  it('clears once the kin writes the line, and the next is expected again', async () => {
    const state = await played([create, approve('R2.0'), publish('R2.0')]);
    expect(read(state).denunciations).toEqual([SIGNED]);
    const next = await played([draft('signed'), approve('R2.1')], SCHEMA, state);
    expect(read(next).denunciations).toEqual([PUBLISHED]);
  });

  it('stands after a failure, so the next reading finds the work still to do', async () => {
    const state = await played([create, approve('R2.0'), draft('publish_failed', { why: 'timeout' }, tabularium)]);
    expect(read(state).denunciations).toEqual([PUBLISHED]);
  });

  it('is raised again when the line that answered it is revoked, and cleared when the approval is', async () => {
    const answered = await played([create, approve('R2.0'), publish('R2.0'), draft('signed')]);
    expect(kinned(read(answered))).toEqual([]);
    const published = answered.lines.find((l) => l.gist === 'published')!;
    const revoked = await played([draft('published_revoke', { target: published.id })], SCHEMA, answered);
    expect(kinned(read(revoked))).toEqual([PUBLISHED]);
    const approval = revoked.lines.find((l) => l.gist === 'approved')!;
    const withdrawn = await played([draft('approved_revoke', { target: approval.id })], SCHEMA, revoked);
    expect(kinned(read(withdrawn))).toEqual([]);
  });

  it('is not raised by a retracted tag, which the condition leaves out', async () => {
    const state = await played([create, approve('R2.1'), draft('retracted', { tag: 'R2.1' })]);
    expect(read(state).denunciations).toEqual([]);
  });

  it('comes last, after the goals\' and the handles\', in the order of the schema\'s gists', async () => {
    // the lines stamped and never settled, read against handles that know nothing: every sort but the thread's is denounced
    const lines: EventLine[] = [];
    const drafts = [
      create,
      approve('R2.0'),
      publish('R2.0'),
      approve('R2.1'),
      draft('set_goal', { name: 'Avviso', when: { has: { $value: 'approved' } }, then: 'notice', with: { text: 'ok' } }),
    ];
    for (const next of drafts) lines.push(await stamp(next, lines, NOW, { schema: SCHEMA }));
    const reading = consequitur(lines, hold({}, []), SCHEMA);
    const sorts = reading.denunciations.map((d) => ('kin' in d ? `kin ${d.gist}` : d.sort));
    expect(sorts).toEqual(['line', 'handle', 'handle', 'handle', 'handle', 'kin published', 'kin signed']);
    expect(reading.denunciations.slice(-2)).toEqual([PUBLISHED, SIGNED]);
    expect(reading.settled).toBe(false);
  });

  it('reads the first gist schema of a gist once, and an unchecked second not at all', async () => {
    const state = await played([create, approve('R2.0')]);
    const twice: Schema = { ...SCHEMA, gists: [...SCHEMA.gists, { gist: 'published', writers: ['user'], rules: [], expect: { kin: 'user', while: { has: { $value: 'approved' } } } }] };
    expect(read(state, twice).denunciations).toEqual([PUBLISHED]);
  });
});

describe('the engine never answers an expected line', () => {
  it('answer leaves it, and reconcile writes nothing for it', async () => {
    const state = await played([create, approve('R2.0')]);
    const reading = read(state);
    expect(answer(reading, state.handles)).toEqual([]);
    expect(reconcile(reading, state.handles, SCHEMA)).toEqual({ handles: state.handles, drafts: [] });
  });

  it('answer leaves it beside the denunciations the engine answers', async () => {
    const state = await played([create, approve('R2.0')]);
    const reading = read({ ...state, handles: hold({}, []) });
    const answered = answer(reading, hold({}, []));
    expect(answered.length).toBeGreaterThan(0);
    expect(answered.some((d) => 'kin' in d)).toBe(false);
    expect(reading.denunciations.at(-1)).toEqual(PUBLISHED);
  });

  it('settle runs no round for it, and the reading it returns is settled and keeps it', async () => {
    const state = await played([create, approve('R2.0')]);
    const out = await settle(state, SCHEMA, NOW);
    expect(out.rounds).toEqual([]);
    expect(out.state).toEqual(state);
    expect(out.reading).toMatchObject({ settled: true, denunciations: [PUBLISHED] });
  });

  it('dryRun shows it in the reading before the line is sent, and adds only the draft and its record', async () => {
    const opened = await played([create]);
    const run = await dryRun(opened, approve('R2.0'), SCHEMA, NOW);
    expect(run.refusal).toBeUndefined();
    expect(run.reading).toMatchObject({ settled: true, denunciations: [PUBLISHED] });
    expect(run.added.map((l) => l.gist)).toEqual(['approved', 'metadata_set']);
  });

  it('post returns it in the reading, and the law settles does not refuse the approval that made it expected', async () => {
    const opened = await played([create], LAWFUL);
    const out = await post(opened, approve('R2.0'), LAWFUL, NOW);
    expect(out.refusal).toBeUndefined();
    expect(out.reading).toMatchObject({ settled: true, denunciations: [PUBLISHED] });
  });

  it('the policy has nothing to leave: a reading with only expected lines is settled without one', async () => {
    const state = await played([create, approve('R2.0')]);
    const out = await settle(state, SCHEMA, NOW, [{ leave: { gist: 'published' } }]);
    expect(out.reading).toMatchObject({ settled: true, denunciations: [PUBLISHED] });
  });
});
