// The four comparisons, `before`, `after`, `less` and `more`, and `$now`, the clock at the door: read by the
// reader's rules with the module's own problems, translated both ways, evaluated with `$now` unknown wherever
// no instant is given, and met by a goal through the reading. Last, a replay that meets the clock again.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  admit,
  conditionHolds,
  conditionProblem,
  consolidate,
  dryRun,
  emptyState,
  fromModuleForm,
  offers,
  playScenario,
  post,
  readSchema,
  startDrill,
  stepDrill,
  toModuleForm,
  BASE_KIT,
  type Condition,
  type Drill,
  type Io,
  type LineDraft,
  type Names,
  type Refusal,
  type Scope,
  type Seal,
  type Step,
  type ThreadState,
} from '../src/index.ts';
import { strict } from './helpers.ts';

const NAMES: Names = { sets: ['team'], guards: {} };
const now: Condition = { not: { after: [{ $now: 'instant' }, { $value: 'due' }] } };

/** A small schema: an opening that states a due instant and a count, a gist for each kind of `when`, goals and their notice. */
const JSON_SCHEMA = {
  opening: 'open',
  authority: 'system::desk',
  sets: ['team'],
  records: { value: 'value_set', join: 'joined', leave: 'left', warning: 'goal_warning' },
  judged: ['user'],
  guards: { late: { after: [{ $now: 'instant' }, { $value: 'due' }] } },
  gists: [
    {
      gist: 'open',
      writers: ['user'],
      rules: [
        { rule: 'value', key: 'due', from: 'due' },
        { rule: 'value', key: 'count', from: 'count' },
      ],
    },
    { gist: 'state', writers: ['user'], rules: [{ rule: 'value', key: 'arrived', from: 'arrived' }, { rule: 'value', key: 'counted', from: 'counted' }] },
    { gist: 'on_time', writers: ['user'], rules: [], when: now },
    { gist: 'fewer', writers: ['user'], rules: [], when: { less: [{ $draft: 'n' }, { $value: 'count' }] } },
    { gist: 'never', writers: ['user'], rules: [], when: { all: [{ has: { $value: 'absent' } }, { not: { guard: 'late' } }] } },
    { gist: 'set_goal', writers: ['user'], rules: [{ rule: 'goal' }] },
    { gist: 'notice', writers: ['goal'], rules: [] },
    { gist: 'value_set', writers: ['system'], rules: [] },
    { gist: 'joined', writers: ['system'], rules: [] },
    { gist: 'left', writers: ['system'], rules: [] },
    { gist: 'goal_warning', writers: ['goal'], rules: [] },
  ],
};
const SCHEMA = strict(JSON_SCHEMA);
const DUE = '2026-10-20T17:00:00+02:00';
const BEFORE = '2026-10-20T14:59:59.000Z';
const AFTER = '2026-10-20T15:00:01.000Z';
const user = (gist: string, payload: LineDraft['payload'] = {}): LineDraft => ({ gist, writer: 'user::mrossi', payload });

/** A thread of the small schema, opened with the due instant and the count. */
async function opened(): Promise<ThreadState> {
  const out = await post(emptyState(SCHEMA), user('open', { due: DUE, count: 10 }), SCHEMA, BEFORE, { nonce: '00'.repeat(16) });
  expect(out.refusal).toBeUndefined();
  return out.state;
}

describe('the reader', () => {
  it('accepts the four words, with days on before and after, and the operands conditions read', () => {
    const every: Condition = {
      all: [
        { before: [{ $value: 'approved' }, { $value: 'requested' }], days: 5 },
        { after: [{ $now: 'instant' }, '2026-10-13T17:00:00Z'] },
        { after: [{ $value: 'arrived' }, '2026-10-13'], days: -2 },
        { less: [{ $draft: 'n' }, 7] },
        { more: [{ $value: 'counted' }, { $draft: 'n' }] },
      ],
    };
    expect(conditionProblem(every, NAMES, true)).toBeUndefined();
    expect(conditionProblem({ less: [{ $value: 'a' }, { $value: 'b' }] }, NAMES, false)).toBeUndefined();
  });

  it.each([
    ['one operand', { before: [{ $value: 'a' }] }, /two operands/],
    ['three operands', { less: [1, 2, 3] }, /two operands/],
    ['operands that are no list', { more: { $value: 'a' } }, /two operands/],
    ['a key too many', { less: [1, 2], also: 1 }, /exactly one of/],
    ['two words in one node', { less: [1, 2], more: [1, 2] }, /exactly one of/],
    ['a $set', { less: [{ $set: 'team' }, 1] }, /not a \$set or a \$writer/],
    ['a $writer', { before: [{ $writer: 'id' }, '2026-10-13'] }, /not a \$set or a \$writer/],
    ['an object operand', { less: [{ n: 1 }, 1] }, /an operand is/],
    ['days that are not whole', { before: [{ $value: 'a' }, '2026-10-13'], days: 1.5 }, /"days" must be a whole number, not 1\.5\.$/],
    ['days on less', { less: [{ $value: 'a' }, 1], days: 2 }, /exactly one of/],
    ['text where a time is due', { before: [{ $value: 'a' }, 'soon'] }, /^"soon" is not a date or an instant; "before" compares only those\.$/],
    ['a number in text', { less: [{ $value: 'a' }, '7'] }, /"7" is not a number/],
    ['a boolean where a number is due', { more: [{ $value: 'a' }, true] }, /is not a number/],
    ['$now that reads something else', { after: [{ $now: 'today' }, { $value: 'due' }] }, /\$now reads instant/],
  ])('refuses %s', (_, condition, message) => {
    expect(conditionProblem(condition, NAMES, true)).toMatch(message);
  });

  it('keeps $now to a when: in a goal, a law\'s while or a guard a goal uses it is a problem', () => {
    expect(conditionProblem(now, NAMES, true)).toBeUndefined();
    expect(conditionProblem(now, NAMES, false)).toBe('$now may stand only in a when.');
    expect(conditionProblem({ has: { $now: 'instant' } }, NAMES, false)).toBe('$now may stand only in a when.');
    expect(conditionProblem({ guard: 'late' }, { sets: [], guards: SCHEMA.guards }, false)).toBe('$now may stand only in a when.');
    const law = readSchema({ ...JSON_SCHEMA, laws: [{ law: 'keeps-set', set: 'team', while: now, strength: 'refuse' }] }, BASE_KIT);
    expect(law.problems).toEqual(['law "keeps-set": while: $now may stand only in a when.']);
  });

  it('names a literal of the wrong kind as a problem of the schema, in a when and in a guard', () => {
    const gists = JSON_SCHEMA.gists.map((g) => (g.gist === 'on_time' ? { ...g, when: { before: [{ $now: 'instant' }, 'tomorrow'] } } : g));
    expect(readSchema({ ...JSON_SCHEMA, gists }, BASE_KIT).problems).toEqual(['gist "on_time": when: "tomorrow" is not a date or an instant; "before" compares only those.']);
    expect(readSchema({ ...JSON_SCHEMA, guards: { late: { less: [{ $value: 'count' }, '7'] } } }, BASE_KIT).problems).toEqual(['guard "late": "7" is not a number; "less" compares only numbers.']);
  });

  it('refuses a goal whose condition reads $now, at admission', async () => {
    const goal = user('set_goal', { name: 'late', when: { after: [{ $now: 'instant' }, { $value: 'due' }] }, then: 'notice' });
    expect(admit((await opened()).lines, goal, SCHEMA, AFTER)).toMatchObject({ code: 'invalid-payload', detail: expect.stringMatching(/\$now may stand only in a when/) });
  });
});

describe('the translation', () => {
  const every: Condition = {
    all: [
      { before: [{ $value: 'approved' }, { $value: 'requested' }], days: 5 },
      { after: [{ $now: 'instant' }, { $value: 'due' }] },
      { less: [{ $draft: 'n' }, 7] },
      { more: [{ $value: 'counted' }, 0] },
    ],
  };

  it('writes the four words as the module has them, $now a ref from now', () => {
    expect(toModuleForm(every)).toEqual({
      all: [
        { before: [{ ref: { from: 'value', field: 'approved' } }, { ref: { from: 'value', field: 'requested' } }], days: 5 },
        { after: [{ ref: { from: 'now', field: 'instant' } }, { ref: { from: 'value', field: 'due' } }] },
        { less: [{ ref: { from: 'draft', field: 'n' } }, 7] },
        { more: [{ ref: { from: 'value', field: 'counted' } }, 0] },
      ],
    });
  });

  it('comes back the same way, and says what consequitur cannot say', () => {
    expect(fromModuleForm(toModuleForm(every))).toEqual(every);
    expect(fromModuleForm({ after: [{ ref: { from: 'now', field: 'today' } }, '2026-10-13'] })).toMatch(/\(now\)today/);
  });
});

describe('evaluating', () => {
  const scope = (extra: Partial<Scope> = {}): Scope => ({
    handles: { value: { announced: '2026-10-05', arrived: '2026-10-08', due: DUE, count: 10, counted: 8, text: '7' } },
    lines: [],
    guards: {},
    ...extra,
  });
  const v = (key: string) => ({ $value: key });

  it.each<[string, boolean, Condition]>([
    ['three days after, more than two', true, { after: [v('arrived'), v('announced')], days: 2 }],
    ['three days after, more than three', false, { after: [v('arrived'), v('announced')], days: 3 }],
    ['three days after, within four', true, { before: [v('arrived'), v('announced')], days: 4 }],
    ['earlier', true, { before: [v('announced'), v('arrived')] }],
    ['a day before itself', false, { before: [v('arrived'), v('arrived')] }],
    ['a date after an instant', false, { after: [v('arrived'), v('due')] }],
    ['a date before an instant', false, { before: [v('arrived'), v('due')] }],
    ['8 less than 10', true, { less: [v('counted'), v('count')] }],
    ['8 more than 10', false, { more: [v('counted'), v('count')] }],
    ['10 less than 10', false, { less: [v('count'), v('count')] }],
    ['"7" less than 8', false, { less: [v('text'), 8] }],
    ['nothing less than 8', false, { less: [v('absent'), 8] }],
    ['not: nothing less than 8', true, { not: { less: [v('absent'), 8] } }],
  ])('%s: %s', (_, answer, condition) => {
    expect(conditionHolds(condition, scope())).toBe(answer);
  });

  it('reads $now as the instant given, and as unknown without one, as $draft for a menu', () => {
    expect(conditionHolds(now, scope({ now: '2026-10-20T14:59:59.000Z' }))).toBe(true);
    expect(conditionHolds(now, scope({ now: '2026-10-20T15:00:00.001Z' }))).toBe(false);
    expect(conditionHolds(now, scope())).toBe('unknown');
    expect(conditionHolds({ less: [{ $draft: 'n' }, v('count')] }, scope({ draft: 'unknown' }))).toBe('unknown');
    // unknown spreads as for the draft: a false sibling settles an all
    expect(conditionHolds({ all: [{ has: v('absent') }, now] }, scope())).toBe(false);
  });
});

describe('the menu and admission', () => {
  it('offers a when that reads $now or $draft, and leaves out one that is false whatever they are', async () => {
    const state = await opened();
    expect(offers(state.lines, 'user::mrossi', SCHEMA).map((o) => o.gist)).toEqual(['state', 'on_time', 'fewer', 'set_goal']);
  });

  it('admits by the instant given, refuses after it, and refuses without one, as not-now', async () => {
    const { lines } = await opened();
    expect(admit(lines, user('on_time'), SCHEMA, BEFORE)).toBeUndefined();
    expect(admit(lines, user('on_time'), SCHEMA, AFTER)).toMatchObject({ code: 'not-now' });
    expect(admit(lines, user('on_time'), SCHEMA)).toMatchObject({ code: 'not-now' });
    // an instant that is no date is the caller's mistake, as for stamp
    expect(() => admit(lines, user('on_time'), SCHEMA, 'soon')).toThrow(RangeError);
    // the draft is known at admission: the count compares
    expect(admit(lines, user('fewer', { n: 9 }), SCHEMA)).toBeUndefined();
    expect(admit(lines, user('fewer', { n: 10 }), SCHEMA)).toMatchObject({ code: 'not-now' });
  });

  it('is asked at the instant post and dryRun are given', async () => {
    const state = await opened();
    expect((await dryRun(state, user('on_time'), SCHEMA, BEFORE)).refusal).toBeUndefined();
    expect((await dryRun(state, user('on_time'), SCHEMA, AFTER)).refusal).toMatchObject({ code: 'not-now' });
    expect((await post(state, user('on_time'), SCHEMA, AFTER)).refusal).toMatchObject({ code: 'not-now' });
    // the date and the hour of a post's instant are read as stamp writes them: an offset is the same moment
    expect((await post(state, user('on_time'), SCHEMA, '2026-10-20T16:59:59+02:00')).refusal).toBeUndefined();
  });
});

describe('the reading', () => {
  it('meets a goal on each word: before, after with days, less, more, by the values the thread states', async () => {
    let state = await opened();
    const goals: Array<[string, Condition]> = [
      ['within five days', { before: [{ $value: 'arrived' }, { $value: 'expected' }], days: 5 }],
      ['more than two days late', { after: [{ $value: 'arrived' }, { $value: 'expected' }], days: 2 }],
      ['more than three days late', { after: [{ $value: 'arrived' }, { $value: 'expected' }], days: 3 }],
      ['early', { before: [{ $value: 'arrived' }, { $value: 'expected' }] }],
      ['short', { less: [{ $value: 'counted' }, { $value: 'count' }] }],
      ['over', { more: [{ $value: 'counted' }, { $value: 'count' }] }],
    ];
    for (const [name, when] of goals) {
      const out = await post(state, user('set_goal', { name, when, then: 'notice', with: { text: name } } as unknown as LineDraft['payload']), SCHEMA, BEFORE);
      expect(out.refusal, name).toBeUndefined();
      state = out.state;
    }
    // nothing is stated yet: every goal waits
    expect(state.lines.filter((l) => l.gist === 'notice')).toEqual([]);
    const gistOf = SCHEMA.gists.find((g) => g.gist === 'state')!;
    const stated = { ...gistOf, rules: [...gistOf.rules, { rule: 'value', key: 'expected', from: 'expected' }] };
    const schema = { ...SCHEMA, gists: SCHEMA.gists.map((g) => (g.gist === 'state' ? stated : g)) };
    const out = await post(state, user('state', { arrived: '2026-10-23', expected: '2026-10-20', counted: 8 }), schema, BEFORE);
    expect(out.refusal).toBeUndefined();
    expect(out.state.lines.filter((l) => l.gist === 'notice').map((l) => l.payload.text)).toEqual(['within five days', 'more than two days late', 'short']);
  });
});

describe('a replay meets the clock again', () => {
  const EDITORIAL = strict(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'cases', 'editorial-review', 'schema.json'), 'utf8')));
  const ON_TIME = '2026-10-13T10:00:00.000Z';
  const LATER = '2026-10-25T10:00:00.000Z';
  const by = (id: string, gist: string, payload: Step['payload'] = {}, label?: string): Step => ({ writer: `user::${id}`, gist, payload, ...(label ? { label } : {}) });
  const article = { title: 'Le biblioteche civiche nel 2030', version: 'v1', authors: ['aconti'], editor: 'drusso' };

  /** A thread played at one instant, as a scenario's host would. */
  async function played(steps: Step[], at: string, nonce: string): Promise<ThreadState> {
    let state = emptyState(EDITORIAL);
    const io: Io = {
      lines: () => state.lines,
      async send(draft: LineDraft, confirmed: boolean, opening?: { nonce?: string; from?: Seal[] }): Promise<Refusal | undefined> {
        const out = await post(state, draft, EDITORIAL, at, { confirmed, nonce: opening?.nonce, from: opening?.from });
        if (out.refusal) return out.refusal;
        state = out.state;
        return undefined;
      },
    };
    expect((await playScenario(steps, io, { nonce })).failed).toBeUndefined();
    return state;
  }

  /** Steps the drill until it stops or ends. */
  async function run(drill: Drill, at: string): Promise<Drill> {
    let d = drill;
    for (let calls = 0; calls < 100 && d.status === 'going' && d.stop === undefined; calls++) d = await stepDrill(d, at);
    return d;
  }

  it('a version sent before the deadline in its source is refused as not-now when the drill replays it after', async () => {
    const source = await played(
      [
        by('aconti', 'submit', article),
        by('aconti', 'request_review', { reviewers: ['bgalli', 'cneri'] }),
        by('drusso', 'deadline', { date: '2026-10-20T17:00:00+02:00' }),
        by('cneri', 'request_changes'),
        by('aconti', 'revision', { version: 'v2' }, 'v2'),
      ],
      ON_TIME,
      '00'.repeat(16),
    );
    const other = await played([by('aconti', 'submit', article)], ON_TIME, '11'.repeat(16));
    const c = consolidate({ lines: source.lines, schema: EDITORIAL }, { lines: other.lines, schema: EDITORIAL });

    // replayed the same day, the version goes in, and the drill stops at the second opening
    const today = await run(startDrill(c, { nonce: 'aa'.repeat(16) }), ON_TIME);
    expect(today.stop).toMatchObject({ at: 'step', step: { gist: 'submit' } });

    // replayed after the deadline, it is late: the person skips it, edits it or abandons
    const late = await run(startDrill(c, { nonce: 'aa'.repeat(16) }), LATER);
    expect(late.stop).toMatchObject({ at: 'step', step: { gist: 'revision', payload: { version: 'v2' } }, refusal: { code: 'not-now' } });
    const skipped = await stepDrill(late, LATER, { do: 'skip' });
    expect(skipped.skipped).toEqual([late.stop!.index]);
  });
});
