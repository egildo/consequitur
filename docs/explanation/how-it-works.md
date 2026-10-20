# How it works

This page gives the shape of the code, its packages, its modules and its boundaries, with the reasons. What each export does is in the [reference](../reference/README.md), and why it is built so in the [principles](principles.md).

## The packages

| Package | Holds |
|---|---|
| `packages/consequitur` | the engine: a thread, a schema, the kinds, the reading, the authority's part |
| `packages/consequitur-render` | a reading made into DOM ([reference](../reference/render.md)) |
| `packages/consequitur-kdl` | a schema written in KDL, read into the schema object and written back ([reference](../reference/kdl.md)) |
| `playground/` | the sample application, with a domain picker: the SIBAR activity bench and the editorial review, and a panel to try a consolidation, built only on the three packages and the cases; private, never published |
| `cases/<domain>/` | a domain's schema, in JSON and in KDL, its scenarios and, for SIBAR, its policy; not a package |

The engine has one runtime dependency, `kdlet-guards`: kdlet's condition language. It evaluates a
condition node by node, with Kleene's three values where the host says a reference is not yet known, and
gives the trace; consequitur registers its two words on it and resolves the references. Only
`condition.ts` imports it; every other import stays inside `src/`. A test reads every import and
fails on one that leaves, but that one. A condition language shared with kdlet is worth more than a copy
kept dependency-free ([chosen dependencies](decisions/chosen-dependencies.md)).

Tests read the cases from `cases/`, never a fixture of their own, except a toy that isolates one rule, so the
tests and the playground cannot drift apart.

## Publishing

The three packages are built to a git-ignored `dist` by `tsc` alone, which emits per-file ESM and declarations with `rewriteRelativeImportExtensions`; a small script rewrites the `./x.ts` specifiers that remain in the declarations. Development reads the sources instead: each `package.json` keeps `exports` at `./src/index.ts`, so the playground and the tests resolve the workspace without a build. `publishConfig` points `exports`, `main` and `types` at `dist`, and `files` is `["dist"]`, so a tarball holds the built files, the README, the licence and the manifest. The three versions move together.

## The cases and their scenarios

```
cases/
  sibar-activity/          schema.json, schema.kdl, scenarios.json, policy.json
  editorial-review/        schema.json, schema.kdl, scenarios.json
  warehouse-arrival/       schema.json, schema.kdl, scenarios.json
```

A [scenario](../reference/scenarios.md) is a domain's story as data: steps posted to an empty thread. The player
is the engine's own (`scenario.ts`) and knows no gist. It posts each step through whatever its host's `send`
is: the engine's tests post with `post`, the playground with its own `send`, so both play the same files. A
step points at an earlier line by a placeholder, since an id is a hash nobody can write down.

The reverse walk is in the same module: `prune` says which lines of a thread a scenario need not say, `stepsOf`
turns the lines a person keeps into steps, and `holed` makes the values an application names into holes. The
mechanical part of saving a template is the package's; the choices stay with the application.

## Consolidation

Two threads are made one by replay, never by merge ([threads are consolidated, never
merged](decisions/threads-are-consolidated-never-merged.md); [reference](../reference/consolidation.md)).
`consolidate` is pure: it prepares the steps, the derived schema and the two seals, and posts nothing.
The drill then plays the steps into a new thread, one per call, through `playScenario` and `post`, and stops
where a schema conflict or a refused step needs a choice. It is a value, never changed, so a host can keep it,
show it and take it up again. The new thread's first line names its sources, so it says where it came from.

## The modules of `consequitur`

```
types.ts       every type, kits' interfaces included
util.ts        small guards, `compare` (never localeCompare), `keysAre`, `kinOf`, `idOf`
line.ts        the envelope, the hash and the chain: canonical, stamp, verify, inOrder, inForce, lockedBy
check.ts       a check and a payload's references: the one place a reference is replaced
condition.ts   consequitur's form of a condition, read through kdlet-guards
schema.ts      readSchema, schemaJson, readGists, readLaws, readPolicy
reading.ts     the reading: the two passes over the lines in force, the goals, the holes
settle.ts      admission, reconciliation, the dry run and the post, the diff
offers.ts      offers
scenario.ts    the one resolver of scenarios, and saving one from a thread or replaying one
derive.ts      the schema of a consolidation, from its sources' two, with its conflicts
consolidate.ts two sources made the steps, the seals and the derived schema of one new thread
drill.ts       the replay walked one step at a time
kit.ts         BASE_KIT
handles/       value, set
rules/         value, collect-writer, join, leave
laws/          keeps-set, keeps-goals, settles
```

The reference has a page for each area: [the thread](../reference/thread.md), [the schema and the kit](../reference/schema.md),
[conditions](../reference/conditions.md), [the reading](../reference/reading.md), [posting](../reference/posting.md),
[offers](../reference/offers.md), [scenarios](../reference/scenarios.md) and [consolidation](../reference/consolidation.md).

Each file imports only from those above it in this list, apart from `kit.ts`, which gathers the
kinds and is imported by nothing but `index.ts` and the consumer. The reading is synchronous and pure;
only what must be hashed (`stamp`, so `settle`, `dryRun`, `post`) is asynchronous. `stamp` is also the one
place that draws randomness, for the nonce of a thread's first line when none is handed to it. Every entry
that reads a thread against a schema comes through `inOrder` with the schema, so a thread that is not one
chain, or is declared for another schema, is refused in one place, with one sentence.

## The modules of `consequitur-render`

```
facts.ts       lineFacts: each line's facts (pure)
changes.ts     changes, keyOf, keyOfCheck: what a reading changed into, and keys for what has no id (pure)
keyed.ts       keyed: nodes kept by line id
previewer.ts   previewer: the dry run while composing
band.ts        band: the pointer line over a layer
```

Its one dependency is `consequitur`. It owns no markup and no style: the application builds every node and
paints the band's classes. The screen is a deduction from the thread, its reading and the draft; nothing is
read back from the DOM. Only `facts.ts` and `changes.ts` are pure; the other three touch the DOM, and their
tests run under jsdom.

## The modules of `consequitur-kdl`

```
schema.ts      fromKdl, toKdl
```

Its runtime dependencies are `consequitur` (the condition's two forms), `kdlet-guards` (its `kdl` entry reads
and writes a condition's nodes, the way kdlet's files write a guard) and `@bgotink/kdl` (kdlet-guards' optional
peer: it parses and formats KDL, keeping each node's position). The text is checked for its shape; `readSchema`
then reads the object as it reads `schema.json`. JSON stays the model, since a goal is a line and payloads are
JSON; KDL is the form a person writes.

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
`domain()` and names no gist (a test holds it), and switching resets the thread. What a domain adds
beyond data is two optional parts: `commands`, buttons for what the page does itself, playing the system
around the thread (SIBAR signs and makes documents), and `documents`, what it knows beyond the thread.
The screen is a deduction: `main.ts` holds one `PageState`; `update` makes the next and
draws it, `previewer` runs the dry run of the open draft, and nothing is read back from the DOM but the
composer's own inputs. It imports the three packages through their public entry and reads the case's file;
the inspector's «Schemi» and «Leggi» write it in KDL, with `toKdl`, or in JSON, as the person chooses. The
engine, render and `consequitur-kdl` know nothing of it.

## The boundary: mechanics and kinds

**Mechanics** are the thread's own and the engine reads them: the envelope and its hash, the
declaration on the first line, reading order, **revoke** and **goal** (bindings the engine reads itself), the opening rule, `when`, `expect`, the
three steps of the reading, the loop and bound of reconciliation, and where laws sit in a post.
A schema names a mechanic and gives it its words; it cannot replace it.

**Kinds** are everything a domain's words can mean beyond that, and each is registered by name in a
[kit](../reference/schema.md#the-kit):

- a **handle kind** owns one sort of handle (empty form, accumulator, expectation, comparison,
  answer, diff, and the roles of its records);
- a **rule kind** reads its binding, says why a payload cannot carry it, and states expectations
  into the accumulators of handle kinds;
- a **law kind** reads its binding and judges what a dry run would leave behind.

A rule states expectations and never compares: the comparison is made once, by each handle kind, so a
new rule cannot get it wrong. A consumer builds its own kit by adding to the lists, and a schema that needs
fewer kinds is read against a smaller one. The schema keeps the kit it was read against, because the reading,
admission and the laws ask it.

The engine never names a gist except through the schema, and never names a domain word: the
opening gist, the authority, the record gists, the sets, the judged kins and the named guards are in
the schema's head. The one place it knows two kinds by name is a condition's references (`$set` reads the `set`
handle, `$value` the `value` handle); that is the cost of conditions that every schema can use without
a kind of its own.

## References in payloads

A `{ "$value": key }` may stand wherever a JSON value stands in a payload, so a line can be written before
everything it names is known, and completed later by another line ([holes are unstated
values](decisions/holes-are-unstated-values.md)). The reading resolves it before any rule, `when` or `line`
node reads the payload, in two passes over the lines in force: the lines that hold no reference state the values,
and every line is then read with its references replaced ([reference](../reference/reading.md#expectations)). A
value stated through a reference serves no other reference, so there are neither chains nor circles, and one
pass of resolution is enough. A line as stored keeps its reference and the hash covers it.

A reference nobody states is a hole. It is listed and not denounced: nothing reconciles a hole, a person
answers it, and the thread stays settled.

## A post, end to end

`post` is `dryRun` and then a decision ([reference](../reference/posting.md)).

1. **Admit** the draft: who may write the gist, whether its `when` holds for this writer, payload and
   instant, whether the payload fits each rule kind's reading of it, and the mechanics of revoke and goal.
   The payload is judged as it will be stored.
2. **Append** it, stamped at the instant the host gives; on an empty thread, with the declaration. Refuse it
   if the opening rule would break, since no reconciliation could answer that.
3. **Settle**: read; the handle kinds compare what the thread expects with the handles; the authority
   answers what its policy does not leave and no kin answers; each handle kind answers its own, and each record is written as
   the authority; repeat, one goal's outcome a round in thread order, within the bound the goals give
   ([goals fire in thread order](decisions/goals-fire-in-thread-order.md)).
4. **Judge** what the line left behind, if its writer's kin is judged: each law of the schema. A fact from
   outside has already happened, so it is never judged.
5. **Decide**: a `refuse` verdict refuses; a `confirm` verdict needs the writer's confirmation.

`diff` then tells a host, kind by kind, what to apply to its own copy of the handles. The engine reads no
clock: the instant is always the host's argument, so a dry run and a post, given one instant and one nonce,
give the same lines.

## Who answers a denunciation

A denunciation is a difference between what the thread expects and what is, and each has one answerer
([a denunciation names who answers it](decisions/a-denunciation-names-who-answers-it.md)):

- **the engine**, for the authority: a difference in a handle, answered by a record, and a line a goal owes,
  written by the goal. A post writes them before it returns;
- **a kin**: a line the thread expects, by a gist's `expect`, while its condition holds. The denunciation
  names the kin, and the engine never writes the line;
- **nobody**: the opening rule. No line can mend a thread with no opening, or two.

A hole is answered by a person too, but it is listed apart and not denounced
([holes are unstated values](decisions/holes-are-unstated-values.md)).

`settled` means that nothing is left that the engine answers. A thread that waits for a kin is settled: the
bound, the law `settles` and the policy read it so.

## Around the engine

The engine is one part of four, and the only one in these packages.

- **The engine** reads, admits, settles and judges. It holds no state between calls, reads no clock and
  calls nobody.
- **The host**, the thread's authority, is the application's server. It states each writer from the identity
  it authenticated, posts with its own clock, one post a thread at a time, and stores the lines a post adds
  and the handles in one transaction ([How to be the authority](../how-to/be-the-authority.md)).
- **The kins that answer** are whoever the schema expects a line of: a worker of the host, another system, a
  person. Each reads the denunciations that name its kin, does the work in the world, and posts the line,
  through the host, as a writer of that kin; it is admitted as any line is. If the work fails, it posts the
  line the schema gives for a failure, when there is one.
- **The clients** dry-run a draft and show what it would cause, the lines the thread would then expect
  included; what they show is advice, and the host's post is the answer
  ([principles](principles.md), «The server decides, a client previews»).

Nothing passes between the engine and a kin but lines. The engine names what it expects; the kin answers
by writing; the next reading finds the denunciation gone. So there is no message to deliver and no queue in
the engine: the thread is the outbox. A denunciation is a reading of lines the host stored in one transaction
with the post that made it, so what is expected and the state are committed together. Where a kin finds the
threads that expect something of it, a queue fed after each post or a sweep over open threads, is the host's
choice.

The reading is level-triggered, as Kubernetes' controllers are: an expected line is denounced for as long as
its condition holds, not once when it starts to. A worker that stops loses nothing, since the next reading
denounces the same line. It may also act twice: the work was done and the line not yet posted when it
stopped. So the work must be idempotent, keyed by what it acts on.
