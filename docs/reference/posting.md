# Posting

This page covers how a line joins a [thread](glossary.md): admission, the [dry run](glossary.md) and the post, [reconciliation](glossary.md) and its rounds, the [laws](glossary.md) and their [verdicts](glossary.md), the [policy](glossary.md), the diff of two handles, and the refusals and their codes. Its functions are `emptyState`, `admit`, `payloadProblem`, `dryRun`, `post`, `settle`, `reconcile`, `answer`, `readPolicy` and `diff`.

`now` is always an argument: the engine reads no clock. It is the instant the lines are stamped at, and the instant a gist's `when` reads as `$now`. One that does not parse as a date is the caller's mistake and not a refusal: the function throws the platform's `RangeError` when it comes to stamp a line or read a `when`, and the state given is unchanged.

## Types

```ts
/** A thread, in order of arrival, and its handles. */
interface ThreadState {
  lines: EventLine[];
  handles: Handles;
}

interface Refusal {
  code: 'unknown-gist' | 'writer-not-allowed' | 'not-now' | 'invalid-payload' | 'unknown-line'
      | 'not-revocable' | 'unreconcilable' | 'law' | 'unconfirmed';
  /** For developers, in English: which gist, key or id. */
  detail: string;
  /** Present on `law` and `unconfirmed`: every law the dry run found broken. */
  verdicts?: Verdict[];
}

/** What a post would do, kept and not applied. */
interface DryRun {
  /** The state the post would leave; the state given is unchanged. */
  state: ThreadState;
  reading: Reading;
  refusal?: Refusal;
  /** The lines the post would append: the draft's first, then what reconciliation writes. */
  added: EventLine[];
  /** The denunciations each round of reconciliation answered, round by round. */
  rounds: Denunciation[][];
  verdicts: Verdict[];
}

interface PostResult {
  state: ThreadState;
  reading: Reading;
  refusal?: Refusal;
  added: EventLine[];
  rounds: Denunciation[][];
}
```

## `emptyState`

```ts
function emptyState(schema: Schema): ThreadState;
```

A thread with no lines, and each handle kind's empty handle: with `BASE_KIT`, `{ value: {}, set: { <each set>: [] } }`.

## `admit`

```ts
function admit(lines: EventLine[], draft: LineDraft, schema: Schema, now?: string): Refusal | undefined;
```

Why a draft cannot join the thread, or nothing. It reads the thread's [expectations](reading.md#expectations) once, so it throws what [`inOrder`](thread.md#inorder) throws on a thread that is not one chain declared for the schema. The payload is judged as it will be stored, after a JSON round trip. Every other key of the payload is free. The refusals come in a fixed order, the first that applies:

| Code | When |
|---|---|
| `writer-not-allowed` | The draft is not an object, or its writer is not a well-formed string. |
| `unknown-gist` | The gist has no gist schema. |
| `writer-not-allowed` | The writer is of kin `goal`, whose lines the engine writes. |
| `writer-not-allowed` | The gist is a record gist, which the engine writes. |
| `writer-not-allowed` | The writer has no kin, or its kin is not among the gist's writers. |
| `not-now` | The gist's `when` is not true, read with the writer, the payload as it will be stored, and `now`. Without `now`, a `when` that reads `$now` is unknown, and the draft is refused. |
| `invalid-payload` | The payload is not a plain object, or JSON cannot write it. |
| `invalid-payload` | A rule binding's `admit` refuses it, in the order of the bindings; for a revoke, the key `from` does not hold a string. |
| `invalid-payload` | A goal's payload does not fit: see below. |
| `unknown-line` | A revoke names an id no line of the thread has. |
| `not-revocable` | A revoke names a line of a gist its binding does not list, one a final goal wrote, or one already out of force. |

The `when` reads the draft with each of its references replaced by the values the thread states, and the instant as [`stamp`](thread.md#stamp) will write it. A reference in the payload that resolves is checked as its value; one that does not counts as present and is not checked, so a [hole](reading.md#holes) satisfies `required`.

A draft of a gist with a `goal` binding is refused as `invalid-payload` unless its payload holds:

- `name`, a string;
- `when`, a condition a goal may hold: one that reads no `$writer`, `$draft` or `$now`, through a guard either;
- `with`, when present, an object, and `final`, when present, a boolean;
- `then`, the name of a gist with a gist schema, which lists the kin `goal` among its writers, is not the `warning` record gist, and has no `revoke` or `goal` binding;
- a `with` the gist `then` names can carry, by its rule bindings. Its `when` is not asked: the engine writes the outcome.

The lines the engine writes, a goal's and the records, never come through `admit`.

## `payloadProblem`

```ts
function payloadProblem(schema: Schema, gist: GistSchema, payload: Payload, values?: Payload): string | undefined;
```

Why a payload does not fit what a gist's rule bindings read, as an English sentence that ends with the gist, or nothing. Each reference in the payload is read against `values`: one that resolves is checked as its value, one that does not counts as present. `admit` asks it of a draft and of a goal's `with`.

## `dryRun`

```ts
function dryRun(
  state: ThreadState,
  draft: LineDraft,
  schema: Schema,
  now: string,
  options?: { policy?: Policy; nonce?: string; from?: Seal[] },
): Promise<DryRun>;
```

What a post would do, kept and not applied. It changes nothing it is given.

1. **Admit** the draft with [`admit`](#admit), at `now`.
2. **Append** it, stamped at `now`. On an empty thread the line declares the thread: with `options.nonce` when one is given, so a dry run and a post, or two plays, give the same ids; and with `options.from`, the seals of a [consolidation](consolidation.md). A later line never has them.
3. Refuse it as `unreconcilable` when the thread would not hold exactly one line of the opening gist in force: no reconciliation could answer that.
4. **Settle** with [`settle`](#settle) and `options.policy`.
5. **Judge** the laws, when the draft's writer is of a kin the head's `judged` lists. See [laws and verdicts](#laws-and-verdicts).

A refusal returns the state given, its reading, the refusal, and nothing added. Otherwise `state` is the state settled, `added` the draft's line and then every line reconciliation wrote, and `verdicts` every law broken, whatever its strength: a dry run refuses nothing for a verdict.

## `post`

```ts
function post(
  state: ThreadState,
  draft: LineDraft,
  schema: Schema,
  now: string,
  options?: { confirmed?: boolean; policy?: Policy; nonce?: string; from?: Seal[] },
): Promise<PostResult>;
```

A dry run, and then the decision:

- a refusal of the dry run is the post's;
- a `refuse` verdict refuses the line as `law`, with every verdict found;
- otherwise a verdict refuses the line as `unconfirmed`, with every verdict, unless `options.confirmed` is true;
- otherwise the dry run's state, reading, `added` and `rounds` are the result.

A refusal returns the state given and its reading, and nothing added. `post` changes nothing it is given: the host keeps `result.state`.

```ts
const result = await post(state, draft, schema, new Date().toISOString(), { policy });
if (result.refusal) console.log(result.refusal.code, result.refusal.detail);
else state = result.state;
```

## `settle`

```ts
function settle(
  state: ThreadState,
  schema: Schema,
  now: string,
  policy?: Policy,
): Promise<{ state: ThreadState; reading: Reading; rounds: Denunciation[][] }>;
```

Reads the thread, and while the reading holds a denunciation the authority answers, reconciles and reads again, within a bound. A post runs it to its end.

- **A round** answers every denunciation [`answer`](#reconcile-and-answer) returns, but the [outcomes](glossary.md) of goals, and the outcome of one goal: among the goals met and not yet written, the one whose line comes first in reading order. The others wait for the next round, so a goal whose `when` reads what another goal wrote finds it.
- **The bound** is the goals in the reading that have not written their outcome, plus two, counted once when `settle` starts. A goal cannot set a goal, so nothing a round writes raises it.
- **Each line** a round writes is stamped at `now` against the thread with the lines before it appended, so the chain holds.
- **Reaching the bound** is a pause, not an error: the reading is not settled, and the next `post` or `settle` goes on. The law `settles` refuses a line that leaves the thread so.

`rounds` holds, for each round that ran, the denunciations it answered. The reading returned counts as settled when its only denunciations are those `policy` leaves.

## `reconcile` and `answer`

```ts
function reconcile(reading: Reading, handles: Handles, schema: Schema): { handles: Handles; drafts: LineDraft[] };
function answer(reading: Reading, handles: Handles, policy?: Policy): Denunciation[];
```

`reconcile` answers each denunciation of the reading, in its order. A handle denunciation is answered by its handle kind, which gives the new handle and the role of the [record](glossary.md); the record is drafted as the schema's `authority`, under the gist `records` names for that role. A role the head does not name changes nothing and writes nothing, since a handle must not change without a line. A line denunciation is drafted as it is, by the goal's writer. A thread denunciation has no answer. `drafts` follows the order of the denunciations.

`answer` gives the denunciations the authority answers: all but those of the thread, which nothing can reconcile, and those the policy leaves.

## Laws and verdicts

```ts
/** One law a dry run found broken. */
interface Verdict {
  law: string;
  strength: 'refuse' | 'confirm';
  /** For developers, in English. */
  detail: string;
  /** `keeps-goals`: the goal that would be lost, and the path of the node that would make it lost. */
  goal?: LineId;
  path?: string;
  /** `keeps-set`: the set that would be empty. */
  set?: string;
}
```

The laws judge what a line would cause, once it has settled, and only a line whose writer is of a kin the head's `judged` lists: a line from outside states a fact that has already happened, so it is never judged. Each law of the schema is judged in its order, by its kind, with the thread before the line (its reading, its handles, its lines) and the thread after it, settled. Each breach is one verdict, with the law's name and strength. The base laws are on the [schema](schema.md#law-bindings) page.

## The policy

```ts
type Policy = Array<{
  /** A denunciation is left when it equals every part stated. */
  leave: { sort?: 'handle' | 'line'; kind?: string; key?: string; member?: string; gist?: string };
  /** Read on the handles as they stand: each key of the value handle holds the value given. */
  while?: { values: Record<string, Json> };
}>;

function readPolicy(json: unknown, schema: Schema): { policy: Policy; problems: string[] };
```

Which denunciations the authority leaves unanswered. It is the authority's configuration, outside the thread: the thread says what is expected, the policy what the authority does not enforce. An entry leaves a denunciation when the denunciation equals every part of `leave` stated, `kind`, `key` and `member` read on a handle denunciation and `gist` on a line one; and, when there is a `while`, when each key of `while.values` is held by the value handle, as it stands at the start of each round, with an equal value. A thread denunciation is never left.

A reading whose only denunciations a policy leaves counts as settled, with the denunciations still listed, so the bound is not reached and `settles` does not refuse the line.

`readPolicy` reads a policy from JSON against the schema it will be passed with. It never throws. Every key is checked at every level: an entry has `leave` and may have `while`; `leave` has only `sort` (`handle` or `line`), `kind` (a handle kind of the kit), `key` and `member` (strings) and `gist` (a gist of the schema); `while` has only `values`, an object of JSON with at least one key. A policy with any problem is read as the empty policy, and the problems say why.

```json
[{ "leave": { "kind": "set", "key": "assignees" }, "while": { "values": { "status": "closed" } } }]
```

## `diff`

```ts
interface Change {
  kind: string;
  key: string;
  [field: string]: Json | undefined;
}

function diff(before: Handles, after: Handles, kit: Kit): Change[];
```

What changed between two handles, kind by kind in the kit's order, each as its handle kind says it: what a host applies to its own copy of the record. A kind missing from a side is read as `null`, which the base kinds read as empty. The base kinds' changes are on the [schema](schema.md#handle-kinds) page.

```ts
diff(state.handles, result.state.handles, schema.kit);
// [{ kind: 'value', key: 'status', before: 'open', after: 'closed' }, { kind: 'set', key: 'assignees', member: 'mrossi', change: 'leave' }]
```

## Refusal codes

| Code | Given by | Meaning |
|---|---|---|
| `unknown-gist` | `admit` | The gist has no gist schema. |
| `writer-not-allowed` | `admit` | The writer may not write the gist: not a string, of kin `goal`, a record gist, or a kin the gist does not list. |
| `not-now` | `admit` | The gist's `when` is not true for this writer, payload and instant. |
| `invalid-payload` | `admit` | The payload does not fit the gist's rule bindings, or a goal's payload does not fit. |
| `unknown-line` | `admit` | A revoke names a line the thread does not have. |
| `not-revocable` | `admit` | A revoke names a line it may not take out of force. |
| `unreconcilable` | `dryRun`, `post` | The line would break the opening rule. |
| `law` | `post` | A `refuse` verdict: the line would leave the thread in a state a law does not allow. |
| `unconfirmed` | `post` | A `confirm` verdict the writer did not confirm. |
