# Architecture

Status: as built after round 14, «Publish 0.1.0». What the engine does is in [specs/engine.md](../project/specs/engine.md);
why it is built so is in the [principles](principles.md); the names are in the [glossary](../reference/glossary.md).

## The packages

| Package | Holds | State |
|---|---|---|
| `packages/consequitur` | the engine: a thread, a schema, the kinds, the reading, the authority's part | built |
| `packages/consequitur-render` | a reading made into DOM | built |
| `packages/consequitur-kdl` | a schema written in KDL, read into the schema object and written back | built |
| `playground/` | the sample application, with a domain picker: the SIBAR activity bench and the editorial review, and a panel to try a consolidation, built only on the three packages and the cases; private, never published | built |
| `cases/<domain>/` | a domain's schema, in JSON and in KDL, its scenarios and, for SIBAR, its policy; not a package. The engine's `playScenario` plays them | `sibar-activity`, `editorial-review`, `warehouse-arrival` |

The engine has one runtime dependency, `kdlet-guards` (kdlet's condition language: it evaluates a
condition node by node, with Kleene's three values where the host says a reference is not yet known, and
gives the trace; consequitur registers its two words on it and resolves the references), imported by
`condition.ts` alone; every other import stays inside `src/`. `test/thread.test.ts` reads every import and
fails on one that leaves, but that one. Tests read the cases from `cases/`, never a
fixture of their own, except a toy that isolates one rule.

## Publishing

The three packages are built to a git-ignored `dist` by `tsc` alone (`pnpm run build:packages`; each package's `build` runs `scripts/build-package.mjs`, and `prepack` runs `build`): `tsconfig.build.json` at the root and one in each package emit per-file ESM and declarations with `rewriteRelativeImportExtensions`, and the script rewrites the `./x.ts` specifiers that remain in the `.d.ts` files. Development reads the sources: each `package.json` keeps `exports` at `./src/index.ts`, the playground and the tests resolve the workspace through it, and `pnpm typecheck` and `pnpm test` build nothing. `publishConfig` carries `exports`, `main` and `types` to `dist`, applied when the package is packed or published with `pnpm` (kdlet's way: `pnpm -r publish`); `files` is `["dist"]`, so a tarball holds the built files, the README, the licence and the manifest. The three versions move together.

## The cases and their scenarios

```
cases/
  sibar-activity/          schema.json, schema.kdl, scenarios.json (first, opinion), policy.json
  editorial-review/        schema.json, schema.kdl, scenarios.json (published, late, left-alone)
  warehouse-arrival/       schema.json, schema.kdl, scenarios.json (tuesday, saved, second-assignee)
```

A **scenario** is a list of **steps**, `{ writer, gist, payload }`, posted to an empty thread; a step may
be labelled, `confirmed`, or expected `refused`. A payload may point at an earlier line by a
**placeholder**, `$line` (a labelled step's line id), `$goal` (`goal::` and that id) or `$find` (the first
line a check matches), since an id is a hash nobody can write down; a **reference** (`$value`, `$set`, `$writer`,
`$draft`) is not one, and the player leaves it in the line. `playScenario(steps, io)` resolves each
step against the thread as it stands and posts it through whatever `io.send` is: the engine's tests post
with `post`, the playground with its own `send`, so both play the same files; with `options.as` every step is
posted as one writer, the person who opens. The module is the engine's own (`scenario.ts`) and knows no gist.

The reverse walk is in the same module. `prune(lines, reading, schema)` says, line by line, which of a thread
a scenario need not say: the engine writes it again (a goal's line, a record), it is a mistake or its
undoing (out of force, or a revoke), the world will state it again (a kin the schema does not judge), or a
`line` node of a goal will find it again; every other line is left open for a person to decide on. `stepsOf(kept,
all)` turns the lines kept into steps, each id in a payload made a `$line`, a `$goal` or a `$find`. `holed(steps, holes)` then makes
each value an application names a reference, `{ "$value": key }`, a hole, which a fill line states when the scenario is played.

`test/scenarios.test.ts` tests the resolver and `holed` and plays SIBAR's two scenarios, prunes SIBAR's «opinion», and
plays the warehouse's: «Tuesday», `prune` and `stepsOf` of it, «Saved» with its holes and their fills, its dry run
against «Tuesday», and «Second assignee». `test/holes.test.ts` tests the two passes, `Reading.holes`, the fill and
admission of a reference on a toy schema.
`test/editorial.test.ts` plays the review's three, with assertions at the steps that matter, and shows, one
test each, that the five misfits of [misfits.md](../project/misfits.md) now fit. `test/condition.test.ts` tests the
condition module on its own: the reader's rules, the translation both ways, the evaluation with the draft
unknown, and what can no longer hold.

## Consolidation

Two threads are made one by replay, never by merge ([threads are consolidated, never
merged](decisions/threads-are-consolidated-never-merged.md), [spec](../project/specs/consolidation.md)).
`consolidate(first, second)` is the pure preparing function: it refuses a source that is not one chain
declared for its schema, takes each source's `replayed` lines as steps (labels prefixed `1:` and `2:`),
derives the schema with `deriveSchema` and gives the two seals. `startDrill` and `stepDrill` then play the
steps into a new thread, one per call, through `playScenario` and `post`, and stop where a schema conflict
or a refused step needs a choice. The new thread's first line names the sources in its declaration, `from`.
`test/derive.test.ts`, `test/consolidate.test.ts` and `test/drill.test.ts` test the three modules, the last
with the end-to-end consolidation of two of the warehouse's scenarios and the seal;
`test/declaration-from.test.ts` the declaration, with the ids a thread that names no source has always had.

## The modules of `consequitur`

```
types.ts       every type, kits' interfaces included
util.ts        small guards, `compare` (never localeCompare), `keysAre`, `kinOf`, `idOf`
line.ts        canonical, asStored, stamp, verify, inOrder, inForce, lockedBy, revokeOf
check.ts       validCheck, isValueReference, referencesOf, resolvePayload, matches, whereMatches: and the one place a payload's references are replaced
condition.ts   conditionProblem, guardsProblems, toModuleForm, fromModuleForm, resolveCheck, conditionHolds, evaluateCondition, nodes, markLost, lostAt: consequitur's form of a condition, read through kdlet-guards
schema.ts      readSchema, schemaJson, readGists, readLaws, readPolicy
reading.ts     expectations, holds, whenHolds, consequitur: the two passes over the lines in force, and the holes
settle.ts      admit, reconcile, answer, settle, dryRun, post, diff, emptyState
offers.ts      offers
scenario.ts    Step, resolve, draftOf, playScenario, readScenarios, prune, replayed, stepsOf, holed: the one resolver of scenarios, and saving one from a thread or replaying one
derive.ts      deriveSchema: the schema of a consolidation, from its sources' two, with its conflicts
consolidate.ts consolidate: two sources made the steps, the seals and the derived schema of one new thread
drill.ts       startDrill, stepDrill: the replay walked one step at a time, stopping at a schema conflict or a refused step
kit.ts         BASE_KIT
handles/       value, set
rules/         value (four forms: from, value, collect, and the fill, keyFrom), collect-writer, join, leave
laws/          keeps-set, keeps-goals, settles
```

Each file imports only from those above it in this list, apart from `kit.ts`, which gathers the
kinds and is imported by nothing but `index.ts` and the consumer. The reading (`reading.ts`) is
synchronous and pure; only the lines that must be hashed (`stamp`, so `settle`, `dryRun`, `post`)
are asynchronous. `stamp` is also the one place that draws randomness: the nonce of a thread's first
line, its **declaration**, unless one is handed to it. `inOrder`, given the schema, refuses a thread
declared for another, as it refuses a broken chain, and every entry that reads a thread against a
schema passes it the schema: `expectations` (so the reading, the offers, `whenHolds` and every post),
`admit`, `prune`, and `lineFacts` in render.

## The modules of `consequitur-render`

```
facts.ts       lineFacts: each line's facts, from the lines, the reading and the schema (pure)
changes.ts     changes: what a reading changed into, line, goal, check, denunciation and settling; keyOf, keyOfCheck: the keys of a denunciation and a check (pure)
keyed.ts       keyed: nodes kept by line id, rebuilt only when their key changes
previewer.ts   previewer: the debounced dry run while composing, stale answers dropped, a failed run told to `onError`
band.ts        band: the pointer line over a layer, a drag from a slot to a line (`dragging` says one holds it), a hover
```

Its one dependency is `consequitur`, for types and `inOrder`, `canonical` and `compare`. It owns no markup and no style: the
application builds every node and paints the band's classes. Only `facts.ts` and `changes.ts` are pure; the other
three touch the DOM and take it as an argument or from `document`, and their tests run under jsdom.

## The modules of `consequitur-kdl`

```
schema.ts      fromKdl, toKdl: a schema's text in KDL to the schema object, with problems at their line and column, and back
```

Its runtime dependencies are `consequitur` (the condition's two forms, `toModuleForm` and `fromModuleForm`),
`kdlet-guards` (its `kdl` entry reads and writes a condition's nodes, the way kdlet's files write a guard)
and `@bgotink/kdl` (kdlet-guards' optional peer: it parses and formats KDL, keeping each node's position). The
text is checked for its shape; `readSchema` then reads the object as it reads `schema.json`. `test/schema.test.ts`
reads each case's `schema.kdl` to the object of its `schema.json`, and holds the file to what `toKdl` writes.

## The playground

```
domain.ts      the Domain types, `defineDomain` (a case read with BASE_KIT, plus its UI schema), `domain()` and `useDomain`
domains/       sibar.ts, editorial.ts: each domain's UI schema (labels, cards, compose, awaited, words, the guards' words, people, commands), its policy, its examples
ui-schema.ts   the functions that read the domain in use: the Italian sentences of a line, a check, a condition and each of its nodes, a goal, a record, a law
deduce.ts      the writer's offers, each line's actions, what a goal being composed may await (lineFacts feeds it)
ledger.ts      the cards, in `keyed`; cards.ts draws one, a goal's condition as a tree; dock.ts the goals; draft.ts the composer; panel.ts the inspector
pointing.ts    the band over the ledger's column: hover, and a drag from a slot
state.ts, main.ts   one PageState, one `update`, and `send`, which is the only place a line is posted
consolidation.ts, consolidation-view.ts   the «Consolida» tab: a Bench of two played sources and a drill, and its drawing; its state is its own, not the page's
```

It is plain TypeScript and DOM, with `markdown-it` for the texts, Vite for its dev server (port 5588)
and its build. It runs one domain at a time, chosen in the header; the rest of `src/` reads it through
`domain()` and names no gist (`test/fence.test.ts`), and switching resets the thread. What a domain adds
beyond data is two optional parts: `commands`, buttons for what the page does itself, playing the system
around the thread (SIBAR signs and makes documents), and `documents`, what it knows beyond the thread.
The screen is a deduction: `main.ts` holds one `PageState`; `update` makes the next and
draws it, `previewer` runs the dry run of the open draft, and nothing is read back from the DOM but the
composer's own inputs. It imports the three packages through their public entry and reads the case's file;
the inspector's «Schemi» and «Leggi» write it in KDL, with `toKdl`, or in JSON, as the person chooses. The
engine, render and `consequitur-kdl` know nothing of it.

## The boundary: mechanics and kinds

**Mechanics** are the thread's own and the engine reads them: the envelope and its hash, the
declaration on the first line, reading order, **revoke** and **goal** (bindings the engine reads itself), the opening rule, `when`, the
three steps of the reading (the second in two passes, below), the loop and bound of reconciliation, and where laws sit in a post.
A schema names a mechanic and gives it its words; it cannot replace it.

**Kinds** are everything a domain's words can mean beyond that, and each is registered by name:

- a **handle kind** owns one sort of handle (empty form, accumulator, expectation, comparison,
  answer, diff, and the roles of its records);
- a **rule kind** reads its binding, says why a payload cannot carry it, and states expectations
  into the accumulators of handle kinds;
- a **law kind** reads its binding and judges what a dry run would leave behind.

The engine never names a gist except through the schema, and never names a domain word: the
opening gist, the authority, the record gists, the sets, the judged kins and the named guards are in
the schema's head. The one place it knows two kinds by name is a condition's references (`$set` reads the `set`
handle, `$value` the `value` handle); that is the cost of conditions that every schema can use without
a kind of its own.

## References in payloads

A `{ "$value": key }` may stand wherever a JSON value stands in a payload, and the reading resolves it
before any rule, `when` or `line` node reads the payload. The second step of the reading goes over the lines
in force twice, both in reading order: first the lines whose payload holds no reference state their values,
into accumulators nobody keeps, and the `value` handle's expectation is what a reference reads; then every
line is read, by every rule, with each reference replaced by that value, and left out where the first pass
stated none. One small pure helper does it, `resolvePayload` in `check.ts`, and `resolveCheck` in
`condition.ts` reads the same one for a `line` node's check. A line as stored keeps its reference and the hash
covers it; the goal's line is read as written, since its `when` and `with` hold references of their own.
Where no line holds a reference the first pass is the only one. Admission resolves a draft against the same
first pass and keeps, as present and unchecked, the reference that does not resolve; the `value` rule's
fill, `{ rule: 'value', keyFrom, from }`, is how a line states what a reference refers to.

`Reading.holes` lists each key a line in force refers to and the first pass did not state, by key, with the
lines that hold it. It is a list and not a denunciation: nothing reconciles a hole and the thread stays
settled. `changes` in the render package says one opened or filled.

## The kit

```ts
interface Kit { handles: HandleKind[]; rules: RuleKind[]; laws: LawKind[] }
```

`BASE_KIT` holds `value` and `set`, `value`, `collect-writer`, `join` and `leave`, `keeps-set`, `keeps-goals` and
`settles`. A consumer builds its own by adding to the lists: the order of `handles` is the order of
denunciations, and so of the answers. `readSchema(json, kit)` keeps the kit in the `Schema` it
returns, because the reading, the admission and the judging ask it, and refuses a rule, a law or a
record role the kit lacks. A schema that needs fewer kinds is read against a smaller kit.

## A post, end to end

`post(state, draft, schema, now, options)` is `dryRun` and then a decision.

1. **Admit** the draft: an object whose writer is a string, gist, writer's kin, `when` (read with the
   writer and the payload as it will be stored, its references replaced), then that payload, after a JSON
   round trip (a plain object, then each rule kind's `admit`, which reads a reference that resolves as its
   value and one that does not as present, then the mechanics of revoke and goal).
2. **Append** it, stamped, with its payload as JSON holds it (on an empty thread, with the declaration:
   the nonce in `options`, or one drawn, and the schema's name and version), and refuse it if the opening
   rule would break.
3. **Settle**: read; the handle kinds compare what the thread expects with the handles; `answer`
   keeps what the authority answers (everything but the thread's, and what its policy leaves);
   `reconcile` has each handle kind answer its own, and writes each record as the authority; repeat,
   one goal's outcome a round, within the bound the goals give.
4. **Judge** what the line left behind, if its writer's kin is judged: each law of the schema.
5. **Decide**: a `refuse` verdict refuses; a `confirm` verdict needs `confirmed`.

`diff(before, after, kit)` then tells a host, kind by kind, what to apply to its own copy.
