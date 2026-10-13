// The drill of a consolidation: its replay walked one step at a time into the new thread, and stopped where
// it cannot go on, to wait for a choice, as git's rebase stops for one. A drill is a plain value that is never
// changed: `stepDrill` gives the next one. Nothing here reads a clock or draws randomness; `now` is an argument.

import type { Consolidation } from './consolidate.ts';
import { deriveSchema, type Answer, type SchemaConflict } from './derive.ts';
import { playScenario, type Io, type Labels, type Step } from './scenario.ts';
import { emptyState, post } from './settle.ts';
import type { Json, LineId, Policy, Refusal, Schema, ThreadState } from './types.ts';

type Played = Awaited<ReturnType<typeof playScenario>>;
type SchemaStop = Extract<Stop, { at: 'schema' }>;
type StepStop = Extract<Stop, { at: 'step' }>;

/** Where a drill waits for a choice. */
export type Stop =
  /** A schema conflict, by its index among the conflicts. `problems` says why a by-hand part did not read. */
  | { at: 'schema'; index: number; conflict: SchemaConflict; problems: string[] }
  /** A step that was refused, with the refusal; or one whose placeholder found no line, with `why` and no refusal. */
  | { at: 'step'; index: number; step: Step; why: string; refusal?: Refusal };

/** What a host chooses where a drill stops. */
export type Choice =
  | { do: 'first' }
  | { do: 'second' }
  /** Answers a law only one source has: the law goes into the new thread. */
  | { do: 'keep' }
  /** Answers a law only one source has: the law is left out of the new thread. */
  | { do: 'drop' }
  | { do: 'by-hand'; part: Json }
  | { do: 'again' }
  /** A whole replacement for the step; it keeps the old step's label when it has none. */
  | { do: 'edit'; step: Step }
  | { do: 'skip' }
  | { do: 'abort' };

export interface Drill {
  readonly status: 'going' | 'done' | 'aborted';
  readonly stop?: Stop;
  /** The new thread so far; present once the schema is known. A host may post to it to answer a cause and hand the drill back as { ...drill, state }. */
  readonly state?: ThreadState;
  /** The derived schema, once every conflict is answered. */
  readonly schema?: Schema;
  /** The steps as they stand, an edited one in place. */
  readonly steps: readonly Step[];
  /** Index of the next step to play. */
  readonly next: number;
  readonly skipped: readonly number[];
  readonly edited: readonly number[];
  readonly consolidation: Consolidation;
  readonly answers: ReadonlyArray<Answer | undefined>;
  readonly labels: ReadonlyMap<string, LineId>;
  readonly name?: string;
  readonly nonce?: string;
  readonly policy?: Policy;
}

/**
 * Starts the drill of a consolidation. When the sources are read by different schemas, the derived schema is
 * named here, and the name must read: a missing or bad one throws, before any step. The drill stops at the
 * first schema conflict; with none, the new thread is begun.
 */
export function startDrill(c: Consolidation, options: { name?: string; nonce?: string; policy?: Policy } = {}): Drill {
  const base: Drill = {
    status: 'going',
    steps: c.steps,
    next: 0,
    skipped: [],
    edited: [],
    consolidation: c,
    answers: c.derived.conflicts.map(() => undefined),
    labels: new Map<string, LineId>(),
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
  };
  const known = c.derived.same ? c.derived.schema : undefined;
  if (known !== undefined) return withSchema(base, known);
  // a probe with every conflict answered as it fits: it finds a missing or bad name before any step
  const probe = deriveSchema(c.schemas[0], c.schemas[1], { answers: c.derived.conflicts.map(fitting), name: options.name });
  if (probe.schema === undefined) throw new Error(probe.problems.join(' '));
  if (c.derived.conflicts.length === 0) return withSchema(base, probe.schema);
  return { ...base, stop: { at: 'schema', index: 0, conflict: c.derived.conflicts[0], problems: [] } };
}

/**
 * The drill's next state, after one choice where it stops, or after one step where it does not. It never changes
 * `drill`. Throws when the choice does not fit the stop, or when the drill is over.
 */
export async function stepDrill(drill: Drill, now: string, choice?: Choice): Promise<Drill> {
  if (drill.status !== 'going') throw new Error('The drill is over.');
  const { stop } = drill;
  if (stop?.at === 'schema') return answerSchema(drill, stop, choice);
  if (stop?.at === 'step') return answerStep(drill, stop, now, choice);
  if (choice !== undefined) throw new Error(`The drill is not waiting at a stop, so the choice "${choice.do}" does not fit.`);
  return play(drill, drill.next, drill.steps[drill.next], now);
}

/** The drill with its schema known: the new thread is empty, and a drill with no steps is over. */
function withSchema(drill: Drill, schema: Schema): Drill {
  const state = emptyState(schema);
  return drill.steps.length === 0 ? { ...drill, schema, state, status: 'done' } : { ...drill, schema, state };
}

/** The drill without its stop. */
function unstopped(drill: Drill): Drill {
  const { stop: _stop, ...rest } = drill;
  return rest;
}

/** The error for a choice that does not fit the stop the drill waits at. */
function misfit(where: string, choice: Choice | undefined, takes: string): Error {
  return new Error(`The drill waits at ${where}, where it takes ${takes}: ${choice === undefined ? 'no choice was given' : `the choice "${choice.do}" does not fit`}.`);
}

/** The answer that fits a conflict, for the conflicts a probe fills: `keep` for a law only one source has, `first` for the rest. */
const fitting = (conflict: SchemaConflict): Answer => (conflict.part === 'one-sided-law' ? 'keep' : 'first');

/**
 * A schema conflict's choice: the part is recorded, and the drill stops at the next conflict, or the schema is
 * derived. A law only one source has takes keep or drop; every other conflict takes first, second or a part by hand.
 */
function answerSchema(drill: Drill, stop: SchemaStop, choice: Choice | undefined): Drill {
  if (choice?.do === 'abort') return { ...unstopped(drill), status: 'aborted' };
  if (stop.conflict.part === 'one-sided-law') {
    if (choice?.do === 'keep') return answered(drill, stop, 'keep');
    if (choice?.do === 'drop') return answered(drill, stop, 'drop');
    throw misfit(`schema conflict ${stop.index}`, choice, 'keep, drop or abort');
  }
  if (choice?.do === 'first') return answered(drill, stop, 'first');
  if (choice?.do === 'second') return answered(drill, stop, 'second');
  if (choice?.do === 'by-hand') return answered(drill, stop, { by: choice.part });
  throw misfit(`schema conflict ${stop.index}`, choice, 'first, second, by-hand or abort');
}

/**
 * Records the answer to the conflict the drill waits at, and derives the schema once every conflict is answered.
 * An answer that does not read is refused at once: the schema is tried with the conflicts still open answered as
 * they fit, so the conflict that was answered badly is the one asked again, with why.
 */
function answered(drill: Drill, stop: SchemaStop, answer: Answer): Drill {
  const answers = [...drill.answers];
  answers[stop.index] = answer;
  const { schemas, derived } = drill.consolidation;
  const tried = deriveSchema(schemas[0], schemas[1], { answers: answers.map((a, i) => a ?? fitting(derived.conflicts[i])), name: drill.name });
  if (tried.schema === undefined) {
    // a part that does not read is not kept
    answers[stop.index] = undefined;
    return { ...unstopped(drill), answers, stop: { at: 'schema', index: stop.index, conflict: stop.conflict, problems: tried.problems } };
  }
  const open = answers.findIndex((a) => a === undefined);
  if (open >= 0) {
    return { ...unstopped(drill), answers, stop: { at: 'schema', index: open, conflict: drill.consolidation.derived.conflicts[open], problems: [] } };
  }
  return withSchema({ ...unstopped(drill), answers }, tried.schema);
}

/** A step's choice: the step is played again, edited, skipped, or the drill is aborted. */
async function answerStep(drill: Drill, stop: StepStop, now: string, choice: Choice | undefined): Promise<Drill> {
  if (choice?.do === 'abort') return { ...unstopped(drill), status: 'aborted' };
  if (choice?.do === 'skip') {
    const next = stop.index + 1;
    return { ...unstopped(drill), skipped: [...drill.skipped, stop.index], next, status: next === drill.steps.length ? 'done' : 'going' };
  }
  if (choice?.do === 'again') return play(drill, stop.index, drill.steps[stop.index], now);
  if (choice?.do === 'edit') {
    const old = drill.steps[stop.index];
    const step = choice.step.label === undefined && old.label !== undefined ? { ...choice.step, label: old.label } : choice.step;
    const steps = drill.steps.map((s, i) => (i === stop.index ? step : s));
    const edited = drill.edited.includes(stop.index) ? drill.edited : [...drill.edited, stop.index];
    return play({ ...unstopped(drill), steps, edited }, stop.index, step, now);
  }
  throw misfit(`step ${stop.index}`, choice, 'again, edit, skip or abort');
}

/**
 * Plays one step into the thread as it stands, with the labels so far. A refusal, or a placeholder that finds no
 * line, stops the drill at the step and leaves its state and labels as they were; otherwise the step is done.
 */
async function play(drill: Drill, index: number, step: Step, now: string): Promise<Drill> {
  const { consolidation, schema, state: start } = drill;
  if (schema === undefined || start === undefined) throw new Error('The drill has no schema yet, so no step can be played.');
  let state: ThreadState = start;
  const labels: Labels = new Map(drill.labels);
  const io: Io = {
    lines: () => state.lines,
    async send(draft, confirmed, opening) {
      const out = await post(state, draft, schema, now, { confirmed, policy: drill.policy, nonce: opening?.nonce, from: opening?.from });
      if (out.refusal) return out.refusal;
      state = out.state;
      return undefined;
    },
  };

  let played: Played;
  try {
    played = await playScenario([step], io, { labels, nonce: drill.nonce, from: consolidation.from });
  } catch (error) {
    // a placeholder found no line: a step this one points at was skipped, or never posted
    return { ...drill, stop: { at: 'step', index, step, why: error instanceof Error ? error.message : String(error) } };
  }
  if (played.failed) {
    const { refusal } = played.failed;
    return { ...drill, stop: { at: 'step', index, step, why: played.failed.why, ...(refusal === undefined ? {} : { refusal }) } };
  }
  const next = index + 1;
  return { ...unstopped(drill), state, labels, next, status: next === drill.steps.length ? 'done' : 'going' };
}
