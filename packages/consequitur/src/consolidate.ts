// The preparing half of a consolidation: two finished threads become the steps and the schema of one new
// thread, and nothing is posted. Each source is replayed, the lines the engine would not write again become
// steps, the first source's before the second's, and the schema is derived from the two. A pure function of
// its sources: it reads no clock and does not change them.

import { deriveSchema, type DerivedSchema } from './derive.ts';
import { inOrder } from './line.ts';
import { replayed, stepsOf, type Step } from './scenario.ts';
import type { EventLine, Schema, Seal } from './types.ts';

/** A thread to be consolidated, with the schema it is read by. */
export interface Source {
  lines: EventLine[];
  schema: Schema;
}

export interface Consolidation {
  /** The schema derived from the sources', with no answers yet and no name: its conflicts, and the schema itself when both are read by one. */
  derived: DerivedSchema;
  /** The two schemas, as handed: the drill derives again with the answers it is given. */
  schemas: [Schema, Schema];
  /** The first source's steps, then the second's. Labels are prefixed '1:' and '2:' so they never collide. */
  steps: Step[];
  /** How many steps each source gave. */
  taken: [number, number];
  /** What the new thread's first line names: each source's first line id and its last line id, its head. */
  from: [Seal, Seal];
}

/**
 * The source's lines in reading order, refused when it is empty or is not one chain read by its own
 * schema. The sentence names which source it is, and keeps the reader's own sentence after it.
 */
function orderOf(source: Source, which: 'first' | 'second'): EventLine[] {
  if (source.lines.length === 0) throw new Error(`The ${which} source has no lines: there is nothing to consolidate.`);
  try {
    return inOrder(source.lines, source.schema);
  } catch (error) {
    throw new Error(`The ${which} source: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The seal of a source, given its lines in reading order. `last` is the head: the source's last line in
 * reading order, even when the engine wrote it (a goal's outcome at the tail). That is a ruling: the seal
 * says where the source was closed, not which of its lines were replayed.
 */
const sealOf = (ordered: EventLine[]): Seal => ({ first: ordered[0].id, last: ordered[ordered.length - 1].id });

/**
 * Prepares the consolidation of two threads: their steps and their seals, and the schema derived from their
 * schemas. Throws, naming the source, when a source is empty or is not one chain declared for its schema.
 */
export function consolidate(first: Source, second: Source): Consolidation {
  const firstOrdered = orderOf(first, 'first');
  const secondOrdered = orderOf(second, 'second');
  const firstSteps = stepsOf(replayed(first.lines, first.schema), first.lines, '1:');
  const secondSteps = stepsOf(replayed(second.lines, second.schema), second.lines, '2:');
  return {
    derived: deriveSchema(first.schema, second.schema),
    schemas: [first.schema, second.schema],
    steps: [...firstSteps, ...secondSteps],
    taken: [firstSteps.length, secondSteps.length],
    from: [sealOf(firstOrdered), sealOf(secondOrdered)],
  };
}
