# The reading

This page covers the [reading](glossary.md): which lines are [in force](glossary.md) and which are revoked, what the lines expect of the [handles](glossary.md), the [goals](glossary.md) and their [trace](glossary.md), the [holes](glossary.md), the [denunciations](glossary.md), and what a `Reading` holds. Its functions are `consequitur`, `expectations`, `inForce`, `lockedBy` and `goalWriter`.

The reading is pure and synchronous. It reads no clock, draws no randomness and hashes nothing, so a client and the authority read one thread the same way. It never throws on a thread that is one chain declared for its schema: a payload that lacks what a binding reads, or holds it in another shape, states nothing. A thread that is not one chain, or is declared for another schema, is refused whole, by [`inOrder`](thread.md#inorder).

## Types

```ts
/** One entry per handle kind of the kit, keyed by the kind's name. */
type Handles = Record<string, Json>;

interface Reading {
  inForce: LineId[];
  revoked: LineId[];
  /** What the thread expects the handles to be. */
  expected: Handles;
  /** The values awaited, by key. */
  holes: Hole[];
  goals: GoalReading[];
  denunciations: Denunciation[];
  settled: boolean;
}
```

## `consequitur`

```ts
function consequitur(lines: EventLine[], handles: Handles, schema: Schema): Reading;
```

The reading of a thread against its handles, in three steps:

1. **In force.** Which lines stand, and which a revoke has taken out.
2. **Expectations.** What the lines in force expect of each handle, by every rule of their gists; the goals and what they owe; the holes.
3. **Comparison.** Each handle kind compares what the thread expects with the handle it is given, and the opening rule is checked.

- `inForce` and `revoked` are line ids, in reading order.
- `expected` is what the thread expects each handle to be, in each kind's form: a host that holds these handles agrees with the thread.
- `holes`, `goals` and `denunciations` are below.
- `settled` is true when there is no denunciation. [`settle`](posting.md#settle), [`dryRun`](posting.md#dryrun) and [`post`](posting.md#post) also count as settled a reading whose only denunciations the [policy](posting.md#the-policy) leaves.

A line whose gist has no gist schema is in force and states nothing. The first gist schema of a gist is the one read.

```ts
const reading = consequitur(state.lines, state.handles, schema);
if (!reading.settled) console.log(reading.denunciations);
```

## In force

```ts
function inForce(lines: EventLine[], gists: GistSchema[]): { inForce: EventLine[]; revoked: EventLine[] };
function lockedBy(line: EventLine, lines: EventLine[]): LineId | undefined;
```

`inForce` walks the thread from its last line to its first, so a revoking line that is itself revoked has no say and its target stands again. A line of a gist with a `revoke` binding takes out of force the line whose id its payload holds under `from`, when that line is earlier, of a gist the binding lists, and not written by a final goal. A payload that names a line of another gist, an unknown id or no string revokes nothing. Both lists are in reading order.

`lockedBy` gives the id of the final goal that wrote a line, or nothing. A goal's writer is `goal::` and the id of the goal's line; the goal is final when its payload holds `final: true`. The lock outlives the goal: revoking a final goal leaves what it wrote locked.

## Expectations

```ts
function expectations(lines: EventLine[], schema: Schema): Expectations;

interface Expectations {
  standing: { inForce: EventLine[]; revoked: EventLine[] };
  /** One accumulator per handle kind of the kit, by the kind's name. */
  accumulators: Map<string, unknown>;
  /** What the thread expects each handle to be, by the kind's name. */
  handles: Handles;
  /** The lines in force as the rules and the conditions read them, each reference replaced. */
  read: EventLine[];
  /** The values a reference reads: what the lines whose payload holds no reference state, by key. */
  values: Payload;
  /** The values some line in force refers to and none states. */
  holes: Hole[];
  goals: GoalReading[];
  /** The lines the goals still owe, goal by goal: the outcome, then the warning. */
  missing: Denunciation[];
}
```

The first two steps of the reading, without the handles. [`whenHolds`](offers.md#whenholds), [`offers`](offers.md#offers) and [`admit`](posting.md#admit) ask it, since a `when` reads what the thread expects and needs no handles to compare with.

What the lines expect is read in reading order, the later line winning, by each rule kind's `expect`. Where some line in force holds a `$value` reference in its payload, the lines are read in two passes:

1. the lines whose payload holds no reference state their values, into accumulators nobody keeps; the value handle's expectation of them is `values`, the values a reference reads;
2. every line is read, with each reference replaced by the value `values` holds under its key, and one that names a key `values` lacks left out, as a key of its object or an item of its list.

A value stated through a reference serves no other reference. Where no line holds a reference the first pass is the only one. A goal's line is read as it is written, since its `when` and its `with` hold references of their own. A line as stored keeps its reference, and its id covers it.

## Holes

```ts
interface Hole {
  key: string;
  /** The lines in force that hold the reference, in reading order. */
  lines: LineId[];
}
```

Each key some line in force refers to by `{ "$value": key }` and the first pass does not state, sorted by key, with the lines that hold the reference. A goal's line holds the references of its `when` and its `with`. A hole is awaited, never denounced: it leaves `denunciations` and `settled` as they are. A [fill](schema.md#value) states the value and closes it; revoking the fill opens it again. A reference in the schema, in a guard or a gist's `when`, is no line's and is not a hole.

## Goals

```ts
interface GoalReading {
  line: LineId;
  name: string;
  then: string;
  /** Its condition, node by node. */
  trace: Trace;
  /** The root of the trace holds. */
  met: boolean;
  /** The payload of the line the goal writes, when it states one. */
  with?: Payload;
  /** Whether the line the goal writes can never be revoked. */
  final: boolean;
  /** The goal's line in the thread, in force or revoked: a goal writes it once. */
  outcome?: LineId;
  /** The outcome has been revoked, and the goal does not write it again. */
  outcomeRevoked?: true;
}

function goalWriter(id: LineId): Writer; // `goal::${id}`
```

A goal is a line in force of a gist with a `goal` binding whose payload holds `name` (a string), `then` (a string), `when` (a condition a goal may hold: one that reads no `$writer`, `$draft` or `$now`), and, when present, `with` (an object) and `final` (`true` makes it [final](glossary.md)). A goal's payload that does not fit states nothing. Of two goals of one name, the later in reading order is read. The goals come sorted by name.

- **The trace.** The goal's `when` is evaluated against what the thread expects and the lines in force, each with its references replaced, the goal's own line excluded. `met` is the root's `holds`. See [the trace](conditions.md#the-trace).
- **The outcome.** A goal writes its [outcome](glossary.md) once: a line of the gist `then`, by the writer `goalWriter(goal)`, with `with` as its payload. `outcome` is the first such line anywhere in the thread, in force or revoked. A met goal with no outcome owes one, and the reading denounces it.
- **Lost.** Where the schema's `records` names a `warning` gist that has a gist schema, the reading marks each node of the trace that cannot hold, with `lost`. A `line` node is lost when it is not met and the thread has lost something its check names: a value that is a line's id is held only by that line in force; any other value, once some line held it under the same key, must still be held by a line in force. The writer is not asked, since a later line can bring a writer back, and a value no line ever held is awaited, not lost. A `line` node whose reference names a key the thread does not hold is never lost. Above it, an `all` is lost when a child is, an `any` when every child is, an `atLeast n` when fewer than n children can still hold, a guard as its body; `not`, `is`, `has` and the comparisons never are.
- **The warning.** A lost goal owes one warning for each path [`lostAt`](conditions.md#nodes-and-lostat) gives: a line of the `warning` gist, by the goal's writer, with the payload `{ path }`. A path it has written once it does not write again.

## Denunciations

```ts
interface HandleDenunciation {
  sort: 'handle';
  /** The handle kind's name. */
  kind: string;
  /** The value's key, or the set's name. */
  key: string;
  /** Set: the name in question. */
  member?: string;
  /** Value: the expected value, absent when no line expects the key. Set: true (should be in) or false. */
  expected?: Json;
  /** Value: what the handle holds, absent when it lacks the key. */
  found?: Json;
  /** The line that states the expectation, when one does. */
  line?: LineId;
}

type Denunciation =
  | HandleDenunciation
  /** A line a goal owes the thread: its outcome once met, or a warning. `line` is the goal. */
  | { sort: 'line'; gist: string; writer: Writer; line: LineId; payload: Payload }
  /** The opening rule: exactly one line of the opening gist in force. Nothing can reconcile it. */
  | { sort: 'thread'; rule: 'one-opening'; found: number };
```

A denunciation is one difference between what the thread expects and what is. They come in a fixed order:

1. `thread`: the opening rule, when the thread does not hold exactly one line of the opening gist in force. `found` is how many it holds.
2. `line`: the lines the goals owe, by goal name, each goal's outcome before its warning.
3. `handle`: each handle kind's, in the kit's order of handle kinds, each in its kind's own order (see [handle kinds](schema.md#handle-kinds)).

Each handle denunciation is answered by its kind; each line denunciation by writing the line; a thread denunciation by nothing. See [reconciliation](posting.md#reconcile-and-answer). The order is the order of the lines a post adds: see [what a post adds](posting.md#what-a-post-adds).
