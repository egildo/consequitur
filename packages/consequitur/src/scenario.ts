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
// check's writer included; a reference that finds no line is an error that says which. A step may
// also be `confirmed` (a `confirm` law asked of it) or `refused` (the scenario expects the engine to
// refuse it, with this code, and goes on).
//
// This module is the one resolver: the engine's tests, the playground and any application that keeps a
// scenario import it. It knows no gist and no domain.

import { matches, validChecks } from './check.ts';
import { inOrder } from './line.ts';
import type { Check, EventLine, Json, LineDraft, LineId, Payload, Refusal, Writer } from './types.ts';
import { isObject } from './util.ts';

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

/** Replaces every placeholder in a value by what it refers to. Throws, naming it, when a reference finds nothing. */
export function resolve(value: Json, lines: EventLine[], labels: ReadonlyMap<string, LineId>): Json {
  if (Array.isArray(value)) return value.map((item) => resolve(item, lines, labels));
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0].startsWith('$')) {
    const [key] = keys;
    const target = value[key];
    if (key === '$line' || key === '$goal') {
      const id = typeof target === 'string' ? labels.get(target) : undefined;
      if (id === undefined) throw new Error(`The scenario refers to the line "${String(target)}", which no step before has posted.`);
      return key === '$line' ? id : `goal::${id}`;
    }
    if (key === '$find') {
      if (!validChecks([target])) throw new Error('A "$find" holds a check: a gist, a kin, a writer or a payload.');
      const found = inOrder(lines).find((line) => matches(target as unknown as Check, line));
      if (!found) throw new Error(`No line of the thread matches ${JSON.stringify(target)}.`);
      return found.id;
    }
    throw new Error(`The placeholder "${key}" is not one of $line, $goal and $find.`);
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
  /** Posts the draft, and answers the refusal, or nothing when the line was posted. */
  send(draft: LineDraft, confirmed: boolean): Promise<Refusal | undefined>;
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
 * can look at the thread where it matters; `labels` carries the labels of an earlier play on.
 */
export async function playScenario(
  steps: Step[],
  io: Io,
  options: { after?(done: { index: number; step: Step; labels: Labels; refusal?: Refusal }): void | Promise<void>; labels?: Labels } = {},
): Promise<Played> {
  const played: Played = { refused: [], labels: options.labels ?? new Map() };
  for (const [index, step] of steps.entries()) {
    const before = io.lines().length;
    const refusal = await io.send(draftOf(step, io.lines(), played.labels), step.confirmed === true);
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
