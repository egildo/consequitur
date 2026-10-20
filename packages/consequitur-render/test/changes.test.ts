import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyState, inOrder, playScenario, post, readPolicy, readScenarios, consequitur, type EventLine, type LineDraft, type Reading, type Schema, type ThreadState } from 'consequitur';
import { changes, keyOf, keyOfCheck, type ReadingChange } from '../src/index.ts';
import { NOW, SIBAR, mrossi } from './helpers.ts';

const casesDir = join(import.meta.dirname, '..', '..', '..', 'cases', 'sibar-activity');
const scenarios = readScenarios(readFileSync(join(casesDir, 'scenarios.json'), 'utf8'));
const { policy, problems } = readPolicy(JSON.parse(readFileSync(join(casesDir, 'policy.json'), 'utf8')), SIBAR);
if (problems.length > 0) throw new Error(`The policy has problems: ${problems.join(' ')}`);

/** The state and the reading after each posted step of a SIBAR scenario; a refused step leaves them as they were. */
async function play(id: string) {
  const steps = scenarios.find((s) => s.id === id)!.steps;
  let state: ThreadState = emptyState(SIBAR);
  let reading = consequitur(state.lines, state.handles, SIBAR);
  const trace = [{ state, reading }];
  const played = await playScenario(
    steps,
    {
      lines: () => state.lines,
      async send(draft, confirmed) {
        const out = await post(state, draft, SIBAR, NOW, { confirmed, policy });
        if (out.refusal) return out.refusal;
        ({ state, reading } = out);
        return undefined;
      },
    },
    { after: () => void trace.push({ state, reading }) },
  );
  expect(played.failed).toBeUndefined();
  return { trace, labels: played.labels };
}

/** The thread with what its goals wrote taken out, read against handles that know nothing: it is full of denunciations. */
const unanswered = (lines: EventLine[]) => {
  // what is left is no chain, so each line is relinked to the one before it; the ids stay, for the payloads name them
  const left = inOrder(lines)
    .filter((l) => !l.writer.startsWith('goal::'))
    .map((l, i, all) => ({ ...l, previous: i === 0 ? null : all[i - 1].id }));
  return consequitur(left, emptyState(SIBAR).handles, SIBAR);
};

describe('keyOf', () => {
  it('is equal for the denunciations of two reductions of one thread, and different for different ones', async () => {
    const { trace } = await play('opinion');
    const lines = trace.at(-1)!.state.lines;
    const first = unanswered(lines).denunciations;
    const second = unanswered(inOrder(lines).reverse()).denunciations;
    expect(first.map((d) => d.sort)).toEqual(expect.arrayContaining(['handle', 'line']));
    expect(first.map(keyOf)).toEqual(second.map(keyOf));
    expect(new Set(first.map(keyOf)).size).toBe(first.length);
  });

  it('tells what two goals owe apart, and the outcome of one goal from its warnings by gist and payload', async () => {
    const { trace } = await play('opinion');
    const owed = unanswered(trace.at(-1)!.state.lines).denunciations.filter((d) => d.sort === 'line');
    expect(owed.length).toBeGreaterThan(1);
    expect(new Set(owed.map(keyOf)).size).toBe(owed.length);
    const of = (gist: string, payload: Record<string, number>) => keyOf({ sort: 'line', gist, writer: 'system::sibardoc', line: 'ab', payload });
    const at = (path: string) => ({ path }) as unknown as Record<string, number>;
    expect(of('closed', {})).not.toBe(of('goal_warning', at('0')));
    expect(of('goal_warning', at('0'))).not.toBe(of('goal_warning', at('1')));
  });

  it('tells a member in a set from the same name as a value key, and a thread denunciation by its rule', () => {
    const key = (member?: string) => keyOf({ sort: 'handle', kind: 'set', key: 'assignees', ...(member === undefined ? {} : { member }), expected: true });
    expect(key('a')).not.toBe(key('b'));
    expect(key('a')).not.toBe(key());
    expect(keyOf({ sort: 'handle', kind: 'value', key: 'a:b', expected: 1 })).not.toBe(keyOf({ sort: 'handle', kind: 'value:a', key: 'b', expected: 1 }));
    expect(keyOf({ sort: 'thread', rule: 'one-opening', found: 0 })).toBe(keyOf({ sort: 'thread', rule: 'one-opening', found: 2 }));
  });

  it('keys a line a kin answers by the gist and the kin, apart from a line a goal owes', () => {
    const expected = (gist: string, kin: string) => keyOf({ sort: 'line', gist, kin });
    expect(expected('published', 'system')).toBe(expected('published', 'system'));
    expect(expected('published', 'system')).not.toBe(expected('published', 'user'));
    expect(expected('published', 'system')).not.toBe(expected('signed', 'system'));
    expect(expected('a:b', 'c')).not.toBe(expected('a', 'b:c'));
    expect(expected('published', 'system')).not.toBe(keyOf({ sort: 'line', gist: 'published', writer: 'goal::ab', line: 'ab', payload: {} }));
  });
});

describe('keyOfCheck', () => {
  it('differs for two equal checks in one goal, and for the same path in two goals; the nth check of an `all` keeps the key n', async () => {
    const memo = { condition: { line: { gist: 'memo' } }, holds: false };
    const goal = (line: string) => ({ line, name: 'g', then: 'closed', trace: { condition: { all: [memo.condition, memo.condition] }, holds: false, children: [memo, memo] }, met: false, final: false });
    expect(keyOfCheck(goal('a'), '0')).not.toBe(keyOfCheck(goal('a'), '1'));
    expect(keyOfCheck(goal('a'), '0')).not.toBe(keyOfCheck(goal('b'), '0'));
    expect(keyOfCheck(goal('a'), '1')).toBe(keyOfCheck(goal('a'), '1'));
    expect(keyOfCheck(goal('a'), '1')).toBe('a:1');
  });
});

/** What one more post changes, read from the reading before and the reading after. */
async function posted(from: { state: ThreadState; reading: Reading }, draft: LineDraft, confirmed = false) {
  const out = await post(from.state, draft, SIBAR, NOW, { policy, confirmed });
  expect(out.refusal).toBeUndefined();
  return { out, list: changes(from.reading, out.reading) };
}

const only = (list: ReadingChange[], of: ReadingChange['of']) => list.filter((c) => c.of === of);

describe('changes', () => {
  it('is empty between a reading and itself, at every step of both scenarios', async () => {
    for (const { id } of scenarios) {
      for (const { reading } of (await play(id)).trace) expect(changes(reading, reading)).toEqual([]);
    }
  });

  it('lists the same changes for the same readings, and for readings made of the thread in another order', async () => {
    const { trace } = await play('opinion');
    for (let i = 1; i < trace.length; i++) {
      const list = changes(trace[i - 1].reading, trace[i].reading);
      expect(list.length).toBeGreaterThan(0);
      expect(changes(trace[i - 1].reading, trace[i].reading)).toEqual(list);
      const again = (t: (typeof trace)[number]) => consequitur(inOrder(t.state.lines).reverse(), t.state.handles, SIBAR);
      expect(changes(again(trace[i - 1]), again(trace[i]))).toEqual(list);
    }
  });

  it('orders by kind, line, goal, check, denunciation, hole, settled, then by key', async () => {
    const { trace } = await play('opinion');
    const stale = consequitur(trace.at(-1)!.state.lines, emptyState(SIBAR).handles, SIBAR);
    const lists = [changes(stale, trace.at(-1)!.reading), changes(trace[0].reading, trace.at(-1)!.reading)];
    const rank = ['line', 'goal', 'check', 'denunciation', 'hole', 'settled'];
    for (const list of lists) {
      expect(list.length).toBeGreaterThan(1);
      const keyed = list.map((c) => [rank.indexOf(c.of), 'key' in c ? c.key : ''] as const);
      expect(keyed).toEqual([...keyed].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)));
    }
    expect(new Set(lists.flat().map((c) => c.of))).toEqual(new Set(rank.filter((of) => of !== 'hole')));
  });

  it('says a line newly in force, and a goal newly set, with no check found', async () => {
    const { trace } = await play('first');
    const list = changes(trace[3].reading, trace[4].reading);
    const goal = trace[4].reading.goals[0];
    expect(list).toEqual([{ of: 'line', key: goal.line, change: 'in-force' }, { of: 'goal', key: goal.line, change: 'set' }]);
  });

  it('says a check found, and then a goal met with its outcome in force, when the last check finds its line', async () => {
    const { trace, labels } = await play('opinion');
    const firme = labels.get('firme')!;
    const [before, after] = [trace[12], trace[13]];
    const list = changes(before.reading, after.reading);
    const goal = after.reading.goals.find((g) => g.line === firme)!;
    expect(before.reading.goals.find((g) => g.line === firme)!.met).toBe(false);
    expect(goal.met).toBe(true);
    expect(list).toContainEqual({ of: 'goal', key: firme, change: 'met' });
    expect(list).toContainEqual({ of: 'check', key: keyOfCheck(goal, '1'), change: 'found' });
    expect(list).toContainEqual({ of: 'line', key: goal.outcome, change: 'in-force' });
    // the wrapper awaited that outcome, and finds it in the same post
    const wrapper = after.reading.goals.find((g) => g.line === labels.get('wrapper')!)!;
    expect(list).toContainEqual({ of: 'check', key: keyOfCheck(wrapper, '0'), change: 'found' });
  });

  it('says a goal set that is met already, with each of its checks found, and two equal checks have two keys', async () => {
    const { trace } = await play('opinion');
    const draft = { gist: 'set_goal', writer: 'user::mrossi' as const, payload: { name: 'g', then: 'stage', with: { stage: 'x' }, when: { all: [{ line: { gist: 'memo' } }, { line: { gist: 'memo' } }] } } };
    const { out, list } = await posted(trace[2], draft);
    const goal = out.reading.goals.find((g) => g.name === 'g')!;
    expect(only(list, 'goal')).toEqual([{ of: 'goal', key: goal.line, change: 'set' }, { of: 'goal', key: goal.line, change: 'met' }]);
    expect(only(list, 'check')).toEqual(['0', '1'].map((i) => ({ of: 'check', key: keyOfCheck(goal, i), change: 'found' })));
  });

  it('says a line revoked and a check lost when a revoke takes the line a check found out of force', async () => {
    const { trace, labels } = await play('opinion');
    const written = trace[13].state.lines.find((l) => l.gist === 'memo' && l.writer === `goal::${labels.get('firme')}`)!;
    const wrapper = trace[13].reading.goals.find((g) => g.line === labels.get('wrapper')!)!;
    const { list } = await posted(trace[13], { gist: 'memo_revoke', writer: 'user::mrossi', payload: { target: written.id } }, true);
    expect(list).toContainEqual({ of: 'line', key: written.id, change: 'revoked' });
    expect(list).toContainEqual({ of: 'check', key: keyOfCheck(wrapper, '0'), change: 'lost' });
    expect(only(list, 'line').filter((c) => c.change === 'revoked')).toHaveLength(1);
  });

  it('says a goal met no more when a check is lost', async () => {
    const { trace } = await play('opinion');
    const draft = { gist: 'set_goal', writer: 'user::mrossi' as const, payload: { name: 'g', then: 'stage', with: { stage: 'x' }, when: { all: [{ line: { gist: 'memo' } }] } } };
    const { out } = await posted(trace[2], draft);
    const [goal] = out.reading.goals.filter((g) => g.name === 'g');
    const memo = out.state.lines.find((l) => l.gist === 'memo' && l.writer === 'user::mrossi')!;
    const { list } = await posted(out, { gist: 'memo_revoke', writer: 'user::mrossi', payload: { target: memo.id } }, true);
    expect(list).toContainEqual({ of: 'line', key: memo.id, change: 'revoked' });
    expect(list).toContainEqual({ of: 'goal', key: goal.line, change: 'unmet' });
    expect(list).toContainEqual({ of: 'check', key: keyOfCheck(goal, '0'), change: 'lost' });
  });

  it('says a check an orphan when a line it awaited is revoked before it found it', async () => {
    const { trace } = await play('opinion');
    const verbale = trace[9].reading.goals.find((g) => g.name === 'Verbale')!;
    const list = changes(trace[8].reading, trace[9].reading);
    expect(list).toContainEqual({ of: 'check', key: keyOfCheck(verbale, ''), change: 'orphan' });
    expect(list.filter((c) => c.of === 'check' && c.change === 'lost')).toEqual([]);
    expect(list.filter((c) => c.of === 'line' && c.change === 'revoked')).toHaveLength(1);
  });

  it('says a goal gone when the reading no longer holds it', async () => {
    const { trace, labels } = await play('opinion');
    const firme = labels.get('firme')!;
    const { list } = await posted(trace[6], { gist: 'set_goal_revoke', writer: 'user::mrossi', payload: { target: firme } });
    expect(list).toContainEqual({ of: 'goal', key: firme, change: 'gone' });
    expect(list).toContainEqual({ of: 'line', key: firme, change: 'revoked' });
  });

  it('says a denunciation answered and the thread settled, and the other way round', async () => {
    const { trace } = await play('first');
    const { state, reading } = trace.at(-1)!;
    const stale = consequitur(state.lines, emptyState(SIBAR).handles, SIBAR);
    expect(stale.settled).toBe(false);
    const keys = stale.denunciations.map(keyOf);
    expect(keys.length).toBeGreaterThan(0);
    expect(changes(stale, reading)).toEqual(expect.arrayContaining([...keys.map((key) => ({ of: 'denunciation', key, change: 'answered' })), { of: 'settled', change: 'settled' }]));
    expect(only(changes(stale, reading), 'denunciation')).toHaveLength(keys.length);
    expect(changes(reading, stale)).toEqual(expect.arrayContaining([...keys.map((key) => ({ of: 'denunciation', key, change: 'raised' })), { of: 'settled', change: 'unsettled' }]));
  });

  it('says a line expected of a kin raised when its condition holds and answered when the kin writes it, the thread settled all the while', async () => {
    // SIBAR's schema with the stage expected of a person while the activity is open and has none
    const stage = { all: [{ is: { $value: 'status' }, values: ['open'] }, { not: { has: { $value: 'stage' } } }] };
    const schema: Schema = { ...SIBAR, gists: SIBAR.gists.map((g) => (g.gist === 'stage' ? { ...g, expect: { kin: 'user', while: stage } } : g)) };
    const posting = async (state: ThreadState, draft: LineDraft) => {
      const out = await post(state, draft, schema, NOW, { policy });
      expect(out.refusal).toBeUndefined();
      return out;
    };
    const opened = await posting(emptyState(schema), mrossi('create', { name: 'Richiesta parere', assignTo: ['mrossi'] }));
    const key = keyOf({ sort: 'line', gist: 'stage', kin: 'user' });
    expect(only(changes(consequitur([], emptyState(schema).handles, schema), opened.reading), 'denunciation')).toContainEqual({ of: 'denunciation', key, change: 'raised' });
    const staged = await posting(opened.state, mrossi('stage', { stage: 'bozza' }));
    expect(only(changes(opened.reading, staged.reading), 'denunciation')).toEqual([{ of: 'denunciation', key, change: 'answered' }]);
    expect(only(changes(opened.reading, staged.reading), 'settled')).toEqual([]);
    expect([opened, staged].map((r) => r.reading.settled)).toEqual([true, true]);
  });

  it('says the opening rule answered by the thread denunciation, which has a key of its own', async () => {
    const { trace } = await play('first');
    expect(changes(trace[0].reading, trace[1].reading)).toContainEqual({ of: 'denunciation', key: 'thread:one-opening', change: 'answered' });
  });

  it('says a hole opened when a line in force newly refers to a value no line states, and filled when one states it', async () => {
    // SIBAR's schema with a fill: a gist whose value rule takes its key from the payload
    const schema: Schema = { ...SIBAR, gists: [...SIBAR.gists, { gist: 'fill', writers: ['user'], rules: [{ rule: 'value', keyFrom: 'key', from: 'value' }] }] };
    const posting = async (state: ThreadState, draft: LineDraft) => {
      const out = await post(state, draft, schema, NOW, { policy });
      expect(out.refusal).toBeUndefined();
      return out;
    };
    const opened = await posting(emptyState(schema), mrossi('create', { name: 'Richiesta parere', assignTo: ['mrossi'] }));
    const asking = await posting(opened.state, mrossi('memo', { text: 'T', assignTo: [{ $value: 'second' }, { $value: 'third' }] }));
    expect(only(changes(opened.reading, asking.reading), 'hole')).toEqual([
      { of: 'hole', key: 'second', change: 'opened' },
      { of: 'hole', key: 'third', change: 'opened' },
    ]);
    const filled = await posting(asking.state, mrossi('fill', { key: 'second', value: 'gverdi' }));
    expect(only(changes(asking.reading, filled.reading), 'hole')).toEqual([{ of: 'hole', key: 'second', change: 'filled' }]);
    // a hole that stays open is no change, and the thread went on settled all the while
    expect(changes(asking.reading, asking.reading)).toEqual([]);
    expect([opened, asking, filled].map((r) => r.reading.settled)).toEqual([true, true, true]);
  });
});
