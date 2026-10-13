// The preparing function of a consolidation, on finished threads: the warehouse's «Tuesday» and «Saved»
// (one schema), and SIBAR's «first» with the editorial «published» (two schemas).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consolidate, type Source } from '../src/consolidate.ts';
import { deriveSchema } from '../src/derive.ts';
import { emptyState, inOrder, playScenario, post, readPolicy, readScenarios, type Io, type LineDraft, type Policy, type Refusal, type Schema, type Seal, type Step, type ThreadState } from '../src/index.ts';
import { replayed, stepsOf } from '../src/scenario.ts';
import { strict } from './helpers.ts';

const NOW = '2026-10-13T10:00:00.000Z';
const NONCE = '00'.repeat(16);
// a second thread of the same schema gets its own nonce, so it is not the first one again
const NONCE_SECOND = '11'.repeat(16);
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

/** The labels the steps carry. */
const labelsOf = (steps: Step[]): string[] => steps.flatMap((step) => (step.label === undefined ? [] : [step.label]));

/** Every id a payload of the steps points at by `$line` or `$goal`. */
const pointsOf = (steps: Step[]): string[] => [...JSON.stringify(steps).matchAll(/"\$(?:line|goal)":"([^"]*)"/g)].map((m) => m[1]);

describe('consolidating two threads of one schema', () => {
  it('«Tuesday» then «Saved» are one schema, nothing conflicts, and the steps are the replayed steps of each, in order', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const c = consolidate(sourceOf(tuesday, WAREHOUSE), sourceOf(saved, WAREHOUSE));
    expect(c.derived.same).toBe(true);
    expect(c.derived.conflicts).toEqual([]);
    expect(c.derived.schema).toBe(WAREHOUSE);
    expect(c.schemas).toEqual([WAREHOUSE, WAREHOUSE]);
    expect(c.taken).toEqual([13, 9]);
    expect(c.steps).toHaveLength(22);
    expect(c.steps.slice(0, 13)).toEqual(stepsOf(replayed(tuesday.lines, WAREHOUSE), tuesday.lines, '1:'));
    expect(c.steps.slice(13)).toEqual(stepsOf(replayed(saved.lines, WAREHOUSE), saved.lines, '2:'));
    expect(c.steps[0].gist).toBe('open');
    expect(c.steps[13].gist).toBe('open');
  });

  it('no step of a consolidation is written by a goal, and none has the gist of a record', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const { steps } = consolidate(sourceOf(tuesday, WAREHOUSE), sourceOf(saved, WAREHOUSE));
    const records = Object.values(WAREHOUSE.records);
    expect(steps.some((step) => step.writer.startsWith('goal::'))).toBe(false);
    expect(steps.some((step) => records.includes(step.gist))).toBe(false);
  });

  it('the labels of the two sources never collide: each is prefixed by its number, and each source points only within itself', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const { steps, taken } = consolidate(sourceOf(tuesday, WAREHOUSE), sourceOf(saved, WAREHOUSE));
    const first = steps.slice(0, taken[0]);
    const second = steps.slice(taken[0]);
    expect(labelsOf(first).length).toBeGreaterThan(0);
    expect(labelsOf(second).length).toBeGreaterThan(0);
    expect(labelsOf(first).filter((label) => labelsOf(second).includes(label))).toEqual([]);
    for (const label of labelsOf(first)) expect(label.startsWith('1:')).toBe(true);
    for (const label of labelsOf(second)) expect(label.startsWith('2:')).toBe(true);
    expect(pointsOf(first).length).toBeGreaterThan(0);
    for (const point of pointsOf(first)) expect(point.startsWith('1:')).toBe(true);
    expect(pointsOf(second).length).toBeGreaterThan(0);
    for (const point of pointsOf(second)) expect(point.startsWith('2:')).toBe(true);
  });

  it('from names each source\'s first line and its head, the last line in reading order, not the last line taken', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const c = consolidate(sourceOf(tuesday, WAREHOUSE), sourceOf(saved, WAREHOUSE));
    const orderedTuesday = inOrder(tuesday.lines, WAREHOUSE);
    const orderedSaved = inOrder(saved.lines, WAREHOUSE);
    expect(c.from[0]).toEqual({ first: orderedTuesday[0].id, last: orderedTuesday[orderedTuesday.length - 1].id });
    expect(c.from[1]).toEqual({ first: orderedSaved[0].id, last: orderedSaved[orderedSaved.length - 1].id });
    // the head of «Tuesday» is a record the engine wrote at the tail, after the goal's closing: not the last step taken
    const head = orderedTuesday[orderedTuesday.length - 1];
    expect(Object.values(WAREHOUSE.records)).toContain(head.gist);
    expect(head.writer.startsWith('system::')).toBe(true);
    expect(head.gist).not.toBe(c.steps[c.taken[0] - 1].gist);
    const replayedTuesday = replayed(tuesday.lines, WAREHOUSE);
    expect(c.from[0].last).not.toBe(replayedTuesday[replayedTuesday.length - 1].id);
  });

  it('a line written to a source after the consolidation moves its head, not its first line', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const before = consolidate(sourceOf(tuesday, WAREHOUSE), sourceOf(saved, WAREHOUSE));
    const out = await post(tuesday, { gist: 'comment', writer: 'user::lbianchi', payload: { text: 'two pallets damaged' } }, WAREHOUSE, NOW, { policy: [] });
    expect(out.refusal).toBeUndefined();
    const after = consolidate(sourceOf(out.state, WAREHOUSE), sourceOf(saved, WAREHOUSE));
    expect(after.from[0].first).toBe(before.from[0].first);
    expect(after.from[0].last).not.toBe(before.from[0].last);
    expect(after.from[0].last).toBe(inOrder(out.state.lines, WAREHOUSE).at(-1)?.id);
    // the seal taken before names the head it was taken at, and that line is still in the source
    expect(out.state.lines.some((line) => line.id === before.from[0].last)).toBe(true);
  });

  it('consolidating the same sources twice gives equal results, and the sources are not mutated', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const a = sourceOf(tuesday, WAREHOUSE);
    const b = sourceOf(saved, WAREHOUSE);
    const linesA = JSON.stringify(a.lines);
    const linesB = JSON.stringify(b.lines);
    const once = consolidate(a, b);
    expect(consolidate(a, b)).toEqual(once);
    expect(JSON.stringify(a.lines)).toBe(linesA);
    expect(JSON.stringify(b.lines)).toBe(linesB);
  });
});

describe('consolidating threads of two schemas', () => {
  it('SIBAR\'s «first» and the editorial «published» are not one schema: the conflicts are those of deriveSchema, and the schemas are as handed', async () => {
    const first = await finished(scenario('sibar-activity', 'first'), SIBAR, sibarPolicy());
    const published = await finished(scenario('editorial-review', 'published'), EDITORIAL);
    const c = consolidate(sourceOf(first, SIBAR), sourceOf(published, EDITORIAL));
    const expected = deriveSchema(SIBAR, EDITORIAL);
    expect(c.derived.same).toBe(false);
    expect(c.derived.conflicts).toEqual(expected.conflicts);
    expect(c.derived.problems).toEqual(expected.problems);
    expect(c.schemas[0]).toBe(SIBAR);
    expect(c.schemas[1]).toBe(EDITORIAL);
    expect(c.taken[0]).toBeGreaterThan(0);
    expect(c.taken[1]).toBeGreaterThan(0);
    expect(c.steps).toHaveLength(c.taken[0] + c.taken[1]);
  });
});

describe('refusing a source that cannot be consolidated', () => {
  it('a source whose chain is broken is refused as the first source when it is the first', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const second = inOrder(tuesday.lines, WAREHOUSE)[1];
    const broken = { lines: tuesday.lines.filter((line) => line.id !== second.id), schema: WAREHOUSE };
    expect(() => consolidate(broken, sourceOf(saved, WAREHOUSE))).toThrow(/^The first source: The thread has a gap/);
  });

  it('a source whose chain is broken is refused as the second source when it is the second', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    const second = inOrder(saved.lines, WAREHOUSE)[1];
    const broken = { lines: saved.lines.filter((line) => line.id !== second.id), schema: WAREHOUSE };
    expect(() => consolidate(sourceOf(tuesday, WAREHOUSE), broken)).toThrow(/^The second source: The thread has a gap/);
  });

  it('a source declared for another schema is refused, and the sentence keeps the reader\'s words', async () => {
    const tuesday = await finished(scenario('warehouse-arrival', 'tuesday'), WAREHOUSE);
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    expect(() => consolidate({ lines: tuesday.lines, schema: SIBAR }, sourceOf(saved, WAREHOUSE))).toThrow(/^The first source: .*declared for the schema/);
    expect(() => consolidate(sourceOf(tuesday, WAREHOUSE), { lines: saved.lines, schema: SIBAR })).toThrow(/^The second source: .*declared for the schema/);
  });

  it('an empty source is refused, first or second', async () => {
    const saved = await finished(scenario('warehouse-arrival', 'saved'), WAREHOUSE, [], NONCE_SECOND);
    expect(() => consolidate({ lines: [], schema: WAREHOUSE }, sourceOf(saved, WAREHOUSE))).toThrow(
      'The first source has no lines: there is nothing to consolidate.',
    );
    expect(() => consolidate(sourceOf(saved, WAREHOUSE), { lines: [], schema: WAREHOUSE })).toThrow(
      'The second source has no lines: there is nothing to consolidate.',
    );
  });
});
