# Architecture

Status: as built after round 4. What the engine does is in [specs/engine.md](specs/engine.md);
why it is built so is in the [principles](principles.md); the names are in the [glossary](glossary.md).

## The packages

| Package | Holds | State |
|---|---|---|
| `packages/consequitur` | the engine: a thread, a schema, the kinds, the reading, the authority's part | built |
| `packages/consequitur-render` | a reading made into DOM | built |
| `playground/` | the sample application: the SIBAR activity bench, built only on the two packages and the case; private, never published | built |
| `cases/<domain>/` | a domain's schema and, later, its scenarios; not a package | `sibar-activity` |

The engine has no runtime dependency and imports nothing outside `src/`; `test/thread.test.ts`
reads every import and fails on one that leaves. Tests read the case from `cases/`, never a
fixture of their own, except a toy that isolates one rule.

## The modules of `consequitur`

```
types.ts       every type, kits' interfaces included
util.ts        small guards, `compare` (never localeCompare), `keysAre`
line.ts        canonical, stamp, verify, inOrder, inForce, lockedBy, revokeOf
check.ts       validChecks, matches, whereMatches, kinOf, idOf
schema.ts      readSchema, readGists, readLaws
reduce.ts      expectations, holds, whenHolds, reduce
settle.ts      admit, reconcile, answer, settle, dryRun, post, diff, emptyState
offers.ts      offers
kit.ts         BASE_KIT
handles/       value, set
rules/         value, join, leave
laws/          keeps-set, keeps-goals, settles
```

Each file imports only from those above it in this list, apart from `kit.ts`, which gathers the
kinds and is imported by nothing but `index.ts` and the consumer. The reading (`reduce.ts`) is
synchronous and pure; only the lines that must be hashed (`stamp`, so `settle`, `dryRun`, `post`)
are asynchronous.

## The modules of `consequitur-render`

```
facts.ts       lineFacts: each line's facts, from the lines, the reading and the schema (pure)
keyed.ts       keyed: nodes kept by line id, rebuilt only when their key changes
previewer.ts   previewer: the debounced dry run while composing, stale answers dropped
band.ts        band: the pointer line over a layer, a drag from a slot to a line, a hover
```

Its one dependency is `consequitur`, for types and `inOrder`. It owns no markup and no style: the
application builds every node and paints the band's classes. Only `facts.ts` is pure; the other
three touch the DOM and take it as an argument or from `document`, and their tests run under jsdom.

## The playground

```
case.ts        the case read with BASE_KIT (`?raw` import of cases/sibar-activity/schema.json), the policy, the pieces shown as code
ui-schema.ts   the application's words: labels, cards, compose, awaited, the Italian sentences, verdicts by law and set
deduce.ts      the writer's offers, each line's actions, what a goal being composed may await (lineFacts feeds it)
ledger.ts      the cards, in `keyed`; cards.ts draws one; dock.ts the goals; draft.ts the composer; panel.ts the inspector
pointing.ts    the band over the ledger's column: hover, and a drag from a slot
state.ts, main.ts   one PageState, one `update`, and `send`, which is the only place a line is posted
```

It is plain TypeScript and DOM, with `markdown-it` for the texts, Vite for its dev server (port 5588)
and its build. The screen is a deduction: `main.ts` holds one `PageState`; `update` makes the next and
draws it, `previewer` runs the dry run of the open draft, and nothing is read back from the DOM but the
composer's own inputs. It imports the two packages through their public entry and reads the case's file;
the engine and render know nothing of it.

## The boundary: mechanics and kinds

**Mechanics** are the thread's own and the engine reads them: the envelope and its hash, reading
order, **revoke** and **goal** (bindings the engine reads itself), the opening rule, `when`, the
three steps of the reduction, the loop and cap of reconciliation, and where laws sit in a post.
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

1. **Admit** the draft: gist, writer's kin, `when`, payload (each rule kind's `admit`, then the
   mechanics of revoke and goal).
2. **Append** it, stamped, and refuse it if the opening rule would break.
3. **Settle**: reduce; the handle kinds compare what the thread expects with the handles; `answer`
   keeps what the authority answers (everything but the thread's, and what its policy leaves);
   `reconcile` has each handle kind answer its own, and writes each record as the authority; repeat,
   at most three rounds.
4. **Judge** what the line left behind, if its writer's kin is judged: each law of the schema.
5. **Decide**: a `refuse` verdict refuses; a `confirm` verdict needs `confirmed`.

`diff(before, after, kit)` then tells a host, kind by kind, what to apply to its own copy.
