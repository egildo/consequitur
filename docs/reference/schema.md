# The schema and the kit

This page covers the [schema](glossary.md) a domain is written in and how it is read: `readSchema`, `schemaJson`, `readGists` and `readLaws`; the [head](glossary.md), the [gist schemas](glossary.md), the [rule](glossary.md) and [law](glossary.md) bindings; and the [kit](glossary.md), `BASE_KIT`, and the interfaces a [handle kind](glossary.md), a [rule kind](glossary.md) and a law kind implement.

## Types

```ts
/** What a schema says before any of its gists or laws. */
interface SchemaHead {
  name?: string;
  version?: number;
  opening: string;
  authority: Writer;
  sets: string[];
  records: Record<string, string>;
  judged: string[];
  guards: Record<string, Condition>;
}

/** A domain, as data, with the kit it was read against. */
interface Schema extends SchemaHead {
  gists: GistSchema[];
  laws: LawBinding[];
  kit: Kit;
}

interface GistSchema {
  gist: string;
  /** The kins that may write it. */
  writers: string[];
  rules: RuleBinding[];
  /** When it may be written; a gist with none may be written at any point of a thread. */
  when?: Condition;
  /** Who the thread expects a line of this gist from, and while what holds. */
  expect?: Expect;
}

/** A line the thread expects from a kin while its condition holds. */
interface Expect {
  kin: string;
  while: Condition;
}

/** A rule as a gist schema binds it: the kind's name and the payload keys it reads. */
interface RuleBinding {
  rule: string;
  [key: string]: Json | undefined;
}

/** A law as the schema binds it: its kind's name, its strength, and the keys the kind reads. */
interface LawBinding {
  law: string;
  /** `confirm` lets a line through when the writer says so. */
  strength: 'refuse' | 'confirm';
  [key: string]: Json | undefined;
}
```

`Condition` is on the [conditions](conditions.md) page.

## `readSchema`

```ts
function readSchema(json: unknown, kit: Kit): { schema: Schema; problems: string[] };
```

Reads a schema from JSON against a kit. It never throws. It names every problem it finds, each as an English sentence, and a schema with any problem is read as the empty schema: no gists, no laws, an empty head, and the kit given. A gist or a law left out would change what the rest does, so none is left out alone.

The problems come in three groups, and a head with a problem is reported alone:

1. the head's own faults, and a key the schema may not have;
2. each gist schema and each law that does not read;
3. how the head fits the gists: an opening gist or a record gist with no schema, a record gist with rules, a record gist whose writers do not fit.

The schema keeps the kit, since the reading, admission and the laws ask it.

```ts
const { schema, problems } = readSchema(JSON.parse(text), BASE_KIT);
if (problems.length > 0) throw new Error(problems.join(' '));
```

### What the problems say

A problem is a sentence for a developer, and two of them say less than a reader might expect:

- **A misspelled key in a `value` binding is not named.** A binding that has no `key` or not exactly one of `from`, `value` and `collect` gets «a value binding has a key and exactly one of from, value and collect.» Any other wrong key (`requird` for `required`, an unknown key) gets «does not have exactly the keys and types of a value binding.» The sentence is prefixed with the binding's index and the gist, and the other kinds say the same of their own bindings.
- **A problem in the schema is reported again as a missing schema.** When a gist schema fails to read it is left out, so the check of the head against the gists also says that a record gist or the opening gist «has no schema», when the cause is the gist's own problem, which is listed too. Read the problem that names the gist first.

## The head

The keys a schema object may have are `name`, `version`, `opening`, `authority`, `sets`, `records`, `judged`, `guards`, `gists` and `laws`. Any other is a problem.

| Key | What it holds | Required |
|---|---|---|
| `name` | The schema's name, in lower kebab case (`sibar-activity`). | With `version`: both or neither. |
| `version` | A whole number from 1. | With `name`. |
| `opening` | The [opening gist](glossary.md): a gist name, which must have a gist schema. | Yes. |
| `authority` | The [authority](glossary.md): a writer, `KIN::ID`, both parts not empty. | Yes. |
| `sets` | The names of the sets of the set handle: distinct, not empty. | No; none when left out. |
| `records` | One gist for each role of each handle kind of the kit, and optionally for `warning`. | Yes. |
| `judged` | The kins whose lines the laws judge: names that are not empty. | No; none when left out. |
| `guards` | The named [guards](glossary.md): an object of [conditions](conditions.md#named-guards) by name. | No; none when left out. |
| `gists` | The gist schemas, a list. | Yes. |
| `laws` | The law bindings, a list. | No; none when left out. |

**Records.** A [record](glossary.md) is a line the authority writes to say a reconciliation changed a handle. `records` maps each role to its gist. Every role of every handle kind of the kit must be named, even one the domain never uses: with `BASE_KIT`, a schema whose sets nobody leaves still names a `leave` gist and gives it a gist schema, or `readSchema` says `records lacks the role "leave".` A role no handle kind answers with is a problem, and so is a missing one. `warning` may be named, for the [warning](glossary.md) a goal writes; without it the thread expects no warnings and no goal is judged lost. Each record gist must have a gist schema with no rules, since a record states nothing; its writers must hold the authority's kin, or `goal` for `warning`.

With `BASE_KIT` the roles are `value`, `join` and `leave`:

```json
"records": { "value": "metadata_set", "join": "assigned", "leave": "unassigned", "warning": "goal_warning" }
```

## Gist schemas

```json
{ "gist": "quit", "writers": ["user"], "rules": [{ "rule": "leave", "set": "assignees" }], "when": { "guard": "assignee" } }
```

A gist schema has the keys `gist`, `writers` and `rules`, may have `when` and `expect`, and has no other.

- `gist`: lower snake case, starting with a letter, at most 32 characters. A gist with a schema earlier in the list is a problem.
- `writers`: a list of kins, not empty. The kin `goal` lets a [goal](glossary.md) write the gist; a draft of kin `goal` is never admitted from outside.
- `rules`: a list of bindings, at most one `revoke` and at most one `goal`. Each names a rule of the kit or a mechanic, and is read by its kind.
- `when`: a [condition](conditions.md), read with the writer, the draft and the instant the line is admitted at. See [offers](offers.md) and [`admit`](posting.md#admit).
- `expect`: the kin the thread expects a line of this gist from, and the condition under `while` for as long as it does. See [expected lines](#expected-lines).

### Expected lines

```json
{ "gist": "published", "writers": ["system"], "rules": [ … ],
  "expect": { "kin": "system", "while": { "all": [
    { "has": { "$value": "approved" } },
    { "not": { "is": { "$value": "approved" }, "values": [{ "$value": "published" }] } }
  ] } } }
```

While its `while` holds, the thread expects a line of the gist from a writer of the kin, and the reading denounces it with the kin that answers it ([denunciations](reading.md#denunciations)). The engine never writes it: the kin does the work and posts the line, and the denunciation clears when the line makes the condition false. Write into the condition that the work is not yet done, here that the approved tag is not the published one, or the line is expected for ever.

`expect` has exactly the keys `kin` and `while`. Each of these is a problem:

- a `kin` the gist's `writers` do not list, or the kin `goal`;
- an `expect` on a record gist, or on the opening gist;
- a `while` that is not a condition, or that reads `$writer`, `$draft` or `$now`, through a guard either, as a goal's `when` may not.

The `while` is read as a goal's `when` is: against what the thread expects and the lines in force, each with its references replaced, with the schema's guards. Whether the gist's `when` admits the line while the line is expected is not checked: a scenario of the case pins it.

## Rule bindings

A binding names its rule and the payload keys it reads. Each kind reads its binding strictly: a key it does not know is a problem, since a mistyped word would silently change what a gist does. Two bindings are mechanics, read by the engine itself; the others are kinds of the kit.

| Binding | Kind | What the line expects |
|---|---|---|
| `{ rule: 'value', key, from, required?, where? }` | `value` | The value handle holds under `key` the payload's value under `from`. |
| `{ rule: 'value', key, value, where? }` | `value` | The value handle holds `value` under `key`. |
| `{ rule: 'value', key, collect, required?, where? }` | `value` | The payload's value under `collect` is in the list under `key`. |
| `{ rule: 'value', keyFrom, from, where? }` | `value` | The [fill](glossary.md): the payload's value under `from` is held under the key the payload holds under `keyFrom`. |
| `{ rule: 'collect-writer', key }` | `collect-writer` | The writer's id is in the list under `key`. |
| `{ rule: 'join', set, from, required? }` | `join` | The names under `from`, a name or a list of names, are in the set. |
| `{ rule: 'leave', set }` | `leave` | The writer's id is not expected in the set. |
| `{ rule: 'revoke', from, gists }` | mechanic | The line whose id is under `from` is out of force. |
| `{ rule: 'goal' }` | mechanic | The line is a goal. |

### `value`

A key of the value handle takes the value of the latest line in force that states it. A line whose payload lacks the key a binding reads states nothing. The four forms are exclusive: a binding has a `key` and exactly one of `from`, `value` and `collect`, or `keyFrom` and `from` and no `key`.

- `required: true` refuses a draft whose payload lacks the key under `from` or `collect`. A [reference](conditions.md#references) to a value no line states counts as present.
- `collect` adds each value once, equal values compared by their canonical form. A key that held one value, from another binding, starts a new list.
- `where` is an object of at least one key: the binding applies only to a line whose payload holds every key it names, with an equal value. A binding whose `where` does not match is not asked for its `required` either.
- The fill has no `required`. Admission refuses it, as `invalid-payload`, when the payload holds something other than a string under `keyFrom`, when that string is a key some binding of the schema states (any binding with a `key`), or when the value under `from` holds a reference at any depth. The fill is judged as written: a reference in it is no key and no value. A fill whose `where` does not match is not asked.

### `collect-writer`

Adds the id of the line's writer, the part after `::`, to the list under `key`, once. It reads the envelope, so nobody can write it in another's name. Its binding has only `key`, and it admits any payload.

### `join` and `leave`

Both name a set the head declares. `join` expects each name under `from` in the set, and remembers the first line that asked. Its draft must hold a string or a list of strings under `from`, a `$value` reference counting as a name; `required: true` refuses a draft that lacks it. A stored payload that holds a number or a mixed list states nothing. `leave` takes the writer's id out of what the thread expects of the set, until a later line asks for it again.

### `revoke`

A mechanic. `from` is the payload key that holds a line id; `gists` is a list, not empty, of the gists it may revoke, each with a gist schema. Only the first `revoke` binding of a gist is read. A revoke takes an earlier line of a listed gist out of force, unless a final goal wrote it; revoking a revoke gives its target back. What admission refuses is on the [posting](posting.md#admit) page; how the reading walks it is on the [reading](reading.md#in-force) page.

### `goal`

A mechanic, with no keys. A line of the gist is a goal: its payload carries `name`, `when`, `then`, and may carry `with` and `final`. What admission asks of it is on the [posting](posting.md#admit) page; how it is read, on the [reading](reading.md#goals) page.

## Law bindings

```json
{ "law": "keeps-set", "set": "assignees", "while": { "is": { "$value": "status" }, "values": ["open"] }, "strength": "refuse" }
```

A law binding names its kind and its `strength`, `refuse` or `confirm`, and the keys its kind reads. The same law with the same keys twice is a problem, whatever the strengths; the same law with other keys is not (one `keeps-set` for each set). How the laws are judged in a post is on the [posting](posting.md#laws-and-verdicts) page.

| Binding | Broken when |
|---|---|
| `{ law: 'keeps-set', set, strength, while? }` | Once the line has settled, the set is empty, and `while`, when there is one, holds. |
| `{ law: 'keeps-goals', strength }` | The line makes a goal in force lost, through a node it was not lost through before. One verdict for each goal. |
| `{ law: 'settles', strength }` | The thread, once the line and its reconciliations are read, is still not settled. A line a kin is expected to write leaves it settled. |

`keeps-set` names a set the head declares. Its `while` is a condition that may not read the writer, the draft or the instant; it is read on the handles after the line settles and on the lines then in force, as they are written, with the schema's guards. Its verdict carries `set`. `keeps-goals`' verdict carries `goal`, the goal's line, and `path`, the node that would make it lost.
## `readGists` and `readLaws`

```ts
function readGists(value: unknown, kit: Kit, head: SchemaHead): { gists: GistSchema[]; problems: string[] };
function readLaws(value: unknown, kit: Kit, head: SchemaHead): { laws: LawBinding[]; problems: string[] };
```

Read one list alone. Each element that passes is kept and each that fails is named in `problems`, so one bad element does not stop the others. A gist that appears twice keeps its first schema, whether or not that one passed; a law that appears twice, the same, by its keys without its strength. A value that is not a list gives none and one problem.

## `schemaJson`

```ts
function schemaJson(schema: Schema): { [key: string]: Json };
```

The inverse of `readSchema`: the schema as JSON, the form a host keeps, without its kit, since the kit is code. `name` and `version` are there when the schema has them; `sets`, `judged`, `guards` and `laws` are always there, empty when the schema has none. `readSchema(schemaJson(schema), schema.kit)` reads the same schema.

## The kit

```ts
interface Kit {
  handles: HandleKind[];
  rules: RuleKind[];
  laws: LawKind[];
}

const BASE_KIT: Kit;
```

The kinds a schema may use. `BASE_KIT` holds the handle kinds `value` and `set`; the rule kinds `value`, `collect-writer`, `join` and `leave`; and the law kinds `keeps-set`, `keeps-goals` and `settles`. Each is also exported alone: `valueHandle`, `setHandle`, `valueRule`, `collectWriterRule`, `joinRule`, `leaveRule`, `keepsSet`, `keepsGoals` and `settles`.

A kit is a plain value. A kind is registered by putting it in a list, and a smaller kit is a shorter list:

```ts
const kit: Kit = { ...BASE_KIT, rules: [...BASE_KIT.rules, myRule] };
```

The order of `handles` is the order of [denunciations](reading.md#denunciations), and so of the answers. `readSchema` refuses a binding that names a rule the kit lacks, a rule whose kind states into a handle kind the kit lacks, a law the kit lacks, and a record role no handle kind of the kit answers with.

### Handle kinds

```ts
interface HandleKind {
  kind: string;
  /** The roles its answers are recorded as; the schema's `records` names a gist for each. */
  roles: string[];
  empty(schema: Schema): Json;
  /** A fresh accumulator for one reading. */
  start(schema: Schema): unknown;
  /** The thread's expectation, read out of the accumulator, as a handle of this kind. */
  expected(acc: unknown): Json;
  /** Every difference, in a fixed order. */
  compare(acc: unknown, found: Json): HandleDenunciation[];
  /** The handle with one difference answered, and the record line's role and payload. */
  answer(d: HandleDenunciation, found: Json): { handle: Json; role: string; payload: Payload };
  /** What changed between two handles of this kind, for a host to apply. */
  diff(before: Json, after: Json): Change[];
}
```

The rules write into the accumulator; the kind compares it with the handle, once for each reading, so a rule never compares. `HandleDenunciation` is on the [reading](reading.md#denunciations) page, `Change` on the [posting](posting.md#diff) page.

The two base kinds:

| | [`value`](glossary.md) | [`set`](glossary.md) |
|---|---|---|
| Handle | `{ [key: string]: Json }` | `{ [set: string]: string[] }`, each list sorted with `compare` |
| Empty | `{}` | an empty list for each set the head declares |
| Roles | `value` | `join`, `leave` |
| Compared | by key, sorted | by set, then by member, sorted |
| Denounced | a key expected and held with another value (`expected`, `found`, `line`); expected and not held (`expected`, `line`); held and not expected (`found`) | a name expected and not held (`member`, `expected: true`, `line`); held and not expected (`member`, `expected: false`) |
| Record payload | `{ key, value }`, or `{ key }` when the key goes | `{ set, member, line? }` for `join`, `{ set, member }` for `leave` |
| `diff` gives | `{ kind: 'value', key, before?, after? }` | `{ kind: 'set', key, member, change: 'join' \| 'leave' }` |

Their accumulators are exported as types for a kit author who reads them:

```ts
/** What the thread expects of one key. `collected` marks a list built by `collect`, which a later `collect` extends. */
interface Stated { value: Json; line: LineId; collected: boolean }
type ValueAcc = Map<string, Stated>;
/** Per set, each name with the line that asked first. */
type SetAcc = Map<string, Map<string, LineId>>;
```

### Rule kinds

```ts
interface RuleKind {
  rule: string;
  /** The handle kinds its expectations go into: a kit that lacks one cannot hold the rule. */
  handles: string[];
  /** The binding as typed, or a problem in English. Unknown keys are a problem. */
  read(binding: Record<string, unknown>, schema: SchemaHead): RuleBinding | string;
  /** Why a payload cannot carry this binding, in English and without the gist, or nothing. */
  admit(binding: RuleBinding, payload: Payload, written: Payload, schema: Schema): string | undefined;
  /** States what the line expects, into the accumulators of the handle kinds. */
  expect(binding: RuleBinding, line: EventLine, acc: (kind: string) => unknown): void;
}
```

- `read` is asked once, when the schema is read.
- `admit` is asked of a draft and of a goal's `with` alike. `payload` is the draft with each reference that resolves replaced by its value and each that does not left in place: a reference counts as present and is not checked. `written` is the payload as written. The sentence it returns is completed with the gist and becomes an `invalid-payload` refusal.
- `expect` is asked of each line in force, with each reference in its payload replaced, one that resolves to nothing left out. `acc(kind)` gives the accumulator of a handle kind, or `undefined` when the kit lacks it.

### Law kinds

```ts
interface LawKind {
  law: string;
  /** The binding as typed, or a problem in English. Unknown keys are a problem. */
  read(binding: Record<string, unknown>, schema: SchemaHead): LawBinding | string;
  /** `before` is the thread as it was, `after` as the line would leave it, settled. */
  judge(
    binding: LawBinding,
    before: { reading: Reading; handles: Handles; lines: EventLine[] },
    after: { reading: Reading; handles: Handles; lines: EventLine[] },
    schema: Schema,
  ): Array<Omit<Verdict, 'strength' | 'law'>>;
}
```

- `read` receives the whole binding, `strength` among its keys: `readSchema` has checked that it is `refuse` or `confirm`, and asks `read` after. A kind lists `strength` as a required key (`keysAre(binding, ['set', 'strength'])`), since a key it does not list is a problem, and returns the binding with `strength` in it, since the engine takes the strength from there.
- `judge` gives one entry for each breach, each with a `detail` in English; the engine adds the law's name and strength to make a [verdict](posting.md#laws-and-verdicts).

### `keysAre` and `optionalFlag`

```ts
function keysAre(binding: Record<string, unknown>, required: string[], optional?: string[]): boolean;
function optionalFlag(binding: Record<string, unknown>): boolean;
```

Helpers for a kind's `read`. `keysAre` says whether the keys of a binding, besides `rule` or `law`, are exactly `required` and any of `optional`. `optionalFlag` says whether `required` is absent or a boolean.
