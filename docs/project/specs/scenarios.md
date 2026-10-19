# Scenarios — spec

Status: built in the round «Order and scenarios» ([plan](../plan.md) §4), from the decision [templates are scenarios](../../explanation/decisions/templates-are-scenarios.md). Holes came with the round «Holes» and are marked so. Words as in the [glossary](../../reference/glossary.md).

A scenario was a test device from the editorial round: a domain's story as data, played into an empty thread. It is a product device too. An application keeps a scenario as what its users call a template, plays it to open a new activity, and saves one from an activity a person configured by hand. The engine never sees a scenario; it sees the lines the player posts.

## 1 · What a scenario is

Unchanged from today: a list of steps, `{ label?, writer, gist, payload, confirmed?, refused? }`, posted one after the other to an empty thread, each through admission. A payload may hold a placeholder, an object with one key beginning with `$`:

| Placeholder | Stands for | Resolved by |
|---|---|---|
| `{ "$line": label }` | the id of the line the labelled step posted | the player |
| `{ "$goal": label }` | `goal::` and that id | the player |
| `{ "$find": check }` | the id of the first line in reading order the check matches | the player |
| `{ "$value": key }`, and `$set`, `$writer`, `$draft` | a reference, see [conditions](conditions.md) §2 and §7 | nobody: it passes into the line as it is. Built in the round «Conditions», where a goal's condition holds one; a `$value` elsewhere in a payload, a hole, was built in the round «Holes» |

A reference is not a placeholder. The player leaves it alone, and the reading resolves it when the thread is read.

## 2 · The player, in the package

The module is `packages/consequitur/src/scenario.ts`, exported from the package: `Step`, `Scenario`, `Labels`, `Io`, `Played`, `Pruned`, `resolve`, `draftOf`, `playScenario`, `readScenarios`, `prune`, `stepsOf`. In the engine's import order it comes after `offers.ts`; it imports `inOrder`, `matches`, `validCheck`, `nodes` (for the `line` nodes of a goal's trace), the small guards of `util.ts` and the types. It was `cases/scenario.ts` before the round; the tests and the playground import the package.

`playScenario(steps, io, options)` has, besides `after` and `labels`, two options:

- `as?: Writer`: the writer every step is posted as. An application playing a template passes the person who opens; a test replaying a story passes nothing, and each step keeps its own writer.
- `nonce?: string`: handed to every `io.send` in its third argument, `opening`, for `post`, so the first line, which declares the thread, and every id after it are the same each time the scenario is played; without one, each play is a thread of its own. *(Round «The first line declares the thread».)*
- `from?: Seal[]`: the sources a consolidation names, handed in `opening` beside the nonce, so `post` writes them on the first line. *(Round «Consolidation».)* `Io.send` is `send(draft, confirmed, opening?: { nonce?; from? })`.

Everything else is as today: a step may be `confirmed`, a step may be expected `refused` with a code, the first step that does not go as the scenario says stops the play, and `after` is told of each step.

## 3 · Saving a scenario from a thread

Most of saving is mechanical. The package gives the mechanical part; the choices stay with the application.

```ts
export function prune(lines: EventLine[], reading: Reading, schema: Schema): Pruned;

export interface Pruned {
  /** The lines a person decides on, in reading order: kept as steps, dropped, or made into what a goal writes or awaits. */
  open: EventLine[];
  /** Every other line, with why it is left out. */
  left: Array<{ line: EventLine; why: 'engine' | 'revoked' | 'outside' | 'found' }>;
}
```

In reading order, each line gets one answer, the first that applies:

- `engine`: its writer is of kin `goal`, or its gist is one of the schema's `records`. The engine writes it again.
- `revoked`: it is not in force, or its gist has a revoke binding. Mistakes and their undoing.
- `outside`: its writer's kin is not among the schema's `judged`. A fact the world will state again.
- `found`: some goal's `line` node found it (`foundIn`, in the goal's trace). The template awaits it again.
- otherwise it is `open`.

```ts
export function stepsOf(kept: EventLine[], all: EventLine[]): Step[];
```

`stepsOf` turns the lines a person kept into steps, in reading order, and replaces every id in a payload by a placeholder:

- a string equal to the id of an earlier kept line becomes `{ "$line": label }`, with the kept line labelled by its position (`"1"`, `"2"`, …);
- `goal::` and such an id becomes `{ "$goal": label }`;
- a string equal to the id of a line of `all` that was not kept becomes `{ "$find": { gist, payload } }` of that line, since the line itself will be awaited, not replayed: the first line that says the same will do.

Steps carry no `confirmed` and no `refused`; the application adds `confirmed` where its person says so.

*Round «Holes», built.*

```ts
export function holed(steps: Step[], holes: Record<string, Json>): Step[];
```

`holed` replaces, in every step's payload, each value equal to one of the given values by the reference `{ "$value": key }` of its key. One value in several lines becomes one hole, and a value two holes share goes to the first of them. Values are compared as JSON, so a list or an object may be a hole; a placeholder or a reference already in a payload is left as it is, and so is everything outside the payloads (the writer, the gist, the label). The application decides which values become holes; a text with a piece missing is not a hole and is the application's to complete before posting.

The third act, turning a line a person wrote by hand into what a goal writes, is composing a goal, which the application already does.

*Round «Consolidation», built.* `stepsOf(kept, all, prefix = '')` puts `prefix` in front of every label, so the steps of two sources never share one; and `replayed(lines, schema)` gives the lines a replay takes, which is every line the engine would not write again, revoked, outside and found lines included. A consolidation plays them with `playScenario`; see [consolidation](consolidation.md).

## 4 · The check: a dry run of a scenario

A saved scenario is checked against the thread it came from, with nothing invented:

1. Play the steps into a thread nobody keeps, with `post` as `io.send`, as the saver.
2. Fill each hole with the value that was there before it was holed, by posting the fill lines, as the saver: a person who is not on the team yet cannot write the lines that follow until the hole that names them is filled *(round «Holes», built)*.
3. Feed the lines `prune` left as `found` or `outside`, in their reading order, each through `post`; and the open lines the saving session turned into what a goal awaits, in their place in that order.
4. Compare where the handles ended with the source thread's: `diff(source.handles, played.handles, kit)` is empty but for the keys of the holes: a fill states its key into the value handle, where the source thread never had it, so the difference is those keys, added with their values, and nothing else.

The comparison is on the handles, not line by line, because the lines the saving session changed are written by a goal in the dry run and were written by a person in the source. The check proves that the scenario reproduces the activity it came from; another order of events on another day is not proved.

No new function: the steps above are `playScenario`, `post` and `diff`. The case's test does them, and an application copies them.

## 5 · The warehouse case

`cases/warehouse-arrival/` is the third domain, chosen for this spec: an arrival of merchandise registered, announced, unloaded, sorted and shelved. Its vocabulary stays small:

- `open` (opening): `name`, `announced` (the announced arrival date) and `pallets`, and `team` joined from `team`;
- `memo`: assigns, joining `team` from `assignTo`; written by people and by goals;
- `done`: a person says a step is finished; `steps` collects `step`;
- `fill`: a person states a value a hole refers to, `value` from `keyFrom` and `from` (`key`, `value`);
- `set_goal`, `set_goal_revoke`, `comment`;
- `notice`: written by goals, states nothing;
- `closed`: written by goals, `status` becomes `closed`;
- `arrival_scanned`: written by `system::dock`, states `arrived` from `date` and `counted` from `pallets`;
- the records.

Two guards compare what the lines state *(round «Comparisons»)*: `late`, `after (value)arrived (value)announced days=2`, an arrival more than two days after it was announced, and `short`, `less (value)counted (value)pallets`, fewer pallets counted than announced. Goals use them.

`scenarios.json` holds three stories. «Tuesday» is the activity as it happened, with every kind of line: the manager's plan (goals that announce the arrival, assign the sorting, close the activity), a goal set by mistake and revoked, the scanner's line, a comment, the work (`done` lines), and one memo the manager wrote by hand when sorting was done, with no goal behind it. «Saved» is the scenario a person saves from it: the plan's lines, the by-hand memo turned into a goal, and holes for the supplier's reference (`ddt`), the unloader and the sorter, which end with three fills, the values Tuesday had, written by the manager. Played without them, «Saved» opens the activity with three holes and settled. «Second assignee» is a memo that names one assignee and a hole, `legal`, for a second, a goal whose condition is `has` on that reference, and a fill by the assignee who is on the team: the goal fires when the key is stated. «Late and short» is an arrival announced for Monday that comes on Thursday two pallets short: a goal on `late` writes a notice to purchasing, one on `short` a memo to count again, and both fire when the scanner's line comes. «Tuesday» and «Saved» state an arrival a day after it was announced, with every pallet: neither guard holds.

The tests, in `packages/consequitur/test/scenarios.test.ts` or beside it: `prune` of «Tuesday» leaves out exactly the lines §3 says, for the reasons it says, and leaves open the plan's lines, the comment, the `done` of sorting, which no goal of «Tuesday» waits for, and the by-hand memo; `stepsOf` of the kept lines (the open lines but the comment, the `done` of sorting and the by-hand memo; the added goal waits for the one and writes the other) gives the steps of «Saved» but the goal the person added and the fills, once `holed` has made the three values holes; «Saved» played to its fills holds three holes and is settled, and its fills close them; the dry run of §4 ends with no difference in the handles but the three keys; and «Second assignee» fires its goal when the fill comes.

The playground does not gain a third domain in this round: the case is the test's and the spec's truth.

## 6 · What a scenario cannot say

Recorded here, not solved:

- **A plan that goes round again.** A repeating cycle (review, changes, review) is a new activity, or a goal set again by a person.
- **«For each».** One goal per item of a list discovered later cannot be written at opening.
- **Several writers.** Every step is posted by the person who opens; a step another person wrote is awaited, not replayed.

Either of the first two would reopen plans written in the schema, with rules that expect lines and a cycle check in the reader.
