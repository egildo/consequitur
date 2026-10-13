# The engine — spec

Status: settled, built in round 3 («Generalise», [plan](../plan.md) §4). This describes
`packages/consequitur`; where the build had to add to what was proposed, the text says so in place.
The round «Conditions» changed `when`, goals, two laws and the base kit; each change is marked where it is.
The round «Holes» let a reference stand in a payload: the reading, the `value` rule and admission, marked where they are.
Words as in the [glossary](../glossary.md).

What does not change from the ported engine is not repeated here: the line and its envelope
(`canonical`, `stamp`, `verify`, `inOrder`), reading order, in force and revoking, the three
steps of the reading, goals (once, final, `with`, warnings and anchoring), `when` and the
offers, the rounds of reconciliation (capped at three then, within a bound the goals give since the round «Order and scenarios», §7), the dry run and its `added`, `rounds`, `verdicts`. Their
behaviour is the 250 tests'; this round changes the words and opens the kinds, never the meaning.

The round «Chain order» changed one of them, by [the chain is the order](../decisions/the-chain-is-the-order.md): the reading order is the chain, not the timestamps. `inOrder` walks `previous` from the line that has none, and throws an `Error` whose sentence names the last line read before the break when the thread is not one chain: no first line or two, a fork, a gap, a line the walk never reaches. `stamp` writes the instant it is given as it is, so a timestamp may repeat or go back, and no id of a thread written before moves.

The round «The id names its recipe» made the id begin with its recipe's name, by [the id names its recipe](../decisions/the-id-names-its-recipe.md): `stamp` writes `sha256:` before the 64 hex characters, `previous` quotes the id whole, and `verify` reads the name first and does not verify an id whose name it does not know or that has none.

The round «The first line declares the thread» gave a thread a **declaration**, by [the first line declares the thread](../decisions/the-first-line-declares-the-thread.md). A schema may name itself, `name` and `version` in its head (§5). `stamp(draft, lines, now, opening?: { schema?, nonce?, from? })` writes `thread` on a thread's first line only: the nonce it is handed, or 16 random bytes it draws in lowercase hex, and the schema's name and version when it has them. On that line the hash covers `thread` as a sixth field after `payload`, under the same recipe `sha256`; every other line hashes its five, and `verify` follows the same rule. `post`, `dryRun` and `playScenario` take an optional `nonce` and pass it on, so a thread can be played twice to the same ids. `inOrder(lines, schema?)`, given the schema, refuses a thread whose first line declares another schema, as it refuses a broken chain: it throws an `Error` whose sentence names both, absent counting as a value, so a first line with no declaration is read only by a schema with no name. Every entry that reads a thread against a schema comes through it with the schema: `expectations` (and so `consequitur`, `offers`, `whenHolds`, `settle`, `dryRun`, `post`), `admit`, which now reads the thread's expectations once at its start, `prune`, and `lineFacts` in render. An empty thread declares nothing yet and is read by any schema.

The round «Consolidation» gave the declaration `from`, by [threads are consolidated, never merged](../decisions/threads-are-consolidated-never-merged.md): a list of **seals**, `{ first, last }`, the sources a consolidation names. `stamp` writes it on the first line only, from its `opening` object (where the schema and the nonce are now too, since all three matter only on an empty thread), never empty and never as an absent key, so a thread that names no source keeps its ids; `post` and `dryRun` take it in their options beside `nonce`. The rest of consolidation, the derived schema, the preparing function and the drill, is in [consolidation](consolidation.md).

## 1 · What is a mechanic and what is a kind

**Mechanics** belong to the thread and are not registrable: the envelope and its hash; reading
order; **revoke** (a binding `{ rule: 'revoke', from, gists }`); **goal** (`{ rule: 'goal' }`,
its condition, once, final, `with`, warnings); the opening rule (exactly one line of the opening gist
in force); `when`; reconciliation's loop and its bound; laws' place in a post. A goal's line carries
`name`, `when` (a condition, [conditions](conditions.md) §2, which reads neither the writer nor the
draft), `then`, and may carry `with` and `final`; the reading gives each goal its **trace**, and `met`
is the root's `holds` *(round «Conditions»; a goal carried `checks`)*.

**Kinds** are registered in a **kit** and named by schemas:

- a **handle kind** owns one sort of handle: its empty form, how the rules' expectations of it
  accumulate, how they are compared with the handle, how a difference is answered, how two
  handles differ;
- a **rule kind** reads a binding and states expectations into one or more handle kinds;
- a **law kind** judges a dry run.

```ts
export interface Kit {
  handles: HandleKind[];
  rules: RuleKind[];
  laws: LawKind[];
}
export const BASE_KIT: Kit;   // handles: value, set · rules: value, collect-writer, join, leave · laws: keeps-set, keeps-goals, settles
```

## 2 · Handles

```ts
/** One entry per handle kind of the schema, keyed by the kind's name. */
export type Handles = Record<string, Json>;
```

The base kinds:

| Kind | Handle | Example |
|---|---|---|
| `value` | `{ [key: string]: Json }` | `{ name: 'Richiesta parere', status: 'open' }` |
| `set` | `{ [set: string]: string[] }`, each list sorted with `<` | `{ assignees: ['lbianchi', 'mrossi'] }` |

`emptyState(schema)` gives `{ lines: [], handles }` with each kind's empty handle, and a `set`
handle holding an empty list for every set the schema declares. `start` takes the schema so that
the reading's expectation (`Reading.expected`) holds those empty lists too, and has the shape of
the handles it is compared with.

```ts
export interface HandleKind {
  kind: string;
  empty(schema: Schema): Json;
  /** The roles its answers are recorded as: the schema's `records` names a gist for each. */
  roles: string[];
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

`value`'s accumulator remembers, per key, the value (or the collected list) and the line that
stated it, exactly as the metadata map does now (later line wins; `collect` extends a list, a
`from`/`value` replaces it). `set`'s remembers, per set, the members and the line that asked first,
and is emptied for the writer by `leave`, exactly as assignees are now.

Records — the lines reconciliation writes — have **roles**: `value` answers with role `value`
(`{ key, value }` or `{ key }`); `set` with `join` (`{ set, member, line? }`) or `leave`
(`{ set, member }`). The schema maps each role to a gist (§5). Goal warnings have the role
`warning`.

## 3 · Denunciations

```ts
export type HandleDenunciation = {
  sort: 'handle';
  kind: string;          // 'value' | 'set' | …
  key: string;           // the value's key, or the set's name
  member?: string;       // set: the name in question
  expected?: Json;       // value: the expected value · set: true (should be in) | false
  found?: Json;
  line?: LineId;
};

export type Denunciation =
  | HandleDenunciation
  | { sort: 'line'; gist: string; writer: Writer; line: LineId; payload: Payload }
  | { sort: 'thread'; rule: 'one-opening'; found: number };
```

Order: `thread`; then `line` (by goal name, the outcome before the goal's one warning);
then `handle`, by kind in the kit's order, then each kind's own order (value by key; set by set,
then member).

The reading as a whole *(round «Holes» added `holes`)*:

```ts
export interface Reading {
  inForce: LineId[];
  revoked: LineId[];
  expected: Handles;
  /** The values some line in force refers to by { "$value": key } and no line states, by key. */
  holes: Array<{ key: string; lines: LineId[] }>;
  goals: GoalReading[];
  denunciations: Denunciation[];
  settled: boolean;
}
```

A hole is awaited, never denounced: a person answers it, so it leaves `denunciations` and `settled` as
they were, and the application decides whether to prompt, wait or ignore. Its `lines` are the lines in
force that hold the reference, in reading order. A goal's line holds those of its `when`, which it waits
for, and of its `with`, which its outcome carries; so does the outcome once it is written.

**Two passes.** The reading's second step reads the lines in force twice, both in reading order. The lines
whose payload holds no reference state their values; that gives the values a reference reads. Then every
line is read with each `{ "$value": key }` replaced by the value the first pass stated under its key, or,
where it stated none, left out (a key of an object, an item of a list), so that a rule states nothing from
it. That resolved payload is what every rule's `expect`, every `line` node of a condition and a `when`
read; the line as stored keeps the reference and its id covers it. A goal's line is read as it is written,
since its `when` and its `with` hold references of their own. A value stated through a reference serves no
other reference; there are neither chains nor circles. Where no line holds a reference the two passes are
one.

## 4 · Rules

| Binding | Was | Reads |
|---|---|---|
| `{ rule: 'value', key, from, required?, where? }` | `metadata … from` | the payload key's value |
| `{ rule: 'value', key, value, where? }` | `metadata … value` | a fixed value |
| `{ rule: 'value', key, collect, required?, where? }` | `metadata … collect` | adds to the key's list |
| `{ rule: 'value', keyFrom, from, where? }` | — *(round «Holes»)* | the value under `from`, stated under the key the payload holds under `keyFrom`: a fill |
| `{ rule: 'collect-writer', key }` | — *(round «Conditions»)* | adds the writer's id to the key's list, as `collect` does |
| `{ rule: 'join', set, from, required? }` | `assign` | a name or a list of names |
| `{ rule: 'leave', set }` | `release` | the writer's id leaves the set |
| `{ rule: 'revoke', from, gists }` | the same | mechanic |
| `{ rule: 'goal' }` | the same | mechanic |

`join` and `leave` must name a set the schema declares. A `value` binding has exactly one of its four forms,
which are `from`, `value`, `collect` (each with a `key`) and `keyFrom` (with `from`, and no `key`); `required`
is not allowed with `keyFrom`, since a fill that lacks its key or its value states nothing, as a payload that
lacks what a binding reads always does. A later line wins, as for every value.

```ts
export interface RuleKind {
  rule: string;
  /** The handle kinds its expectations go into: a kit that lacks one cannot hold the rule. */
  handles: string[];
  /** The binding as typed, or a problem in English. Unknown keys are a problem. */
  read(binding: Record<string, unknown>, schema: SchemaHead): RuleBinding | string;
  /**
   * Why a payload cannot carry this binding, in English and without the gist, or nothing. `payload` is the draft
   * with each reference that resolves replaced by its value and the others left as they are: a reference counts
   * as present and is not checked. `written` is the draft as written (round «Holes»).
   */
  admit(binding: RuleBinding, payload: Payload, written: Payload, schema: Schema): string | undefined;
  /** States what the line expects, into the accumulators of the handle kinds; the payload is read with each reference replaced. */
  expect(binding: RuleBinding, line: EventLine, acc: (kind: string) => unknown): void;
}
```

`admit` is asked of a draft and of a goal's outcome payload alike («a draft and a goal's outcome
are held to the same checks»), so there is no second method for the goal. `handles` lets the
reader refuse, when the schema is read, a rule that states into a handle kind the kit lacks.

*Round «Holes».* Admission reads a draft's references against the values the thread states as it stands
(the first pass above). `payloadProblem(schema, gist, payload, values?)` gives each rule kind's `admit` the
payload with each reference that resolves replaced by its value and each that does not left in place, so a
hole counts as present: `required` is satisfied by it, and a rule's own checks on the value's shape (`join`
wants a name or a list of names) apply where the reference resolved and not where it did not. A reference
that stays is a name to come, as an item of a list too. The `value` rule's fill is judged as written: `admit`
refuses it, as `invalid-payload`, when the payload holds under `keyFrom` something that is not a string
(a reference is not one), when that key is one a binding of the schema states (any binding that has a
`key`: a hole named `status` must not set the status; the set is read from the schema's gists in each
admission), and when the value under `from` holds a reference, at any depth, whether or not it would
resolve: a fill states a plain value. A fill whose `where` does not match its payload is not asked. A
`when` reads the draft with its references replaced the same way, so a hole makes `has` false and `is`
false.

## 5 · The schema

```json
{
  "name": "sibar-activity",
  "version": 1,
  "opening": "create",
  "authority": "system::sibardoc",
  "sets": ["assignees"],
  "records": { "value": "metadata_set", "join": "assigned", "leave": "unassigned", "warning": "goal_warning" },
  "judged": ["user"],
  "guards": { "assignee": { "is": { "$writer": "id" }, "values": [{ "$set": "assignees" }] } },
  "gists": [
    { "gist": "create", "writers": ["user"], "rules": [
      { "rule": "value", "key": "name", "from": "name", "required": true },
      { "rule": "value", "key": "status", "value": "open" },
      { "rule": "join", "set": "assignees", "from": "assignTo", "required": true }
    ] },
    { "gist": "quit", "writers": ["user"], "rules": [{ "rule": "leave", "set": "assignees" }], "when": { "guard": "assignee" } }
  ],
  "laws": [
    { "law": "keeps-set", "set": "assignees", "while": { "is": { "$value": "status" }, "values": ["open"] }, "strength": "refuse" },
    { "law": "keeps-goals", "strength": "confirm" },
    { "law": "settles", "strength": "refuse" }
  ]
}
```

- `name` and `version`: optional, both or neither: the schema's name in lower kebab case, and a whole
  number from 1. A thread's first line declares them, and a schema reads only the threads declared for
  it. *(Round «The first line declares the thread».)*
- `opening`: the gist of the opening rule. `authority`: the writer of the records. `judged`: the
  kins whose lines the laws judge (none if left out). `sets`: the names of the sets (none if left
  out). `records`: one gist per role; each must be a gist of the schema whose writers include the
  authority's kin (and `goal` for `warning`), and which has no rules: a record states nothing, or
  the thread could never settle. Every role of every handle kind of the kit must be
  named; `warning` may be left out, and then the thread expects no warnings and no node is
  judged lost. A schema that uses fewer handle kinds is read against a smaller kit.
- `laws`: optional; a schema with none judges nothing.
- `when`: a condition ([conditions](conditions.md) §2), read with the writer and the draft. `guards`:
  optional, the named guards, each a condition, used by `{ "guard": name }` in a `when`, a goal or a
  law; a guard may read `$writer` and `$draft`, and then only a `when` may use it. *(Round «Conditions»;
  `when` was `{ checks?, in?, values? }`.)*

```ts
export function readSchema(json: unknown, kit: Kit): { schema: Schema; problems: string[] };
```

Never throws, and names every problem it finds; a schema with any problem gives an empty schema and
the problems, since a gist schema or law left out would change what the rest does: the next post
would answer as though what only that gist stated had never been said. A problem may be in the head
(`name` and `version`, `opening`, `authority`, `sets`, `records`, `judged`, `guards`), in a gist schema or a law, or in how the head
fits the gists: an opening gist, or a record gist, with no schema, or whose writers do not fit, or a
record gist with rules. A rule or law naming a kind the kit lacks is a problem. `readGists(value,
kit, head)` and `readLaws(value, kit, head)` read the two lists alone, and keep each element that
passes.

## 6 · Laws

```ts
export interface LawKind {
  law: string;
  read(binding: Record<string, unknown>, schema: SchemaHead): LawBinding | string;
  judge(
    binding: LawBinding,
    before: { reading: Reading; handles: Handles; lines: EventLine[] },
    after: { reading: Reading; handles: Handles; lines: EventLine[] },
    schema: Schema,
  ): Array<Omit<Verdict, 'strength' | 'law'> & { detail: string }>;
}
```

`keeps-set { set, while? }`: broken when, after, the set is empty and the condition `while` holds,
read on the handles after and the lines then in force, with the schema's guards; `while` reads neither
the writer nor the draft. Its detail says so in the schema's own words for the set, never in a
domain's. Its verdict names the set (`set`), so an application can word it. `keeps-goals`: broken for
each goal in force that the line would make lost, one verdict per goal, carrying the goal (`goal`) and
the path of the node that would make it lost (`path`); a goal lost before through the same node is not
new. `settles` as now. *(Round «Conditions»: `judge` takes the lines and the schema, which a condition
needs; `while` was `{ [key]: Json }`, and `keeps-goals` spoke of a check's index.)* Laws come from the schema; `dryRun` and `post` judge
them for drafts whose writer's kin is in `judged`. The same law may appear again with other keys
(one `keeps-set` per set); the same law with the same keys twice is a problem, as a gist twice is.

## 7 · Posting, the policy, the diff

```ts
export function dryRun(state, draft, schema, now, options?: { policy?: Policy; nonce?: string; from?: Seal[] }): Promise<DryRun>;
export function post(state, draft, schema, now, options?: { confirmed?: boolean; policy?: Policy; nonce?: string; from?: Seal[] }): Promise<PostResult>;
export function settle(state, schema, now, policy?: Policy): Promise<{ state; reading; rounds }>;
export function answer(reading: Reading, handles: Handles, policy?: Policy): Denunciation[];
export function diff(before: Handles, after: Handles, kit: Kit): Change[];
```

**Rounds.** From [goals fire in thread order](../decisions/goals-fire-in-thread-order.md). `settle` runs to the thread's end. Each round answers every handle denunciation and every warning the policy does not leave, and the outcome of one goal: among the goals met and not yet fired, the one whose line comes first in reading order. The bound is derived: the goals in force that have not written their outcome, plus two. A round past the bound is not run; the thread pauses, `settled` is false, and `settles` refuses the line. Only a handle kind that does not cure the difference it answers can reach the bound, so for the base kit it is an assertion. `rounds` lists what each round answered.

`dryRun` takes the policy too, so a preview is the post it previews. `now` is the host's argument, not
the writer's: one that does not parse as a date is a mistake of the caller and not a refusal, so `post`,
`dryRun` and `settle` reject with the platform's `RangeError` when they come to stamp a line, as `stamp`
does, and the state given is unchanged.

`consequitur`, `admit`, `reconcile`, `payloadProblem`, `whenHolds` and `offers` take the schema where the
ported engine took the gist schemas, since the kinds they ask live in its kit; `inForce` still takes
the list of gist schemas, as it reads nothing else. `reconcile` writes each record as the schema's
`authority`, under the gist its `records` gives the answer's role.

**The policy** is the authority's, not the schema's: a list of entries, each a denunciation
pattern and an optional condition, «leave this unanswered when that holds»:

```ts
export type Policy = Array<{
  leave: { sort?: 'handle' | 'line'; kind?: string; key?: string; member?: string; gist?: string };
  while?: { values: Record<string, Json> };    // read on the handles as they stand
}>;

export function readPolicy(json: unknown, schema: Schema): { policy: Policy; problems: string[] };
```

A policy is conf, as a schema is, and `readPolicy` reads it against the schema it will be passed
with. It never throws, and every key is checked at every level, since a mistyped word would silently
change what the authority answers: an entry has `leave` and may have `while`; `leave` has only
`sort` (`handle` or `line`), `kind` (a handle kind of the schema's kit), `key` and `member`
(strings) and `gist` (a gist of the schema); `while` has only `values`, an object of JSON with at
least one key. A policy with any problem is read as the empty policy, and the problems say why.

`settle` answers every denunciation `answer` returns: all but those of the thread and those a
policy entry leaves. The condition is read on the handles as they stand at the start of each
round. A reading whose only denunciations are left by the policy counts as settled (`settled:
true`, the denunciations still listed): the bound stops being reached, and the law `settles` does
not refuse the line. Example:
`{ leave: { kind: 'set', key: 'assignees' }, while: { values: { status: 'closed' } } }` — SIBAR's
«quits on a done activity are not answered».

**The diff** lists, per handle kind, what changed: `value` gives `{ kind: 'value', key, before?,
after? }`; `set` gives `{ kind: 'set', key, member, change: 'join' | 'leave' }`.

## 8 · Offers

`offers` computes the expectations once per call, not once per gist. Same result. Admission and
the menu still ask one question: `whenHolds(lines, writer, gist, schema, payload?)` computes the
expectations for its one gist, and `offers` asks the same part of them (`holds`) for each. Admission
passes the draft's payload, as it will be stored; the menu has none, so a node of a `when` that reads
`$draft` is unknown, unknown spreads by Kleene's strong tables, and a gist is offered unless its `when`
is false ([the reading is closed-world](../decisions/closed-world-reading.md)). The menu may offer what
admission then refuses for its payload, never the reverse.
The engine neither offers the lines it writes itself, one by a writer of kin `goal` and one of a gist
the head's `records` names (`warning` included), nor admits them (`writer-not-allowed`): `settle`
writes them, and they skip admission. A revoke names only a line in force: one of a line already out
of force is not offered, and admission refuses it (`not-revocable`).

## 9 · The SIBAR case

`cases/sibar-activity/schema.json` is `BASE_GIST_DATA` written in this schema, with the head of
§5 and the three laws. `BASE_GIST_DATA` and `BASE_GISTS` leave the package. The tests read the
case; their test-only inline schemas are rewritten in the new words.
