// The release, the workflow the decision «a denunciation names who answers it» was born from: one thread
// per package across its releases. The case (`cases/release/`) is read from its files; each scenario is
// played step by step, and the reading after each step says whether `system` is expected to write
// `published`, with the thread settled throughout.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answer,
  BASE_KIT,
  consequitur,
  emptyState,
  playScenario,
  post,
  readScenarios,
  readSchema,
  type Condition,
  type Denunciation,
  type GistSchema,
  type LineDraft,
  type Reading,
  type Refusal,
  type Schema,
  type ThreadState,
} from '../src/index.ts';
import { strict, valuesOf } from './helpers.ts';

const NOW = '2026-10-20T10:00:00.000Z';
const casePath = (file: string) => join(import.meta.dirname, '..', '..', '..', 'cases', 'release', file);

const SCHEMA_JSON = JSON.parse(readFileSync(casePath('schema.json'), 'utf8')) as { gists: GistSchema[] };
const SCHEMA: Schema = strict(SCHEMA_JSON);
const SCENARIOS = new Map(readScenarios(readFileSync(casePath('scenarios.json'), 'utf8')).map((s) => [s.id, s]));

const PUBLISHED: Denunciation = { sort: 'line', gist: 'published', kin: 'system' };

/** Plays a scenario, and keeps the reading after each step, by the step's label. */
async function play(id: string, schema: Schema = SCHEMA) {
  let state: ThreadState = emptyState(schema);
  const send = async (draft: LineDraft, confirmed: boolean): Promise<Refusal | undefined> => {
    const out = await post(state, draft, schema, NOW, { confirmed });
    if (out.refusal) return out.refusal;
    state = out.state;
    return undefined;
  };
  const readings: Array<[string, Reading, ThreadState]> = [];
  const played = await playScenario(SCENARIOS.get(id)!.steps, { lines: () => state.lines, send }, {
    after: ({ step }) => void readings.push([step.label!, consequitur(state.lines, state.handles, schema), state]),
  });
  expect(played.failed, played.failed?.why).toBeUndefined();
  return { readings, state, refused: played.refused.map((r) => [r.step.label, r.refusal.code]) };
}

/**
 * Each step's label, with whether the publication is expected after it; and, at every step, that the
 * thread is settled, that `answer` leaves the expected line, and that the denunciations are that line
 * alone, last since it is the only one, or none.
 */
function expected(readings: Array<[string, Reading, ThreadState]>): Array<[string, boolean]> {
  return readings.map(([label, reading, state]) => {
    const owed = reading.denunciations.length > 0;
    expect(reading.denunciations, label).toEqual(owed ? [PUBLISHED] : []);
    expect(reading.settled, label).toBe(true);
    expect(answer(reading, state.handles), label).toEqual([]);
    return [label, owed];
  });
}

describe('the release: the schema', () => {
  it('is read by the base kit with no problem, and says its own words', () => {
    const { schema, problems } = readSchema(SCHEMA_JSON, BASE_KIT);
    expect(problems).toEqual([]);
    expect(schema).toMatchObject({ name: 'release', version: 1, opening: 'opened', sets: ['approvers'], judged: ['user'] });
    expect(schema.gists.filter((g) => g.expect).map((g) => [g.gist, g.expect!.kin])).toEqual([['published', 'system']]);
  });
});

describe('the release: the publication it expects', () => {
  it('«two releases»: expected from each approval until its publication, and from nothing else', async () => {
    const run = await play('two-releases');
    expect(expected(run.readings)).toEqual([
      ['open', false],
      ['tag-r1', false],
      ['build-r1', false],
      // the law `settles` does not refuse the approval that makes the publication expected
      ['approve-r1', true],
      ['publish-r1', false],
      // a new tag, then its build, leave the approved tag the published one
      ['tag-r2', false],
      ['build-r2', false],
      ['approve-r2', true],
      ['publish-r2', false],
    ]);
    expect(valuesOf(run.state.handles)).toEqual({ tag: 'R2.0', built: 'R2.0', approved: 'R2.0', published: 'R2.0', history: ['R1.0', 'R2.0'] });
  });

  it('«failed and retried»: the failure is a line, and the publication stands expected until the retry', async () => {
    const run = await play('failed-and-retried');
    expect(expected(run.readings)).toEqual([
      ['open', false],
      ['tag-r1', false],
      ['build-r1', false],
      ['approve-r1', true],
      ['failed-r1', true],
      ['publish-r1', false],
    ]);
    expect(run.state.lines.filter((l) => l.gist === 'publish_failed').map((l) => l.payload)).toEqual([{ tag: 'R1.0', why: 'the registry did not answer' }]);
  });

  it('«retracted»: what is out is R1.0 again, and R2.0, still approved, is not expected again', async () => {
    const run = await play('retracted');
    expect(expected(run.readings).slice(-3)).toEqual([
      ['approve-r2', true],
      ['publish-r2', false],
      ['retract-r2', false],
    ]);
    expect(valuesOf(run.state.handles)).toEqual({ tag: 'R2.0', built: 'R2.0', approved: 'R2.0', published: 'R1.0', history: ['R1.0'] });
  });

  it('«retracted»: without the condition\'s third child, the retraction would bring the expectation back for R2.0', async () => {
    const trap = strict({
      ...SCHEMA_JSON,
      gists: SCHEMA_JSON.gists.map((g) => {
        if (!g.expect) return g;
        const { all } = g.expect.while as { all: Condition[] };
        return { ...g, expect: { ...g.expect, while: { all: all.slice(0, 2) } } };
      }),
    });
    const [label, reading] = (await play('retracted', trap)).readings.at(-1)!;
    expect(label).toBe('retract-r2');
    expect(reading.denunciations).toEqual([PUBLISHED]);
  });

  it('«refused»: the five refusals, each `not-now`, and the publication still expected through the refused one', async () => {
    const run = await play('refused');
    expect(run.refused).toEqual([
      ['approved-unbuilt', 'not-now'],
      ['published-unapproved', 'not-now'],
      ['approved-by-other', 'not-now'],
      ['published-by-other', 'not-now'],
      ['retracted-unpublished', 'not-now'],
    ]);
    expect(expected(run.readings)).toEqual([
      ['open', false],
      ['tag-r1', false],
      ['approved-unbuilt', false],
      ['build-r1', false],
      ['published-unapproved', false],
      ['approved-by-other', false],
      ['approve-r1', true],
      ['published-by-other', true],
      ['publish-r1', false],
      ['retracted-unpublished', false],
    ]);
  });
});
