// The logic of the page's consolidation panel: two played threads picked as sources, the derived schema and
// its conflicts, and the drill walked choice by choice. A plain module over an immutable `Bench`; every
// function returns the next bench, and `now` is an argument everywhere, so nothing here reads a clock.

import { consolidate, emptyState, playScenario, post, startDrill, stepDrill, type Choice, type Consolidation, type Drill, type Source, type ThreadState } from 'consequitur';
import type { Domain, Example } from './domain.ts';

/** A source the panel holds: the example it was played from, and the domain that plays it. */
export interface Picked {
  domain: Domain;
  example: Example;
  source: Source;
}

export interface Bench {
  first?: Picked;
  second?: Picked;
  /** The name of the derived schema, when the sources are read by different schemas. */
  name: string;
  /** Both sources picked and accepted by `consolidate`. */
  consolidation?: Consolidation;
  drill?: Drill;
  /** A sentence of a refusal: of `consolidate` (a source it refuses) or of `startDrill`; shown, never thrown at the page. */
  error?: string;
}

export const EMPTY_BENCH: Bench = { name: '' };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Plays an example's steps on an empty thread of its domain, as the page posts them. A step that does not go as the
 * example says is an error: the example is the domain's own, so a mismatch is a bug in it.
 */
export async function playSource(domain: Domain, example: Example, now: string): Promise<Source> {
  let state: ThreadState = emptyState(domain.schema);
  const played = await playScenario(example.steps, {
    lines: () => state.lines,
    async send(draft, confirmed, opening) {
      const result = await post(state, draft, domain.schema, now, { confirmed, policy: domain.policy, nonce: opening?.nonce, from: opening?.from });
      if (result.refusal) return result.refusal;
      state = result.state;
      return undefined;
    },
  });
  if (played.failed) throw new Error(played.failed.why);
  return { lines: state.lines, schema: domain.schema };
}

/** The bench with one side set to the pick, and nothing built from the old picks. */
function withPick(bench: Bench, which: 'first' | 'second', picked: Picked): Bench {
  const { consolidation: _consolidation, drill: _drill, error: _error, ...kept } = bench;
  return which === 'first' ? { ...kept, first: picked } : { ...kept, second: picked };
}

/**
 * Plays the example and puts it on one side. With both sides picked, the consolidation is prepared; a refusal of
 * `consolidate` is the bench's error, and the name is suggested when the sources' schemas differ.
 */
export async function pick(bench: Bench, which: 'first' | 'second', domain: Domain, example: Example, now: string): Promise<Bench> {
  const next = withPick(bench, which, { domain, example, source: await playSource(domain, example, now) });
  if (next.first === undefined || next.second === undefined) return next;
  try {
    const consolidation = consolidate(next.first.source, next.second.source);
    const name = next.name === '' && !consolidation.derived.same ? suggestName(next) : next.name;
    return { ...next, consolidation, name };
  } catch (error) {
    return { ...next, error: messageOf(error) };
  }
}

/** `first-second` by the two picked schemas' names; empty while a side or a name is missing. */
export function suggestName(bench: Bench): string {
  const a = bench.first?.domain.schema.name;
  const b = bench.second?.domain.schema.name;
  return a && b ? `${a}-${b}` : '';
}

/**
 * Starts the drill. The first domain's policy governs the new thread only when both sources share a schema, since a
 * derived schema's laws are both sources' union. A refusal of `startDrill` is the bench's error, and no drill is kept.
 */
export function begin(bench: Bench, options: { nonce?: string } = {}): Bench {
  const { consolidation } = bench;
  if (consolidation === undefined) throw new Error('There is no consolidation to begin: both sources must be picked and accepted.');
  const policy = consolidation.derived.same ? bench.first?.domain.policy : undefined;
  const { drill: _drill, error: _error, ...kept } = bench;
  try {
    const drill = startDrill(consolidation, { name: bench.name || undefined, nonce: options.nonce, policy });
    return { ...kept, drill };
  } catch (error) {
    return { ...kept, error: messageOf(error) };
  }
}

/**
 * One step of the drill, or one choice where it stops. A choice that does not fit keeps the drill and says why.
 */
export async function advance(bench: Bench, now: string, choice?: Choice): Promise<Bench> {
  if (bench.drill === undefined) throw new Error('There is no drill to advance: begin one first.');
  try {
    const drill = await stepDrill(bench.drill, now, choice);
    return { ...bench, drill, error: undefined };
  } catch (error) {
    return { ...bench, error: messageOf(error) };
  }
}

/**
 * Advances the drill with no choice until it stops or is over. A refusal ends the run too, so it cannot loop on one.
 */
export async function run(bench: Bench, now: string): Promise<Bench> {
  let next = bench;
  while (next.drill?.status === 'going' && next.drill.stop === undefined) {
    const after = await advance(next, now);
    if (after.error !== undefined) return after;
    next = after;
  }
  return next;
}
