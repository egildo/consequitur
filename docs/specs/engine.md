# The engine — spec

Status: proposed for round 3 («Generalise», [plan](../plan.md) §4). When round 3 lands, this
describes `packages/consequitur`. Words as in the [glossary](../glossary.md).

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
handle holding an empty list for every set the schema declares.

```ts
export interface HandleKind {
  kind: string;
  empty(schema: Schema): Json;
  /** A fresh accumulator for one reduction. */
  start(): unknown;
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
  /** The binding as typed, or a problem in English. Unknown keys are a problem. */
  read(binding: Record<string, unknown>, schema: SchemaHead): RuleBinding | string;
  /** Why a payload cannot carry this binding, in English, or nothing. */
  admit(binding: RuleBinding, payload: Payload): string | undefined;
  /** Whether a goal's empty-or-given outcome payload satisfies this binding (a `required` key). */
  asks(binding: RuleBinding, payload: Payload): boolean;
  /** States what the line expects, into the accumulators of the handle kinds. */
  expect(binding: RuleBinding, line: EventLine, acc: (kind: string) => unknown): void;
}
```

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
  kins whose lines the laws judge. `records`: one gist per role; each must be a gist of the schema
  whose writers include the authority's kin (and `goal` for `warning`).
- `when`: `{ checks?, in?: <set>, values?: { [key]: Json } }` — `in` and `values` replace
  `assignee` and `metadata`.

```ts
export function readSchema(json: unknown, kit: Kit): { schema: Schema; problems: string[] };
```

Like `readGists`: never throws; a gist schema or law that fails is left out and named, the rest
kept; a schema whose head (`opening`, `authority`, `sets`, `records`, `judged`) fails gives an
empty schema and the problems. A rule or law naming a kind the kit lacks is a problem.

## 6 · Laws

```ts
export interface LawKind {
  law: string;
  read(binding: Record<string, unknown>, schema: SchemaHead): LawBinding | string;
  judge(binding: LawBinding, before: { reading: Reading; handles: Handles }, after: { reading: Reading; handles: Handles }): Array<Omit<Verdict, 'strength' | 'law'> & { detail: string }>;
}
```

`keeps-set { set, while? }`: broken when, after, every value in `while` holds and the set is
empty. `keeps-goals` and `settles` as now. Laws come from the schema; `dryRun` and `post` judge
them for drafts whose writer's kin is in `judged`.

## 7 · Posting, the policy, the diff

```ts
export function dryRun(state, draft, schema, now): Promise<DryRun>;
export function post(state, draft, schema, now, options?: { confirmed?: boolean; policy?: Policy }): Promise<PostResult>;
export function settle(state, schema, now, policy?: Policy): Promise<{ state; reading; rounds }>;
export function diff(before: Handles, after: Handles, kit: Kit): Change[];
```

**The policy** is the authority's, not the schema's: a list of entries, each a denunciation
pattern and an optional condition, «leave this unanswered when that holds»:

```ts
export type Policy = Array<{
  leave: { sort?: 'handle' | 'line'; kind?: string; key?: string; member?: string; gist?: string };
  while?: { values?: Record<string, Json> };   // read on the handles as they stand
}>;
```

`settle` answers every denunciation except `thread` and those a policy entry leaves; a reading
whose only denunciations are left by the policy counts as settled for the cap. Example:
`{ leave: { kind: 'set', key: 'assignees' }, while: { values: { status: 'closed' } } }` — SIBAR's
«quits on a done activity are not answered».

**The diff** lists, per handle kind, what changed: `value` gives `{ kind: 'value', key, before?,
after? }`; `set` gives `{ kind: 'set', key, member, change: 'join' | 'leave' }`.

## 8 · Offers

`offers` computes the expectations once per call, not once per gist. Same result.

## 9 · The SIBAR case

`cases/sibar-activity/schema.json` is `BASE_GIST_DATA` written in this schema, with the head of
§5 and the three laws. `BASE_GIST_DATA` and `BASE_GISTS` leave the package. The tests read the
case; their test-only inline schemas are rewritten in the new words.
