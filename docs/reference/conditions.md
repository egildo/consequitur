# Conditions

This page covers the [condition](glossary.md) language as consequitur reads it: every node, every [reference](glossary.md), where each may stand, the three-valued answer, named [guards](glossary.md), the [check](glossary.md) a `line` node asks, the [trace](glossary.md), and the functions of the condition module. Each node is shown in JSON, the form a schema and a goal's payload hold, and in KDL, the form [`consequitur-kdl`](kdl.md) reads and writes.

A condition stands in four places: a gist's [`when`](glossary.md), a [goal](glossary.md)'s `when`, a `keeps-set` law's `while`, and a named guard in the schema's head. consequitur evaluates it with [`kdlet-guards`](https://www.npmjs.com/package/kdlet-guards), on which it registers its two [words](glossary.md), `line` and `at-least`.

## Types

```ts
type Reference = { $value: string } | { $set: string } | { $writer: 'id' | 'kin' } | { $draft: string } | { $now: 'instant' };

/** What `is`, `has` and the four comparisons read: a plain value, or a reference. */
type Operand = string | number | boolean | null | Reference;

type Condition =
  | { is: Operand; values: Operand[] }
  | { has: Operand }
  | { before: [Operand, Operand]; days?: number }
  | { after: [Operand, Operand]; days?: number }
  | { less: [Operand, Operand] }
  | { more: [Operand, Operand] }
  | { not: Condition }
  | { all: Condition[] }
  | { any: Condition[] }
  | { guard: string }
  | { line: Check }
  | { atLeast: number; of: Condition[] };

/** Every stated part must equal the line's; `payload` compares the keys it names. */
interface Check {
  gist?: string;
  kin?: string;
  writer?: Writer;
  payload?: Payload;
}
```

## Nodes

| JSON | KDL | Holds when |
|---|---|---|
| `{ "is": A, "values": [B, …] }` | `is A B …` | A equals one of the Bs. A `$set` among the Bs stands for its members. |
| `{ "has": A }` | `has A` | A is there, and is not null, empty text or an empty list. |
| `{ "before": [A, B], "days": n }` | `before A B days=n` | The time A is earlier than the time B, moved by n whole days. `days` is optional. |
| `{ "after": [A, B], "days": n }` | `after A B days=n` | The time A is later than the time B, moved by n whole days. `days` is optional. |
| `{ "less": [A, B] }` | `less A B` | The number A is smaller than the number B. |
| `{ "more": [A, B] }` | `more A B` | The number A is greater than the number B. |
| `{ "not": C }` | `not { C }` | C does not hold. |
| `{ "all": [C, …] }` | `all { C … }` | Every child holds. |
| `{ "any": [C, …] }` | `any { C … }` | Some child holds. |
| `{ "guard": "name" }` | `guard name` | The schema's guard of that name holds. |
| `{ "line": Check }` | `line gist=… kin=… writer=… { payload key=value }` | A line in force matches the check. |
| `{ "atLeast": n, "of": [C, …] }` | `at-least n { C … }` | At least n of the children hold. |

In KDL, a body that holds several conditions holds all of them. A reference in KDL is a tagged value, `(value)status`; a date or an instant is quoted text, `"2026-10-13"`. KDL writes a reference as the left operand of `is` and of a comparison; JSON may hold a plain value there too.

```json
{ "all": [
  { "is": { "$writer": "id" }, "values": [{ "$set": "assignees" }] },
  { "is": { "$value": "status" }, "values": ["open"] },
  { "line": { "gist": "memo" } }
] }
```

```kdl
all {
    is (writer)id (set)assignees
    is (value)status open
    line gist=memo
}
```

## Comparisons

The four [comparisons](glossary.md) are strict: «on or before» is `not` of `after`, «at least» is `not` of `less`.

- `before` and `after` compare times. A time is an RFC 3339 date, `2026-10-13`, or an instant with its offset, `2026-10-13T17:00:00Z`, compared as the moment it names. A date never compares with an instant.
- `days` moves the right operand by whole calendar days, on dates only; a negative number moves it back. `{ "before": [a, b], "days": 5 }` holds when a is earlier than five days after b.
- `less` and `more` compare JSON numbers. `"7"` is text, not a number.
- What does not compare (the wrong kind of value, a date against an instant, `days` beside instants) makes the node false. It never stops the reading.

The operands of a comparison are `$value`, `$draft`, `$now` and plain values. A `$set` and a `$writer` are never a time or a number, and the reader refuses them there.

```json
{ "not": { "after": [{ "$now": "instant" }, { "$value": "deadline" }] } }
```

## References

A reference is an object with one key, `$` and the place it reads from, naming a field with text.

| Reference | KDL | Reads | May stand in |
|---|---|---|---|
| `{ "$value": key }` | `(value)key` | The value handle, under the key. | Every condition; and any payload, as a [hole](reading.md#holes). |
| `{ "$set": name }` | `(set)name` | The members of the set. The name must be a set the head declares. | Every condition. Not the left operand of `is`, and not a comparison. |
| `{ "$writer": "id" }`, `{ "$writer": "kin" }` | `(writer)id` | The id or the kin of the line's writer. | A gist's `when`. Not a comparison. |
| `{ "$draft": key }` | `(draft)key` | A key of the draft's payload, with its references replaced. | A gist's `when`. |
| `{ "$now": "instant" }` | `(now)instant` | The instant the line is admitted at, as [`stamp`](thread.md#stamp) writes it. | A gist's `when`. |

`$writer`, `$draft` and `$now` stand only in a gist's `when`, and in a guard that only a `when` uses: a goal and a law that use such a guard are refused.

`$value` and `$set` read the handles the condition is read with. In a gist's `when` and in a goal, those are what the thread expects, [`Reading.expected`](reading.md#consequitur). In a `keeps-set` law's `while`, they are the handles as the line leaves them, settled.

## The answer

The reading is closed-world: what no line in force says is not so. A reference to something no line states is absent, and an absent operand makes `is` and a comparison false, and `has` false. A `line` node whose check holds a `$value` reference to a key nobody states is false.

Two things are unknown, and only where they are not given: the draft, for the menu drawn before there is one, and the instant, when admission is not handed one. A node that reads `$draft` or `$now` there is neither true nor false, and the answer spreads by Kleene's strong tables:

| Node | Unknown when |
|---|---|
| `not` | its child is unknown |
| `all` | no child is false, and some child is unknown |
| `any` | no child is true, and some child is unknown |
| `atLeast n` | fewer than n children hold, and n could still with the unknown ones |
| a named guard | its body is unknown |

[Admission](posting.md#admit) admits only when a `when` is true; [the offers](offers.md) offer unless it is false. So the menu may offer what admission refuses for its payload or its instant, never the reverse.

## Where a `line` node looks

A `line` node holds when some line in force matches its check. A goal's own line never meets it. In a gist's `when` and in a goal, each line is read with its references replaced, as the rules read it; in a `keeps-set` law's `while`, each line is read as it is written.

A check states at least one of `gist`, `kin`, `writer` (strings) and `payload` (an object with at least one key), and nothing else. A line matches when it equals every part stated: its gist, the kin of its writer, its writer, and, for each key of `payload`, the payload's value under that key compared by its canonical form. A payload value of the check may be a `$value` reference; an object holding `$value` beside other keys is refused. Before the check is matched, each reference in its payload is replaced by the value handle's value; a reference to a key the handle lacks makes the node false.

In KDL, a check's payload is a child node of properties, and a reference is a tagged property:

```kdl
line gist=approve {
    payload version=(value)version
}
```

## Named guards

A guard is a condition the schema's head names, used by `{ "guard": name }`. A guard is read as a `when` is: it may read `$writer`, `$draft` and `$now`, and then only a `when` may use it. A guard may use other guards. The head is refused when a guard has no name, names a guard the head lacks, or depends on itself.

```kdl
guard assignee {
    is (writer)id (set)assignees
}
gist quit user {
    leave set=assignees
    when {
        guard assignee
    }
}
```

## The trace

```ts
interface Trace {
  condition: Condition;
  holds: boolean;
  children?: Trace[];
  /** A `line` node: the line that met it. */
  foundIn?: LineId;
  /** A `line` node: the check as matched, each reference replaced; absent when a reference names a key the thread does not hold. */
  check?: Check;
  /** The node cannot hold: read only where warnings are. */
  lost?: true;
}
```

What reading a condition found, node by node. Every node has its trace, those the evaluation did not need to ask included (an `all` after its first child that fails, an `any` after its first that holds). `not`, `all`, `any` and `atLeast` have one child for each condition they hold; a named guard has one child, its body. A node's path is its indexes from the root, joined by dots: the root's is `""`, `"0.2"` is the root's first child's third child. A goal's reading carries its trace; `lost` is on the [reading](reading.md#goals) page.

## Functions

### `conditionProblem`

```ts
interface Names {
  sets: string[];
  guards: Record<string, Condition>;
}

function conditionProblem(value: unknown, names: Names, inWhen: boolean): string | undefined;
```

The first thing wrong with a condition, as an English sentence, or `undefined`. A `Schema` is a `Names`. `inWhen` is true for a gist's `when` and a guard, false for a goal and a law. It asks:

- every node has exactly the keys of its kind;
- `is` has a list of values, not empty, and its left operand is not a `$set`;
- `all`, `any` and `atLeast`'s `of` hold a list of conditions, not empty;
- `atLeast` is a whole number from 1 to the count of its children;
- a comparison holds two operands, neither a `$set` nor a `$writer`; `days` stands only on `before` and `after`, and is a whole number; a plain operand is of a kind the comparison reads;
- an operand is a string, a finite number, a boolean, `null` or a reference; `$set` names a set of `names`, `$writer` reads `id` or `kin`, `$now` reads `instant`;
- `$writer`, `$draft` and `$now` stand only where `inWhen` is true, and, where it is false, not in a guard the condition uses either;
- `line` holds a check;
- `guard` names a guard of `names`.

### `guardsProblems`

```ts
function guardsProblems(value: unknown, sets: string[]): string[];
```

The problems of a head's `guards`: an object of conditions by name, each read as a `when` reads, with no guard named `""`, none that names a guard the object lacks, and none that depends on itself. Each problem names its guard.

### `conditionHolds`

```ts
interface Scope {
  /** The handles a reference reads: `$value` the value handle, `$set` the set handle. */
  handles: Handles;
  /** The lines a `line` node looks among: those in force. */
  lines: EventLine[];
  /** The schema's named guards. */
  guards: Record<string, Condition>;
  /** The line a `line` node never finds: a goal's own. */
  self?: LineId;
  /** The writer of the line being written, which `$writer` reads. */
  writer?: Writer;
  /** The payload of the line being written, which `$draft` reads; `unknown` for a menu. */
  draft?: Payload | 'unknown';
  /** The instant the line is admitted at, which `$now` reads; without one, `$now` is unknown. */
  now?: string;
}

function conditionHolds(condition: Condition, scope: Scope): boolean | 'unknown';
```

Whether a condition holds in a scope: `true`, `false`, or `'unknown'` when it hangs on a draft that is `'unknown'` or on an instant not given. It is pure: the same condition and scope give the same answer. The condition is taken as read: `conditionProblem` is its check.

### `evaluateCondition`

```ts
function evaluateCondition(condition: Condition, scope: Scope): Trace;
```

The trace of a condition in a scope, every node with its `holds`, and each `line` node with `foundIn` and `check` where they are known. The reading uses it for goals.

### `nodes` and `lostAt`

```ts
function nodes(trace: Trace): Array<{ path: string; node: Trace }>;
function lostAt(trace: Trace): string | undefined;
```

`nodes` gives every node of a trace with its path, depth first from the root. `lostAt` gives the path of the node that made a lost trace lost: down from the root, through an `all` to its first lost child and through a guard to its body, to the node whose loss is its own (a `line`) or its children's together (an `any`, an `atLeast`). It gives nothing when the root is not lost.

### `validCheck`, `matches` and `resolveCheck`

```ts
function validCheck(check: unknown): check is Check;
function matches(check: Check, line: EventLine): boolean;
function resolveCheck(line: Check, handles: Handles): Check | undefined;
```

`validCheck` says whether a value can be read as a check, as above. `matches` says whether a line equals every part a check states; it does not resolve references. `resolveCheck` gives the check with each `$value` in its payload replaced by the value handle's value, or nothing when one names a key the handle lacks.

### `whereMatches`

```ts
function whereMatches(where: Payload | undefined, line: Pick<EventLine, 'payload'>): boolean;
```

Whether a rule binding's `where` lets it apply to a line: every key it names is in the payload, with an equal value. No `where` applies to every line.

### `isValueReference`, `referencesOf` and `resolvePayload`

```ts
function isValueReference(value: unknown): value is { $value: string };
function referencesOf(value: Json): string[];
function resolvePayload(payload: Payload, values: Payload, keep?: boolean): Payload;
```

- `isValueReference` says whether a value is an object with the one key `$value`, holding a string.
- `referencesOf` gives the key of every `$value` reference a value holds, at any depth, in order, a key once for each reference.
- `resolvePayload` gives a new payload with each reference replaced by what `values` holds under its key. A reference to a key `values` lacks is left out, as a key of its object or an item of its list; with `keep`, it stays as it is. The payload given is not changed.

### `toModuleForm` and `fromModuleForm`

```ts
function toModuleForm(condition: Condition, members?: (set: string) => string[]): ModuleCondition;
function fromModuleForm(condition: ModuleCondition): Condition | string;
```

The translation between consequitur's form and `kdlet-guards`' own (`ModuleCondition` is its `Condition` type). A reference becomes `{ ref: { from, field } }`, `line` becomes the word `line` with the check as its arguments, and `atLeast` the word `at-least` with n as its arguments and the children as its body; the comparisons keep their shape. Given `members`, a `$set` among an `is`'s values is replaced by the set's members, as an evaluation needs; without it, `toModuleForm` is the inverse of `fromModuleForm`. `fromModuleForm` gives an English sentence for what consequitur's form cannot say: another word, a reference from another place, `$writer` reading another field, `$now` reading another field. Whether the result is a valid condition is `conditionProblem`'s to say. The module's form is never stored.
