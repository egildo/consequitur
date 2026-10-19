# The plan — extracting the engine into a library

Status: settled 2026-10-04 by Egildo's answers (section 5); rounds 1 to 21 are done; 0.2.0 is published (2026-10-19). Rounds 17 to 21, the documents, added 2026-10-19. Rounds 6 to 9 reordered 2026-10-06: the order of goals and the scenarios need nothing from outside and go first; conditions and holes follow; «Publish» moves from 7 to 9. «Chain order» added as 9 the same day, «Publish» moves to 10. «The id names its recipe» added as 10 on 2026-10-08, «Publish» moves to 11; «The first line declares the thread» added as 11 the same day, «Publish» moves to 12. «Consolidation» and «The drill in the playground» added as 12 and 13 on 2026-10-13, «Publish» moves to 14. This file is the brief for the
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
type-stripped by Node in development, built with `tsc` alone for publishing (round 14).

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
   Done: the workspace, the engine and its 250 tests (run by vitest) green in `packages/consequitur`,
   and an empty `consequitur-render`.
3. **Generalise**, as [specs/engine.md](specs/engine.md) says. Handle kinds, rule kinds, law kinds and the kit; the opening gist and the
   record gists named by the schema; `readSchema`; the policy; `diff`; `offers` computing the
   expectations once. SIBAR becomes `cases/sibar-activity/`, and the tests read it.
   Done: the kinds and the kit, `readSchema` with its head, the policy, `diff`, `emptyState` and the
   single computation of `offers`; SIBAR is `cases/sibar-activity/schema.json`, and the 250 tests
   of round 2 pass in the new words, with the tests of what is new beside them.
4. **Render, and the playground**, as [specs/render.md](specs/render.md) and [specs/playground.md](specs/playground.md) say. `consequitur-render` from what the bench proved (keyed nodes,
   the preview loop, the band); the playground as a sample application on the SIBAR domain: the
   thread, the composer, the preview, the goal dock, the inspector with the schema as code.
   Done: `consequitur-render` (`lineFacts`, `keyed`, `previewer`, `band`), and the playground in
   `playground/`, the SIBAR thread bench ported onto the two packages and the case's schema.
5. **The editorial review**, as [specs/editorial-review.md](specs/editorial-review.md) says, the second domain: a draft, two reviewers who must both approve, an
   editor who publishes, a deadline written as a line. What does not fit is recorded.
   Done: `cases/editorial-review/` (schema and three scenarios), the shared scenario resolver in
   `cases/scenario.ts`, SIBAR's examples in the same shape, the engine's tests of the scenarios and of the
   five misfits, [misfits.md](misfits.md), and the playground with a domain picker. The engine did not change.
6. **Order and scenarios**, the round that needs nothing from outside: goals fire one per round in thread order and a post runs to its end, with the bound the goals give, as [goals fire in thread order](../explanation/decisions/goals-fire-in-thread-order.md) and the [engine spec](specs/engine.md) §7 say; the scenario player moves into the package, `prune` and `stepsOf` join it, and the warehouse is the third case, with its dry run against its own source, as [specs/scenarios.md](specs/scenarios.md) says, holes left for later.
   Done: goals fire one per round in thread order and `settle` runs to the bound the goals give (`MAX_ROUNDS` is gone); `scenario.ts` is in the package with `prune`, `stepsOf` and the `as` option, and `cases/warehouse-arrival/` plays «Tuesday» and checks «Saved» by a dry run against it.
7. **Conditions**, answering the misfits in one round, as [specs/conditions.md](specs/conditions.md)
   says: in kdlet, `kdlet-guards` (0.2.1 on npm) has the third answer the menu needs for a `$draft` operand; here, `when` and goals rewritten on it with
   `line`, `at-least` and the references, named guards in the schema, `collect-writer` in
   `BASE_KIT`; then `consequitur-kdl`, schemas written in KDL, shown so in the playground.
   Done: `condition.ts` on `kdlet-guards` 0.2 (which has the third answer), `when`, goals and `keeps-set`'s `while` as conditions with the references and the two words, the trace in `GoalReading` and one warning per path, named guards in the head, `collect-writer` in `BASE_KIT`, the three cases rewritten and the five misfits fitting; `consequitur-kdl` reads and writes a schema in KDL, each case has `schema.kdl`, and the playground draws the trace as a tree and shows the schema in KDL or JSON.
8. **Holes**, as [specs/conditions.md](specs/conditions.md) §7 says, from [holes are unstated values](../explanation/decisions/holes-are-unstated-values.md): a reference may stand in any payload, the reading resolves it in two passes, the `value` rule's `keyFrom` form, `Reading.holes`, `holed` in the package, and the warehouse's «Saved» with its holes and fills.
   Done: a `$value` reference stands in any payload and the reading resolves it in two passes (`resolvePayload` in `check.ts`, which `resolveCheck` reads too); `Reading.holes` lists what is awaited, and `changes` says a hole opened or filled; the `value` rule's `keyFrom` form is the fill, and admission refuses a fill that names a key the schema states or holds a reference, reads a hole as present and checks a resolved value's shape; a goal's `with` may hold a reference and its outcome completes when the key is stated; `holed` is in the package; the warehouse has the gist `fill`, «Saved» has its three holes and fills, and «Second assignee» fires a goal on a fill. The stopping law is not built, as the spec says.
9. **Chain order**, as [the chain is the order](../explanation/decisions/the-chain-is-the-order.md) says: the reading order walks `previous` from the first line, a thread that is not one chain is refused, and `stamp` no longer bends the timestamp. The first of the three decisions that change ids for ever; the other two did not join it: they are rounds 10 and 11.
   Done: `inOrder` walks the chain and refuses a thread that is not one (no first line or two, a fork, a gap, a line the walk never reaches), in one place, the sentence naming the last line read before the break; `stamp` writes the instant it is given; the hash and every stored id are unchanged, and the cases play as they were. `stepsOf` reads the kept lines in the order of the whole thread, since a part of a chain is no chain.
10. **The id names its recipe**, as [the id names its recipe](../explanation/decisions/the-id-names-its-recipe.md) says: `stamp` writes `sha256:` before the hex, `verify` reads the name and refuses one it does not know, and the glossary's **id** says so. Built alone, before the third decision is written: that one may change the recipe again, and nothing is stored to migrate.
   Done: `stamp` writes the id as `sha256:` and the 64 hex characters of the same hash as before, and `previous` quotes it whole; `verify` reads the name before the first colon and checks the recipe it names, `sha256` being the only one, so an id with an unknown name or no name does not verify, as one that does not match, and never throws; the hash input is unchanged. The test that pins an id's pattern pins the name, and new tests cover an unknown name, no name, a right name over wrong hex, and a JSON round trip.
11. **The first line declares the thread**, as [the first line declares the thread](../explanation/decisions/the-first-line-declares-the-thread.md) says: a schema may name itself (`name`, `version`), the first line's envelope carries `thread` (the nonce, and the schema's name and version when it has them) inside the hash, and every reading refuses a thread declared for another schema or version. The last of the three decisions that change ids for ever.
   Done: `readSchema` reads `name` (lower kebab case) and `version` (a whole number from 1), both or neither, and `consequitur-kdl` reads and writes them; `stamp(draft, lines, now, schema?, nonce?)` writes `thread` on the first line only, the nonce handed or 16 bytes drawn, with the schema's name and version when it has them, hashed as a sixth field on that line alone under the same `sha256`, and `verify` follows; `post`, `dryRun` and `playScenario` take a `nonce`. `inOrder(lines, schema)` refuses a declaration that does not match, in one place, with a sentence that names both, and every entry that reads a thread against a schema passes it the schema: `expectations` (so `consequitur`, `offers`, `whenHolds`, `settle`, `dryRun`, `post`), `admit`, `prune` and `lineFacts`. The three cases are named after their folders, at version 1. The tests that stamp a thread by hand stamp it for the schema that reads it, with one nonce.
12. **Consolidation**, as [threads are consolidated, never merged](../explanation/decisions/threads-are-consolidated-never-merged.md) says, in the package: the declaration's `from` (each source's first and last id), taken by `stamp`, `post`, `dryRun` and the player as the nonce is; the derived schema, the pushout of the sources', with its schema conflicts; the preparing function, which refuses a broken source and gives the steps (pruned, made steps, the first source's then the second's) and the `from` list; the drill, which plays one step at a time and waits for a choice where a step is refused (take again, edit, skip, abort) and where the schemas conflict (first, second, by hand, abort). A test consolidates two of a case's scenarios, walks a drill through the refused second opening, and checks the seal.
   Done: the declaration's `from`, a list of seals (`{ first, last }`: a source's first line and its head, the decision's «last line taken» amended), taken by `stamp(draft, lines, now, opening?)` with the schema and the nonce, and by `post`, `dryRun` and the player; `replayed` and `stepsOf`'s `prefix`; `schemaJson`; `deriveSchema` with its conflicts, a law only one source has among them, asked keep or drop; `consolidate`; and the drill, `startDrill` and `stepDrill`, one step a call. The tests consolidate «Tuesday» and «Saved», walk the drill through the refused second opening, and check the seal.
13. **The drill in the playground.** A minimal panel in the inspector: pick two threads (a domain's scenarios played), see the derived schema and its conflicts, walk the drill choice by choice, read the new thread and its declaration. Nothing in it the package does not give.
   Done: a fifth tab of the inspector, «Consolida»: two sources picked among any domain's examples and played, the derived schema with its conflicts and a name for it, and the drill walked step by step (`Avanti`, `Fino al prossimo arresto`) with the package's choices at each stop, then the new thread, its agreement with its lines and its declaration. Its state is its own (`consolidation.ts`, `consolidation-view.ts`), not the page's; it names no gist, and gives nothing the package does not.
14. **Publish 0.1.0.** What each package exposes and ships (`exports`, `files`, `types`), its licence and repository; the build, to a built copy with type declarations (`tsc` alone if it gives a correct per-file ESM, else `vite` and `tsc`); a README per package; the changelog's «Unreleased» becomes 0.1.0; `npm pack --dry-run` read file by file. Whether the three packages share one version, as kdlet's do, is settled in the round. Egildo publishes, from his terminal. The switching in `sibardoc-prototype` comes after, there.
   Done: the three packages carry version 0.1.0, all together (Egildo's answer), and the shape kdlet's have: `files: ["dist"]`, an MIT licence file and a README each, author, repository (`git+https://codeberg.org/egildo/consequitur.git` with a `directory` each; the remote does not exist yet), `engines.node` `>=20.0.0` (`isWellFormed`, `Object.hasOwn` and WebCrypto are in Node 20, and the packed engine runs the warehouse consolidation under Node 20.17), `sideEffects: false`; `consequitur` is a plain dependency of render and kdl, as `workspace:^`. **The build is `tsc` alone, a choice**: with `rewriteRelativeImportExtensions` it emits a correct per-file ESM `dist` (the sources' `./x.ts` become `./x.js`) and its declarations, and `scripts/build-package.mjs` rewrites the `./x.ts` specifiers `tsc` leaves in the `.d.ts` files, and fails if any file still has one; no `vite` in the packages. The dev loop is unchanged: each `exports` stays `./src/index.ts`, and `publishConfig` carries `exports`, `main` and `types` to `dist`, which `pnpm pack` and `pnpm publish` apply (`npm` would not). `pnpm run build:packages` builds the three; `prepack` builds each. The tarballs were packed into the scratchpad and read file by file (no `src`, no tests, no maps), installed in a scratch consumer, run under Node 20 and typechecked under `nodenext` with `skipLibCheck` off. Not published.

15. **Ordering in kdlet-guards**, in the kdlet repository, as [times are compared as stated](../explanation/decisions/times-are-compared-as-stated.md) and kdlet's `docs/guards-module.md` §6 say: `before` and `after` for dates and instants (never one against the other), with `days` on dates; `less` and `more` for numbers; in the model, the evaluator, `problems`, and the KDL reader and writer, with three-valued answers as `is` has. kdlet's three packages move to 0.3.0 together, and Egildo publishes. Its documents name no consumer.
   Done, in kdlet: `kdlet-guards` 0.3.0 is on npm, and its `docs/guards-module.md` §6, «As built», says where it chose.
16. **Comparisons**, here, on `kdlet-guards` ^0.3.0: the condition reader accepts the four words and `$now`, a `$now` outside a gist's `when` is a problem; the translation to the module's form carries them; `admit` takes an optional `now` (`post` and `dryRun` pass theirs) and resolves `$now` from it, unknown without it, and `offers` answers it unknown; `consequitur-kdl` reads and writes them; the editorial review refuses a version submitted after its deadline (stated as an instant) by `$now`, and the warehouse compares the announced and actual arrival dates with `days` and the announced and counted pieces with `less`, each pinned by tests; the conditions spec, the glossary, the playground's words for conditions. The three packages are prepared at 0.2.0 together; Egildo publishes.
   Done: `kdlet-guards` ^0.3.0; the reader accepts `before`, `after` (with `days`), `less` and `more` between `$value`, `$draft`, `$now` and literals, refuses a `$set` or a `$writer` there, names the module's own `problems` (a literal of the wrong kind, `days` that is not whole) as problems of the schema, and refuses `$now` outside a `when`, through a guard too; `$now` is `{ "$now": "instant" }`, a reference that names its field as the others do, so KDL writes it `(now)instant`; `toModuleForm` and `fromModuleForm` carry the four and `$now`; `admit(lines, draft, schema, now?)` reads `$now` as `stamp` writes the instant, holds only when the `when` is true, and refuses `not-now` without an instant, `dryRun` and `post` passing theirs, and `holds` and `whenHolds` take `now` too; `offers` answers `$now` unknown as it does `$draft`; `consequitur-kdl` reads and writes them through `kdlet-guards/kdl`. The editorial review's `revision` is refused after the deadline, stated as an instant, and «late» ends on a version so refused; the warehouse states the announced and actual arrival dates and the announced and counted pallets, and its guards `late` (`after`, `days=2`) and `short` (`less`) are met by the goals of a new scenario, «Late and short»; a drill replays a version sent on time after its deadline, and stops at it, `not-now`. The playground says the four and `$now` in Italian. The three packages are at 0.2.0, packed and read, not published.

The documents, as [the documents are four shelves and an archive](../explanation/decisions/the-documents-are-four-shelves.md) says. Each round amends no code; each keeps every link working and `pnpm test` green.

17. **The shelves.** `docs/` becomes `tutorial/`, `how-to/`, `reference/`, `explanation/` and `project/`, by moving files, not rewriting them: the vision, the principles and `decisions/` to `explanation/`; `architecture.md` to `explanation/how-it-works.md`; the glossary to `reference/`; the plan, `specs/` and `misfits.md` to `project/`. Every link in the repository follows, the packages' READMEs and the changelog included. The root README is written again as the entry point: what consequitur is, in its first paragraph; install; the example as it runs today; the five shelves, one line each. The packages' READMEs point to the shelves on Codeberg. The misfits page says at its top that all five fit since the round «Conditions».
   Done: the files moved with `git mv`, not rewritten: `vision.md`, `principles.md` and `decisions/` to `explanation/`, `architecture.md` to `explanation/how-it-works.md`, `glossary.md` to `reference/`, `plan.md`, `specs/` and `misfits.md` to `project/`; every relative link follows; `tutorial/`, `how-to/` and `reference/` hold a short README saying what comes in rounds 18 to 20, and `explanation/` and `project/` a README listing their pages; the root README is the entry point and the packages' READMEs point to the shelves on Codeberg; the misfits page says all five fit.
18. **The reference, as the present.** One page per module of `consequitur`, in the order a reader meets them (the line and the thread; the schema and the kit; conditions; the reading; posting, the policy and the diff; offers; scenarios; consolidation and the drill), one for `consequitur-render`, one for `consequitur-kdl`, and the condition language on a page of its own. Each says what is exported, its signature, what it returns, what it refuses and throws, in the present tense, with a small example; no round, no «now», no «changed». Written from the code and the tests, the specs read for meaning; where the two disagree, the code is the truth and the brief's report says so. The glossary loses its «(new)» marks and links each word to its page. `explanation/how-it-works.md` loses the facts the reference now holds and keeps the shape and the reasons.
   Done: ten pages in `reference/`, written from the code: `thread.md`, `schema.md` (the schema and the kit, the base rule and law bindings, the kinds' interfaces), `conditions.md` (the language in JSON and KDL, the references, the three-valued answer, guards, checks, the trace and the condition module's functions), `reading.md`, `posting.md` (the refusal codes in one table), `offers.md`, `scenarios.md`, `consolidation.md`, `render.md` and `kdl.md` (the KDL form of a schema); the shelf's README lists them; the glossary has no «(new)» and links each name to its page, where one describes it; `how-it-works.md` is «How it works», keeps the packages, the modules, the boundary, a post end to end and the reasons, and links to the reference for the rest; the root README and the package's link each item to its page. The KDL examples were read by `fromKdl` and the full one by `readSchema`; every relative link resolves. No code changed.
19. **The tutorial.** One lesson, «Your first thread», on a small domain of its own (not one of the cases, so a lesson never changes when a case does): a schema of two or three gists, a thread written line by line, a value and a set on the record, a dry run before a post, a goal that waits and fires, a line refused. Each step shows what the reader sees. Its code is a test in `packages/consequitur/test/`, and the page quotes it, so the lesson runs with the suite.
   Done: «Your first thread», a book club choosing its next book: a schema read, an empty thread, a dry run, a post, a second reader joining, a vote refused as `not-now`, a goal that waits and fires on the second vote; its code is `packages/consequitur/test/tutorial.test.ts`, which the page quotes.
20. **The how-to guides.** Five pages, each a goal and its steps, linking to the reference for every option: write a schema (JSON, and KDL with `consequitur-kdl`); add a kind to a kit; be the authority (post, the policy, storing lines, verifying a thread); preview a draft in a page with `consequitur-render`; consolidate two threads, with the drill.
   Done: five guides in `how-to/`: write a schema (JSON, then KDL), add a kind to a kit, be the authority of a thread, preview a draft in a web page, consolidate two threads; one review-request domain runs through four of them, and every snippet was run or typechecked against the exports before it was written down.
21. **The changelog and a style pass.** The changelog follows Keep a Changelog: 0.1.0 and 0.2.0 written for a user, what each adds, changes and fixes, in a few lines each; the round paragraphs are not kept there. Then one pass over the four shelves against the review's first question, which of the four a page is, and the house voice: headings in sentence case, one H1, the first sentence of a section carrying its point, no identifier where a name will do.
   Done: `CHANGELOG.md` in the form of Keep a Changelog, with `Unreleased` (the documents reorganised), 0.2.0 and 0.1.0, each written for a user of the packages and linked to its Codeberg tag; the reference gaps the first readers found, each written from the code (every record role named, what a post adds and in what order, what a `LineDraft` accepts, a law kind's `read` and its `strength`, what the problems of `readSchema` say, the opening stop of a drill, a gist with no `when`, `keyed`'s `key`), with «refusal» in the glossary; and the style pass over the four shelves and the READMEs: no history in the reference, the explanation and the READMEs (status lines, «amended», «today», «now», «no longer»), the decisions' status lines shortened, a how-to's concept cut and linked, test files not named where a name will do. The principle «Conf, not code» keeps its name and its origin. It found that `fromKdl` reports no property written twice on one node (`value key=k key=j` reads as `j`), which the reference now says as it is; whether it should be a problem is for a later round. Every relative link and anchor resolves; no code changed.

After 0.1.0, parked by name: «value dates» (where a line states its valid time); the payload as its own fingerprint (redaction, the right to erasure, a later recipe); reading an older schema version and saying so, or upcasting; one thread split and rejoined (a merge line with two parents); rebuilding handles from the thread; structured errors in place of sentences.

## 5 · Settled

Egildo's answers, 2026-10-04.

| Question | Answer |
|---|---|
| The name | **consequitur** — free on npm, «it follows as a consequence» |
| Handles beyond values and sets | **Possible**: handle kinds are registered, like rule and law kinds |
| Comparisons in checks (`gt`, `before`) | **Later**; settled 2026-10-13 as [times are compared as stated](../explanation/decisions/times-are-compared-as-stated.md), rounds 15 and 16 |
| The vocabulary | **The proposals**: `value` and `set` handles, `join`/`leave`, `opening`, `records`, kinds and kit |
| Rule kinds as registered code; comparison and answer the engine's (per handle kind) | **Yes** |
| The UI schema | **Playground only**; the library offers the reducer and a render module; the playground is a sample real-life application |
| The authority's part | **Agreed**: the policy and `diff` in; queues, storage and retries out. The server part is for later |
| The second domain | **Editorial review** |
| Packaging | **One monorepo, several packages** |
| Playgrounds | **Here only.** `sibardoc-prototype` gets no playground of this; it switches to the package once consequitur is ready |
