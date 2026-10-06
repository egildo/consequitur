// The shared resolver of `scenario.ts`, and the SIBAR scenarios it plays: the stories of the
// first case, as the playground's two examples have always told them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { admit, consequitur, diff, draftOf, dryRun, emptyState, inOrder, lockedBy, matches, offers, playScenario, post, prune, readPolicy, readScenarios, resolve, stepsOf, type Check, type EventLine, type Io, type LineDraft, type Policy, type Refusal, type Schema, type Step, type ThreadState, type Writer } from '../src/index.ts';
import { strict, SIBAR_JSON, membersOf, valuesOf } from './helpers.ts';

const NOW = '2026-10-03T10:00:00.000Z';
const casePath = (...parts: string[]) => join(import.meta.dirname, '..', '..', '..', 'cases', ...parts);

/** A thread of a schema, posted to as a scenario's host would. */
function host(schema = strict(SIBAR_JSON), policy: Policy = []) {
  let state: ThreadState = emptyState(schema);
  const io: Io = {
    lines: () => state.lines,
    async send(draft: LineDraft, confirmed: boolean): Promise<Refusal | undefined> {
      const out = await post(state, draft, schema, NOW, { confirmed, policy });
      if (out.refusal) return out.refusal;
      state = out.state;
      return undefined;
    },
  };
  return { io, state: () => state };
}

/** SIBAR's policy, read against the schema it is passed with, as the playground reads it; a problem fails the test. */
function sibarPolicy(schema: Schema = strict(SIBAR_JSON)): Policy {
  const { policy, problems } = readPolicy(JSON.parse(readFileSync(casePath('sibar-activity', 'policy.json'), 'utf8')), schema);
  expect(problems).toEqual([]);
  return policy;
}

const line = (id: string, gist: string, writer: EventLine['writer'], payload: EventLine['payload'] = {}): EventLine => ({ id, previous: null, gist, writer, timestamp: `2026-10-03T10:00:0${id}.000Z`, payload });

describe('the scenario resolver', () => {
  const lines = [line('1', 'memo', 'user::mrossi'), line('2', 'memo', 'goal::abc'), line('3', 'comment', 'user::lbianchi')];
  const labels = new Map([['first', '1']]);

  it('replaces $line by the id of the line a step posted, wherever a value stands', () => {
    expect(resolve({ about: { $line: 'first' }, list: [{ $line: 'first' }, 'x'], nested: { checks: [{ payload: { about: { $line: 'first' } } }] } }, lines, labels)).toEqual({
      about: '1',
      list: ['1', 'x'],
      nested: { checks: [{ payload: { about: '1' } }] },
    });
  });

  it('replaces $goal by the writer of what that goal writes', () => {
    expect(resolve({ writer: { $goal: 'first' } }, lines, labels)).toEqual({ writer: 'goal::1' });
  });

  it('replaces $find by the first line, in reading order, that its check matches', () => {
    expect(resolve({ target: { $find: { gist: 'memo', kin: 'goal' } } }, lines, labels)).toEqual({ target: '2' });
    expect(resolve({ target: { $find: { gist: 'memo' } } }, [...lines].reverse(), labels)).toEqual({ target: '1' });
  });

  it('leaves what is not a placeholder alone, an object with more keys than one included', () => {
    expect(resolve({ a: 1, b: null, c: { $line: 'first', other: 1 } }, lines, labels)).toEqual({ a: 1, b: null, c: { $line: 'first', other: 1 } });
  });

  it('says which reference found nothing, and which placeholder it does not know', () => {
    expect(() => resolve({ $line: 'later' }, lines, labels)).toThrow(/"later"/);
    expect(() => resolve({ $goal: 'later' }, lines, labels)).toThrow(/"later"/);
    expect(() => resolve({ $find: { gist: 'nothing' } }, lines, labels)).toThrow(/nothing/);
    expect(() => resolve({ $find: {} }, lines, labels)).toThrow(/check/);
    expect(() => resolve({ $line: 3 }, lines, labels)).toThrow();
    expect(() => resolve({ $other: 'x' }, lines, labels)).toThrow(/\$other/);
  });

  it('makes the draft of a step, resolved against the thread', () => {
    const step: Step = { writer: 'user::mrossi', gist: 'got_it', payload: { about: { $line: 'first' } } };
    expect(draftOf(step, lines, labels)).toEqual({ gist: 'got_it', writer: 'user::mrossi', payload: { about: '1' } });
  });
});

describe('playing a scenario', () => {
  const steps: Step[] = [
    { label: 'open', writer: 'user::mrossi', gist: 'create', payload: { name: 'A', assignTo: ['mrossi'] } },
    { label: 'note', writer: 'user::mrossi', gist: 'memo', payload: { text: 'T', assignTo: ['lbianchi'] } },
    { writer: 'user::lbianchi', gist: 'got_it', payload: { about: { $line: 'note' } } },
  ];

  it('posts each step to the thread as it stands, and remembers each label', async () => {
    const h = host();
    const seen: number[] = [];
    const played = await playScenario(steps, h.io, { after: ({ index }) => void seen.push(index) });
    expect(played.failed).toBeUndefined();
    expect(seen).toEqual([0, 1, 2]);
    expect(played.labels.get('open')).toBe(h.state().lines[0].id);
    // the label is the draft's line, not what reconciliation wrote after it
    expect(h.state().lines.find((l) => l.id === played.labels.get('note'))?.gist).toBe('memo');
    // and a `$line` reached the line it named
    expect(valuesOf(h.state().handles).acknowledged).toBe(played.labels.get('note'));
  });

  it('stops at the first step refused that the scenario does not expect refused, and says so', async () => {
    const h = host();
    const played = await playScenario([steps[0], { writer: 'user::mrossi', gist: 'nothing', payload: {} }, steps[1]], h.io);
    expect(played.failed).toMatchObject({ index: 1, refusal: { code: 'unknown-gist' } });
    expect(h.state().lines.map((l) => l.gist)).not.toContain('memo');
  });

  it('goes on past a step expected refused, and stops at one that is posted or refused otherwise', async () => {
    const h = host();
    const refusedStep: Step = { writer: 'user::lbianchi', gist: 'memo', payload: { text: 'T' }, refused: 'not-now' };
    // lbianchi is not an assignee yet: the memo is not allowed now
    const played = await playScenario([steps[0], refusedStep, steps[1]], h.io);
    expect(played.failed).toBeUndefined();
    expect(played.refused).toHaveLength(1);
    expect(played.refused[0]).toMatchObject({ index: 1, refusal: { code: 'not-now' } });
    expect(membersOf(h.state().handles)).toEqual(['lbianchi', 'mrossi']);

    const posted = await playScenario([{ ...steps[0], refused: 'not-now' }], host().io);
    expect(posted.failed?.why).toMatch(/expected to be refused/);
    const other = await playScenario([steps[0], { ...refusedStep, refused: 'law' }], host().io);
    expect(other.failed?.why).toMatch(/with not-now/);
  });

  it('posts every step as the writer it is given, in place of its own', async () => {
    // a stranger's comment is refused as it stands, and posted as the one who opens
    const comment: Step = { writer: 'user::zed', gist: 'comment', payload: { text: 'T' } };
    expect((await playScenario([steps[0], comment], host().io)).failed?.refusal?.code).toBe('not-now');
    const h = host();
    const played = await playScenario([steps[0], comment], h.io, { as: 'user::mrossi' });
    expect(played.failed).toBeUndefined();
    expect(h.state().lines.filter((l) => l.gist === 'create' || l.gist === 'comment').map((l) => l.writer)).toEqual(['user::mrossi', 'user::mrossi']);
  });

  it('carries labels on to a later play', async () => {
    const h = host();
    const first = await playScenario(steps.slice(0, 2), h.io);
    const second = await playScenario(steps.slice(2), h.io, { labels: first.labels });
    expect(second.failed).toBeUndefined();
  });
});

describe('saving a scenario from a thread', () => {
  const schema = strict(SIBAR_JSON);

  /** The thread «opinion» leaves, and what `prune` makes of it. */
  async function opinion() {
    const scenario = readScenarios(readFileSync(casePath('sibar-activity', 'scenarios.json'), 'utf8')).find((s) => s.id === 'opinion')!;
    const h = host(schema, sibarPolicy(schema));
    await playScenario(scenario.steps, h.io);
    const { lines, handles } = h.state();
    return { lines, pruned: prune(lines, consequitur(lines, handles, schema), schema) };
  }

  it('leaves out what the engine, a revoke, the world or a goal will bring back, and keeps the rest open, in reading order', async () => {
    const { lines, pruned } = await opinion();
    const why = new Map(pruned.left.map((l) => [l.line.id, l.why] as const));
    const records = Object.values(schema.records);
    for (const line of lines) {
      if (line.writer.startsWith('goal::') || records.includes(line.gist)) expect(why.get(line.id), line.gist).toBe('engine');
    }
    expect(pruned.left.filter((l) => l.why === 'outside').map((l) => l.line.gist)).toEqual(['doc_created', 'doc_signed', 'doc_signed']);
    expect(pruned.left.filter((l) => l.why === 'revoked').map((l) => l.line.gist)).toEqual(['doc_ref', 'doc_ref_revoke']);
    expect(pruned.left.filter((l) => l.why === 'found').map((l) => [l.line.gist, l.line.writer])).toEqual([['got_it', 'user::gverdi']]);
    expect(pruned.open.map((l) => l.gist)).toEqual(['create', 'memo', 'doc_ref', 'doc_ref', 'set_goal', 'set_goal', 'set_goal', 'comment']);
    // every line is in one list or the other, and each list is in reading order
    expect(pruned.open.length + pruned.left.length).toBe(lines.length);
    expect(pruned.left.map((l) => l.line.id)).toEqual(inOrder(pruned.left.map((l) => l.line)).map((l) => l.id));
  });

  it('makes steps of the lines kept, with the id of an earlier kept line a $line, and goal:: and it a $goal, labelled by position', async () => {
    const { lines, pruned } = await opinion();
    const steps = stepsOf(pruned.open, lines);
    expect(steps.map((s) => s.gist)).toEqual(pruned.open.map((l) => l.gist));
    expect(steps.map((s) => s.label)).toEqual([undefined, '2', undefined, undefined, '5', undefined, undefined, undefined]);
    expect(steps[2].payload).toMatchObject({ about: { $line: '2' } });
    expect(steps[6].payload).toMatchObject({ checks: [{ gist: 'memo', writer: { $goal: '5' } }, { gist: 'got_it', writer: 'user::gverdi' }] });
    // and the steps are the lines' words, nothing the thread added
    expect(steps.every((s) => s.confirmed === undefined && s.refused === undefined)).toBe(true);
  });

  it('makes a $find of the line a kept line named and was not kept, the check holding its gist and its payload, or its gist alone', async () => {
    const { lines, pruned } = await opinion();
    const memo = pruned.open.find((l) => l.gist === 'memo')!;
    const steps = stepsOf(pruned.open.filter((l) => l !== memo), lines);
    expect(steps[1].payload).toMatchObject({ about: { $find: { gist: 'memo', payload: memo.payload } } });

    const plain = line('1', 'x', 'user::a');
    const asking = line('2', 'y', 'user::a', { about: plain.id, list: [plain.id], other: 'z' });
    expect(stepsOf([asking], [plain, asking])[0].payload).toEqual({ about: { $find: { gist: 'x' } }, list: [{ $find: { gist: 'x' } }], other: 'z' });
    // a string that is no line's id is left alone
    expect(stepsOf([asking], [asking])[0].payload).toEqual({ about: plain.id, list: [plain.id], other: 'z' });
  });
});

describe('reading a scenarios file', () => {
  it('reads the cases\' files', () => {
    for (const domain of ['sibar-activity', 'editorial-review']) {
      const scenarios = readScenarios(readFileSync(casePath(domain, 'scenarios.json'), 'utf8'));
      expect(scenarios.length).toBeGreaterThan(0);
      expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    }
  });

  it('says what is wrong with a file that is not one', () => {
    expect(() => readScenarios('{}')).toThrow(/list/);
    expect(() => readScenarios('[{"id":"a","title":"b"}]')).toThrow(/scenario 1/);
    expect(() => readScenarios('[{"id":"a","title":"b","steps":[{"gist":"x"}]}]')).toThrow(/step 1 of "a"/);
  });
});

describe('the SIBAR scenarios', () => {
  const scenarios = new Map(readScenarios(readFileSync(casePath('sibar-activity', 'scenarios.json'), 'utf8')).map((s) => [s.id, s]));

  it('«first»: the memo is confirmed, the signature closes the activity, and the quit before it was allowed', async () => {
    const h = host(undefined, sibarPolicy());
    const played = await playScenario(scenarios.get('first')!.steps, h.io);
    expect(played.failed).toBeUndefined();
    const { handles, lines } = h.state();
    expect(valuesOf(handles)).toMatchObject({ name: 'Richiesta parere', status: 'closed' });
    expect(membersOf(handles)).toEqual(['lbianchi', 'mrossi']);
    expect(lines.filter((l) => l.gist === 'closed').map((l) => l.writer.split('::')[0])).toEqual(['goal']);
  });

  it('«opinion»: two goals, one warned, a final wrapper that closes the activity for good', async () => {
    const h = host(undefined, sibarPolicy());
    const played = await playScenario(scenarios.get('opinion')!.steps, h.io);
    expect(played.failed).toBeUndefined();
    const { handles, lines } = h.state();
    expect(valuesOf(handles)).toMatchObject({ name: 'Parere sul contratto arredi', status: 'closed', documents: ['34132412', '34133265'] });
    expect(membersOf(handles)).toEqual(['gverdi', 'lbianchi', 'mrossi']);
    const closed = lines.find((l) => l.gist === 'closed');
    expect(closed && lockedBy(closed, lines)).toBe(played.labels.get('wrapper'));
    // the goal «Verbale» was warned when its document was unlinked
    expect(lines.some((l) => l.gist === 'goal_warning')).toBe(true);
    expect(lines.some((l) => l.gist === 'memo' && l.writer.startsWith('goal::'))).toBe(true);
  });
});

describe('the offers and admission, at every state the scenarios pass through', () => {
  /** The refusals that say a writer may not write a gist now, or not on that line: the menu's own questions. */
  const MENU: Array<Refusal['code']> = ['not-now', 'writer-not-allowed', 'unknown-line', 'not-revocable'];

  it('agree: an offer is never refused for the moment, the writer or the line, and what is not offered is refused', async () => {
    let states = 0;
    let offered = 0;
    for (const domain of ['sibar-activity', 'editorial-review']) {
      const schema = strict(JSON.parse(readFileSync(casePath(domain, 'schema.json'), 'utf8')));
      const policy = domain === 'sibar-activity' ? sibarPolicy(schema) : [];
      for (const scenario of readScenarios(readFileSync(casePath(domain, 'scenarios.json'), 'utf8'))) {
        const writers = [...new Set<Writer>(scenario.steps.map((s) => s.writer))];
        const h = host(schema, policy);
        const check = async (state: ThreadState): Promise<void> => {
          states++;
          for (const writer of writers) {
            const menu = offers(state.lines, writer, schema);
            for (const gist of schema.gists) {
              const offer = menu.find((o) => o.gist === gist.gist);
              const revoking = gist.rules.find((r) => r.rule === 'revoke');
              // a revoking gist is asked of every line of a gist it lists, in force or not
              const lines = revoking ? state.lines.filter((l) => (revoking.gists as string[]).includes(l.gist)).map((l) => l.id) : [];
              for (const target of lines.length > 0 ? lines : [undefined]) {
                const draft: LineDraft = { gist: gist.gist, writer, payload: revoking && target !== undefined ? { [revoking.from as string]: target } : {} };
                const named = `${domain} ${scenario.id}, ${writer} ${gist.gist}${target ? ` of ${target.slice(0, 8)}` : ''}`;
                const isOffered = offer !== undefined && (!revoking || (target !== undefined && offer.targets?.includes(target) === true));
                const refusal = admit(state.lines, draft, schema);
                if (isOffered) {
                  offered++;
                  expect(MENU, `offered and refused: ${named}`).not.toContain(refusal?.code);
                } else if (refusal === undefined) {
                  // admitted though not offered: only the opening rule, which the dry run reads, may refuse it
                  expect((await dryRun(state, draft, schema, NOW, { policy })).refusal?.code, `not offered and admitted: ${named}`).toBe('unreconcilable');
                }
              }
            }
          }
        };
        await check(h.state());
        const played = await playScenario(scenario.steps, h.io, { after: () => check(h.state()) });
        expect(played.failed, `${domain} ${scenario.id}`).toBeUndefined();
      }
    }
    expect(states).toBeGreaterThan(40);
    expect(offered).toBeGreaterThan(100);
  });
});

describe('the warehouse arrival', () => {
  const schema = strict(JSON.parse(readFileSync(casePath('warehouse-arrival', 'schema.json'), 'utf8')));
  const scenarios = new Map(readScenarios(readFileSync(casePath('warehouse-arrival', 'scenarios.json'), 'utf8')).map((s) => [s.id, s]));
  const MROSSI: Writer = 'user::mrossi';

  /** «Tuesday» played to its end, and what `prune` makes of it. */
  async function tuesday() {
    const h = host(schema);
    const played = await playScenario(scenarios.get('tuesday')!.steps, h.io);
    expect(played.failed).toBeUndefined();
    const { lines, handles } = h.state();
    return { lines, handles, played, pruned: prune(lines, consequitur(lines, handles, schema), schema) };
  }

  /**
   * What a person would keep of «Tuesday»: the open lines, but the comment, the memo written by hand and the
   * sorting, which the goal the person adds in its place waits for.
   */
  const kept = (open: EventLine[]) => open.filter((l) => !['comment', 'done'].includes(l.gist) && !(l.gist === 'memo' && l.payload.text === 'Put on shelves, aisle 4'));

  it('«Tuesday»: the goals write the notice, the memo to sorting and the closing; the team grows with the memos', async () => {
    const { lines, handles, played } = await tuesday();
    expect(valuesOf(handles)).toEqual({ name: 'Arrivo Ferrari · DDT 4471', steps: ['unload', 'sort', 'shelve'], status: 'closed' });
    expect(handles.set).toEqual({ team: ['cneri', 'gverdi', 'lbianchi', 'mrossi'] });
    const goalLines = lines.filter((l) => l.writer.startsWith('goal::'));
    expect(goalLines.map((l) => l.gist)).toEqual(['notice', 'memo', 'closed']);
    expect(goalLines.find((l) => l.gist === 'notice')?.writer).toBe(`goal::${played.labels.get('registered')}`);
    // the goal set by mistake never fired, and the last goal closed the activity for good
    expect(goalLines.find((l) => l.gist === 'closed')).toBeDefined();
    expect(lockedBy(goalLines.find((l) => l.gist === 'closed')!, lines)).toBeDefined();
  });

  it('prune says why each line of «Tuesday» is left out, and leaves open the plan, the comment, the work nobody awaits and the memo written by hand', async () => {
    const { lines, pruned } = await tuesday();
    const why = new Map(pruned.left.map((l) => [l.line.id, l.why] as const));
    expect(inOrder(lines).map((l) => [l.gist, why.get(l.id) ?? 'open'])).toEqual([
      ['open', 'open'],
      ['metadata_set', 'engine'],
      ['assigned', 'engine'],
      ['assigned', 'engine'],
      ['memo', 'open'],
      ['set_goal', 'open'],
      ['set_goal', 'open'],
      ['set_goal', 'open'],
      ['set_goal', 'revoked'],
      ['set_goal_revoke', 'revoked'],
      ['arrival_scanned', 'outside'],
      ['notice', 'engine'],
      ['comment', 'open'],
      ['done', 'found'],
      ['memo', 'engine'],
      ['metadata_set', 'engine'],
      ['assigned', 'engine'],
      ['done', 'open'],
      ['metadata_set', 'engine'],
      ['memo', 'open'],
      ['assigned', 'engine'],
      ['done', 'found'],
      ['closed', 'engine'],
      ['metadata_set', 'engine'],
      ['metadata_set', 'engine'],
    ]);
    expect(pruned.open.map((l) => [l.gist, l.writer])).toEqual([
      ['open', MROSSI],
      ['memo', MROSSI],
      ['set_goal', MROSSI],
      ['set_goal', MROSSI],
      ['set_goal', MROSSI],
      ['comment', 'user::lbianchi'],
      ['done', 'user::gverdi'],
      ['memo', MROSSI],
    ]);
  });

  it('stepsOf the lines a person keeps gives the steps of «Saved», but the goal the person added', async () => {
    const { lines, pruned } = await tuesday();
    const saved = scenarios.get('saved')!.steps;
    const steps = stepsOf(kept(pruned.open), lines);
    expect(saved.at(-1)).toMatchObject({ gist: 'set_goal', payload: { name: 'to_shelves' } });
    expect(steps).toEqual(saved.slice(0, -1));
  });

  it('«Saved» played as the manager, with the lines of «Tuesday» that were awaited fed in, ends where «Tuesday» ended', async () => {
    const source = await tuesday();
    const h = host(schema);
    const played = await playScenario(scenarios.get('saved')!.steps, h.io, { as: MROSSI });
    expect(played.failed).toBeUndefined();

    // what the scenario awaits: the world's lines, a goal's finds, and the work the goal the person added waits for
    const added = scenarios.get('saved')!.steps.at(-1)!.payload.checks as Check[];
    const awaited = inOrder(source.lines).filter((l) => {
      const why = source.pruned.left.find((left) => left.line.id === l.id)?.why;
      return why === 'found' || why === 'outside' || (why === undefined && added.some((check) => matches(check, l)));
    });
    expect(awaited.map((l) => l.gist)).toEqual(['arrival_scanned', 'done', 'done', 'done']);
    for (const line of awaited) {
      const sent = await h.io.send({ gist: line.gist, writer: line.writer, payload: line.payload }, false);
      expect(sent, `${line.gist} by ${line.writer}`).toBeUndefined();
    }
    expect(diff(source.handles, h.state().handles, schema.kit)).toEqual([]);
  });
});
