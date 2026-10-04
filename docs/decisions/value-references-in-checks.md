# Value references in checks

Status: settled 2026-10-04, not built. To be built in the single round that answers the
[misfits](../misfits.md).

## Context

A goal's check compares a line's payload with literal values. A goal that should wait for «the
version now on the table» has to name the version, so every new version means revoking the goal
and writing it again (misfit «The current version»; scenario «published», step «goal-v2»). The
thread already holds the current version, as a value handle; a check cannot refer to it.

## Decision

A check's payload value may be a **value reference**, `{ "$value": "<key>" }`. During the
reduction the value handles are accumulated first, as now; then the goals are read, and each
reference is replaced by the value the thread expects under that key. The check is then matched
as any check.

```json
{ "gist": "approve", "writer": "user::bgalli", "payload": { "version": { "$value": "version" } } }
```

- **A key the thread does not hold** leaves the check unmet. It is never an orphan, so it writes no
  warning: a value not stated yet is awaited, not lost.
- **Goals still fire once.** A goal met at v1 and satisfied does not fire again at v2.
- **The reading shows the check resolved**: `GoalReading.checks[i]` carries the check as matched,
  with the reference replaced, and the reference as written, so a screen can say «approva la
  versione v2».
- **Anchoring** judges the resolved check, by the rules it has now.
- A literal payload value that is an object with the single key `$value` can no longer be matched
  in a check. `validChecks` accepts the reference and refuses an object with `$value` beside other
  keys.

## Consequences

One goal waits for «both reviewers approved the current version» across revisions; the scenario
loses its step «goal-v2». The reading stays a function of the thread. `when` is untouched: a
reference in `when.values` would compare a handle with a handle; what a schema would want there —
«a reviewer may approve only the current version», comparing the draft's own payload — is a
different feature, left open.
