import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyState, inOrder, post, readPolicy, reduce, type EventLine, type ThreadState } from 'consequitur';
import { playScenario, readScenarios } from '../../../cases/scenario.ts';
import { keyOf, keyOfCheck } from '../src/index.ts';
import { NOW, SIBAR } from './helpers.ts';

const casesDir = join(import.meta.dirname, '..', '..', '..', 'cases', 'sibar-activity');
const scenarios = readScenarios(readFileSync(join(casesDir, 'scenarios.json'), 'utf8'));
const { policy, problems } = readPolicy(JSON.parse(readFileSync(join(casesDir, 'policy.json'), 'utf8')), SIBAR);
if (problems.length > 0) throw new Error(`The policy has problems: ${problems.join(' ')}`);

/** The state and the reading after each posted step of a SIBAR scenario; a refused step leaves them as they were. */
async function play(id: string) {
  const steps = scenarios.find((s) => s.id === id)!.steps;
  let state: ThreadState = emptyState(SIBAR);
  let reading = reduce(state.lines, state.handles, SIBAR);
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
  const left = lines.filter((l) => !l.writer.startsWith('goal::'));
  return reduce(left, emptyState(SIBAR).handles, SIBAR);
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
    expect(of('closed', {})).not.toBe(of('goal_warning', { check: 0 }));
    expect(of('goal_warning', { check: 0 })).not.toBe(of('goal_warning', { check: 1 }));
  });

  it('tells a member in a set from the same name as a value key, and a thread denunciation by its rule', () => {
    const key = (member?: string) => keyOf({ sort: 'handle', kind: 'set', key: 'assignees', ...(member === undefined ? {} : { member }), expected: true });
    expect(key('a')).not.toBe(key('b'));
    expect(key('a')).not.toBe(key());
    expect(keyOf({ sort: 'handle', kind: 'value', key: 'a:b', expected: 1 })).not.toBe(keyOf({ sort: 'handle', kind: 'value:a', key: 'b', expected: 1 }));
    expect(keyOf({ sort: 'thread', rule: 'one-opening', found: 0 })).toBe(keyOf({ sort: 'thread', rule: 'one-opening', found: 2 }));
  });
});

describe('keyOfCheck', () => {
  it('differs for two equal checks in one goal, and for the same index in two goals', async () => {
    const goal = (line: string) => ({ line, name: 'g', then: 'closed', checks: [{ check: { gist: 'memo' } }, { check: { gist: 'memo' } }], met: false, final: false });
    expect(keyOfCheck(goal('a'), 0)).not.toBe(keyOfCheck(goal('a'), 1));
    expect(keyOfCheck(goal('a'), 0)).not.toBe(keyOfCheck(goal('b'), 0));
    expect(keyOfCheck(goal('a'), 1)).toBe(keyOfCheck(goal('a'), 1));
  });
});
