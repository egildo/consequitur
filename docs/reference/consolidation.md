# Consolidation

This page covers the [consolidation](glossary.md) of two threads into one by replay: the preparing function `consolidate`, the [derived schema](glossary.md) and its [schema conflicts](glossary.md) (`deriveSchema`), the [seals](glossary.md) a new thread's [declaration](thread.md#the-declaration) names, and the [drill](glossary.md) that walks the replay one step at a time (`startDrill`, `stepDrill`). Nothing here reads a clock, draws randomness or touches storage; `now` is an argument of every step.

A consolidation is never a merge. Each [source](glossary.md) is replayed into the new thread, the first's steps and then the second's, through [`post`](posting.md#post) as any line is. The sources are not changed.

## `consolidate`

```ts
/** A thread to be consolidated, with the schema it is read by. */
interface Source {
  lines: EventLine[];
  schema: Schema;
}

interface Consolidation {
  /** The schema derived from the sources', with no answers yet and no name. */
  derived: DerivedSchema;
  /** The two schemas, as handed: the drill derives again with the answers it is given. */
  schemas: [Schema, Schema];
  /** The first source's steps, then the second's. Labels are prefixed '1:' and '2:'. */
  steps: Step[];
  /** How many steps each source gave. */
  taken: [number, number];
  /** What the new thread's first line names: each source's first line id and its last line id, its head. */
  from: [Seal, Seal];
}

function consolidate(first: Source, second: Source): Consolidation;
```

Prepares the consolidation of two threads, and posts nothing. Which source goes first is the order of the arguments.

- `steps` are, for each source, [`stepsOf`](scenarios.md#stepsof) of its [`replayed`](scenarios.md#replayed) lines, prefixed `1:` and `2:`: every line the engine would not write again, revokes and what they revoke included, with every id made a placeholder.
- `from` holds a seal for each source: `first`, the id of its first line, says which thread it was; `last`, the id of its last line in reading order, its head, says where it was closed. `last` is the head whether or not the replay takes that line, a goal's outcome at the tail included. A line written to a source later has another id, and is visibly after the seal.
- `derived` is `deriveSchema(first.schema, second.schema)`.

It throws an `Error` whose sentence begins «The first source» or «The second source» when that source has no lines, is not one chain, or is declared for another schema.

## `deriveSchema`

```ts
interface SchemaConflict {
  part: 'opening' | 'authority' | 'record' | 'guard' | 'gist' | 'law' | 'one-sided-law';
  /** The record's role, the guard's or the gist's name, the law's identity; empty for opening and authority. */
  name: string;
  /** The first source's part, null when the first source has none. */
  first: Json;
  /** The second source's part, null when the second source has none. */
  second: Json;
}

type Answer = 'first' | 'second' | 'keep' | 'drop' | { by: Json };

interface DerivedSchema {
  /** Both sources are read by one schema: the derived schema is that schema itself. */
  same: boolean;
  /** Every conflict, in a fixed order that does not depend on the answers; an index is a stable key. */
  conflicts: SchemaConflict[];
  /** Present once every conflict is answered, every answer fits, a name is given when the schemas differ, and the result reads. */
  schema?: Schema;
  /** Why there is no schema although every conflict is answered. Empty while conflicts are only unanswered. */
  problems: string[];
}

function deriveSchema(
  first: Schema,
  second: Schema,
  options?: { answers?: Array<Answer | undefined>; name?: string },
): DerivedSchema;
```

The schema of a consolidated thread, from its sources' two: what both share is kept once, what only one has is added. It never throws.

When the two schemas are equal in canonical form, name and version included, `same` is true and the schema is the first. Otherwise the derived schema is new: it takes `options.name`, at version 1, and the first source's kit. The parts are compared by their canonical form, where key order does not count and list order does:

| Part | Derived | A conflict when |
|---|---|---|
| `opening`, `authority` | the one both state | the two differ |
| `sets`, `judged` | the first's, then the second's it lacks | never |
| `records` | by role; a role only one names is added | both name a role, with another gist |
| `guards` | by name; a guard only one has is added | both have a guard, with another condition |
| gists | by gist name; a gist only one has is added | both have a gist, with another gist schema |
| laws | by the law's identity, its binding without its strength; a law both have is kept | both have a law, at another strength |
| a law only one source has | asked, as `one-sided-law` | always |

A law only one source has is asked, since a law forbids: the new thread applies one set of laws, chosen by a person. Gists, guards, records and sets only allow more, and are added unasked.

`conflicts` comes in this order: `opening`, `authority`, then the records, guards and gists in the second schema's order, then the first's laws in its order and the second's that the first lacks in its order. An answer at each index answers that conflict:

- `'first'`, `'second'` or `{ by: part }`, a part written by hand, answer every conflict but a one-sided law;
- `'keep'` (the law goes into the new schema) or `'drop'` (it does not) answer a one-sided law, and nothing else.

While some conflict is unanswered there is no schema and no problem. Once all are answered, an answer that does not fit its conflict is a problem; without a name, when the schemas differ, there is a problem; otherwise the result is read with [`readSchema`](schema.md#readschema), and its problems, if any, are the derivation's. Whether the parts fit together is the reader's to say: an answer `'second'` for a record role leaves the first's record gist in the schema as a gist nobody writes.

## The drill

```ts
/** Where a drill waits for a choice. */
type Stop =
  /** A schema conflict, by its index among the conflicts. `problems` says why a by-hand part did not read. */
  | { at: 'schema'; index: number; conflict: SchemaConflict; problems: string[] }
  /** A step that was refused, with the refusal; or one whose placeholder found no line, with `why` and no refusal. */
  | { at: 'step'; index: number; step: Step; why: string; refusal?: Refusal };

/** What a host chooses where a drill stops. */
type Choice =
  | { do: 'first' }
  | { do: 'second' }
  | { do: 'keep' }
  | { do: 'drop' }
  | { do: 'by-hand'; part: Json }
  | { do: 'again' }
  | { do: 'edit'; step: Step }
  | { do: 'skip' }
  | { do: 'abort' };

interface Drill {
  readonly status: 'going' | 'done' | 'aborted';
  readonly stop?: Stop;
  /** The new thread so far; present once the schema is known. */
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
```

A drill is a plain value, never changed: `stepDrill` gives the next one. It plays the steps of a consolidation into the new thread, one step a call, and stops where it cannot go on, to wait for a choice.

### `startDrill`

```ts
function startDrill(c: Consolidation, options?: { name?: string; nonce?: string; policy?: Policy }): Drill;
```

Starts the drill. `name` names the derived schema when the sources' schemas differ; `nonce` and `policy` are handed to every post. When the schemas are one, or differ with no conflict, the schema is known and the new thread is begun, empty; a consolidation with no steps is `done` at once. Otherwise the drill stops at the first schema conflict.

When the schemas differ, it throws an `Error` before any step when the derived schema, with every conflict answered as it fits (`'first'`, or `'keep'` for a one-sided law), does not read: a missing name, a name that is not lower kebab case, or parts that do not fit.

### `stepDrill`

```ts
function stepDrill(drill: Drill, now: string, choice?: Choice): Promise<Drill>;
```

The drill's next state. Without a stop, it plays the next step, with no choice. At a stop, it takes one choice:

| Stop | Choices |
|---|---|
| a schema conflict | `first`, `second`, `by-hand` with the part, or `abort` |
| a law only one source has | `keep`, `drop`, or `abort` |
| a step | `again`, `edit` with a whole replacement step, `skip`, or `abort` |

- **A schema answer** is recorded, and the drill stops at the next unanswered conflict. Once every conflict is answered the schema is derived and the new thread begun. An answer whose part does not read is not kept: the drill stops again at the same conflict, with the reader's `problems`.
- **`again`** plays the step again against the thread as it stands. A host answers the cause by posting a line to `drill.state` itself, and handing the drill back as `{ ...drill, state }`.
- **`edit`** replaces the step and plays it; the new step keeps the old label when it has none. Its index joins `edited`.
- **`skip`** leaves the step out and moves on; its index joins `skipped`. A later step that points at it stops at a placeholder that finds no line.
- **`abort`** ends the drill, `aborted`.

A step is played with [`playScenario`](scenarios.md#playscenario) and `post`, at `now`, as its own writer, with the labels so far, the drill's nonce and policy, and the consolidation's seals: the first line posted declares the thread with them. A step refused, or one whose placeholder finds no line, stops the drill at the step with the state and the labels as they were. The drill is `done` once the last step is played or skipped.

It throws an `Error` when the drill is `done` or `aborted`, when a choice is given where the drill does not stop, and when the choice does not fit the stop.

```ts
const choose = (stop: Stop): Choice =>
  stop.at === 'step' ? { do: 'skip' } : stop.conflict.part === 'one-sided-law' ? { do: 'keep' } : { do: 'first' };

let drill = startDrill(consolidate(first, second), { name: 'arrivals', nonce });
while (drill.status === 'going') drill = await stepDrill(drill, now, drill.stop && choose(drill.stop));
```

This host keeps every law, takes the first source's part of every other conflict and skips every refused step. A host that has a person asks them.
