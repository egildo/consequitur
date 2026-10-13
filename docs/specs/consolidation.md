# Consolidation — spec

Status: built in the round «Consolidation» ([plan](../plan.md) §4), from the decision [threads are consolidated, never merged](../decisions/threads-are-consolidated-never-merged.md); the playground's panel came with the round «The drill in the playground». Words as in the [glossary](../glossary.md).

A **consolidation** makes one new thread of two finished ones, the **sources**: each is replayed, one after the other, into a thread that opens by naming them. The package gives four things: the sources named in the **declaration**, a **derived schema** with its **schema conflicts**, a preparing function, and a **drill** that walks the replay and waits for a choice where it cannot go on. Nothing here reads a clock, draws randomness or touches storage; `now` is an argument of every step.

## 1 · The declaration names its sources

```ts
export type Seal = { first: LineId; last: LineId };
// EventLine.thread?: { nonce: string; schema?: string; version?: number; from?: Seal[] }

export function stamp(draft, lines, now, opening?: { schema?: SchemaHead; nonce?: string; from?: Seal[] }): Promise<EventLine>;
```

A **seal** is a source named in the new thread's first line: `first` is the id of the source's first line, which says which thread it was; `last` is the id of its last line in reading order, its head, which says where it was closed. `last` is the head whether or not the replay took that line: a source usually ends on a goal's outcome, which the replay does not take, and a seal that skipped it could never be compared with the source's head. A line written to a source after the consolidation has an id other than `last`, and so is visibly after the seal; whether a host refuses it is the host's business.

`stamp` writes `from` on a thread's first line only, as it writes the nonce, and never writes it empty or absent as a key, so a thread that names no source keeps the ids it has always had. It is inside the hash with the rest of `thread`. `post`, `dryRun` and `playScenario` take `from` in their options as they take `nonce`, and `Io.send` receives both as its third argument, `opening?: { nonce?: string; from?: Seal[] }`. The reading does not read `from`.

*Round 11's trailing `schema` and `nonce` arguments of `stamp`, and the third argument of `Io.send`, became these objects in this round: all matter only on an empty thread.*

## 2 · What a replay takes

```ts
export function replayed(lines: EventLine[], schema: Schema): EventLine[];
export function stepsOf(kept: EventLine[], all: EventLine[], prefix?: string): Step[];
```

`replayed` gives, in reading order, every line the engine would not write again: all but the lines of kin `goal` and those of a record gist. It is `inOrder(lines, schema)` less those, so a source that is not one chain, or is declared for another schema, is refused here as everywhere. Unlike `prune`, which for a template also leaves out the revoked, the outside and the found lines, a replay takes them: revokes and what they revoke come over, and the world's lines and the lines goals found are replayed too, since in a new thread nobody awaits them. `prune` and `replayed` share the one test of what the engine writes.

`stepsOf` takes the optional `prefix` of every label: the label of the n-th kept line is `${prefix}${n}`, and so are the `$line` and `$goal` placeholders that point at it. A consolidation gives `1:` to the first source and `2:` to the second, so two sources' labels never meet.

## 3 · The derived schema

```ts
export function deriveSchema(first: Schema, second: Schema, options?: { answers?: Array<Answer | undefined>; name?: string }): DerivedSchema;
export function schemaJson(schema: Schema): { [key: string]: Json };
```

If the two schemas are equal in canonical form, name and version included, the derived schema is the first itself (`same`). Otherwise it is new: the host passes its `name` (lower kebab case) and it is at version 1, and its kit is the first source's. `schemaJson` is the inverse of `readSchema`, the schema without its kit, which is what a host keeps and what `toKdl` is given.

The parts, compared by canonical form (key order does not count, array order does):

| Part | Rule | A conflict when |
|---|---|---|
| `opening`, `authority` | must agree | the two differ |
| `sets`, `judged` | union, the first's order then the second's additions | never |
| `records` | per role; a role only one names is added | both name a role, and a different gist |
| `guards` | per name; a guard only one has is added | the conditions differ |
| gists | per gist name; a gist only one has is added | the whole gist schemas differ |
| laws | a law is identified by its binding without its `strength`, as `readLaws` does; a law only one has is added | the same law, another strength |

`conflicts` lists every conflict in this order, the second's order within a kind, and does not depend on the answers: an index is a key. A conflicting part stands as the first's until it is answered. An answer is `'first'`, `'second'` or `{ by }`, a part written by hand. Once all are answered, and a name is given when the schemas differ, the result is read with `readSchema`; what does not read comes back as `problems`, and there is no `schema`. Whether the parts fit together is the reader's to say, not the derivation's: an answer `'second'` for a record role leaves the first's record gist in the schema as an ordinary gist nobody writes.

## 4 · The preparing function

```ts
export interface Source { lines: EventLine[]; schema: Schema }
export function consolidate(first: Source, second: Source): Consolidation;
```

Which source goes first is the order of the arguments. `consolidate` throws, with a sentence that starts «The first source» or «The second source», when a source has no lines, is not one chain, or is declared for another schema. It gives `derived` (the derivation with no answers and no name), `schemas`, `steps` (`stepsOf(replayed(…), lines, prefix)` for each source, the first's then the second's), `taken` (how many each gave) and `from` (the two seals).

## 5 · The drill

```ts
export function startDrill(c: Consolidation, options?: { name?: string; nonce?: string; policy?: Policy }): Drill;
export function stepDrill(drill: Drill, now: string, choice?: Choice): Promise<Drill>;
```

A `Drill` is a plain value, never changed: `stepDrill` gives the next. It holds the new thread (`state`, once the schema is known), the derived `schema`, the `steps` as edited, `next`, the indexes `skipped` and `edited`, its `status` (`going`, `done`, `aborted`) and, where it waits, its `stop`. One call to `stepDrill` plays at most one step.

`startDrill` throws a sentence when the schemas differ and the name is missing or does not read. It stops at the first schema conflict, or, with none, begins.

**A stop** is one of two:

- `{ at: 'schema', index, conflict, problems }`: a schema conflict. The choices are `first`, `second`, `by-hand` (with the `part`) and `abort`. A by-hand part that does not read stops again at the same conflict, with `problems`.
- `{ at: 'step', index, step, why, refusal? }`: a step that was refused, with the refusal, or whose placeholder found no line (a step it points at was skipped), with `why` and no refusal. The choices are `again`, `edit` (with a whole replacement `step`, which keeps the old label when it has none), `skip` and `abort`.

A choice that does not fit the stop throws. `again` plays the step against the thread as it stands; the cause is answered by the host, which posts a line to `drill.state` itself and hands the drill back as `{ ...drill, state }`. The replay writes each step as its own writer at the `now` given, so every line is new, and a placeholder carries each reference to an old id over to the new one. A step is played with `playScenario`, one at a time, with the labels so far, the nonce and the seals; `post` writes the declaration on the first line that is posted.

## 6 · What is not solved

Recorded, not solved:

- **A reference to an engine line is a `$find` of its gist and payload,** the first such line in the new thread. If both sources have an identical engine-written line and the second source's step points at its own, the reference lands on the first source's. A fix would let a check name its writer by placeholder, which changes templates too.
- **The two kits are not merged:** the derived schema is read against the first source's kit, and a rule of the second's kit the first lacks is a problem of the derived schema.
- **The laws of both sources judge the whole new thread,** since the derived schema is their union. Two sources of different domains stop at nearly every step: replaying SIBAR's «first» under the union with the editorial review's schema, the first `create` is refused by the review's `keeps-set` on `editors`, which would be empty. The drill says so and waits; it does not decide.
- **A name already taken** by a source's schema is the host's to avoid.
