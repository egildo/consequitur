# Conditions — spec

Status: §1 to §6 built in the round «Conditions» ([plan](../plan.md) §4), where the build chose as §6 and §8 say. From the decision
[conditions are kdlet's guards](../decisions/conditions-are-kdlt-guards.md). Built on the module
`kdlet-guards` (kdlet's repo, `docs/guards-module.md`; on npm as `kdlet-guards`). Section 7, references in payloads, is for the round «Holes», from [holes are unstated values](../decisions/holes-are-unstated-values.md); the firing order of goals is in the [engine spec](engine.md) §7.

## 1 · Where a condition stands

| Place | Was | Now |
|---|---|---|
| a gist's `when` | `{ checks?, in?, values? }` | a `Condition` |
| a goal's payload | `checks: Check[]` (all) | `when: Condition` |
| the schema | — | `guards: { [name]: Condition }`, used by `{ "guard": "name" }` |
| `keeps-set`'s `while` | `{ [key]: Json }` | a `Condition` |

The old shapes are not kept: the cases are rewritten.

## 2 · The JSON form

`kdlet-guards`' model, with consequitur's two words and a shorthand for references:

```json
{ "all": [
  { "is": { "$writer": "id" }, "values": [{ "$set": "assignees" }] },
  { "is": { "$value": "status" }, "values": ["open"] },
  { "line": { "gist": "memo" } }
] }
```

| Condition | Holds when |
|---|---|
| `{ "is": A, "values": [B…] }` | A equals one of the Bs; a `$set` operand among the Bs stands for its members |
| `{ "has": A }` | A is there, and not null, empty text or an empty list |
| `{ "not": C }`, `{ "all": [C…] }`, `{ "any": [C…] }` | as their names say |
| `{ "guard": "name" }` | the schema's named guard holds |
| `{ "line": Check }` | a line in force matches the check; a payload value in the check may be a reference |
| `{ "atLeast": n, "of": [C…] }` | at least n of the children hold |

References, `{ "$<from>": "<field>" }`:

| Reference | Reads | Where |
|---|---|---|
| `$value` | the value handle the thread expects, under the key | everywhere |
| `$set` | the members the thread expects in the set | everywhere |
| `$writer` | `id` or `kin` of the line being written | `when` |
| `$draft` | a key of the payload being written | `when` |

An absent operand makes `is` false (`missing: 'false'`): the reading never throws. A `$writer` or
`$draft` reference in a goal is a problem the reader names.

**Two forms, one model.** The form above is consequitur's, and it is what a schema and a goal's payload hold. `kdlet-guards` has its own: a reference is `{ "ref": { "from", "field" } }`, and `line` and `atLeast` are registered words, `{ "word": "line", "args": Check }` and `{ "word": "at-least", "args": n, "body": [C…] }`. The engine translates at each evaluation, with the expectations in hand: `$value`, `$set`, `$writer` and `$draft` become references the host resolves, a `$set` operand among an `is`'s values is replaced by the set's members, `line` and `atLeast` become the two words. The translation is a small pure function and its inverse serves `consequitur-kdl` (§6), which reads KDL through the module's reader and writes it back. Nothing of the module's form is stored in a thread or a schema.

## 3 · Reading a condition

- **A gist's `when`** is evaluated with the writer and the draft. `admit` evaluates it fully. `offers` has no draft, so a node that reads `$draft` is neither true nor false: it is **unknown**, and unknown spreads as in three-valued logic. `not` of unknown is unknown; `all` is false when a child is false, otherwise unknown when a child is; `any` is true when a child is true, otherwise unknown when a child is; `atLeast n` is true when n children are true, false when fewer than n could still be, otherwise unknown; a named guard is as its body. A gist is offered unless its `when` is false. So the menu may offer what admission then refuses for its payload, never the reverse. (Treating a `$draft` node as holding, as first written here, breaks that promise under `not`: `not` of a node held true is false, and the menu hides what admission accepts.) `kdlet-guards` answers an absent operand with `missing: 'error' | 'false'` and has no third value; the menu needs one for the operand the draft will supply, and that is the one change asked of kdlet, recorded in the plan.
- **A goal** is evaluated in the reading, after the handles are accumulated, against the lines in
  force (the goal itself excluded, as now). Once, final, `with` and warnings are unchanged. Goals met in one reading write their outcomes one per round, in reading order of their lines ([engine](engine.md) §7).
- `GoalReading` carries the **trace**: each node with `holds`, and on a `line` node the line that
  met it (`foundIn`) and the check as resolved. `met` is the root's `holds`.

**When a goal can no longer hold** — the warning:

| Node | Lost when |
|---|---|
| `line` | not met, and the thread lost what it names (today's anchoring, on the resolved check) |
| `all` | any child is lost |
| `any` | every child is lost |
| `atLeast n` | fewer than n children can still hold |
| `not`, `is`, `has`, `guard` | never (a named guard: as its body) |

A lost goal writes one warning, `{ path }`, where `path` names the node that made it lost
(`"0.2"`: the root's first child's third child) — replacing today's `{ check: i }`.

## 4 · The base kit

`collect-writer` joins `BASE_KIT`: `{ rule: 'collect-writer', key }` adds the line's writer id to
the value list under `key`, like `collect`. The editorial schema uses it and drops `stamp`.

## 5 · What changes in the cases and the playground

- `cases/sibar-activity/schema.json` and `cases/editorial-review/schema.json` rewritten: SIBAR's
  repeated «open and an assignee» becomes a named guard; the editorial misfits fit — one goal for
  the current version, «draft or changes requested», the deadline with `not`, a quorum where it
  makes sense in a scenario.
- The misfit tests become tests that the five now fit; `docs/misfits.md` says so, each with the
  test that proves it. The scenario «published» loses its step «goal-v2».
- The playground's goal composer builds an `all` of `line` nodes as now; the dock and the
  inspector draw the trace as a tree.

## 6 · consequitur-kdl

A package that reads a schema written in KDL into the schema object and writes one back, on
`kdlet-guards/kdl` and `@bgotink/kdl`. JSON stays the model (a goal is a line, and payloads are
JSON); KDL is how a person writes a schema. Each case gains `schema.kdl`, and a test checks it
reads to the same object as `schema.json`. The playground's «Schemi» shows the schema as KDL or
JSON.

**As built.** `packages/consequitur-kdl` exports `fromKdl(text)`, which gives `{ json, problems }`, each problem
with its line and column, and never throws, and `toKdl(json)`, which writes a schema object, or any part of one,
in the order the reader reads it. The head is one node a part (`opening create`, `authority "system::sibardoc"`,
`sets assignees`, `records value=metadata_set …`, `judged user`); a guard is `guard <name> { condition }`; a gist
is `gist <name> <writer kin>… { bindings; when { condition } }`; a law is `law <kind> <keys> { while { condition } }`.
A binding is a node named for its rule: its plain keys are properties, a list is a child node of its items, an
object of plain values a child node of properties (`revoke from=target { gists memo }`, `where direction=inbound`).
A condition is written as kdlet's files write a guard's body, with the tags `(value)`, `(set)`, `(writer)` and
`(draft)`; several nodes in one body are all of them. Two words are read and written here, not by the module:
`line gist=… kin=… writer=… { payload key=value key=(value)key }`, since a word's arguments in the module's KDL
hold neither a reference nor a nested value, and `at-least <n> { … }`, whose argument the module reads as a list.
What this form cannot hold (a value inside a value of a binding, a list in a check's payload) makes `toKdl` throw a
`RangeError`; an `is` whose first operand is not a reference reads back as a problem, as kdlet's files ask. The
playground's «Schemi» and «Leggi» show each part in KDL, from `toKdl`, or in JSON.

## 7 · References in payloads: holes and fills

*Round «Holes».* A **hole** is a reference to a value no line in force states. The conditions above read references; this section lets a reference stand in any payload, so that a line can be written before everything it names is known, and completed later by another line.

**Where a reference may stand.** `{ "$value": key }` may stand wherever a JSON value stands in a payload, a list's item included. `$set`, `$writer` and `$draft` stay in conditions. A payload value that is an object with the single key `$value` is a reference, never a literal, as [value references in checks](../decisions/value-references-in-checks.md) already settled for checks.

**How the reading resolves.** In two passes over the lines in force, both in reading order:

1. The lines whose payload holds no reference state their values, as today. This gives the values references may read.
2. Every line is read with each reference replaced by that value. A reference to a key the first pass did not state stays unresolved: for a rule, the key is absent and states nothing; for a condition, `has` is false and `is` is false, which is `kdlet-guards`' `missing: 'false'`. An unfilled hole is absent, not unknown.

A value stated through a reference serves no other reference, so there are neither chains nor circles, and one pass of resolution is enough. A later line that states the key resolves every reference to it; revoking that line gives the earlier value back, or the hole.

**The fill.** A fill is an ordinary line of a gist whose `value` rule takes its key from the payload:

| Binding | Reads |
|---|---|
| `{ rule: 'value', keyFrom, from, where? }` | the key under `keyFrom` in the payload, the value under `from` |

`keyFrom` and `from` are payload keys. Admission refuses the line (`invalid-payload`) when the key is not a string, when it is a key some `value` binding of the schema states (a hole named `status` must not set the status), or when the value holds a reference: a fill holds plain values. The expectation is the key's value, later line wins, as for every value. The warehouse case has such a gist, `fill`, written by people.

**What the reading says.** `Reading` gains `holes: Array<{ key: string; lines: LineId[] }>`: every key some line in force refers to and no line states, by key, with the lines that hold the reference in reading order. Nothing is denounced and nothing is unsettled: a hole is answered by a person, and the application decides whether to prompt, wait or ignore. Admission treats a reference where a rule reads as present, so `required` is satisfied by a hole; the rule's own checks on the value's shape apply once it is resolved.

**Goals and holes.** A goal's `with` may hold a reference. The outcome is written as the goal carries it, the reference inside, and completes when the key is stated, like any line. A condition that reads a hole is false until the hole is filled, so «before things move» is `has` on the reference, in a `when` or in a goal.

**Stopping on a hole.** A schema that wants no line of a judged kin while a hole is open registers a law kind for it, broken while `holes` is not empty, or while a hole it names is. It is not in the base kit until a schema asks.

**Cases.** The warehouse's «Saved» scenario ([scenarios](scenarios.md) §5) has holes for the supplier's reference, the unloader and the sorter, and a run that fills them; its dry run against «Tuesday» fills them with Tuesday's values. The memo that names one assignee and leaves a second to be named, with a goal that waits on the second, is a scenario of the same case.

## 8 · As built

*Round «Conditions».* Where the build had to choose:

- **The module** is `packages/consequitur/src/condition.ts`, the one file that imports `kdlet-guards`: `conditionProblem` and `guardsProblems` (the reader's rules), `toModuleForm` and `fromModuleForm` (the two forms; without the set's members the one is the other's inverse), `conditionHolds` (true, false or unknown, for `when`), `evaluateCondition` (the trace, for goals), and `nodes`, `markLost`, `lostAt` (paths, and what can no longer hold).
- **The reader** asks a little more than §2 says, as it does of every conf: `is` has at least one value, `all`, `any` and `of` hold at least one condition, `atLeast` is a whole number from one to their count, `$set` names a declared set and `$writer` reads `id` or `kin`. An operand is a plain value or a reference, never an object or a list, since the module's `is` compares with `===`: a `when` that compared an object value, as `when.values` could, cannot be said. A goal, and a law's `while`, may not read `$writer` or `$draft`, through a guard either.
- **The trace.** The module stops an `all` at its first child that fails and an `any` at its first that holds; the translation back reads the children it did not ask, so every node has its trace and a screen can tick each. A named guard's node has its body as its one child, so a path may go through it.
- **Lost.** Read only where warnings are, as the anchoring was. A `line` node whose reference names a key no line states is never lost. The warning's `path` goes down from the root through an `all` to its first lost child and through a guard to its body, and stops at a `line`, an `any` or an `atLeast`; a goal writes one warning for each path, ever. `keeps-goals` gives one verdict per goal, when the path that makes it lost is new.
- **Laws** are judged with the lines and the schema besides the reading and the handles (`LawKind.judge`), since a condition reads lines in force and named guards.
- **Admission** reads `when` with the payload as it will be stored, before the payload's own checks, so a `when` that reads `$draft` refuses a payload that lacks the key as `not-now`.
- **The scenario player** leaves a reference in the line, as [scenarios](scenarios.md) §1 said it would.
- **`collect-writer`** has only `key`, and admits any payload.
- **The policy** keeps its `while: { values }`: §1 does not name it.
- **The cases.** SIBAR's guards are `assignee` and `open_assignee`; the review's `member`, `reviewer`, `editor` and `reviewing`; the warehouse's `member`. In the review, `request_changes` may be written by a goal (the deadline's), and the law on the reviewers holds while the status is `in_review` and a `request_review` line is in force: otherwise «draft or changes requested» would let `revision` be offered on a draft and every one refused by that law. «Published» loses the revoke of the old goal with the step «goal-v2», the two lines that changed it, and its goal's label is `goal`. The quorum is in the misfits' test, not in a scenario: none of the three is about a third reviewer. A goal of one check is a `line` node, not an `all` of one.
- **The playground**'s composer holds checks and sends them as an `all` of `line` nodes; «Cambia» opens only a goal whose condition is a `line` or an `all` of `line` nodes, which is every goal the page writes. The dock, the cards and the inspector («Riga») draw the trace as a tree, a goal that is an `all` as the one list of its children. Each domain has words for its schema's guards, and `defineDomain` refuses one that lacks or adds any.
- **Render.** `keyOfCheck(goal, path)` and `lineFacts`' warnings by path; the `n`th check of an `all` keeps the key it had.
