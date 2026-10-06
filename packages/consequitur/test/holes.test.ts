// Holes: a reference stands in any payload, the reading resolves it in two passes, a fill states the
// value it refers to, and the reading lists what is awaited. A toy schema isolates each behaviour; the
// warehouse's own hole and fills are in `scenarios.test.ts`.

import { describe, expect, it } from 'vitest';
import { admit, consequitur, emptyState, offers, post, readGists, verify, BASE_KIT, type EventLine, type LineDraft, type Payload, type Reading, type Refusal, type RuleBinding, type Schema, type ThreadState, type Writer } from '../src/index.ts';
import { HEAD, custom, membersOf, valuesOf } from './helpers.ts';

const NOW = '2026-10-06T10:00:00.000Z';

const SCHEMA: Schema = custom([
  {
    gist: 'create',
    writers: ['user'],
    rules: [
      { rule: 'value', key: 'name', from: 'name', required: true },
      { rule: 'value', key: 'status', value: 'open' },
      { rule: 'join', set: 'assignees', from: 'assignTo', required: true },
    ],
  },
  { gist: 'memo', writers: ['user', 'goal'], rules: [{ rule: 'join', set: 'assignees', from: 'assignTo' }] },
  { gist: 'tag', writers: ['user'], rules: [{ rule: 'value', key: 'tag', from: 'tag' }] },
  { gist: 'note', writers: ['user'], rules: [{ rule: 'value', key: 'note', from: 'note', required: true }] },
  { gist: 'fill', writers: ['user'], rules: [{ rule: 'value', keyFrom: 'key', from: 'value' }] },
  { gist: 'fill_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['fill'] }] },
  { gist: 'memo_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['memo'] }] },
  { gist: 'guarded', writers: ['user'], rules: [], when: { has: { $draft: 'who' } } },
  { gist: 'collected', writers: ['user'], rules: [{ rule: 'value', key: 'seen', collect: 'item' }, { rule: 'collect-writer', key: 'people' }] },
  { gist: 'set_goal', writers: ['user'], rules: [{ rule: 'goal' }] },
  { gist: 'notice', writers: ['goal'], rules: [{ rule: 'value', key: 'notice', from: 'text' }] },
]);

const mrossi: Writer = 'user::mrossi';
const draft = (gist: string, payload: Payload, writer: Writer = mrossi): LineDraft => ({ gist, writer, payload });
const create = draft('create', { name: 'Arrivo', assignTo: ['mrossi'] });
const fill = (key: string, value: Payload[string]) => draft('fill', { key, value });

/** Posts each draft in turn through admission, and fails the test on a refusal. */
async function played(drafts: LineDraft[], schema: Schema = SCHEMA): Promise<ThreadState> {
  let state = emptyState(schema);
  for (const next of drafts) {
    const out = await post(state, next, schema, NOW);
    expect(out.refusal, `${next.gist} ${JSON.stringify(next.payload)}`).toBeUndefined();
    state = out.state;
  }
  return state;
}

const read = (state: ThreadState, schema: Schema = SCHEMA): Reading => consequitur(state.lines, state.handles, schema);
const refusalOf = (state: ThreadState, next: LineDraft, schema: Schema = SCHEMA): Refusal | undefined => admit(state.lines, next, schema);
const ref = (key: string) => ({ $value: key });

describe('a reference in a payload', () => {
  it('is read as the value a line states under its key, a list\'s item too, and the line keeps the reference', async () => {
    const state = await played([create, draft('memo', { assignTo: ['lbianchi', ref('second')], text: ref('second') }), fill('second', 'gverdi')]);
    expect(membersOf(state.handles)).toEqual(['gverdi', 'lbianchi', 'mrossi']);
    const memo = state.lines.find((l) => l.gist === 'memo')!;
    expect(memo.payload).toEqual({ assignTo: ['lbianchi', { $value: 'second' }], text: { $value: 'second' } });
    expect(await verify(memo)).toBe(true);
  });

  it('states nothing while no line states the key: the key, or the item of a list, is left out, and nothing is denounced', async () => {
    const state = await played([create, draft('memo', { assignTo: ['lbianchi', ref('second')] }), draft('tag', { tag: ref('second') })]);
    expect(membersOf(state.handles)).toEqual(['lbianchi', 'mrossi']);
    expect(valuesOf(state.handles)).not.toHaveProperty('tag');
    const reading = read(state);
    expect(reading.settled).toBe(true);
    expect(reading.denunciations).toEqual([]);
  });

  it('is filled by a later line, and the later fill wins; revoking it gives back the one before, or the hole', async () => {
    const lines = [create, draft('tag', { tag: ref('x') }), fill('x', 'one')];
    let state = await played(lines);
    expect(valuesOf(state.handles)).toMatchObject({ tag: 'one', x: 'one' });
    state = await played([...lines, fill('x', 'two')]);
    expect(valuesOf(state.handles)).toMatchObject({ tag: 'two', x: 'two' });
    const second = state.lines.filter((l) => l.gist === 'fill')[1];
    const revoked = await post(state, draft('fill_revoke', { target: second.id }), SCHEMA, NOW);
    expect(valuesOf(revoked.state.handles)).toMatchObject({ tag: 'one', x: 'one' });
    const first = state.lines.filter((l) => l.gist === 'fill')[0];
    const both = await post(revoked.state, draft('fill_revoke', { target: first.id }), SCHEMA, NOW);
    expect(valuesOf(both.state.handles)).not.toHaveProperty('tag');
    expect(valuesOf(both.state.handles)).not.toHaveProperty('x');
    expect(read(both.state).holes).toEqual([{ key: 'x', lines: [both.state.lines.find((l) => l.gist === 'tag')!.id] }]);
  });

  it('is read once: a value stated through a reference serves no other reference', async () => {
    const state = await played([create, fill('x', 'v'), draft('tag', { tag: ref('x') }), draft('memo', { assignTo: ref('tag') })]);
    expect(valuesOf(state.handles).tag).toBe('v');
    // the memo's reference names `tag`, which only a reference states: it stays a hole
    expect(membersOf(state.handles)).toEqual(['mrossi']);
    expect(read(state).holes).toEqual([{ key: 'tag', lines: [state.lines.find((l) => l.gist === 'memo')!.id] }]);
  });

  it('is read by the first pass whatever the order of the lines: a fill after the line, and one before it, give the same', async () => {
    const before = await played([create, fill('x', 'v'), draft('tag', { tag: ref('x') })]);
    const after = await played([create, draft('tag', { tag: ref('x') }), fill('x', 'v')]);
    expect(before.handles).toEqual(after.handles);
  });

  it('is replaced where a `line` check reads, in a goal\'s condition: it is met when the fill comes', async () => {
    const goal = draft('set_goal', { name: 'tagged', when: { line: { gist: 'tag', payload: { tag: 'hello' } } }, then: 'notice', with: { text: 'tagged' } });
    const waiting = await played([create, goal, draft('tag', { tag: ref('x') })]);
    expect(read(waiting).goals[0].met).toBe(false);
    const filled = await played([create, goal, draft('tag', { tag: ref('x') }), fill('x', 'hello')]);
    expect(read(filled).goals[0]).toMatchObject({ met: true });
    expect(valuesOf(filled.handles).notice).toBe('tagged');
  });

  it('is replaced in the draft a `when` reads, and a hole makes `has` false', async () => {
    const state = await played([create]);
    expect(refusalOf(state, draft('guarded', { who: ref('x') }))?.code).toBe('not-now');
    const filled = await played([create, fill('x', 'mrossi')]);
    expect(refusalOf(filled, draft('guarded', { who: ref('x') }))).toBeUndefined();
    // the menu has no draft, and offers the gist
    expect(offers(state.lines, mrossi, SCHEMA).map((o) => o.gist)).toContain('guarded');
  });

  it('is read in a `when` of a gist and in a condition with `has` and `is` false until it is filled', async () => {
    const schema = custom([
      { gist: 'create', writers: ['user'], rules: [{ rule: 'value', key: 'name', from: 'name' }, { rule: 'join', set: 'assignees', from: 'assignTo' }] },
      { gist: 'fill', writers: ['user'], rules: [{ rule: 'value', keyFrom: 'key', from: 'value' }] },
      { gist: 'go', writers: ['user'], rules: [], when: { all: [{ has: { $value: 'who' } }, { not: { is: { $value: 'who' }, values: ['nobody'] } }] } },
      { gist: 'never', writers: ['user'], rules: [], when: { is: { $value: 'who' }, values: ['nobody'] } },
    ]);
    const before = await played([create], schema);
    expect(refusalOf(before, draft('go', {}), schema)?.code).toBe('not-now');
    expect(refusalOf(before, draft('never', {}), schema)?.code).toBe('not-now');
    const after = await played([create, fill('who', 'nobody')], schema);
    expect(refusalOf(after, draft('go', {}), schema)?.code).toBe('not-now');
    expect(refusalOf(after, draft('never', {}), schema)).toBeUndefined();
    const other = await played([create, fill('who', 'mrossi')], schema);
    expect(refusalOf(other, draft('go', {}), schema)).toBeUndefined();
  });

  it('is read by a line revoked as its fill goes: the line revoked states nothing, so its references are no hole', async () => {
    const state = await played([create, draft('memo', { assignTo: ref('x') })]);
    expect(read(state).holes).toHaveLength(1);
    const memo = state.lines.find((l) => l.gist === 'memo')!;
    const revoked = await post(state, draft('memo_revoke', { target: memo.id }), SCHEMA, NOW);
    expect(read(revoked.state).holes).toEqual([]);
  });
});

describe('the reading says what is awaited', () => {
  it('lists each key referred to and stated by no line, by key, with the lines that hold it in reading order', async () => {
    const state = await played([
      create,
      draft('memo', { assignTo: [ref('zed'), ref('amy')] }),
      draft('tag', { tag: ref('zed') }),
      draft('memo', { assignTo: ref('amy'), nested: { deep: [ref('mid')] } }),
      fill('stated', 1),
      draft('tag', { tag: ref('stated') }),
    ]);
    const [, memo, tag, second] = state.lines.filter((l) => l.gist !== 'metadata_set' && l.gist !== 'assigned');
    expect(read(state).holes).toEqual([
      { key: 'amy', lines: [memo.id, second.id] },
      { key: 'mid', lines: [second.id] },
      { key: 'zed', lines: [memo.id, tag.id] },
    ]);
    expect(read(state).denunciations).toEqual([]);
  });

  it('has none when no line refers to anything', async () => {
    expect(read(await played([create])).holes).toEqual([]);
  });

  it('lists the keys a goal refers to, in its condition and in its `with`: the goal waits for them', async () => {
    const state = await played([create, draft('set_goal', { name: 'g', when: { has: { $value: 'later' } }, then: 'notice', with: { text: ref('wording') } })]);
    const goal = state.lines.find((l) => l.gist === 'set_goal')!.id;
    expect(read(state).holes).toEqual([{ key: 'later', lines: [goal] }, { key: 'wording', lines: [goal] }]);
    // a key the schema states is no hole once a line states it
    const named = await played([create, draft('set_goal', { name: 'g', when: { is: { $value: 'name' }, values: ['Arrivo'] }, then: 'notice', with: { text: 'x' } })]);
    expect(read(named).holes).toEqual([]);
  });

  it('lists a reference in a line whose gist the schema does not know, which no rule reads', async () => {
    const state = await played([create]);
    const stray: EventLine = { ...state.lines[0], id: 'stray', previous: state.lines.at(-1)!.id, gist: 'unknown', payload: { a: ref('x') } };
    expect(consequitur([...state.lines, stray], state.handles, SCHEMA).holes).toEqual([{ key: 'x', lines: ['stray'] }]);
  });
});

describe('a goal whose `with` holds a reference', () => {
  const goal = draft('set_goal', { name: 'announce', when: { line: { gist: 'tag' } }, then: 'memo', with: { assignTo: ['lbianchi', ref('second')] } });

  it('writes its outcome as it carries it, the reference inside, and the outcome completes when the key is stated', async () => {
    const state = await played([create, goal, draft('tag', { tag: 'go' })]);
    const outcome = state.lines.find((l) => l.writer.startsWith('goal::'))!;
    expect(outcome.payload).toEqual({ assignTo: ['lbianchi', { $value: 'second' }] });
    expect(membersOf(state.handles)).toEqual(['lbianchi', 'mrossi']);
    // the goal's line carries the reference, and so does the outcome
    expect(read(state).holes).toEqual([{ key: 'second', lines: [state.lines.find((l) => l.gist === 'set_goal')!.id, outcome.id] }]);

    const filled = await post(state, fill('second', 'gverdi'), SCHEMA, NOW);
    expect(filled.refusal).toBeUndefined();
    expect(membersOf(filled.state.handles)).toEqual(['gverdi', 'lbianchi', 'mrossi']);
    expect(read(filled.state).holes).toEqual([]);
    // the goal wrote once
    expect(filled.state.lines.filter((l) => l.writer.startsWith('goal::') && l.gist === 'memo')).toHaveLength(1);
  });
});

describe('the fill', () => {
  it('reads a binding with exactly keyFrom and from, and where; not a key, a form beside it, or required', () => {
    const rule = (binding: RuleBinding) => readGists([{ gist: 'f', writers: ['user'], rules: [binding] }], BASE_KIT, HEAD).problems;
    expect(rule({ rule: 'value', keyFrom: 'key', from: 'value' })).toEqual([]);
    expect(rule({ rule: 'value', keyFrom: 'key', from: 'value', where: { kind: 'fill' } })).toEqual([]);
    for (const bad of [
      { rule: 'value', keyFrom: 'key' },
      { rule: 'value', keyFrom: 'key', from: 'value', key: 'k' },
      { rule: 'value', keyFrom: 'key', from: 'value', required: true },
      { rule: 'value', keyFrom: 'key', from: 'value', value: 1 },
      { rule: 'value', keyFrom: 1, from: 'value' },
      { rule: 'value', keyFrom: 'key', from: 'value', where: {} },
    ]) {
      expect(rule(bad as RuleBinding), JSON.stringify(bad)).toHaveLength(1);
    }
  });

  it('states the value under the key the payload holds, a later fill winning, and the record says the key and the value', async () => {
    const state = await played([create, fill('legal', 'one'), fill('legal', ['a', 'b']), fill('other', null)]);
    expect(valuesOf(state.handles)).toMatchObject({ legal: ['a', 'b'], other: null });
    expect(state.lines.filter((l) => l.gist === 'metadata_set').map((l) => l.payload)).toContainEqual({ key: 'legal', value: ['a', 'b'] });
  });

  it('states nothing when its payload lacks the key or the value, or holds a key that is not a string, and the reading does not throw', async () => {
    const state = await played([create]);
    const stray = (payload: Payload): EventLine => ({ ...state.lines[0], id: 'stray', previous: state.lines.at(-1)!.id, gist: 'fill', payload });
    const lacking: Payload[] = [{ key: 'k' }, { value: 1 }, { key: 3, value: 1 }, {}];
    for (const payload of lacking) {
      expect(consequitur([...state.lines, stray(payload)], state.handles, SCHEMA).expected.value).toEqual(valuesOf(state.handles));
    }
  });

  it('is refused when the key is not a string, a reference included', async () => {
    const state = await played([create, fill('x', 'plain')]);
    for (const key of [3, null, ['a'], { a: 1 }, ref('x')]) {
      const refusal = refusalOf(state, draft('fill', { key, value: 1 }));
      expect(refusal?.code, JSON.stringify(key)).toBe('invalid-payload');
      expect(refusal?.detail).toMatch(/"key" must hold a string/);
    }
  });

  it('is refused when the key is one some value binding of the schema states: a fixed one, a payload\'s, a collected, a collect-writer\'s', async () => {
    const state = await played([create]);
    for (const key of ['name', 'status', 'tag', 'note', 'seen', 'people', 'notice']) {
      const refusal = refusalOf(state, fill(key, 'x'));
      expect(refusal?.code, key).toBe('invalid-payload');
      expect(refusal?.detail).toMatch(/which a value binding of the schema states/);
    }
    // a key no binding states is free, and so is one that only a fill states
    expect(refusalOf(state, fill('legal', 'x'))).toBeUndefined();
  });

  it('is refused when the value holds a reference, whether or not it would resolve, and at any depth', async () => {
    const state = await played([create, fill('x', 'v')]);
    for (const value of [ref('x'), ref('unknown'), ['a', ref('x')], { deep: ref('x') }]) {
      const refusal = refusalOf(state, fill('legal', value));
      expect(refusal?.code, JSON.stringify(value)).toBe('invalid-payload');
      expect(refusal?.detail).toMatch(/"value" must not hold a reference/);
    }
  });

  it('applies where its `where` matches, as the other forms do', async () => {
    const schema = custom([
      { gist: 'create', writers: ['user'], rules: [{ rule: 'join', set: 'assignees', from: 'assignTo' }] },
      { gist: 'fill', writers: ['user'], rules: [{ rule: 'value', keyFrom: 'key', from: 'value', where: { kind: 'fill' } }, { rule: 'value', key: 'status', value: 'filled', where: { kind: 'fill' } }] },
    ]);
    const state = await played([create], schema);
    // not the kind it fills: no check, and nothing stated
    expect(refusalOf(state, draft('fill', { kind: 'other', key: 3, value: ref('x') }), schema)).toBeUndefined();
    expect(refusalOf(state, draft('fill', { kind: 'fill', key: 3, value: 1 }), schema)?.code).toBe('invalid-payload');
    expect(refusalOf(state, draft('fill', { kind: 'fill', key: 'status', value: 1 }), schema)?.code).toBe('invalid-payload');
  });
});

describe('admission reads a reference as present, and checks the value only where it is resolved', () => {
  it('lets a hole satisfy `required`, and still refuses the key when it is absent', async () => {
    const state = await played([create]);
    expect(refusalOf(state, draft('note', { note: ref('later') }))).toBeUndefined();
    expect(refusalOf(state, draft('note', {}))?.code).toBe('invalid-payload');
    expect(refusalOf(state, draft('create', { name: ref('name'), assignTo: [ref('x')] }))).toBeUndefined();
  });

  it('checks the shape of a resolved value: a join wants a string or a list of strings, a hole is not checked', async () => {
    const state = await played([create, fill('number', 42), fill('names', ['a', 'b']), fill('one', 'a')]);
    expect(refusalOf(state, draft('memo', { assignTo: ref('number') }))?.detail).toMatch(/must hold a string or a list of strings/);
    expect(refusalOf(state, draft('memo', { assignTo: ['x', ref('number')] }))?.code).toBe('invalid-payload');
    expect(refusalOf(state, draft('memo', { assignTo: ref('one') }))).toBeUndefined();
    expect(refusalOf(state, draft('memo', { assignTo: ref('names') }))).toBeUndefined();
    expect(refusalOf(state, draft('memo', { assignTo: ['x', ref('one')] }))).toBeUndefined();
    expect(refusalOf(state, draft('memo', { assignTo: ['x', ref('hole')] }))).toBeUndefined();
    expect(refusalOf(state, draft('memo', { assignTo: ref('hole') }))).toBeUndefined();
    // a payload that holds no reference is checked as it was
    expect(refusalOf(state, draft('memo', { assignTo: 3 }))?.code).toBe('invalid-payload');
    expect(refusalOf(state, draft('memo', { assignTo: ['x', 3] }))?.code).toBe('invalid-payload');
  });

  it('reads the references of a goal\'s `with` against the outcome\'s gist the same way', async () => {
    const state = await played([create, fill('number', 42)]);
    const goal = (withs: Payload) => draft('set_goal', { name: 'g', when: { has: { $value: 'name' } }, then: 'memo', with: withs });
    expect(refusalOf(state, goal({ assignTo: ['x', ref('hole')] }))).toBeUndefined();
    expect(refusalOf(state, goal({ assignTo: ref('number') }))?.detail).toMatch(/"with" does not fit the gist "memo"/);
  });
});
