# What did not fit

Status: recorded in round 5 ([plan](plan.md) §4), from the editorial review ([spec](specs/editorial-review.md)):
a second domain, chosen to be unlike SIBAR's activities, so that what the engine cannot say would show.
Five things a schema author wanted did not fit. All five fit since the round «Conditions», which answered
them together with one condition language ([conditions](specs/conditions.md)) rather than five keys. Each
below has what the author wanted, what the engine said before, and what it says now, with the test that
proves it, in `packages/consequitur/test/editorial.test.ts`, under «what now fits».

Four of the five reached a **mechanic** (a goal's checks, `when`, a goal's payload), which a kit cannot
replace, and were answered by the conditions; the fifth reached only a **kind**, and registration already
answered it, as the principles say it should: the round shipped that kind in `BASE_KIT`. That is the pattern
worth keeping: a need that a kind can meet is no change to the engine.

## 1 · «The current version»

**Wanted.** One goal, «both reviewers approved the version now on the table», written once by the editor.

**Before.** A check matched a line by equality on the payload keys it named, so a goal waited for
approvals of the version written into it. Every new version meant revoking the goal and writing it again,
which is what scenario «published» did (the step «goal-v2»).

**Now.** A check's payload value may be a reference, `{ "$value": "version" }`, resolved against the value
the thread expects when the goal is read ([value references in checks](decisions/value-references-in-checks.md)).
The goal set at v1 awaits v2 once v2 is posted; the trace shows each check as matched. A reference to a key
no line states leaves the check unmet and is never lost, so it writes no warning. Scenario «published» has
one goal and no step «goal-v2». Proved by: *1 · one goal follows the version the thread holds, and a key
the thread does not hold is awaited, never lost*.

## 2 · «Before the deadline»

**Wanted.** «When the deadline passes and a reviewer has not approved, ask for changes (or escalate).»

**Before.** A goal's checks were the presence of lines, with no negation and no reading of a value; the
nearest goal waited for the line the clock writes and acted whatever was missing.

**Now.** A goal's condition has `not`: `{ all: [{ line: deadline_passed }, { not: { all: [both approvals of
the current version] } }] }`, then `request_changes`, which a goal may now write. Time still enters as a
line, and the engine reads no clock. A goal met and then unmet keeps the outcome it wrote, as before.
Proved by: *2 · a goal with `not`: when the deadline passes and the current version is not approved by
both, it asks for changes*.

## 3 · «Status is A or B»

**Wanted.** `revision` allowed on a draft nobody has reviewed yet **or** after a request for changes.

**Before.** `when.values` held one value per key, and the parts of a `when` were all required, so there was
no OR, and `revision` was allowed only on `changes_requested`.

**Now.** `revision`'s `when` is `{ all: [{ guard: member }, { is: { $value: status }, values: [draft,
changes_requested] }] }`. A revision of a draft puts it in review before anyone is asked to review it, so
the law on the reviewers holds only once a `request_review` line is in force (its `while` is a condition
too); without that the law would refuse every revision of a draft. Proved by: *3 · `is` with two values:
an author may post a new version of a draft nobody has opened, or after a request for changes*.

## 4 · «Any two of three reviewers»

**Wanted.** A goal that fires when at least two of three reviewers have approved.

**Before.** A goal was the AND of its checks; «any two» was one goal for each pair, n choose k of them.

**Now.** The word `atLeast`: `{ atLeast: 2, of: [three approvals of the current version] }`. A warning, and
the law `keeps-goals`, speak when fewer than two can still hold, not when one check alone is lost. Proved
by: *4 · `atLeast`: one goal for «any two of three», which a third approval does not need*.

## 5 · «Who approved»

**Wanted.** The list of approvals, by reviewer.

**Before.** Rules read the payload and never the writer, so the approval carried a `stamp`,
`<version>:<the reviewer's id>`, the writer's own word, which nothing checked.

**Now.** `collect-writer { key }` is in `BASE_KIT`: it adds the line's writer id to the list under `key`,
as `collect` does. The editorial schema uses it and has no `stamp`; nobody can approve in another's name.
The list says who approved, not which version: the goal on the current version says which. Proved by:
*5 · `collect-writer`, in the base kit: approvals come from the writers, with no stamp, and nobody signs
for another*.
