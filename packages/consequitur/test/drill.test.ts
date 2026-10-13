// The drill of a consolidation: the replay walked into the new thread one step at a time, stopped at a schema
// conflict or at a step it cannot play, and answered by a choice. The cases are read from their own files, and
// the sources are played as test/consolidate.test.ts plays them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consolidate, type Consolidation, type Source } from '../src/consolidate.ts';
import { startDrill, stepDrill, type Choice, type Drill, type Stop } from '../src/drill.ts';
import { playScenario, readScenarios, type Io, type Step } from '../src/scenario.ts';
import { consequitur, emptyState, inOrder, post, readPolicy, verify, type LineDraft, type Policy, type Refusal, type Schema, type Seal, type ThreadState } from '../src/index.ts';
import { strict } from './helpers.ts';

const NOW = '2026-10-13T10:00:00.000Z';
const NONCE = '00'.repeat(16);
// a second source gets its own nonce, so it is not the first one again
const NONCE_SECOND = '11'.repeat(16);
// the drill's own nonce: the new thread's first line declares it
const NONCE_DRILL = 'aa'.repeat(16);
const casePath = (...parts: string[]) => join(import.meta.dirname, '..', '..', '..', 'cases', ...parts);

const WAREHOUSE = strict(JSON.parse(readFileSync(casePath('warehouse-arrival', 'schema.json'), 'utf8')));
const SIBAR = strict(JSON.parse(readFileSync(casePath('sibar-activity', 'schema.json'), 'utf8')));
const EDITORIAL = strict(JSON.parse(readFileSync(casePath('editorial-review', 'schema.json'), 'utf8')));

/** The steps of one scenario of a case. */
function scenario(domain: string, id: string): Step[] {
  const found = readScenarios(readFileSync(casePath(domain, 'scenarios.json'), 'utf8')).find((s) => s.id === id);
  if (found === undefined) throw new Error(`No scenario ${id} in ${domain}.`);
  return found.steps;
}

/** SIBAR's policy, read against its schema; a problem fails the test. */
function sibarPolicy(): Policy {
  const { policy, problems } = readPolicy(JSON.parse(readFileSync(casePath('sibar-activity', 'policy.json'), 'utf8')), SIBAR);
  expect(problems).toEqual([]);
  return policy;
}

/** A thread of a schema, posted to as a scenario's host would: its first line is declared with the nonce given. */
function host(schema: Schema, policy: Policy = []) {
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

/** A thread played to the end of its scenario, with the nonce given. */
async function finished(steps: Step[], schema: Schema, policy: Policy = [], nonce = NONCE): Promise<ThreadState> {
  const h = host(schema, policy);
  const played = await playScenario(steps, h.io, { nonce });
  expect(played.failed).toBeUndefined();
  return h.state();
}

const sourceOf = (thread: ThreadState, schema: Schema): Source => ({ lines: thread.lines, schema });

/** The warehouse's two sources, «Tuesday» and «Saved», and the consolidation of them. */
async function warehouse(): Promise<{ tuesday: ThreadState; saved: ThreadState; c: Consolidation }> {
  const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
  const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
  return { tuesday, saved, c: consolidate(sourceOf(tuesday, WAREHOUSE), sourceOf(saved, WAREHOUSE)) };
}

/** SIBAR's «first» and the editorial «published»: two schemas, eleven schema conflicts, the last three laws only one has. */
async function crossDomain(): Promise<Consolidation> {
  const first = await finished(scenario('sibar-activity', 'first'), SIBAR, sibarPolicy());
  const published = await finished(scenario('editorial-review', 'published'), EDITORIAL, [], NONCE_SECOND);
  return consolidate(sourceOf(first, SIBAR), sourceOf(published, EDITORIAL));
}

/** The new thread of a drill that has a schema. */
function threadOf(drill: Drill): ThreadState {
  if (drill.state === undefined) throw new Error('The drill has no thread yet.');
  return drill.state;
}

/** The schema of a drill that has one. */
function schemaOf(drill: Drill): Schema {
  if (drill.schema === undefined) throw new Error('The drill has no schema yet.');
  return drill.schema;
}

/** The stop a drill waits at. */
function stopOf(drill: Drill): Stop {
  if (drill.stop === undefined) throw new Error('The drill is not waiting at a stop.');
  return drill.stop;
}

/** The drill's fields as text, for a test that the drill is unchanged. */
const snapshot = (drill: Drill): string => JSON.stringify({ ...drill, labels: [...drill.labels] });

/**
 * Calls stepDrill until the drill is over or a stop appears. At a stop, `answer`, when given, is the choice and the
 * walk goes on; without one the walk ends at the stop. A walk that does not end fails the test.
 */
async function run(drill: Drill, answer?: Choice): Promise<Drill> {
  let d = drill;
  for (let calls = 0; calls < 500; calls++) {
    if (d.status !== 'going') return d;
    if (d.stop !== undefined && answer === undefined) return d;
    d = await stepDrill(d, NOW, d.stop === undefined ? undefined : answer);
  }
  throw new Error('The drill did not end.');
}

/** The eleven answers that resolve the conflicts of SIBAR and the editorial case: first, second, a part by hand, and keep for the three laws. */
function schemaAnswers(c: Consolidation): Choice[] {
  return [
    { do: 'first' },
    { do: 'second' },
    { do: 'by-hand', part: c.derived.conflicts[2].second },
    { do: 'first' },
    { do: 'second' },
    { do: 'first' },
    { do: 'second' },
    { do: 'first' },
    { do: 'keep' },
    { do: 'keep' },
    { do: 'keep' },
  ];
}

describe('starting a drill', () => {
  it('startDrill throws when the schemas differ and no name is given', async () => {
    const c = await crossDomain();
    expect(() => startDrill(c)).toThrow('The derived schema needs a name: the sources are read by different schemas.');
  });

  it('startDrill throws when the name is not lower kebab case', async () => {
    const c = await crossDomain();
    expect(() => startDrill(c, { name: 'Both Cases' })).toThrow('name must be in lower kebab case');
  });

  it('startDrill with a valid name does not throw on the cross-domain pair, whose probe answers each conflict as it fits', async () => {
    const c = await crossDomain();
    expect(() => startDrill(c, { name: 'both-cases' })).not.toThrow();
  });

  it('startDrill needs no name when both sources are read by one schema, and begins with an empty thread of it', async () => {
    const { c } = await warehouse();
    const drill = startDrill(c, { nonce: NONCE_DRILL });
    expect(drill.status).toBe('going');
    expect(drill.schema).toBe(WAREHOUSE);
    expect(threadOf(drill).lines).toEqual([]);
    expect(drill.stop).toBeUndefined();
  });

  it('startDrill stops at schema conflict 0 with that conflict, and has no thread and no schema yet', async () => {
    const c = await crossDomain();
    const drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    expect(drill.status).toBe('going');
    expect(drill.stop).toEqual({ at: 'schema', index: 0, conflict: c.derived.conflicts[0], problems: [] });
    expect(drill.state).toBeUndefined();
    expect(drill.schema).toBeUndefined();
    expect(drill.answers).toEqual(c.derived.conflicts.map(() => undefined));
  });

  it('a drill has no key for a name, nonce or policy it was not given, and keeps the ones it was', async () => {
    const { c } = await warehouse();
    const bare = startDrill(c);
    expect(Object.keys(bare)).not.toContain('name');
    expect(Object.keys(bare)).not.toContain('nonce');
    expect(Object.keys(bare)).not.toContain('policy');
    const policy: Policy = [];
    const named = startDrill(c, { nonce: NONCE_DRILL, policy });
    expect(named.nonce).toBe(NONCE_DRILL);
    expect(named.policy).toBe(policy);
  });
});

describe('answering schema conflicts', () => {
  it('first, second, by-hand and keep each record their answer and move the stop to the next conflict, 0 to 10', async () => {
    const c = await crossDomain();
    let drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    const stops: number[] = [];
    for (const answer of schemaAnswers(c)) {
      stops.push(stopOf(drill).index);
      drill = await stepDrill(drill, NOW, answer);
    }
    expect(stops).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(drill.answers).toEqual(['first', 'second', { by: c.derived.conflicts[2].second }, 'first', 'second', 'first', 'second', 'first', 'keep', 'keep', 'keep']);
  });

  it('keep and drop at a law only one source has are recorded and move the stop on, and the schema is derived after the last', async () => {
    const c = await crossDomain();
    let drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    for (let i = 0; i < 8; i++) drill = await stepDrill(drill, NOW, { do: 'first' });
    expect(stopOf(drill)).toMatchObject({ at: 'schema', index: 8, conflict: c.derived.conflicts[8] });
    drill = await stepDrill(drill, NOW, { do: 'keep' });
    expect(stopOf(drill)).toMatchObject({ at: 'schema', index: 9 });
    drill = await stepDrill(drill, NOW, { do: 'drop' });
    expect(stopOf(drill)).toMatchObject({ at: 'schema', index: 10 });
    drill = await stepDrill(drill, NOW, { do: 'keep' });
    expect(drill.stop).toBeUndefined();
    expect(drill.answers.slice(8)).toEqual(['keep', 'drop', 'keep']);
    expect(schemaOf(drill)).toMatchObject({ name: 'both-cases', version: 1 });
  });

  it('first, second and by-hand do not fit a law only one source has, and throw; abort there ends the drill', async () => {
    const c = await crossDomain();
    let drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    for (let i = 0; i < 8; i++) drill = await stepDrill(drill, NOW, { do: 'first' });
    await expect(stepDrill(drill, NOW, { do: 'first' })).rejects.toThrow('where it takes keep, drop or abort: the choice "first" does not fit');
    await expect(stepDrill(drill, NOW, { do: 'second' })).rejects.toThrow('does not fit');
    await expect(stepDrill(drill, NOW, { do: 'by-hand', part: 'x' })).rejects.toThrow('does not fit');
    expect(stopOf(drill)).toMatchObject({ at: 'schema', index: 8 });
    const aborted = await stepDrill(drill, NOW, { do: 'abort' });
    expect(aborted.status).toBe('aborted');
    expect(aborted.stop).toBeUndefined();
  });

  it('keep and drop do not fit a conflict that is not a law only one source has, and throw', async () => {
    const c = await crossDomain();
    const drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    await expect(stepDrill(drill, NOW, { do: 'keep' })).rejects.toThrow('where it takes first, second, by-hand or abort: the choice "keep" does not fit');
    await expect(stepDrill(drill, NOW, { do: 'drop' })).rejects.toThrow('the choice "drop" does not fit');
  });

  it('a by-hand part that does not read stops again at the same index, with problems, and the answer is not kept', async () => {
    const c = await crossDomain();
    let drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    for (const answer of schemaAnswers(c).slice(0, 7)) drill = await stepDrill(drill, NOW, answer);
    expect(stopOf(drill)).toMatchObject({ at: 'schema', index: 7 });

    const again = await stepDrill(drill, NOW, { do: 'by-hand', part: 'not-a-gist' });
    const stop = stopOf(again);
    expect(stop).toMatchObject({ at: 'schema', index: 7 });
    expect(stop.at === 'schema' && stop.problems.length).toBeGreaterThan(0);
    expect(again.answers[7]).toBeUndefined();
    expect(again.schema).toBeUndefined();
    expect(again.state).toBeUndefined();
  });

  it('a by-hand part that does not read is refused at its own conflict, not at the last one', async () => {
    const c = await crossDomain();
    const drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    const again = await stepDrill(drill, NOW, { do: 'by-hand', part: 'not-a-gist' });
    expect(stopOf(again)).toMatchObject({ at: 'schema', index: 0 });
    expect(again.answers[0]).toBeUndefined();
  });

  it('after the last answer the schema exists, named as given at version 1, and the state is an empty thread of it', async () => {
    const c = await crossDomain();
    let drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    for (const answer of schemaAnswers(c)) drill = await stepDrill(drill, NOW, answer);
    expect(drill.stop).toBeUndefined();
    expect(drill.status).toBe('going');
    expect(schemaOf(drill)).toMatchObject({ name: 'both-cases', version: 1 });
    expect(threadOf(drill)).toEqual(emptyState(schemaOf(drill)));
  });

  it('abort at a schema stop ends the drill, and a step on the ended drill throws', async () => {
    const c = await crossDomain();
    const aborted = await stepDrill(startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL }), NOW, { do: 'abort' });
    expect(aborted.status).toBe('aborted');
    expect(aborted.stop).toBeUndefined();
    await expect(stepDrill(aborted, NOW, { do: 'first' })).rejects.toThrow('The drill is over.');
    await expect(stepDrill(aborted, NOW)).rejects.toThrow('The drill is over.');
  });

  it('a choice that does not fit a schema stop throws, and a missing choice throws too', async () => {
    const c = await crossDomain();
    const drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL });
    await expect(stepDrill(drill, NOW, { do: 'skip' })).rejects.toThrow('does not fit');
    await expect(stepDrill(drill, NOW, { do: 'again' })).rejects.toThrow('does not fit');
    await expect(stepDrill(drill, NOW)).rejects.toThrow('no choice was given');
  });
});

describe('walking the steps', () => {
  it('a plain walk plays exactly one step per call, so after k calls next is k and the thread has grown', async () => {
    const { c } = await warehouse();
    let drill = startDrill(c, { nonce: NONCE_DRILL });
    let lines = 0;
    for (let k = 1; k <= 5; k++) {
      drill = await stepDrill(drill, NOW);
      expect(drill.next).toBe(k);
      expect(threadOf(drill).lines.length).toBeGreaterThan(lines);
      lines = threadOf(drill).lines.length;
    }
  });

  it('the walk reaches the second source\'s opening, and stops there at a step stop refused as unreconcilable', async () => {
    const { c } = await warehouse();
    let drill = startDrill(c, { nonce: NONCE_DRILL });
    for (let k = 0; k < 13; k++) drill = await stepDrill(drill, NOW);
    const before = threadOf(drill).lines.length;
    drill = await run(drill);
    const stop = stopOf(drill);
    expect(stop).toMatchObject({ at: 'step', index: 13, step: c.steps[13] });
    expect(stop.at === 'step' && stop.refusal?.code).toBe('unreconcilable');
    expect(threadOf(drill).lines.length).toBe(before);
    expect(drill.next).toBe(13);
    expect(drill.status).toBe('going');
  });

  it('skip at that stop moves on: skipped is [13], and the walk ends done with the new thread settled', async () => {
    const { c } = await warehouse();
    const stopped = await run(startDrill(c, { nonce: NONCE_DRILL }));
    const skipped = await stepDrill(stopped, NOW, { do: 'skip' });
    expect(skipped.skipped).toEqual([13]);
    const done = await run(skipped);
    expect(done.status).toBe('done');
    expect(done.stop).toBeUndefined();
    const { lines, handles } = threadOf(done);
    expect(consequitur(lines, handles, schemaOf(done)).settled).toBe(true);
  });

  it('edit replaces the refused opening, plays it at once, and the walk ends done', async () => {
    const { c } = await warehouse();
    const stopped = await run(startDrill(c, { nonce: NONCE_DRILL }));
    const memo: Step = { writer: 'user::mrossi', gist: 'memo', payload: { text: 'Also Saved', assignTo: ['lbianchi'] } };
    const edited = await stepDrill(stopped, NOW, { do: 'edit', step: memo });
    expect(edited.edited).toEqual([13]);
    expect(edited.next).toBe(14);
    expect(edited.stop).toBeUndefined();
    expect(edited.steps[13]).toEqual(memo);
    expect(edited.steps[13].label).toBe(c.steps[13].label);
    const done = await run(edited);
    expect(done.status).toBe('done');
    expect(done.edited).toEqual([13]);
  });

  it('an edit keeps the old step\'s label when the new step has none', async () => {
    const { c } = await warehouse();
    const labelled = { ...c, steps: c.steps.map((step, i) => (i === 13 ? { ...step, label: '2:open' } : step)) };
    const stopped = await run(startDrill(labelled, { nonce: NONCE_DRILL }));
    const memo: Step = { writer: 'user::mrossi', gist: 'memo', payload: { text: 'Also Saved', assignTo: ['lbianchi'] } };
    const edited = await stepDrill(stopped, NOW, { do: 'edit', step: memo });
    expect(edited.steps[13].label).toBe('2:open');
  });

  it('again at a refused step stops at the same step with the same refusal until the cause is answered, then plays it', async () => {
    const { c } = await warehouse();
    // a comment by someone not on the team is refused; the host answers the cause by putting them on the team
    const newcomer: Step = { writer: 'user::newcomer', gist: 'comment', payload: { text: 'hello' } };
    const trial = { ...c, steps: [c.steps[0], newcomer] };
    const stopped = await run(startDrill(trial, { nonce: NONCE_DRILL }));
    const first = stopOf(stopped);
    expect(first).toMatchObject({ at: 'step', index: 1 });
    expect(first.at === 'step' && first.refusal?.code).toBe('not-now');

    const retried = await stepDrill(stopped, NOW, { do: 'again' });
    expect(stopOf(retried)).toEqual(first);

    const put = await post(threadOf(stopped), { writer: 'user::mrossi', gist: 'memo', payload: { text: 'welcome', assignTo: ['newcomer'] } }, WAREHOUSE, NOW, { policy: [] });
    expect(put.refusal).toBeUndefined();
    const answered: Drill = { ...stopped, state: put.state };
    const played = await stepDrill(answered, NOW, { do: 'again' });
    expect(played.stop).toBeUndefined();
    expect(played.next).toBe(2);
    expect(played.status).toBe('done');
  });

  it('a later step that points at a label a skipped step would have given stops with a why and no refusal', async () => {
    const { c } = await warehouse();
    const newcomer: Step = { label: 'L', writer: 'user::newcomer', gist: 'comment', payload: { text: 'x' } };
    const pointing: Step = { writer: 'user::mrossi', gist: 'comment', payload: { about: { $line: 'L' } } };
    const trial = { ...c, steps: [c.steps[0], newcomer, pointing] };
    const stopped = await run(startDrill(trial, { nonce: NONCE_DRILL }));
    expect(stopOf(stopped)).toMatchObject({ at: 'step', index: 1 });
    const why = await run(await stepDrill(stopped, NOW, { do: 'skip' }));
    const stop = stopOf(why);
    expect(stop).toMatchObject({ at: 'step', index: 2 });
    expect(stop.at === 'step' && stop.why).toContain('"L"');
    expect(stop).not.toHaveProperty('refusal');
  });

  it('abort at a step stop ends the drill, and the thread is the one so far', async () => {
    const { c } = await warehouse();
    const stopped = await run(startDrill(c, { nonce: NONCE_DRILL }));
    const aborted = await stepDrill(stopped, NOW, { do: 'abort' });
    expect(aborted.status).toBe('aborted');
    expect(aborted.stop).toBeUndefined();
    expect(threadOf(aborted).lines).toEqual(threadOf(stopped).lines);
    await expect(stepDrill(aborted, NOW, { do: 'skip' })).rejects.toThrow('The drill is over.');
  });

  it('a choice that does not fit a step stop throws, and a missing choice throws too', async () => {
    const { c } = await warehouse();
    const stopped = await run(startDrill(c, { nonce: NONCE_DRILL }));
    await expect(stepDrill(stopped, NOW, { do: 'first' })).rejects.toThrow('does not fit');
    await expect(stepDrill(stopped, NOW, { do: 'by-hand', part: 'x' })).rejects.toThrow('does not fit');
    await expect(stepDrill(stopped, NOW)).rejects.toThrow('no choice was given');
  });

  it('a choice given where the drill is not stopped throws', async () => {
    const { c } = await warehouse();
    await expect(stepDrill(startDrill(c, { nonce: NONCE_DRILL }), NOW, { do: 'skip' })).rejects.toThrow('not waiting at a stop');
  });
});

describe('a drill is a value', () => {
  it('stepping an earlier drill again gives an equal result, and the earlier drill is unchanged', async () => {
    const { c } = await warehouse();
    const drill = await run(startDrill(c, { nonce: NONCE_DRILL }));
    const before = snapshot(drill);
    const once = await stepDrill(drill, NOW, { do: 'skip' });
    const twice = await stepDrill(drill, NOW, { do: 'skip' });
    expect(twice).toEqual(once);
    expect(snapshot(drill)).toBe(before);
  });

  it('a step does not change the labels of the drill it is played from', async () => {
    const { c } = await warehouse();
    let drill = startDrill(c, { nonce: NONCE_DRILL });
    drill = await stepDrill(drill, NOW);
    drill = await stepDrill(drill, NOW);
    const before = [...drill.labels];
    const after = await stepDrill(drill, NOW);
    expect(after.labels.get('1:3')).toBeDefined();
    expect(after.labels).not.toBe(drill.labels);
    expect([...drill.labels]).toEqual(before);
  });
});

describe('the warehouse walked to the end', () => {
  it('the walk to the refused opening, skipped, and run to the end gives a settled thread that verifies and reads in order', async () => {
    const { c } = await warehouse();
    const done = await run(await stepDrill(await run(startDrill(c, { nonce: NONCE_DRILL })), NOW, { do: 'skip' }));
    expect(done.status).toBe('done');
    const { lines, handles } = threadOf(done);
    expect(lines.every(verify)).toBe(true);
    expect(() => inOrder(lines, schemaOf(done))).not.toThrow();
    expect(consequitur(lines, handles, schemaOf(done)).settled).toBe(true);
  });

  it('the first line declares the thread: the drill\'s nonce, the schema, and the sources the consolidation names', async () => {
    const { c } = await warehouse();
    const done = await run(await stepDrill(await run(startDrill(c, { nonce: NONCE_DRILL })), NOW, { do: 'skip' }));
    const first = inOrder(threadOf(done).lines, WAREHOUSE)[0];
    expect(first.thread).toEqual({ nonce: NONCE_DRILL, schema: 'warehouse-arrival', version: 1, from: c.from });
  });

  it('the seals name the sources: the new first line is neither source\'s first, and the second source\'s seal is its head', async () => {
    const { tuesday, saved, c } = await warehouse();
    const done = await run(await stepDrill(await run(startDrill(c, { nonce: NONCE_DRILL })), NOW, { do: 'skip' }));
    const newFirst = inOrder(threadOf(done).lines, WAREHOUSE)[0];
    expect(c.from[0].first).toBe(inOrder(tuesday.lines, WAREHOUSE)[0].id);
    expect(c.from[1].last).toBe(inOrder(saved.lines, WAREHOUSE).at(-1)?.id);
    expect(newFirst.id).not.toBe(c.from[0].first);
    expect(newFirst.id).not.toBe(c.from[1].first);
  });

  it('a line appended to the first source after the consolidation moves its head', async () => {
    const { tuesday, saved, c } = await warehouse();
    const out = await post(tuesday, { gist: 'comment', writer: 'user::lbianchi', payload: { text: 'two pallets damaged, again' } }, WAREHOUSE, NOW, { policy: [] });
    expect(out.refusal).toBeUndefined();
    const after = consolidate(sourceOf(out.state, WAREHOUSE), sourceOf(saved, WAREHOUSE));
    expect(after.from[0].last).not.toBe(c.from[0].last);
    expect(after.from[0].last).toBe(inOrder(out.state.lines, WAREHOUSE).at(-1)?.id);
  });

  it('the same walk twice, with the same nonce and NOW, gives the same line ids', async () => {
    const { c } = await warehouse();
    const walk = async () => threadOf(await run(await stepDrill(await run(startDrill(c, { nonce: NONCE_DRILL })), NOW, { do: 'skip' }))).lines.map((line) => line.id);
    const first = await walk();
    expect(first.length).toBeGreaterThan(0);
    expect(await walk()).toEqual(first);
  });
});

describe('the cross-domain drill', () => {
  it('keeping all three laws, with the old conflicts answered first, every step stops and is skipped, and the thread stays empty', async () => {
    const c = await crossDomain();
    let drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL, policy: sibarPolicy() });
    for (let i = 0; i < 8; i++) drill = await stepDrill(drill, NOW, { do: 'first' });
    for (let i = 0; i < 3; i++) drill = await stepDrill(drill, NOW, { do: 'keep' });
    const stops: Array<{ index: number; code?: string }> = [];
    for (let calls = 0; drill.status === 'going' && calls < 500; calls++) {
      const stop = drill.stop;
      if (stop?.at === 'step') {
        stops.push({ index: stop.index, code: stop.refusal?.code });
        drill = await stepDrill(drill, NOW, { do: 'skip' });
      } else {
        drill = await stepDrill(drill, NOW);
      }
    }
    expect(drill.status).toBe('done');
    expect(schemaOf(drill)).toMatchObject({ name: 'both-cases', version: 1 });
    // every step stopped: the first is refused by the keeps-set law (the editors would be empty), and the rest are
    // refused or point at a line of a skipped step
    expect(stops.map((s) => s.index)).toEqual(c.steps.map((_, i) => i));
    expect(stops[0]).toEqual({ index: 0, code: 'law' });
    expect(drill.skipped).toEqual(c.steps.map((_, i) => i));
    expect(threadOf(drill).lines).toEqual([]);
    expect(() => consequitur(threadOf(drill).lines, threadOf(drill).handles, schemaOf(drill))).not.toThrow();
  });

  it('keeping the SIBAR assignees law and dropping both editorial laws admits SIBAR\'s first step, which opens the new thread', async () => {
    const c = await crossDomain();
    let drill = startDrill(c, { name: 'both-cases', nonce: NONCE_DRILL, policy: sibarPolicy() });
    for (let i = 0; i < 8; i++) drill = await stepDrill(drill, NOW, { do: 'first' });
    drill = await stepDrill(drill, NOW, { do: 'keep' });
    drill = await stepDrill(drill, NOW, { do: 'drop' });
    drill = await stepDrill(drill, NOW, { do: 'drop' });
    expect(drill.stop).toBeUndefined();
    drill = await stepDrill(drill, NOW);
    expect(drill.stop).toBeUndefined();
    expect(drill.next).toBe(1);
    expect(threadOf(drill).lines.length).toBeGreaterThan(0);
    const first = inOrder(threadOf(drill).lines, schemaOf(drill))[0];
    expect(first.thread).toEqual({ nonce: NONCE_DRILL, schema: 'both-cases', version: 1, from: c.from });
  });
});
