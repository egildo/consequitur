import { inOrder } from 'consequitur';
import { describe, expect, it } from 'vitest';
import { advance, begin, EMPTY_BENCH, pick, playSource, run, suggestName, type Bench } from '../src/consolidation.ts';
import type { Domain, Example } from '../src/domain.ts';
import { DOMAINS } from '../src/domains/index.ts';

const NOW = '2026-10-13T10:00:00.000Z';
const [sibar, editorial] = DOMAINS;
const [sibarFirst, sibarOpinion] = sibar.examples;
const [editorialPublished, editorialLate] = editorial.examples;

/** A bench with two examples picked, the first on the first side. */
async function picked(first: [Domain, Example], second: [Domain, Example]): Promise<Bench> {
  const one = await pick(EMPTY_BENCH, 'first', first[0], first[1], NOW);
  return pick(one, 'second', second[0], second[1], NOW);
}

describe('the consolidation panel', () => {
  it('plays an example to its end, into a source whose lines are one chain read by the domain\'s schema', async () => {
    const source = await playSource(sibar, sibarFirst, NOW);
    expect(source.schema).toBe(sibar.schema);
    expect(source.lines.length).toBeGreaterThan(sibarFirst.steps.length);
    expect(() => inOrder(source.lines, source.schema)).not.toThrow();
  });

  it('gives a consolidation that is the same schema, with no conflicts and no error, for two examples of one domain', async () => {
    const bench = await picked([sibar, sibarFirst], [sibar, sibarOpinion]);
    expect(bench.consolidation?.derived.same).toBe(true);
    expect(bench.consolidation?.derived.conflicts).toEqual([]);
    expect(bench.error).toBeUndefined();
    expect(bench.name).toBe('');
  });

  it('gives a consolidation with conflicts, and suggests the name of the two schemas, for examples of two domains', async () => {
    const bench = await picked([sibar, sibarFirst], [editorial, editorialPublished]);
    expect(bench.consolidation?.derived.conflicts).toHaveLength(11);
    expect(bench.error).toBeUndefined();
    expect(bench.name).toBe(`${sibar.schema.name}-${editorial.schema.name}`);
    expect(suggestName(bench)).toBe(bench.name);
  });

  it('replaces the side picked again and clears the drill', async () => {
    const bench = await picked([sibar, sibarFirst], [sibar, sibarOpinion]);
    const begun = begin(bench);
    expect(begun.drill).toBeDefined();
    const again = await pick(begun, 'first', sibar, sibarOpinion, NOW);
    expect(again.first?.example).toBe(sibarOpinion);
    expect(again.second?.example).toBe(sibarOpinion);
    expect(again.drill).toBeUndefined();
    expect(again.error).toBeUndefined();
  });

  it('refuses to begin on different schemas with an empty name, with an error and no drill', async () => {
    const bench = await picked([sibar, sibarFirst], [editorial, editorialPublished]);
    const begun = begin({ ...bench, name: '' });
    expect(begun.drill).toBeUndefined();
    expect(begun.error).toMatch(/name/);
  });

  it('begins on different schemas with the suggested name, and stops at schema conflict 0', async () => {
    const bench = await picked([sibar, sibarFirst], [editorial, editorialPublished]);
    const begun = begin(bench);
    expect(begun.error).toBeUndefined();
    expect(begun.drill?.stop).toMatchObject({ at: 'schema', index: 0 });
  });

  it('stops at a step when the second source of one domain opens a thread that is not empty, and ends done once that step is skipped', async () => {
    const bench = await picked([editorial, editorialLate], [editorial, editorialLate]);
    const stopped = await run(begin(bench), NOW);
    expect(stopped.drill?.stop).toMatchObject({ at: 'step', refusal: { code: 'unreconcilable' } });
    const skipped = await run(await advance(stopped, NOW, { do: 'skip' }), NOW);
    expect(skipped.drill?.status).toBe('done');
    const declaration = skipped.drill?.state?.lines[0].thread;
    expect(declaration?.from).toHaveLength(2);
  });

  it('keeps the drill and says why, when a choice does not fit the stop', async () => {
    const bench = await picked([sibar, sibarFirst], [sibar, sibarOpinion]);
    const stopped = await run(begin(bench), NOW);
    const after = await advance(stopped, NOW, { do: 'first' });
    expect(after.error).toMatch(/does not fit/);
    expect(after.drill).toBe(stopped.drill);
  });
});
