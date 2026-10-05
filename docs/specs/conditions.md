# Conditions — spec

Status: proposed for round 6 ([plan](../plan.md) §4), from the decision
[conditions are kdlt's guards](../decisions/conditions-are-kdlt-guards.md). Built on the module
`kdlt-guards` (kdlt's repo, `docs/guards-module.md`).

## 1 · Where a condition stands

| Place | Was | Now |
|---|---|---|
| a gist's `when` | `{ checks?, in?, values? }` | a `Condition` |
| a goal's payload | `checks: Check[]` (all) | `when: Condition` |
| the schema | — | `guards: { [name]: Condition }`, used by `{ "guard": "name" }` |
| `keeps-set`'s `while` | `{ [key]: Json }` | a `Condition` |

The old shapes are not kept: the cases are rewritten.

## 2 · The JSON form

`kdlt-guards`' model, with consequitur's two words and a shorthand for references:

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

## 3 · Reading a condition

- **A gist's `when`** is evaluated with the writer and the draft. `offers`, which has no draft,
  evaluates it treating every node that reads `$draft` as holding; `admit` evaluates it fully. So
  the menu may offer what admission then refuses for its payload, never the reverse.
- **A goal** is evaluated in the reading, after the handles are accumulated, against the lines in
  force (the goal itself excluded, as now). Once, final, `with` and warnings are unchanged.
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
`kdlt-guards/kdl` and `@bgotink/kdl`. JSON stays the model (a goal is a line, and payloads are
JSON); KDL is how a person writes a schema. Each case gains `schema.kdl`, and a test checks it
reads to the same object as `schema.json`. The playground's «Schemi» shows the schema as KDL or
JSON.
