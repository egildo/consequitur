# The engine — spec

Status: settled, built in round 3 («Generalise», [plan](../plan.md) §4). This describes
`packages/consequitur`; where the build had to add to what was proposed, the text says so in place.
Words as in the [glossary](../glossary.md).

What does not change from the ported engine is not repeated here: the line and its envelope
(`canonical`, `stamp`, `verify`, `inOrder`), reading order, in force and revoking, the three
steps of the reduction, goals (once, final, `with`, warnings and anchoring), `when` and the
offers, the cap of three rounds, the dry run and its `added`, `rounds`, `verdicts`. Their
behaviour is the 250 tests'; this round changes the words and opens the kinds, never the meaning.

## 1 · What is a mechanic and what is a kind

**Mechanics** belong to the thread and are not registrable: the envelope and its hash; reading
order; **revoke** (a binding `{ rule: 'revoke', from, gists }`); **goal** (`{ rule: 'goal' }`,
its checks, once, final, `with`, warnings); the opening rule (exactly one line of the opening gist
in force); `when`; reconciliation's loop and cap; laws' place in a post.

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
export const BASE_KIT: Kit;   // handles: value, set · rules: value, join, leave · laws: keeps-set, keeps-goals, settles
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
  /** A fresh accumulator for one reduction. */
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

Order: `thread`; then `line` (by goal name, outcome before warnings, warnings by check index);
then `handle`, by kind in the kit's order, then each kind's own order (value by key; set by set,
then member).

## 4 · Rules

| Binding | Was | Reads |
|---|---|---|
| `{ rule: 'value', key, from, required?, where? }` | `metadata … from` | the payload key's value |
| `{ rule: 'value', key, value, where? }` | `metadata … value` | a fixed value |
| `{ rule: 'value', key, collect, required?, where? }` | `metadata … collect` | adds to the key's list |
| `{ rule: 'join', set, from, required? }` | `assign` | a name or a list of names |
| `{ rule: 'leave', set }` | `release` | the writer's id leaves the set |
| `{ rule: 'revoke', from, gists }` | the same | mechanic |
| `{ rule: 'goal' }` | the same | mechanic |

`join` and `leave` must name a set the schema declares.

```ts
export interface RuleKind {
  rule: string;
  /** The handle kinds its expectations go into: a kit that lacks one cannot hold the rule. */
  handles: string[];
  /** The binding as typed, or a problem in English. Unknown keys are a problem. */
  read(binding: Record<string, unknown>, schema: SchemaHead): RuleBinding | string;
  /** Why a payload cannot carry this binding, in English and without the gist, or nothing. */
  admit(binding: RuleBinding, payload: Payload): string | undefined;
  /** States what the line expects, into the accumulators of the handle kinds. */
  expect(binding: RuleBinding, line: EventLine, acc: (kind: string) => unknown): void;
}
```

`admit` is asked of a draft and of a goal's outcome payload alike («a draft and a goal's outcome
are held to the same checks»), so there is no second method for the goal. `handles` lets the
reader refuse, when the schema is read, a rule that states into a handle kind the kit lacks.

## 5 · The schema

```json
{
  "opening": "create",
  "authority": "system::sibardoc",
  "sets": ["assignees"],
  "records": { "value": "metadata_set", "join": "assigned", "leave": "unassigned", "warning": "goal_warning" },
  "judged": ["user"],
  "gists": [
    { "gist": "create", "writers": ["user"], "rules": [
      { "rule": "value", "key": "name", "from": "name", "required": true },
      { "rule": "value", "key": "status", "value": "open" },
      { "rule": "join", "set": "assignees", "from": "assignTo", "required": true }
    ] },
    { "gist": "quit", "writers": ["user"], "rules": [{ "rule": "leave", "set": "assignees" }], "when": { "in": "assignees" } }
  ],
  "laws": [
    { "law": "keeps-set", "set": "assignees", "while": { "status": "open" }, "strength": "refuse" },
    { "law": "keeps-goals", "strength": "confirm" },
    { "law": "settles", "strength": "refuse" }
  ]
}
```

- `opening`: the gist of the opening rule. `authority`: the writer of the records. `judged`: the
  kins whose lines the laws judge (none if left out). `sets`: the names of the sets (none if left
  out). `records`: one gist per role; each must be a gist of the schema whose writers include the
  authority's kin (and `goal` for `warning`), and which has no rules: a record states nothing, or
  the thread could never settle. Every role of every handle kind of the kit must be
  named; `warning` may be left out, and then the thread expects no warnings and no check is
  judged. A schema that uses fewer handle kinds is read against a smaller kit.
- `laws`: optional; a schema with none judges nothing.
- `when`: `{ checks?, in?: <set>, values?: { [key]: Json } }` — `in` and `values` replace
  `assignee` and `metadata`.

```ts
export function readSchema(json: unknown, kit: Kit): { schema: Schema; problems: string[] };
```

Never throws; a gist schema or law that fails is left out and named, the rest kept; a schema whose
head (`opening`, `authority`, `sets`, `records`, `judged`) fails gives an empty schema and the
problems. So does a head that names a gist the reader did not keep: an opening gist, or a record
gist, with no schema, or whose writers do not fit. A rule or law naming a kind the kit lacks is a
problem. `readGists(value, kit, head)` and `readLaws(value, kit, head)` read the two lists alone.

## 6 · Laws

```ts
export interface LawKind {
  law: string;
  read(binding: Record<string, unknown>, schema: SchemaHead): LawBinding | string;
  judge(binding: LawBinding, before: { reading: Reading; handles: Handles }, after: { reading: Reading; handles: Handles }): Array<Omit<Verdict, 'strength' | 'law'> & { detail: string }>;
}
```

`keeps-set { set, while? }`: broken when, after, every value in `while` holds and the set is
empty; its detail says so in the schema's own words for the set and the values, never in a
domain's. Its verdict names the set (`set`), so an application can word it. `keeps-goals` and `settles` as now. Laws come from the schema; `dryRun` and `post` judge
them for drafts whose writer's kin is in `judged`. The same law may appear again with other keys
(one `keeps-set` per set); the same law with the same keys twice is a problem, as a gist twice is.

## 7 · Posting, the policy, the diff

```ts
export function dryRun(state, draft, schema, now, options?: { policy?: Policy }): Promise<DryRun>;
export function post(state, draft, schema, now, options?: { confirmed?: boolean; policy?: Policy }): Promise<PostResult>;
export function settle(state, schema, now, policy?: Policy): Promise<{ state; reading; rounds }>;
export function answer(reading: Reading, handles: Handles, policy?: Policy): Denunciation[];
export function diff(before: Handles, after: Handles, kit: Kit): Change[];
```

`dryRun` takes the policy too, so a preview is the post it previews.

`reduce`, `admit`, `reconcile`, `payloadProblem`, `whenHolds` and `offers` take the schema where the
ported engine took the gist schemas, since the kinds they ask live in its kit; `inForce` still takes
the list of gist schemas, as it reads nothing else. `reconcile` writes each record as the schema's
`authority`, under the gist its `records` gives the answer's role.

**The policy** is the authority's, not the schema's: a list of entries, each a denunciation
pattern and an optional condition, «leave this unanswered when that holds»:

```ts
export type Policy = Array<{
  leave: { sort?: 'handle' | 'line'; kind?: string; key?: string; member?: string; gist?: string };
  while?: { values?: Record<string, Json> };   // read on the handles as they stand
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
true`, the denunciations still listed): the cap stops being reached, and the law `settles` does
not refuse the line. Example:
`{ leave: { kind: 'set', key: 'assignees' }, while: { values: { status: 'closed' } } }` — SIBAR's
«quits on a done activity are not answered».

**The diff** lists, per handle kind, what changed: `value` gives `{ kind: 'value', key, before?,
after? }`; `set` gives `{ kind: 'set', key, member, change: 'join' | 'leave' }`.

## 8 · Offers

`offers` computes the expectations once per call, not once per gist. Same result. Admission and
the menu still ask one question: `whenHolds(lines, writer, gist, schema)` computes the
expectations for its one gist, and `offers` asks the same part of them (`holds`) for each.
The engine neither offers the lines it writes itself, one by a writer of kin `goal` and one of a gist
the head's `records` names (`warning` included), nor admits them (`writer-not-allowed`): `settle`
writes them, and they skip admission.

## 9 · The SIBAR case

`cases/sibar-activity/schema.json` is `BASE_GIST_DATA` written in this schema, with the head of
§5 and the three laws. `BASE_GIST_DATA` and `BASE_GISTS` leave the package. The tests read the
case; their test-only inline schemas are rewritten in the new words.
