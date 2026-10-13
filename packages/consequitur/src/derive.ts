// The schema of a consolidated thread, derived from the schemas of its two sources:
// the pushout. What both share is kept once, what only one has is added, and two parts
// with the same name and other content are a schema conflict, which a person answers.
// A law only one source has is asked too: the new thread applies one set of laws, chosen
// by the person. A pure function of two schemas: it reads no thread and no clock.

import type { Json, Schema } from './types.ts';
import { canonical } from './line.ts';
import { readSchema, schemaJson } from './schema.ts';

/**
 * One part two sources state differently, or a law only one of them has: what a person must answer before the
 * derived schema exists.
 */
export interface SchemaConflict {
  part: 'opening' | 'authority' | 'record' | 'guard' | 'gist' | 'law' | 'one-sided-law';
  /** The record's role, the guard's or the gist's name, the law's identity; empty for opening and authority. */
  name: string;
  /** The first source's part, null when the first source has none. */
  first: Json;
  /** The second source's part, null when the second source has none. */
  second: Json;
}

/**
 * The answer to one schema conflict. `keep` and `drop` answer a law only one source has (a `one-sided-law`);
 * `first`, `second` and `{ by }` answer every other conflict.
 */
export type Answer = 'first' | 'second' | 'keep' | 'drop' | { by: Json };

/** The result of deriving a schema from two. */
export interface DerivedSchema {
  /** Both sources are read by one schema (canonically equal, name and version included): the derived schema is that schema itself. */
  same: boolean;
  /** Every conflict, in a fixed order that does not depend on the answers; an index is a stable key. */
  conflicts: SchemaConflict[];
  /** Present once every conflict is answered, every answer fits its conflict, a name is given when the schemas differ, and the result reads. */
  schema?: Schema;
  /** Why there is no schema although every conflict is answered: the answers that do not fit, the reader's problems, or that it needs a name. Empty while conflicts are only unanswered. */
  problems: string[];
}

/** Whether two parts are the same in their canonical form, where key order does not count. */
const same = (a: Json, b: Json): boolean => canonical(a) === canonical(b);

/** The object a JSON part holds, or an empty one: a part that is not an object names nothing. */
const objectOf = (value: Json | undefined): { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

/** The list a JSON part holds, or an empty one. */
const listOf = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : []);

/** The strings a JSON list holds, in order. */
const namesOf = (value: Json | undefined): string[] => listOf(value).filter((v): v is string => typeof v === 'string');

/** The gist name of a gist schema, or empty when it has none. */
const gistOf = (value: Json): string => {
  const name = objectOf(value).gist;
  return typeof name === 'string' ? name : '';
};

/** A law's identity: its canonical form without its strength, so one law at two strengths is one law. */
const identityOf = (law: Json): string => {
  const { strength: _strength, ...rest } = objectOf(law);
  return canonical(rest);
};

/** The first's names, then the second's names not among them. */
const union = (a: string[], b: string[]): string[] => [...a, ...b.filter((name) => !a.includes(name))];

/**
 * The part a chosen answer gives. An unanswered conflict is never asked, so undefined counts as the first; `keep`
 * and `drop` never get here, since `fits` refuses them for every conflict but a one-sided law.
 */
const chosen = (conflict: SchemaConflict, answer: Answer | undefined): Json => {
  if (answer === 'second') return conflict.second;
  if (typeof answer === 'object') return answer.by;
  return conflict.first;
};

/** Whether an answer fits its conflict: `keep` and `drop` for a law only one source has, the others for every other conflict. */
const fits = (conflict: SchemaConflict, answer: Answer | undefined): boolean =>
  conflict.part === 'one-sided-law' ? answer === 'keep' || answer === 'drop' : answer !== 'keep' && answer !== 'drop';

/** What a conflict takes as its answer, in words, for the problem an answer that does not fit gives. */
const takes = (conflict: SchemaConflict): string =>
  conflict.part === 'one-sided-law' ? "a law only one source has takes 'keep' or 'drop'" : "this conflict takes 'first', 'second' or a part written by hand";

/**
 * Derives the schema of a thread from the schemas of its two sources. The derived
 * schema keeps the first source's kit. Never throws: an answer that does not fit its
 * conflict is a problem, like a part that does not read.
 */
export function deriveSchema(first: Schema, second: Schema, options: { answers?: Array<Answer | undefined>; name?: string } = {}): DerivedSchema {
  const fj = schemaJson(first);
  // copied, since what only the second has goes into the derived schema and the second's own must not be shared
  const sj: { [key: string]: Json } = JSON.parse(JSON.stringify(schemaJson(second)));
  if (canonical(fj) === canonical(sj)) return { same: true, conflicts: [], schema: first, problems: [] };

  // the first's parts stand unless an answer or an addition says otherwise
  const merged: { [key: string]: Json } = JSON.parse(JSON.stringify(fj));
  delete merged.name;
  delete merged.version;
  const conflicts: SchemaConflict[] = [];
  // parallel to conflicts: how an answer goes into merged
  const setters: Array<(answer: Answer | undefined) => void> = [];
  const differ = (part: SchemaConflict['part'], name: string, a: Json, b: Json, set: (value: Json) => void): void => {
    if (same(a, b)) return;
    const conflict: SchemaConflict = { part, name, first: a, second: b };
    conflicts.push(conflict);
    setters.push((answer) => set(chosen(conflict, answer)));
  };

  differ('opening', '', fj.opening, sj.opening, (v) => {
    merged.opening = v;
  });
  differ('authority', '', fj.authority, sj.authority, (v) => {
    merged.authority = v;
  });
  merged.sets = union(namesOf(fj.sets), namesOf(sj.sets));
  merged.judged = union(namesOf(fj.judged), namesOf(sj.judged));

  const records = objectOf(merged.records);
  const firstRecords = objectOf(fj.records);
  for (const [role, gist] of Object.entries(objectOf(sj.records))) {
    if (!Object.hasOwn(firstRecords, role)) {
      records[role] = gist;
      continue;
    }
    differ('record', role, firstRecords[role], gist, (v) => {
      records[role] = v;
    });
  }

  const guards = objectOf(merged.guards);
  const firstGuards = objectOf(fj.guards);
  for (const [name, condition] of Object.entries(objectOf(sj.guards))) {
    if (!Object.hasOwn(firstGuards, name)) {
      guards[name] = condition;
      continue;
    }
    differ('guard', name, firstGuards[name], condition, (v) => {
      guards[name] = v;
    });
  }

  const gists = listOf(merged.gists);
  const firstGists = listOf(fj.gists);
  for (const gist of listOf(sj.gists)) {
    const name = gistOf(gist);
    // the merged list keeps the first's order, so a first's index is the same in both
    const at = firstGists.findIndex((g) => gistOf(g) === name);
    if (at < 0) gists.push(gist);
    else differ('gist', name, firstGists[at], gist, (v) => {
      gists[at] = v;
    });
  }

  // the first's laws in its order, then the second's the first lacks in its order. A law is found by its identity,
  // not its place, since a dropped law moves the ones after it.
  const laws = listOf(merged.laws);
  const firstLaws = listOf(fj.laws);
  const secondLaws = listOf(sj.laws);
  const indexOfLaw = (identity: string): number => laws.findIndex((l) => identityOf(l) === identity);
  for (const law of firstLaws) {
    const identity = identityOf(law);
    const other = secondLaws.find((l) => identityOf(l) === identity);
    if (other !== undefined) {
      differ('law', identity, law, other, (v) => {
        laws[indexOfLaw(identity)] = v;
      });
      continue;
    }
    // the first's law stands in the merged laws until it is dropped
    conflicts.push({ part: 'one-sided-law', name: identity, first: law, second: null });
    setters.push((answer) => {
      const at = indexOfLaw(identity);
      if (answer === 'drop' && at >= 0) laws.splice(at, 1);
    });
  }
  for (const law of secondLaws) {
    const identity = identityOf(law);
    if (firstLaws.some((l) => identityOf(l) === identity)) continue;
    // the second's law is not in the merged laws until it is kept
    conflicts.push({ part: 'one-sided-law', name: identity, first: null, second: law });
    setters.push((answer) => {
      if (answer === 'keep') laws.push(law);
    });
  }

  const answers = options.answers ?? [];
  if (conflicts.some((_, i) => answers[i] === undefined)) return { same: false, conflicts, problems: [] };
  const misfits = conflicts.flatMap((conflict, i) =>
    fits(conflict, answers[i]) ? [] : [`The answer to conflict ${i} (${conflict.part} ${conflict.name}) does not fit it: ${takes(conflict)}.`],
  );
  if (misfits.length > 0) return { same: false, conflicts, problems: misfits };
  conflicts.forEach((_, i) => setters[i](answers[i]));

  if (options.name === undefined) {
    return { same: false, conflicts, problems: ['The derived schema needs a name: the sources are read by different schemas.'] };
  }
  const read = readSchema({ name: options.name, version: 1, ...merged }, first.kit);
  if (read.problems.length > 0) return { same: false, conflicts, problems: read.problems };
  return { same: false, conflicts, schema: read.schema, problems: [] };
}
