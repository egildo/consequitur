# Conditions — spec

Status: §1 to §6 built in the round «Conditions» ([plan](../plan.md) §4), where the build chose as §6 and §8 say. From the decision
[conditions are kdlet's guards](../../explanation/decisions/conditions-are-kdlt-guards.md). Built on the module
`kdlet-guards` (kdlet's repo, `docs/guards-module.md`; on npm as `kdlet-guards`). Section 7, references in payloads, is built in the round «Holes», from [holes are unstated values](../../explanation/decisions/holes-are-unstated-values.md), and §8 says where it chose; the firing order of goals is in the [engine spec](engine.md) §7. The four comparisons and `$now` are built in the round «Comparisons», from [times are compared as stated](../../explanation/decisions/times-are-compared-as-stated.md), on `kdlet-guards` 0.3, and §8 says where it chose.

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
| `{ "is": A, "values": [B…] }` | A equals one of the Bs; a `$set` operand among the Bs stands for its members, and may not be A |
| `{ "has": A }` | A is there, and not null, empty text or an empty list |
| `{ "before": [A, B], "days"?: n }` | the time A is earlier than the time B, moved by n whole days (dates only) |
| `{ "after": [A, B], "days"?: n }` | the time A is later than the time B, moved by n whole days (dates only) |
| `{ "less": [A, B] }` | the number A is smaller than the number B |
| `{ "more": [A, B] }` | the number A is greater than the number B |
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
| `$now` | `instant`: the instant the line is admitted at, as `stamp` writes it | a gist's `when` |

An absent operand makes `is` and a comparison false (`missing: 'false'`): the reading never throws. A `$writer`,
`$draft` or `$now` reference in a goal or a law's `while`, or in a guard either uses, is a problem the reader names.

**Comparisons**, the module's own words (kdlet's `docs/guards-module.md` §6). All four are strict: «on or before» is `not` of `after`, «at least» is `not` of `less`. A time is an RFC 3339 date, `2026-10-13`, or an instant with its offset, `2026-10-13T17:00:00Z`, compared as the moment it names; a date never compares with an instant, so a schema that compares a deadline with a moment states the deadline as an instant. `days` moves the right operand by whole calendar days, on dates only: `{ "before": [a, b], "days": 5 }` is «a within five days of b», and a negative number moves b back. Numbers are JSON numbers: `"7"` is text. What does not compare (the wrong kind, a date against an instant, `days` with instants) makes the node false, never an error that stops the reading. The operands are `$value`, `$draft` and `$now`, and literals; a `$set` (a list of names) and a `$writer` (a name) are never a time or a number, and the reader refuses them there. The module's `problems` says what can be seen without a value, a literal of the wrong kind or `days` that is not a whole number, and the reader names it as a problem of the schema.

**`$now`** is the clock at the door, and only there: the instant `post` and `dryRun` are given, which `admit` takes as its last argument. A gist's `when` may refuse a late line: `{ "not": { "after": [{ "$now": "instant" }, { "$value": "deadline" }] } }`. The reading, goals and laws never read it: the passage of time inside the thread is a line the world writes, as the editorial review's `deadline_passed`.

**Two forms, one model.** The form above is consequitur's, and it is what a schema and a goal's payload hold. `kdlet-guards` has its own: a reference is `{ "ref": { "from", "field" } }`, and `line` and `atLeast` are registered words, `{ "word": "line", "args": Check }` and `{ "word": "at-least", "args": n, "body": [C…] }`. The engine translates at each evaluation, with the expectations in hand: `$value`, `$set`, `$writer`, `$draft` and `$now` become references the host resolves (`$now` from `now`, field `instant`), a `$set` operand among an `is`'s values is replaced by the set's members, `line` and `atLeast` become the two words, and the four comparisons stay as they are, their operands translated. The translation is a small pure function and its inverse serves `consequitur-kdl` (§6), which reads KDL through the module's reader and writes it back. Nothing of the module's form is stored in a thread or a schema.

## 3 · Reading a condition

- **A gist's `when`** is evaluated with the writer, the draft and the instant. `admit(lines, draft, schema, now?)` evaluates it fully, and admits only when it is true: given no `now`, a node that reads `$now` is unknown, and the line is refused `not-now`. `offers` has no draft and no instant, so a node that reads `$draft` or `$now` is neither true nor false: it is **unknown**, and unknown spreads as in three-valued logic. `not` of unknown is unknown; `all` is false when a child is false, otherwise unknown when a child is; `any` is true when a child is true, otherwise unknown when a child is; `atLeast n` is true when n children are true, false when fewer than n could still be, otherwise unknown; a named guard is as its body. A gist is offered unless its `when` is false. So the menu may offer what admission then refuses for its payload or its instant, never the reverse. (Treating a `$draft` node as holding, as first written here, breaks that promise under `not`: `not` of a node held true is false, and the menu hides what admission accepts.) `kdlet-guards` answers an absent operand with `missing: 'error' | 'false'`; the menu needs a third value for the operand the draft will supply, which was the one change asked of kdlet, recorded in the plan. Version 0.2 has it: a host answers `UNKNOWN` for a reference not yet known, and the menu answers so for `$draft`.
- **A goal** is evaluated in the reading, after the handles are accumulated, against the lines in
  force (the goal itself excluded, as now), each read with its references replaced (§7). Once, final, `with` and warnings are unchanged. Goals met in one reading write their outcomes one per round, in reading order of their lines ([engine](engine.md) §7).
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
- The misfit tests become tests that the five now fit; `docs/project/misfits.md` says so, each with the
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
A condition is written as kdlet's files write a guard's body, with the tags `(value)`, `(set)`, `(writer)`,
`(draft)` and `(now)`; several nodes in one body are all of them. The four comparisons are the module's, read and
written by it: `after (now)instant (value)deadline`, `after (value)arrived (value)announced days=2`; the left operand
is a reference, as in `is`, and a date or an instant is quoted text, `"2026-10-13"`, since a bare word cannot start with a digit. Two words are read and written here, not by the module:
`line gist=… kin=… writer=… { payload key=value key=(value)key }`, since a word's arguments in the module's KDL
hold neither a reference nor a nested value, and `at-least <n> { … }`, whose argument the module reads as a list.
What this form cannot hold (a value inside a value of a binding, a list in a check's payload) makes `toKdl` throw a
`RangeError`; an `is` whose first operand is not a reference reads back as a problem, as kdlet's files ask. The
playground's «Schemi» and «Leggi» show each part in KDL, from `toKdl`, or in JSON.

## 7 · References in payloads: holes and fills

*Round «Holes», built.* A **hole** is a reference to a value no line in force states. The conditions above read references; this section lets a reference stand in any payload, so that a line can be written before everything it names is known, and completed later by another line.

**Where a reference may stand.** `{ "$value": key }` may stand wherever a JSON value stands in a payload, a list's item included. `$set`, `$writer` and `$draft` stay in conditions. A payload value that is an object with the single key `$value` is a reference, never a literal, as [value references in checks](../../explanation/decisions/value-references-in-checks.md) already settled for checks.

**How the reading resolves.** In two passes over the lines in force, both in reading order:

1. The lines whose payload holds no reference state their values, as today. This gives the values references may read.
2. Every line is read with each reference replaced by that value. A reference to a key the first pass did not state stays unresolved: for a rule, the key is absent and states nothing; for a condition, `has` is false and `is` is false, which is `kdlet-guards`' `missing: 'false'`. An unfilled hole is absent, not unknown.

A value stated through a reference serves no other reference, so there are neither chains nor circles, and one pass of resolution is enough. A later line that states the key resolves every reference to it; revoking that line gives the earlier value back, or the hole.

**The fill.** A fill is an ordinary line of a gist whose `value` rule takes its key from the payload:

| Binding | Reads |
|---|---|
| `{ rule: 'value', keyFrom, from, where? }` | the key under `keyFrom` in the payload, the value under `from` |

`keyFrom` and `from` are payload keys. Admission refuses the line (`invalid-payload`) when the key is not a string, when it is a key some `value` binding of the schema states (a hole named `status` must not set the status), or when the value holds a reference: a fill holds plain values. The expectation is the key's value, later line wins, as for every value. The warehouse case has such a gist, `fill`, written by people.

`required` is not allowed on this binding, and a fill whose payload lacks the key or the value states nothing, as a payload that lacks what a binding reads always does.

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

*Round «Holes».* Where the build had to choose:

- **The helper** is `resolvePayload(payload, values, keep?)` in `check.ts`, beside `isValueReference` and `referencesOf`, which gives the keys a value refers to. It leaves a reference to a key `values` lacks out (an object's key, a list's item), or, with `keep`, in place. `resolveCheck` is no longer its own loop: it reads the same helper, against the value handle the condition is read with, and gives nothing when a key of the check's payload was left out. A reference inside a list or an object in a check's payload is resolved too, which it was not before; one that does not resolve leaves its item out.
- **The first pass** runs when some line holds a reference. Otherwise the one pass states the values too. A goal's line is never resolved, nor counted as one that holds a reference for the first pass: its `when` is a condition, read as §2 says, and its `with` is what the outcome will carry.
- **A condition reads the thread's expectation,** `$value` in an operand or in a check being the value handle as the whole reading states it (§2); only a payload's references read the first pass alone. The two differ only for a key stated through a reference.
- **`holes`** lists the keys a reference names that the first pass did not state. So a reference to a key only a reference states (the chain §7 forbids) is a hole, and stays one. A line holds a reference by its payload, a goal's by its `when` and its `with` both: a goal that waits for a value in its condition awaits it, as one whose outcome carries a reference does, and so does the outcome once it is written. A reference in the schema, in a guard or a gist's `when`, is no line's and is not listed.
- **Admission** gives each rule kind's `admit` the draft with each reference that resolves replaced and the others left, a reference counting as present, and, besides, the draft as written and the schema (`admit(binding, payload, written, schema)`). The fill's three refusals are read on the draft as written, so a reference that would resolve is no key and no value either. The set of keys the schema states is read from its gists in each admission, not stored. `join` lets a reference stand as the names or as an item. The outcome of a goal, `with`, is admitted the same way.
- **The draft a `when` reads** has its references replaced the same way; a reference that states nothing is absent, and `has` is false.
- **Not done: the stopping law** (§7), as the spec says, and `keeps-set`'s `while`, which still reads the lines in force as they are written: a `line` node there does not see a reference resolved.

*Round «Comparisons».* Where the build had to choose:

- **`$now`'s shape** is a reference like the others, `{ "$now": "instant" }`, and `instant` is the one field it reads, as `$writer` reads `id` or `kin`; the decision wrote `{ "$now": true }`, but a reference names a field with text, and the module's KDL reads one only so: `(now)instant`.
- **The operands.** `$value`, `$draft`, `$now` and literals, as the decision lists them; `$set` and `$writer` are refused in a comparison, since neither is ever a time or a number and the node could only be false. `days` stands only on `before` and `after`: on `less` or `more` the node has a key too many. Each comparison is checked by the reader's shape rules and then by the module's `problems`, whose sentence is the problem's, with a full stop: `gist "on_time": when: "tomorrow" is not a date or an instant; "before" compares only those.`
- **Admission** reads `$now` as `new Date(now).toISOString()`, the instant `stamp` writes, so an offset in `now` is the same moment. A `when` admits only when it is true: before, unknown could only come from `$draft`, which admission always has. A `now` that does not parse is the caller's mistake: `admit` throws the platform's `RangeError`, as `stamp` does, once a `when` is to be read. `holds` and `whenHolds` take the same optional `now` after the payload; without a payload they are the menu's question, and `now` is not read.
- **The cases.** The editorial review's `revision` adds `not after (now)instant (value)deadline` to its `when`; «late» writes its deadline as `2026-10-02T17:00:00+02:00`, an instant before every `now` its plays are given, and ends with a version sent after it, refused `not-now`. The warehouse states `announced` and `pallets` on `open` and `arrived` (from `date`) and `counted` (from `pallets`) on `arrival_scanned`, and names two guards, `late` (`after (value)arrived (value)announced days=2`) and `short` (`less (value)counted (value)pallets`), which goals use; «Tuesday» and «Saved» state the dates and the pallets of an arrival a day after it was announced, with every pallet, and «Late and short» is three days late and two pallets short, and both goals fire.
- **The playground** says the four as «è prima di», «è dopo», «è meno di», «è più di», with «più n giorni» or «meno n giorni» after the right operand, and `$now` as «adesso».
