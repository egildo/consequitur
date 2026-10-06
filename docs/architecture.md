# Architecture

Status: as built after round 6. What the engine does is in [specs/engine.md](specs/engine.md);
why it is built so is in the [principles](principles.md); the names are in the [glossary](glossary.md).

## The packages

| Package | Holds | State |
|---|---|---|
| `packages/consequitur` | the engine: a thread, a schema, the kinds, the reading, the authority's part | built |
| `packages/consequitur-render` | a reading made into DOM | built |
| `playground/` | the sample application, with a domain picker: the SIBAR activity bench and the editorial review, built only on the two packages and the cases; private, never published | built |
| `cases/<domain>/` | a domain's schema, its scenarios and, for SIBAR, its policy; not a package. The engine's `playScenario` plays them | `sibar-activity`, `editorial-review`, `warehouse-arrival` |

The engine has one runtime dependency, `kdlet-guards` (kdlet's condition language: it evaluates a
condition node by node, with Kleene's three values where the host says a reference is not yet known, and
gives the trace; consequitur registers its two words on it and resolves the references), imported by
`condition.ts` alone; every other import stays inside `src/`. `test/thread.test.ts` reads every import and
fails on one that leaves, but that one. Tests read the cases from `cases/`, never a
fixture of their own, except a toy that isolates one rule.

## The cases and their scenarios

```
cases/
  sibar-activity/          schema.json, scenarios.json (first, opinion), policy.json
  editorial-review/        schema.json, scenarios.json (published, late, left-alone)
  warehouse-arrival/       schema.json, scenarios.json (tuesday, saved)
```

A **scenario** is a list of **steps**, `{ writer, gist, payload }`, posted to an empty thread; a step may
be labelled, `confirmed`, or expected `refused`. A payload may point at an earlier line by a
**placeholder**, `$line` (a labelled step's line id), `$goal` (`goal::` and that id) or `$find` (the first
line a check matches), since an id is a hash nobody can write down. `playScenario(steps, io)` resolves each
step against the thread as it stands and posts it through whatever `io.send` is: the engine's tests post
with `post`, the playground with its own `send`, so both play the same files; with `options.as` every step is
posted as one writer, the person who opens. The module is the engine's own (`scenario.ts`) and knows no gist.

The reverse walk is in the same module. `prune(lines, reading, schema)` says, line by line, which of a thread
a scenario need not say: the engine writes it again (a goal's line, a record), it is a mistake or its
undoing (out of force, or a revoke), the world will state it again (a kin the schema does not judge), or a
goal's check will find it again; every other line is left open for a person to decide on. `stepsOf(kept,
all)` turns the lines kept into steps, each id in a payload made a `$line`, a `$goal` or a `$find`.

`test/scenarios.test.ts` tests the resolver and plays SIBAR's two scenarios, prunes SIBAR's «opinion», and
plays the warehouse's: «Tuesday», `prune` and `stepsOf` of it, and the dry run of «Saved» against it.
`test/editorial.test.ts` plays the review's three, with assertions at the steps that matter, and pins one
test to each of the five misfits of [misfits.md](misfits.md), `collect-writer` registered in a kit inside
the test.

## The modules of `consequitur`

```
types.ts       every type, kits' interfaces included
util.ts        small guards, `compare` (never localeCompare), `keysAre`, `kinOf`, `idOf`
line.ts        canonical, asStored, stamp, verify, inOrder, inForce, lockedBy, revokeOf
check.ts       validCheck, validChecks, isValueReference, matches, whereMatches
condition.ts   conditionProblem, guardsProblems, toModuleForm, fromModuleForm, resolveCheck, conditionHolds, evaluateCondition, nodes, markLost, lostAt: consequitur's form of a condition, read through kdlet-guards
schema.ts      readSchema, readGists, readLaws, readPolicy
reading.ts     expectations, holds, whenHolds, consequitur
settle.ts      admit, reconcile, answer, settle, dryRun, post, diff, emptyState
offers.ts      offers
scenario.ts    Step, resolve, draftOf, playScenario, readScenarios, prune, stepsOf: the one resolver of scenarios, and saving one from a thread
kit.ts         BASE_KIT
handles/       value, set
rules/         value, join, leave
laws/          keeps-set, keeps-goals, settles
```

Each file imports only from those above it in this list, apart from `kit.ts`, which gathers the
kinds and is imported by nothing but `index.ts` and the consumer. The reading (`reading.ts`) is
synchronous and pure; only the lines that must be hashed (`stamp`, so `settle`, `dryRun`, `post`)
are asynchronous.

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

## The playground

```
domain.ts      the Domain types, `defineDomain` (a case read with BASE_KIT, plus its UI schema), `domain()` and `useDomain`
domains/       sibar.ts, editorial.ts: each domain's UI schema (labels, cards, compose, awaited, words, people, commands), its policy, its examples
ui-schema.ts   the functions that read the domain in use: the Italian sentences of a line, a check, a goal, a record, a law
deduce.ts      the writer's offers, each line's actions, what a goal being composed may await (lineFacts feeds it)
ledger.ts      the cards, in `keyed`; cards.ts draws one; dock.ts the goals; draft.ts the composer; panel.ts the inspector
pointing.ts    the band over the ledger's column: hover, and a drag from a slot
state.ts, main.ts   one PageState, one `update`, and `send`, which is the only place a line is posted
```

It is plain TypeScript and DOM, with `markdown-it` for the texts, Vite for its dev server (port 5588)
and its build. It runs one domain at a time, chosen in the header; the rest of `src/` reads it through
`domain()` and names no gist (`test/fence.test.ts`), and switching resets the thread. What a domain adds
beyond data is two optional parts: `commands`, buttons for what the page does itself, playing the system
around the thread (SIBAR signs and makes documents), and `documents`, what it knows beyond the thread.
The screen is a deduction: `main.ts` holds one `PageState`; `update` makes the next and
draws it, `previewer` runs the dry run of the open draft, and nothing is read back from the DOM but the
composer's own inputs. It imports the two packages through their public entry and reads the case's file;
the engine and render know nothing of it.

## The boundary: mechanics and kinds

**Mechanics** are the thread's own and the engine reads them: the envelope and its hash, reading
order, **revoke** and **goal** (bindings the engine reads itself), the opening rule, `when`, the
three steps of the reading, the loop and bound of reconciliation, and where laws sit in a post.
A schema names a mechanic and gives it its words; it cannot replace it.

**Kinds** are everything a domain's words can mean beyond that, and each is registered by name:

- a **handle kind** owns one sort of handle (empty form, accumulator, expectation, comparison,
  answer, diff, and the roles of its records);
- a **rule kind** reads its binding, says why a payload cannot carry it, and states expectations
  into the accumulators of handle kinds;
- a **law kind** reads its binding and judges what a dry run would leave behind.

The engine never names a gist except through the schema, and never names a domain word: the
opening gist, the authority, the record gists, the sets and the judged kins are in the schema's
head. The one place it knows two kinds by name is `when` (`in` reads the `set` handle, `values`
the `value` handle); that is the cost of a `when` that every schema can use without a kind of its
own.

## The kit

```ts
interface Kit { handles: HandleKind[]; rules: RuleKind[]; laws: LawKind[] }
```

`BASE_KIT` holds `value` and `set`, `value`, `join` and `leave`, `keeps-set`, `keeps-goals` and
`settles`. A consumer builds its own by adding to the lists: the order of `handles` is the order of
denunciations, and so of the answers. `readSchema(json, kit)` keeps the kit in the `Schema` it
returns, because the reading, the admission and the judging ask it, and refuses a rule, a law or a
record role the kit lacks. A schema that needs fewer kinds is read against a smaller kit.

## A post, end to end

`post(state, draft, schema, now, options)` is `dryRun` and then a decision.

1. **Admit** the draft: an object whose writer is a string, gist, writer's kin, `when`, payload as it
   will be stored, after a JSON round trip (a plain object, then each rule kind's `admit`, then the
   mechanics of revoke and goal).
2. **Append** it, stamped, with its payload as JSON holds it, and refuse it if the opening rule would break.
3. **Settle**: read; the handle kinds compare what the thread expects with the handles; `answer`
   keeps what the authority answers (everything but the thread's, and what its policy leaves);
   `reconcile` has each handle kind answer its own, and writes each record as the authority; repeat,
   one goal's outcome a round, within the bound the goals give.
4. **Judge** what the line left behind, if its writer's kin is judged: each law of the schema.
5. **Decide**: a `refuse` verdict refuses; a `confirm` verdict needs `confirmed`.

`diff(before, after, kit)` then tells a host, kind by kind, what to apply to its own copy.
