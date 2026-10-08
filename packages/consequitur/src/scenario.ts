// Scenarios: a domain's stories as data, played by the tests and by the playground the same way.
//
// A scenario is a list of steps, `{ writer, gist, payload }`, posted one after the other to an empty
// thread. A payload may refer to a line posted before, by a placeholder, since a line's id is a hash
// nobody can write down:
//
//   { "$line": "<label>" }    the id of the line the step labelled <label> posted
//   { "$goal": "<label>" }    `goal::` and that id: the writer of what that goal writes
//   { "$find": <check> }      the id of the first line, in reading order, that the check matches:
//                             for a line no step posted, such as one a goal wrote
//
// A placeholder is an object with that one key, wherever a value may stand, a check's payload and a
// check's writer included; a placeholder that finds no line is an error that says which. A reference
// (`$value`, `$set`, `$writer`, `$draft`) is not a placeholder: the player leaves it in the line, and the
// reading resolves it. A step may
// also be `confirmed` (a `confirm` law asked of it) or `refused` (the scenario expects the engine to
// refuse it, with this code, and goes on).
//
// A scenario is also saved from a thread: `prune` says which of its lines the engine, a revoke, the
// world or a goal's check will bring back, and `stepsOf` turns the lines a person kept into steps;
// `holed` then makes the values a person says must be supplied each time into references, holes.
//
// This module is the one resolver: the engine's tests, the playground and any application that keeps a
// scenario import it. It knows no gist and no domain.

import { matches, validCheck } from './check.ts';
import { nodes } from './condition.ts';
import { canonical, inOrder } from './line.ts';
import type { Check, EventLine, Json, LineDraft, LineId, Payload, Reading, Refusal, Schema, Writer } from './types.ts';
import { isObject, kinOf } from './util.ts';

export interface Step {
  /** Names the line this step posts, for a later `$line` or `$goal`. */
  label?: string;
  writer: Writer;
  gist: string;
  /** What the writer states, with placeholders. */
  payload: Payload;
  /** The writer confirms what a `confirm` law finds. */
  confirmed?: true;
  /** The engine is expected to refuse this step, with this code. */
  refused?: Refusal['code'];
}

export interface Scenario {
  id: string;
  /** What the scenario shows, in English. A person's words for it are the application's. */
  title: string;
  steps: Step[];
}

/** The id of the line each label named, as the steps posted them. */
export type Labels = Map<string, LineId>;

/** The keys of a reference, which the player leaves alone. */
const REFERENCES = ['$value', '$set', '$writer', '$draft'];

/** Replaces every placeholder in a value by what it refers to, and leaves references alone. Throws, naming it, when a placeholder finds nothing. */
export function resolve(value: Json, lines: EventLine[], labels: ReadonlyMap<string, LineId>): Json {
  if (Array.isArray(value)) return value.map((item) => resolve(item, lines, labels));
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0].startsWith('$') && !REFERENCES.includes(keys[0])) {
    const [key] = keys;
    const target = value[key];
    if (key === '$line' || key === '$goal') {
      const id = typeof target === 'string' ? labels.get(target) : undefined;
      if (id === undefined) throw new Error(`The scenario refers to the line "${String(target)}", which no step before has posted.`);
      return key === '$line' ? id : `goal::${id}`;
    }
    if (key === '$find') {
      if (!validCheck(target)) throw new Error('A "$find" holds a check: a gist, a kin, a writer or a payload.');
      const found = inOrder(lines).find((line) => matches(target as unknown as Check, line));
      if (!found) throw new Error(`No line of the thread matches ${JSON.stringify(target)}.`);
      return found.id;
    }
    throw new Error(`The placeholder "${key}" is not one of $line, $goal and $find, nor a reference.`);
  }
  return Object.fromEntries(keys.map((key) => [key, resolve(value[key], lines, labels)]));
}

/** The draft a step posts to a thread as it stands. */
export function draftOf(step: Step, lines: EventLine[], labels: ReadonlyMap<string, LineId>): LineDraft {
  return { gist: step.gist, writer: step.writer, payload: resolve(step.payload, lines, labels) as Payload };
}

/** What a scenario needs of its host: the thread as it stands, and a way to post to it. */
export interface Io {
  lines(): EventLine[];
  /** Posts the draft, and answers the refusal, or nothing when the line was posted; `nonce` is the player's, for `post`. */
  send(draft: LineDraft, confirmed: boolean, nonce?: string): Promise<Refusal | undefined>;
}

export interface Played {
  /** The first step that did not go as the scenario says: refused when it was not expected to be, or not refused when it was. */
  failed?: { index: number; step: Step; why: string; refusal?: Refusal };
  /** The steps the scenario expects refused, each with the refusal that came. */
  refused: Array<{ index: number; step: Step; refusal: Refusal }>;
  labels: Labels;
}

/**
 * Plays the steps in order, resolving each against the thread as it stands, and stops at the first
 * that does not go as the scenario says. `after` is told of each step once it is done, so a test
 * can look at the thread where it matters; `labels` carries the labels of an earlier play on; `as`
 * is the writer every step is posted as, in place of its own, for an application that plays a
 * scenario for the person who opens it; `nonce` is handed to every `send`, so the first line, which
 * declares the thread, and every id after it are the same each time the scenario is played.
 */
export async function playScenario(
  steps: Step[],
  io: Io,
  options: { after?(done: { index: number; step: Step; labels: Labels; refusal?: Refusal }): void | Promise<void>; labels?: Labels; as?: Writer; nonce?: string } = {},
): Promise<Played> {
  const played: Played = { refused: [], labels: options.labels ?? new Map() };
  for (const [index, step] of steps.entries()) {
    const before = io.lines().length;
    const draft = draftOf(step, io.lines(), played.labels);
    const refusal = await io.send(options.as === undefined ? draft : { ...draft, writer: options.as }, step.confirmed === true, options.nonce);
    if (refusal && step.refused === undefined) {
      played.failed = { index, step, why: `The step was refused: ${refusal.code}.`, refusal };
      return played;
    }
    if (!refusal && step.refused !== undefined) {
      played.failed = { index, step, why: `The step was expected to be refused (${step.refused}) and was posted.` };
      return played;
    }
    if (refusal && refusal.code !== step.refused) {
      played.failed = { index, step, why: `The step was expected to be refused with ${step.refused}, and was with ${refusal.code}.`, refusal };
      return played;
    }
    if (refusal) played.refused.push({ index, step, refusal });
    // the draft is the first line the post appended
    else if (step.label !== undefined) played.labels.set(step.label, io.lines()[before].id);
    await options.after?.({ index, step, labels: played.labels, ...(refusal ? { refusal } : {}) });
  }
  return played;
}

/** Reads a scenarios file: a list of scenarios. A file that is not one is an error that says what is wrong. */
export function readScenarios(text: string): Scenario[] {
  const file: unknown = JSON.parse(text);
  if (!Array.isArray(file)) throw new Error('A scenarios file is a list of scenarios.');
  return file.map((scenario: unknown, at): Scenario => {
    if (!isObject(scenario) || typeof scenario.id !== 'string' || typeof scenario.title !== 'string' || !Array.isArray(scenario.steps)) {
      throw new Error(`The scenario ${at + 1} has no id, title and steps.`);
    }
    const id = scenario.id;
    scenario.steps.forEach((step: unknown, index) => {
      const ok = isObject(step) && typeof step.writer === 'string' && step.writer.includes('::') && typeof step.gist === 'string' && isObject(step.payload);
      if (!ok) throw new Error(`The step ${index + 1} of "${id}" has no writer, gist and payload.`);
    });
    return scenario as unknown as Scenario;
  });
}

export interface Pruned {
  /** The lines a person decides on, in reading order: kept as steps, dropped, or made into what a goal writes or awaits. */
  open: EventLine[];
  /** Every other line, in reading order, with why it is left out. */
  left: Array<{ line: EventLine; why: 'engine' | 'revoked' | 'outside' | 'found' }>;
}

/**
 * What of a thread a scenario need not say, line by line, the first answer that applies: the engine writes
 * it again (a goal's line, a record), it is a mistake and its undoing (out of force, or a revoke), the
 * world will state it again (a kin the schema does not judge), or a goal's check will find it again.
 * Every other line is open, for a person to decide on. `reading` is the reading of `lines` under `schema`.
 */
export function prune(lines: EventLine[], reading: Reading, schema: Schema): Pruned {
  const standing = new Set(reading.inForce);
  const found = new Set(reading.goals.flatMap((goal) => nodes(goal.trace).flatMap(({ node }) => (node.foundIn === undefined ? [] : [node.foundIn]))));
  const records = Object.values(schema.records);
  const pruned: Pruned = { open: [], left: [] };
  for (const line of inOrder(lines, schema)) {
    const kin = kinOf(line.writer);
    const why: Pruned['left'][number]['why'] | undefined =
      kin === 'goal' || records.includes(line.gist) ? 'engine'
      : !standing.has(line.id) || schema.gists.find((g) => g.gist === line.gist)?.rules.some((r) => r.rule === 'revoke') ? 'revoked'
      : kin === undefined || !schema.judged.includes(kin) ? 'outside'
      : found.has(line.id) ? 'found'
      : undefined;
    if (why === undefined) pruned.open.push(line);
    else pruned.left.push({ line, why });
  }
  return pruned;
}

/**
 * The steps of the lines a person kept, in reading order, with every id in a payload made a placeholder:
 * the id of an earlier kept line, a `$line` of that step's label, and `goal::` and such an id a `$goal`;
 * the id of a line of `all` that was not kept, a `$find` of the check the line states (its gist and its
 * payload), since that line will be awaited and not replayed. A step is labelled, by its position among
 * the kept lines from "1", when a later step points at it. A step carries no `confirmed` and no
 * `refused`: the application adds `confirmed` where its person says so.
 */
export function stepsOf(kept: EventLine[], all: EventLine[]): Step[] {
  // the kept lines are no chain by themselves: they are read in the order of the whole thread
  const place = new Map(inOrder(all).map((line, i) => [line.id, i] as const));
  const ordered = [...kept].sort((a, b) => place.get(a.id)! - place.get(b.id)!);
  const labelOf = new Map(ordered.map((line, i) => [line.id, String(i + 1)] as const));
  const pointed = new Set<LineId>();
  const awaited = new Map(all.filter((line) => !labelOf.has(line.id)).map((line) => [line.id, line] as const));

  const before = new Set<LineId>();
  const replace = (value: Json): Json => {
    if (typeof value === 'string') {
      const id = value.startsWith('goal::') ? value.slice('goal::'.length) : value;
      if (before.has(id)) {
        pointed.add(id);
        return value === id ? { $line: labelOf.get(id)! } : { $goal: labelOf.get(id)! };
      }
      const line = awaited.get(value);
      if (line === undefined) return value;
      return { $find: Object.keys(line.payload).length > 0 ? { gist: line.gist, payload: line.payload } : { gist: line.gist } };
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
  };

  const steps = ordered.map((line): Step => {
    const step: Step = { writer: line.writer, gist: line.gist, payload: replace(line.payload) as Payload };
    before.add(line.id);
    return step;
  });
  return steps.map((step, i) => (pointed.has(ordered[i].id) ? { label: String(i + 1), ...step } : step));
}

/**
 * The steps with each payload value equal to one of `holes` replaced by the reference `{ "$value": key }` of
 * its key, wherever a value stands, a list's item and a check's payload included: one value in several lines
 * becomes one hole. A value two holes share goes to the first of them. A placeholder or a reference is left as
 * it is. The application chooses which values are holes; what a hole is filled with is posted as a line.
 */
export function holed(steps: Step[], holes: Record<string, Json>): Step[] {
  const keys = new Map(Object.entries(holes).map(([key, value]) => [canonical(value), key] as const).reverse());
  const swap = (value: Json): Json => {
    const placeholder = isObject(value) && Object.keys(value).length === 1 && Object.keys(value)[0].startsWith('$');
    const key = placeholder ? undefined : keys.get(canonical(value));
    if (key !== undefined) return { $value: key };
    if (Array.isArray(value)) return value.map(swap);
    if (value === null || typeof value !== 'object' || placeholder) return value;
    return Object.fromEntries(Object.entries(value).map(([own, item]) => [own, swap(item)]));
  };
  return steps.map((step) => ({ ...step, payload: Object.fromEntries(Object.entries(step.payload).map(([key, value]) => [key, swap(value)])) }));
}
