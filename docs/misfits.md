# What does not fit

Status: recorded in round 5 ([plan](plan.md) §4), from the editorial review ([spec](specs/editorial-review.md)):
a second domain, chosen to be unlike SIBAR's activities, so that what the engine cannot say would show.
Five things a schema author wanted did not fit. Each below has what the author wanted, what the engine
says today (and the test that pins it, in `packages/consequitur/test/editorial.test.ts`, under «what does
not fit»), and the smallest engine change that would make it fit. The changes are proposals: nothing here
is built, and each waits for Egildo's answer.

Four of the five reach a **mechanic** (a goal's checks, `when`, a goal's payload), which a kit cannot
replace; the fifth reaches only a **kind**, and registration already answers it, as the principles say it
should. That is the pattern worth keeping: a need that a kind can meet is no change to the engine.

## 1 · «The current version»

**Wanted.** One goal, «both reviewers approved the version now on the table», written once by the editor.

**Today.** A check matches a line by equality on the payload keys it names, so a goal waits for approvals
of the version written into it. When the author posts v2 the goal still waits for v1: both reviewers
approve v2 and the article stays in review. A check cannot name a value handle: `{ "version": { "$value":
"version" } }` is admitted, being JSON, and is compared as written, so it is never met. Every new version
means revoking the goal and writing it again, which is what scenario «published» does (the step «goal-v2»).
Pinned by: *1 · a check holds a version written into it*.

**Smallest change.** A check's payload value, and a `when.values` value, may be a reference,
`{ "$value": "<key>" }`, resolved in `expectations` against the value handle just accumulated, before the
goals are read. The thread still decides, and the reading of a thread stays a function of it. The
reading's `checks` would carry the check as resolved. A literal payload value that is an object with the
single key `$value` can no longer be written in a check: acceptable.

## 2 · «Before the deadline»

**Wanted.** «When the deadline passes and a reviewer has not approved, ask for changes (or escalate).»

**Today.** There is no clock in the engine, which is right: the deadline is a value, and «it passed» is a
line a bridge writes, `deadline_passed`, whose only consequence is the value `late`. A goal's checks are
the presence of lines, with no negation and no reading of a value. A check with `not` or with `values` is
refused as an invalid payload. The nearest goal waits for the line the clock writes and acts whatever is
missing: with only one of two approvals in, it publishes the article. Pinned by: *2 · no check on time and
no negation*.

**Smallest change.** Two optional keys on a check: `absent: true`, met while no line in force matches it
(and never an orphan), and `values: { <key>: <value> }`, met while the value handle holds them, as in a
`when`. A goal `[{ values: { late: true } }, { absent: true, gist: 'approve', writer: 'user::cneri' }]`
then says it. Time still enters as a line, and the engine reads no clock. The question to settle is a
goal that is met and then unmet: it writes its outcome once, as now, and the outcome stands.

## 3 · «Status is A or B»

**Wanted.** `revision` allowed on a draft nobody has reviewed yet **or** after a request for changes.

**Today.** `when.values` holds one value per key, and the parts of a `when` are all required, so there is
no OR. `revision` is allowed only on `changes_requested`: an author cannot send a new version of a draft,
or of an article in review, and the menu does not offer it. The way out today is two gists for one fact,
with two labels, two cards and two schemas. Pinned by: *3 · a `when` names one value per key*.

**Smallest change.** A value in `when.values` may be a set of alternatives, `{ "$in": ["draft",
"changes_requested"] }`, read by `holds`. The laws' `while` and the policy's `while` read values the same
way, so one small function would serve the three.

## 4 · «Any two of three reviewers»

**Wanted.** A goal that fires when at least two of three reviewers have approved.

**Today.** A goal is the AND of its checks. With three reviewers and one goal on the three, two approvals do
not meet it. The way out is one goal for each pair, n choose k of them, each its own goal in the reading and
its own block in the dock; for «any three of seven» it is thirty-five. Pinned by: *4 · a goal is an AND of
its checks*.

**Smallest change.** An optional `need: <n>` in a goal's payload, beside `final` and `with`: met when at
least `need` of its checks are found (the default is all of them). A warning, and the law `keeps-goals`,
then speak when the quorum can no longer be reached, and not when one check alone is orphaned.

## 5 · «Who approved»

**Wanted.** The list of approvals of a version, by reviewer.

**Today.** Rules read the payload and never the writer, so the approval carries a `stamp`, `<version>:<the
reviewer's id>`, which repeats what the line already says: its writer. It is the writer's own word, so
nothing checks it: bgalli can post a stamp that says cneri. Pinned by: *5 · rules read the payload, never
the writer*.

**Smallest change.** None to the engine: a rule kind that reads the writer, `collect-writer { key,
prefix? }`, registered in a kit. The test registers one, reads a variant of the schema that uses it
against that kit (the base kit refuses it by name), and the scenario with no `stamp` deduces the same
approvals, from the writers, and nobody can sign for another. The only change worth making is to ship the
kind in `BASE_KIT` (about twenty lines), since a rule that reads the envelope will be needed again. The
alternative, `collect: "$writer"` in the `value` rule, would put an envelope word in a rule's vocabulary
for one use.
