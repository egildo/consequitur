// The shared resolver of `scenario.ts`, and the SIBAR scenarios it plays: the stories of the
// first case, as the playground's two examples have always told them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { admit, conditionHolds, consequitur, diff, draftOf, dryRun, emptyState, holed, inOrder, lockedBy, matches, offers, playScenario, post, prune, readPolicy, readScenarios, resolve, stepsOf, type Check, type EventLine, type Io, type LineDraft, type Policy, type Refusal, type Schema, type Seal, type Step, type ThreadState, type Writer } from '../src/index.ts';
import { replayed } from '../src/scenario.ts';
import { strict, SIBAR_JSON, membersOf, valuesOf } from './helpers.ts';

const NOW = '2026-10-03T10:00:00.000Z';
const casePath = (...parts: string[]) => join(import.meta.dirname, '..', '..', '..', 'cases', ...parts);

/** A thread of a schema, posted to as a scenario's host would. */
function host(schema = strict(SIBAR_JSON), policy: Policy = []) {
  let state: ThreadState = emptyState(schema);
  const io: Io = {
    lines: () => state.lines,
    async send(draft: LineDraft, confirmed: boolean, opening?: { nonce?: string; from?: Seal[] }): Promise<Refusal | undefined> {
      const out = await post(state, draft, schema, NOW, { confirmed, policy, nonce: opening?.nonce, from: opening?.from });
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

const line = (id: string, gist: string, writer: EventLine['writer'], payload: EventLine['payload'] = {}): EventLine => ({ id, previous: id === '1' ? null : String(Number(id) - 1), gist, writer, timestamp: `2026-10-03T10:00:0${id}.000Z`, payload });

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

  it('leaves what is not a placeholder alone, an object with more keys than one and a reference included', () => {
    expect(resolve({ a: 1, b: null, c: { $line: 'first', other: 1 } }, lines, labels)).toEqual({ a: 1, b: null, c: { $line: 'first', other: 1 } });
    const references = { v: { $value: 'version' }, s: { $set: 'team' }, w: { $writer: 'id' }, d: { $draft: 'x' } };
    expect(resolve(references, lines, labels)).toEqual(references);
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

  it('hands the nonce it is given to every post, so a scenario played twice gives the same ids', async () => {
    const play = async (nonce?: string) => {
      const h = host();
      await playScenario(steps, h.io, nonce === undefined ? {} : { nonce });
      return h.state().lines.map((l) => l.id);
    };
    const nonce = 'ab'.repeat(16);
    expect(await play(nonce)).toEqual(await play(nonce));
    expect((await play())[0]).not.toBe((await play())[0]);
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
    const leftIds = new Set(pruned.left.map((l) => l.line.id));
    expect(pruned.left.map((l) => l.line.id)).toEqual(inOrder(lines).filter((l) => leftIds.has(l.id)).map((l) => l.id));
  });

  it('makes steps of the lines kept, with the id of an earlier kept line a $line, and goal:: and it a $goal, labelled by position', async () => {
    const { lines, pruned } = await opinion();
    const steps = stepsOf(pruned.open, lines);
    expect(steps.map((s) => s.gist)).toEqual(pruned.open.map((l) => l.gist));
    expect(steps.map((s) => s.label)).toEqual([undefined, '2', undefined, undefined, '5', undefined, undefined, undefined]);
    expect(steps[2].payload).toMatchObject({ about: { $line: '2' } });
    expect(steps[6].payload).toMatchObject({ when: { all: [{ line: { gist: 'memo', writer: { $goal: '5' } } }, { line: { gist: 'got_it', writer: 'user::gverdi' } }] } });
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
    expect(stepsOf([asking], [{ ...asking, previous: null }])[0].payload).toEqual({ about: plain.id, list: [plain.id], other: 'z' });
  });
});

describe('holing a scenario', () => {
  const steps: Step[] = [
    { writer: 'user::mrossi', gist: 'open', payload: { name: 'A', team: ['mrossi', 'lbianchi'], unloader: 'lbianchi' } },
    { label: 'g', writer: 'user::mrossi', gist: 'set_goal', payload: { name: 'g', when: { line: { gist: 'done', payload: { step: 'unload', by: 'lbianchi' } } }, then: 'memo', with: { assignTo: 'gverdi', lines: [{ $line: 'g' }] } } },
  ];

  it('replaces each payload value equal to a given one by a reference to its key, wherever a value stands, and one value in several lines is one hole', () => {
    const out = holed(steps, { unloader: 'lbianchi', sorter: 'gverdi' });
    expect(out[0].payload).toEqual({ name: 'A', team: ['mrossi', { $value: 'unloader' }], unloader: { $value: 'unloader' } });
    expect(out[1].payload).toEqual({
      name: 'g',
      when: { line: { gist: 'done', payload: { step: 'unload', by: { $value: 'unloader' } } } },
      then: 'memo',
      with: { assignTo: { $value: 'sorter' }, lines: [{ $line: 'g' }] },
    });
  });

  it('compares values as JSON, a list or an object included, and leaves the steps, the writers, the gists and the labels as they are', () => {
    const [step] = holed([{ label: 'x', writer: 'user::a', gist: 'g', payload: { list: [1, 2], object: { b: 1, a: 2 }, other: [2, 1] } }], { pair: [1, 2], both: { a: 2, b: 1 } });
    expect(step).toEqual({ label: 'x', writer: 'user::a', gist: 'g', payload: { list: { $value: 'pair' }, object: { $value: 'both' }, other: [2, 1] } });
    expect(holed(steps, { n: 'user::mrossi', m: 'open' })).toEqual(steps);
  });

  it('leaves a placeholder and a reference alone, and gives a value two holes share to the first', () => {
    const [step] = holed([{ writer: 'user::a', gist: 'g', payload: { a: { $line: 'x' }, b: { $value: 'k' }, c: 'v' } }], { first: 'v', second: 'v', x: 'x', k: 'k' });
    expect(step.payload).toEqual({ a: { $line: 'x' }, b: { $value: 'k' }, c: { $value: 'first' } });
  });

  it('does not change the steps it is given, and gives the same steps for no holes', () => {
    const copy = JSON.parse(JSON.stringify(steps)) as Step[];
    holed(steps, { unloader: 'lbianchi' });
    expect(steps).toEqual(copy);
    expect(holed(steps, {})).toEqual(steps);
  });
});

describe('reading a scenarios file', () => {
  it('reads the cases\' files', () => {
    for (const domain of ['sibar-activity', 'editorial-review', 'release']) {
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

  it('agree: an offer is never refused for the writer or the line, nor for the moment but as late, and what is not offered is refused', async () => {
    let states = 0;
    let offered = 0;
    let late = 0;
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
                const named = `${domain} ${scenario.id}, ${writer} ${gist.gist}${target ? ` of ${target.split(':')[1].slice(0, 8)}` : ''}`;
                const isOffered = offer !== undefined && (!revoking || (target !== undefined && offer.targets?.includes(target) === true));
                const refusal = admit(state.lines, draft, schema, NOW);
                if (isOffered) {
                  offered++;
                  // the menu has no instant, so it offers what admission may refuse as late: a `when` that reads `$now`
                  if (refusal?.code === 'not-now' && JSON.stringify(gist.when).includes('"$now"')) late++;
                  else expect(MENU, `offered and refused: ${named}`).not.toContain(refusal?.code);
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
    // the editorial «late»: a new version, offered after the deadline, is refused
    expect(late).toBeGreaterThan(0);
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
    expect(valuesOf(handles)).toEqual({ name: 'Arrivo Ferrari · DDT 4471', announced: '2026-10-05', pallets: 12, arrived: '2026-10-06', counted: 12, steps: ['unload', 'sort', 'shelve'], status: 'closed' });
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
      ['metadata_set', 'engine'],
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
      ['metadata_set', 'engine'],
      ['metadata_set', 'engine'],
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

  /** The values a person says must be supplied each time: the supplier's reference, the unloader and the sorter. */
  const HOLES = { ddt: 4471, unloader: 'lbianchi', sorter: 'gverdi' };

  it('stepsOf the lines a person keeps, with the three values holed, gives the steps of «Saved», but the goal the person added and the fills', async () => {
    const { lines, pruned } = await tuesday();
    const saved = scenarios.get('saved')!.steps;
    const steps = stepsOf(kept(pruned.open), lines);
    const plan = saved.filter((s) => s.gist !== 'fill' && s.payload.name !== 'to_shelves');
    expect(saved.find((s) => s.payload.name === 'to_shelves')).toMatchObject({ gist: 'set_goal' });
    // as the lines say it, the values are in the steps; holed, they are references, one hole for a value in several lines
    expect(steps).not.toEqual(plan);
    expect(holed(steps, HOLES)).toEqual(plan);
    expect(JSON.stringify(plan).match(/"\$value":"unloader"/g)).toHaveLength(2);
  });

  it('«Saved» ends with the three fills, each the value that was there before it was holed', () => {
    const fills = scenarios.get('saved')!.steps.filter((s) => s.gist === 'fill');
    expect(Object.fromEntries(fills.map((s) => [s.payload.key, s.payload.value]))).toEqual(HOLES);
    expect(scenarios.get('saved')!.steps.slice(-3)).toEqual(fills);
  });

  it('«Saved» played as the manager opens with three holes, and the fills close them: the thread stays settled and the unloader joins the team', async () => {
    const saved = scenarios.get('saved')!.steps;
    const at = saved.findIndex((s) => s.gist === 'fill');
    const h = host(schema);
    const first = await playScenario(saved.slice(0, at), h.io, { as: MROSSI });
    expect(first.failed).toBeUndefined();
    const before = consequitur(h.state().lines, h.state().handles, schema);
    expect(before.holes.map((hole) => hole.key)).toEqual(['ddt', 'sorter', 'unloader']);
    expect(before.settled).toBe(true);
    // unloader is a hole: lbianchi is not on the team, and may not say he unloaded
    expect(membersOf(h.state().handles, 'team')).toEqual(['mrossi']);
    expect(admit(h.state().lines, { gist: 'done', writer: 'user::lbianchi', payload: { step: 'unload' } }, schema)?.code).toBe('not-now');

    const second = await playScenario(saved.slice(at), h.io, { as: MROSSI, labels: first.labels });
    expect(second.failed).toBeUndefined();
    const after = consequitur(h.state().lines, h.state().handles, schema);
    expect(after.holes).toEqual([]);
    expect(after.settled).toBe(true);
    expect(valuesOf(h.state().handles)).toMatchObject(HOLES);
    expect(h.state().handles.set).toEqual({ team: ['lbianchi', 'mrossi'] });
    expect(admit(h.state().lines, { gist: 'done', writer: 'user::lbianchi', payload: { step: 'unload' } }, schema)).toBeUndefined();
  });

  it('«Saved» played as the manager, filled, with the lines of «Tuesday» that were awaited fed in, ends where «Tuesday» ended but for the three keys of its holes', async () => {
    const source = await tuesday();
    const h = host(schema);
    const played = await playScenario(scenarios.get('saved')!.steps, h.io, { as: MROSSI });
    expect(played.failed).toBeUndefined();

    // what the scenario awaits: the world's lines, a goal's finds, and the work the goal the person added waits for
    const added = [(scenarios.get('saved')!.steps.find((s) => s.payload.name === 'to_shelves')!.payload.when as unknown as { line: Check }).line];
    const awaited = inOrder(source.lines).filter((l) => {
      const why = source.pruned.left.find((left) => left.line.id === l.id)?.why;
      return why === 'found' || why === 'outside' || (why === undefined && added.some((check) => matches(check, l)));
    });
    expect(awaited.map((l) => l.gist)).toEqual(['arrival_scanned', 'done', 'done', 'done']);
    for (const line of awaited) {
      const sent = await h.io.send({ gist: line.gist, writer: line.writer, payload: line.payload }, false);
      expect(sent, `${line.gist} by ${line.writer}`).toBeUndefined();
    }
    // the fills put their keys in the value handle, where «Tuesday» never had them; nothing else differs
    expect(diff(source.handles, h.state().handles, schema.kit)).toEqual([
      { kind: 'value', key: 'ddt', after: 4471 },
      { kind: 'value', key: 'sorter', after: 'gverdi' },
      { kind: 'value', key: 'unloader', after: 'lbianchi' },
    ]);
  });

  it('«Tuesday» came a day after it was announced, with every pallet: neither the guard late nor short holds', async () => {
    const { lines, handles } = await tuesday();
    const scope = { handles, lines, guards: schema.guards };
    expect(valuesOf(handles)).toMatchObject({ announced: '2026-10-05', arrived: '2026-10-06', pallets: 12, counted: 12 });
    expect(conditionHolds({ guard: 'late' }, scope)).toBe(false);
    expect(conditionHolds({ guard: 'short' }, scope)).toBe(false);
  });

  it('«Late and short»: three days after it was announced and two pallets short, the goal on late writes the notice and the one on short the memo', async () => {
    const h = host(schema);
    const played = await playScenario(scenarios.get('late-and-short')!.steps, h.io);
    expect(played.failed).toBeUndefined();
    const { lines, handles } = h.state();
    expect(valuesOf(handles)).toMatchObject({ announced: '2026-10-05', arrived: '2026-10-08', pallets: 12, counted: 10 });
    const written = lines.filter((l) => l.writer.startsWith('goal::'));
    expect(written.map((l) => [l.gist, l.writer])).toEqual([
      ['notice', `goal::${played.labels.get('late')}`],
      ['memo', `goal::${played.labels.get('short')}`],
    ]);
    expect(consequitur(lines, handles, schema).settled).toBe(true);
  });

  it('«Late and short», two days after and with every pallet: strict both ways, no goal fires', async () => {
    const steps = scenarios.get('late-and-short')!.steps;
    const h = host(schema);
    const onTime = steps.map((s) => (s.gist === 'arrival_scanned' ? { ...s, payload: { ...s.payload, date: '2026-10-07', pallets: 12 } } : s));
    expect((await playScenario(onTime, h.io)).failed).toBeUndefined();
    expect(h.state().lines.filter((l) => l.writer.startsWith('goal::'))).toEqual([]);
  });

  it('«Second assignee»: a memo names one assignee and leaves a second, a goal waits on it, and a fill by a member of the team names it and the goal fires', async () => {
    const steps = scenarios.get('second-assignee')!.steps;
    const h = host(schema);
    const first = await playScenario(steps.slice(0, -1), h.io);
    expect(first.failed).toBeUndefined();
    const { lines, handles } = h.state();
    expect(handles.set).toEqual({ team: ['lbianchi', 'mrossi'] });
    const memo = lines.find((l) => l.gist === 'memo')!;
    // the memo carries the hole, and the goal waits for it
    const goal = lines.find((l) => l.gist === 'set_goal')!;
    expect(consequitur(lines, handles, schema)).toMatchObject({ holes: [{ key: 'legal', lines: [memo.id, goal.id] }], settled: true });
    expect(lines.some((l) => l.gist === 'notice')).toBe(false);

    const second = await playScenario(steps.slice(-1), h.io, { labels: first.labels });
    expect(second.failed).toBeUndefined();
    const after = h.state();
    expect(after.handles.set).toEqual({ team: ['cneri', 'lbianchi', 'mrossi'] });
    expect(valuesOf(after.handles)).toMatchObject({ legal: 'cneri' });
    expect(after.lines.filter((l) => l.gist === 'notice').map((l) => l.writer.startsWith('goal::'))).toEqual([true]);
    expect(consequitur(after.lines, after.handles, schema)).toMatchObject({ holes: [], settled: true });
    // the memo itself still holds its reference
    expect(after.lines.find((l) => l.id === memo.id)?.payload).toEqual({ assignTo: ['lbianchi', { $value: 'legal' }], text: 'Check the contract with legal' });
  });
});

describe('replaying a thread', () => {
  const schema = strict(JSON.parse(readFileSync(casePath('warehouse-arrival', 'schema.json'), 'utf8')));
  const scenarios = new Map(readScenarios(readFileSync(casePath('warehouse-arrival', 'scenarios.json'), 'utf8')).map((s) => [s.id, s]));
  const records = Object.values(schema.records);
  /** The lines the engine writes again: a goal's, and a record. */
  const engine = (line: EventLine) => line.writer.startsWith('goal::') || records.includes(line.gist);

  /** «Tuesday» played to its end. */
  async function tuesday() {
    const h = host(schema);
    const played = await playScenario(scenarios.get('tuesday')!.steps, h.io);
    expect(played.failed).toBeUndefined();
    const { lines, handles } = h.state();
    return { lines, handles, played };
  }

  it('replayed «Tuesday» leaves out exactly the engine\'s lines and takes every other line in reading order', async () => {
    const { lines, handles } = await tuesday();
    const kept = replayed(lines, schema);
    expect(kept).toEqual(inOrder(lines, schema).filter((line) => !engine(line)));
    expect(kept.length).toBe(lines.length - lines.filter(engine).length);
    expect(kept.map((l) => l.gist)).toEqual(['open', 'memo', 'set_goal', 'set_goal', 'set_goal', 'set_goal', 'set_goal_revoke', 'arrival_scanned', 'comment', 'done', 'done', 'memo', 'done']);
    // what prune leaves out for a template comes over: the revoked set_goal and its revoke, the world's line and the goals' finds
    const pruned = prune(lines, consequitur(lines, handles, schema), schema);
    const keptIds = new Set(kept.map((l) => l.id));
    for (const { line, why } of pruned.left.filter((l) => l.why !== 'engine')) expect(keptIds.has(line.id), `${why} ${line.gist}`).toBe(true);
    expect(pruned.left.filter((l) => l.why === 'revoked').map((l) => l.line.gist)).toEqual(['set_goal', 'set_goal_revoke']);
    expect(pruned.left.filter((l) => l.why === 'found').map((l) => l.line.gist)).toEqual(['done', 'done']);
    expect(kept.filter((l) => l.gist === 'arrival_scanned').map((l) => l.writer)).toEqual(['system::dock']);
  });

  it('replayed refuses a thread that is not one chain', async () => {
    const { lines } = await tuesday();
    const second = inOrder(lines)[1];
    expect(() => replayed(lines.filter((l) => l.id !== second.id), schema)).toThrow(/gap|cut/);
  });

  it('replayed refuses a thread read against another schema', async () => {
    const { lines } = await tuesday();
    expect(() => replayed(lines, strict(SIBAR_JSON))).toThrow(/declared for the schema/);
  });

  it('stepsOf with a prefix puts it in front of every label, and of every $line and $goal the steps point at', async () => {
    const { lines } = await tuesday();
    const kept = replayed(lines, schema);
    const plain = stepsOf(kept, lines);
    const prefixed = stepsOf(kept, lines, '1:');
    const labels = (steps: Step[]) => steps.flatMap((step) => (step.label === undefined ? [] : [step.label]));
    expect(labels(plain).length).toBeGreaterThan(0);
    expect(labels(prefixed)).toEqual(labels(plain).map((label) => `1:${label}`));
    const points = JSON.stringify(prefixed).match(/"\$(?:line|goal)":"[^"]*"/g) ?? [];
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) expect(point).toMatch(/:"1:/);
    expect(labels(prefixed).filter((label) => labels(stepsOf(kept, lines, '2:')).includes(label))).toEqual([]);
  });

  it('stepsOf with no prefix gives the same steps as with the empty prefix', async () => {
    const { lines } = await tuesday();
    const kept = replayed(lines, schema);
    expect(stepsOf(kept, lines)).toEqual(stepsOf(kept, lines, ''));
  });

  it('the steps of a replay of «Tuesday», played into an empty thread, post nothing refused and end with the handles of «Tuesday»', async () => {
    const { lines, handles } = await tuesday();
    const h = host(schema);
    const played = await playScenario(stepsOf(replayed(lines, schema), lines), h.io);
    expect(played.failed).toBeUndefined();
    expect(h.state().handles).toEqual(handles);
  });

  it('playScenario hands its nonce and its from to every send, as the opening of the thread', async () => {
    const h = host(undefined, sibarPolicy());
    const openings: Array<{ nonce?: string; from?: Seal[] } | undefined> = [];
    const io: Io = {
      lines: () => h.io.lines(),
      send(draft, confirmed, opening) {
        openings.push(opening);
        return h.io.send(draft, confirmed, opening);
      },
    };
    const nonce = '00'.repeat(16);
    const from: Seal[] = [{ first: 'a', last: 'b' }];
    const first = readScenarios(readFileSync(casePath('sibar-activity', 'scenarios.json'), 'utf8')).find((s) => s.id === 'first')!;
    const played = await playScenario(first.steps.slice(0, 3), io, { nonce, from });
    expect(played.failed).toBeUndefined();
    expect(openings).toHaveLength(3);
    for (const opening of openings) expect(opening).toEqual({ nonce, from });
  });
});
