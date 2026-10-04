# The plan — extracting the engine into a library

Status: settled 2026-10-04 by Egildo's answers (section 5). This file is the brief for the
rounds; as each lands, what it made true moves into `architecture.md`, and a ruling worth
keeping into `decisions/`.

## 1 · Where it comes from

In `sibardoc-prototype`, on the branch `activities-as-threads`:

- the engine, `packages/core/src/thread/` (types, line, reduce, schema, gists, settle, offers,
  laws): about 1,100 lines, pure, zero dependencies, 250 tests in
  `packages/core/tests/thread.test.ts`;
- the rounds that shaped it: `docs/next/activity-threads-round.md`, `thread-goals-round.md`,
  `thread-dry-run-round.md`;
- the bench page, `bench/src/thread/` (plain TypeScript and DOM, markdown-it): the screen as a
  deduction, the composer, the dry-run preview, the goal dock, the inspector, the elastic band.

Everything there is SIBAR's: its gists, its words, its handles (metadata and assignees). This
library keeps the engine and turns SIBAR into the first **domain**: a schema in `cases/`.

## 2 · What changes on the way out

| In SIBAR | In consequitur | Why |
|---|---|---|
| handles = `{ metadata, assignees }` | handles of registered **handle kinds**: `value` (keyed JSON) and `set` (named sets of names) ship with the library; the schema names its sets | assignees are one set among many, and a domain may need a handle of its own |
| rule `metadata` | rule `value` (`from`, `value` or `collect`, with `where`) | the handle's sort, not SIBAR's word |
| rules `assign` / `release` | `join { set, from }` / `leave { set }` | membership of any set |
| `when.assignee` | `when.in: '<set>'` | the same, for any set |
| `create`, reserved | the schema's `opening` gist | no gist name in the engine |
| `metadata_set`, `assigned`, `unassigned`, `goal_warning`, reserved | the schema's `records` names them | SIBAR keeps its names; another domain picks its own |
| the five rule words, closed | **rule kinds**, registered; the base five ship with the library | extension without a fork |
| comparison and reconciliation fixed to two handles | each handle kind brings its comparison and its answer | the engine stays the same when a handle kind is added |
| `keeps-assignee`, `keeps-goals`, `settles` | law kinds; `keeps-set { set, while }` generalises the first | a law about any set |
| the watcher, not built | `answer(reading, handles, policy)`: a pure policy filter before reconciliation | the authority's choice, as conf |

What does **not** change: the line, its hash and chain, reading order, revoke by line id and by
gist list, the three steps of the reduction, the comparison both ways, reconciliation capped at
three rounds, goals that fire once, final goals, outcomes with a payload, warnings when the
thread lost what a check names, `when` and the offers, laws judging only one kin's lines, the dry
run. The semantics are the 250 tests', and they must pass on the SIBAR case unchanged in meaning.

## 3 · The shape

A pnpm monorepo publishing several packages. Zero runtime dependencies in each; TypeScript
type-stripped by Node in development, built with `vite` + `tsc` for publishing.

```
packages/
  consequitur/          the engine — npm `consequitur`
    src/line.ts           canonical, stamp, verify, inOrder, inForce
    src/schema.ts         readSchema(json, kit) → { schema, problems }
    src/handles/          value, set — each a HandleKind
    src/rules/            revoke, value, join, leave, goal — each a RuleKind
    src/laws/             keeps-set, keeps-goals, settles — each a LawKind
    src/reduce.ts         expectations, comparison, the reading
    src/settle.ts         reconcile, answer (the policy), settle, post, dryRun, diff
    src/offers.ts         whenHolds, offers (expectations computed once)
    test/
  consequitur-render/   a reading made into DOM — npm `consequitur-render`
    src/                  keyed nodes by line id, the dry-run preview loop, the band
cases/
  sibar-activity/       schema.json, scenarios — SIBAR's semantics, the 250 tests' truth
  editorial-review/     the second domain
playground/             the sample application, private: built only on the two packages;
                        the UI schema (labels, cards, compose, awaited) lives here
docs/
```

A **kit** is the set of kinds a schema may use: `BASE_KIT` holds the base handle, rule and law
kinds; a consumer adds its own. A schema names kinds; `readSchema` refuses one the kit lacks.

The API, as a consumer writes it:

```ts
import { readSchema, BASE_KIT, emptyState, dryRun, post, offers, diff } from 'consequitur';

const { schema, problems } = readSchema(json, BASE_KIT);
let state = emptyState(schema);
const now = new Date().toISOString();

const preview = await dryRun(state, draft, schema, now);   // added, rounds, verdicts
const result = await post(state, draft, schema, now, { confirmed: true });
if (!result.refusal) {
  const changes = diff(state.handles, result.state.handles);   // what the host applies
  state = result.state;
}
offers(state.lines, 'user::lbianchi', schema);
```

The ProseMirror correspondence, which the library should feel like:

| ProseMirror | consequitur |
|---|---|
| `Schema`, node specs as data | `Schema`, gist schemas as data |
| `Node` (immutable) | `EventLine` (immutable, hashed) |
| `EditorState` | `ThreadState` + its `Reading` |
| `Transaction`, `filterTransaction` | a draft, `post`, laws |
| plugins, node views | handle, rule and law kinds |
| `prosemirror-view` | `consequitur-render`, a small toolkit; the application draws |

## 4 · Rounds

1. **Carve.** These documents. Done.
2. **The monorepo, and the engine ported as is.** The workspace, the two package folders, the
   engine and its 250 tests copied from `sibardoc-prototype` into `packages/consequitur`, green
   under `node --test`, with no change of meaning. `consequitur-render` is an empty package.
3. **Generalise.** Handle kinds, rule kinds, law kinds and the kit; the opening gist and the
   record gists named by the schema; `readSchema`; the policy; `diff`; `offers` computing the
   expectations once. SIBAR becomes `cases/sibar-activity/`, and the tests read it.
4. **Render, and the playground.** `consequitur-render` from what the bench proved (keyed nodes,
   the preview loop, the band); the playground as a sample application on the SIBAR domain: the
   thread, the composer, the preview, the goal dock, the inspector with the schema as code.
5. **The editorial review**, the second domain: a draft, two reviewers who must both approve, an
   editor who publishes, a deadline written as a line. What does not fit is recorded.
6. **Publish 0.1.0.** The switching in `sibardoc-prototype` comes after, there.

## 5 · Settled

Egildo's answers, 2026-10-04.

| Question | Answer |
|---|---|
| The name | **consequitur** — free on npm, «it follows as a consequence» |
| Handles beyond values and sets | **Possible**: handle kinds are registered, like rule and law kinds |
| Comparisons in checks (`gt`, `before`) | **Later** |
| The vocabulary | **The proposals**: `value` and `set` handles, `join`/`leave`, `opening`, `records`, kinds and kit |
| Rule kinds as registered code; comparison and answer the engine's (per handle kind) | **Yes** |
| The UI schema | **Playground only**; the library offers the reducer and a render module; the playground is a sample real-life application |
| The authority's part | **Agreed**: the policy and `diff` in; queues, storage and retries out. The server part is for later |
| The second domain | **Editorial review** |
| Packaging | **One monorepo, several packages** |
| Playgrounds | **Here only.** `sibardoc-prototype` gets no playground of this; it switches to the package once consequitur is ready |
