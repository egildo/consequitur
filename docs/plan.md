# The plan — extracting the engine into a library

Status: proposed, written 2026-10-04, for discussion before anything is built. When the hot
points of section 5 are settled this file becomes the brief for the first rounds, and its
settled parts move into `architecture.md` and `decisions/`.

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

| In SIBAR | In sequitur | Why |
|---|---|---|
| handles = `{ metadata, assignees }` | `{ values: Record<string, Json>, sets: Record<string, string[]> }`; the schema names its sets | assignees are one set among many: reviewers, signers, watchers |
| rule `metadata` | rule `value` (`from`, `value` or `collect`, with `where`) | the handle's sort, not SIBAR's word |
| rules `assign` / `release` | `join { set, from }` / `leave { set }` | membership of any set |
| `when.assignee` | `when.in: '<set>'` | the same, for any set |
| `create`, reserved | the schema's `opening` gist | no gist name in the engine |
| `metadata_set`, `assigned`, `unassigned`, `goal_warning`, reserved | the schema's `records` names them | SIBAR keeps its names; another domain picks its own |
| the five rule words, closed | **rule kinds**, registered; the base five ship with the library | extension without a fork |
| `keeps-assignee`, `keeps-goals`, `settles` | law kinds; `keeps-set { set, while }` generalises the first | a law about any set |
| the watcher, not built | `answer(reading, handles, policy)`: a pure policy filter before reconciliation | the authority's choice, as conf |

What does **not** change: the line, its hash and chain, reading order, revoke by line id and by
gist list, the three steps of the reduction, the comparison both ways, reconciliation capped at
three rounds, goals that fire once, final goals, outcomes with a payload, warnings when the
thread lost what a check names, `when` and the offers, laws judging only one kin's lines, the dry
run. The semantics are the 250 tests', and they must pass on the SIBAR case unchanged in meaning.

## 3 · The shape

One package, `@egildo/sequitur`, zero dependencies, ES modules, TypeScript type-stripped in
development and built with `vite` + `tsc` for publishing — the layout of fewrd.

```
src/
  line.ts        canonical, stamp, verify, inOrder, inForce
  schema.ts      readSchema(json, kinds) → { schema, problems }
  kinds/         revoke, value, join, leave, goal — each a RuleKind
  reduce.ts      expectations, comparison, the reading
  settle.ts      reconcile, answer (policy), settle, post, dryRun
  offers.ts      whenHolds, offers (expectations computed once)
  laws/          keeps-set, keeps-goals, settles — each a LawKind
  index.ts
cases/
  sibar-activity/   schema.json, ui.json, scenarios/*.json (the SIBAR tests' scenarios)
  <second domain>/
playground/        the page, generalised from the bench
test/              node --test, reading cases/
docs/
```

The API, as a consumer writes it:

```ts
import { readSchema, BASE_KINDS, post, dryRun, offers, emptyState } from '@egildo/sequitur';

const { schema, problems } = readSchema(json, BASE_KINDS);
let state = emptyState(schema);
const now = new Date().toISOString();

const preview = await dryRun(state, { gist: 'memo', writer: 'user::mrossi', payload: { text, assignTo: ['lbianchi'] } }, schema, now);
// preview.added, preview.rounds, preview.verdicts — show them

const result = await post(state, draft, schema, now, { confirmed: true });
if (!result.refusal) state = result.state;
offers(state.lines, 'user::lbianchi', schema);   // what to put in the menu
```

The ProseMirror correspondence, which the library should feel like:

| ProseMirror | sequitur |
|---|---|
| `Schema`, node specs as data | `Schema`, gist schemas as data |
| `Node` (immutable) | `EventLine` (immutable, hashed) |
| `EditorState` | `ThreadState` + its `Reading` |
| `Transaction`, `filterTransaction` | a draft, `post`, laws |
| plugins, node views | rule kinds, law kinds |
| `EditorView` | not in the library — the playground shows one |

## 4 · Rounds

1. **Carve.** These documents, settled by the discussion of section 5.
2. **Port as is.** The engine and its 250 tests copied over, green under `node --test`, with no
   change of meaning. Nothing generic yet: it proves the move.
3. **Generalise.** Handles as values and sets; rule kinds and law kinds registered; the opening
   gist and the record gists named by the schema; `readSchema`; the policy. SIBAR becomes
   `cases/sibar-activity/`, and the tests read it. `offers` computes the expectations once.
4. **The playground.** The bench page generalised: a domain picker; the schema as editable JSON
   with its problems listed live; the thread written by hand; the dry-run preview; the goal dock;
   the inspector with the gist schemas as code. Driven by a domain's `ui.json`, never by a gist
   name in code.
5. **A second domain**, to find what does not fit.
6. **Publish 0.1.0.** Then, in `sibardoc-prototype`, a round that replaces
   `packages/core/src/thread/` with the package.

## 5 · Hot points

Open, for discussion now.

1. **The name on npm.** `sequitur` is taken (1.3.0, an unrelated package). `@egildo/sequitur`,
   or another name?
2. **Handles as values and sets.** Enough? SIBAR fits. A domain that needs counters, lists of
   records or numbers compared with `<` does not. Keep the three handle sorts closed (value, set,
   line) and extend only rules and laws — or open handle sorts too?
3. **Equality-only checks.** Checks and `when` compare with `canonical` equality. «Amount above
   10,000», «signed before the deadline» are out. A comparison vocabulary (`gt`, `in`, `before`)
   is the most requested thing a second domain will ask for. Now or later?
4. **The vocabulary.** Keep SIBAR's words — thread, line, gist, writer, kin, rule, reading,
   denunciation, reconciliation, goal, law, dry run — and rename only what is SIBAR's (metadata,
   assignees, assign, release)? `join`/`leave`, `value`/`set` handles, `opening`, `records` are
   my proposals.
5. **Rule kinds as registered code.** A kind declares how its binding is read, what a payload
   must hold, and what it expects, in the closed handle sorts; comparison and reconciliation stay
   the engine's. Is that the right place for the line between data and code?
6. **The UI schema.** Labels, card sorts, how a gist is composed, how it is awaited. Library
   (`@egildo/sequitur/ui`, a typed convention) or playground only?
7. **The authority's part.** In the library: the policy filter and a diff of handles before and
   after (what a host applies to its own assignments and indexes). Out: queues, storage, retries.
   Agreed?
8. **The second domain.** Something unlike SIBAR, with two parties and a deadline: an editorial
   review (two approvals, publish), a purchase request (thresholds — tests point 3), a bug ticket
   (reopen by the reporter). Which one?
9. **One package or several.** ProseMirror splits model, state, transform and view. One package
   with subpath exports until a consumer needs only part of it?
10. **The playground's home.** In this repo, served by `pnpm dev`, and deployed (as fewrd's is)?
