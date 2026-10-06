# The editorial review — spec

Status: settled, built (round 5, [plan](../plan.md) §4). The second domain, chosen to be unlike
SIBAR's activities, so that what does not fit the engine shows. Built as data in
`cases/editorial-review/`, tested in the engine's suite, and offered in the playground beside the
SIBAR activity.

## 1 · The story

An author submits an article and names an editor. The author asks two reviewers. Each reviewer
reads the current version and approves it or asks for changes; the author answers with a new
version. When both reviewers have approved the same version, the article is published — by a
goal the editor sets, final, so a published article cannot be unpublished by a revoke. A deadline
can be written into the thread; a clock outside posts that it passed.

People: Anna Conti (`aconti`, author), Bruno Galli (`bgalli`) and Carla Neri (`cneri`,
reviewers), Davide Russo (`drusso`, editor). Writers: `user::…`, `system::clock` (the authority
and the clock's bridge), `goal::…`.

## 2 · The schema (`cases/editorial-review/schema.json`)

Head: `opening: "submit"`, `authority: "system::clock"`, `sets: ["team", "reviewers", "editors"]`,
`records: { value: "value_set", join: "joined", leave: "left", warning: "goal_warning" }`,
`judged: ["user"]`.

| Gist | Writers | Rules | When |
|---|---|---|---|
| `submit` | user | value `title` from `title` (r); value `status` = `draft`; value `version` from `version` (r); join `team` from `authors` (r); join `editors` from `editor` (r) | — |
| `revision` | user | value `version` from `version` (r); value `status` = `in_review` | in `team`; status `changes_requested` |
| `request_review` | user | join `reviewers` from `reviewers` (r); join `team` from `reviewers` (r); value `status` = `in_review` | in `team` |
| `approve` | user | collect `approvals` from `stamp` (r) | in `reviewers`; status `in_review` |
| `approve_revoke` | user | revoke `approve` from `target` | in `reviewers`; status `in_review` |
| `request_changes` | user | value `status` = `changes_requested` | in `reviewers`; status `in_review` |
| `comment` | user | — | in `team` |
| `set_goal` | user | goal | in `editors` |
| `set_goal_revoke` | user | revoke `set_goal` from `target` | in `editors` |
| `publish` | goal, user | value `status` = `published` | in `editors`; status `in_review` |
| `deadline` | user | value `deadline` from `date` (r) | in `editors` |
| `deadline_passed` | system | value `late` = `true` | — |
| `leave_team` | user | leave `team`; leave `reviewers` | in `team` |
| `value_set`, `joined`, `left` | system | — | — |
| `goal_warning` | goal | — | — |

An approval's payload is `{ version, stamp }`, where `stamp` is `"<version>:<reviewer id>"`, so the
`approvals` list says who approved what. A goal for publication has the checks
`{ gist: 'approve', writer: 'user::bgalli', payload: { version: 'v2' } }` and the same for
`cneri`, then `publish`, `final: true`.

Laws: `keeps-set { set: 'reviewers', while: { status: 'in_review' } }` refuse;
`keeps-set { set: 'editors' }` refuse; `keeps-goals` confirm; `settles` refuse.

## 3 · Scenarios (`cases/editorial-review/scenarios.json`, read by tests and the playground)

1. **Published**: submit (v1) by aconti, editor drusso → request review of bgalli and cneri →
   the editor's goal «Pubblicazione» (both approve v1, then publish, final) → bgalli approves v1 →
   cneri asks for changes → aconti posts v2 → the editor changes the goal to v2 (revoke and new)
   → both approve v2 → published by the goal; a `publish` revoke is not even offered (no revoke
   gist for it), and the goal's line is locked.
2. **Late**: the same up to the request for changes, then the editor writes a deadline, and
   `system::clock` posts `deadline_passed`: `late` is set, nothing else happens (§4).
3. **Left alone**: bgalli leaves the team during the review while cneri stays: allowed; then cneri
   tries to leave: refused by `keeps-set` on reviewers.

## 4 · What is expected not to fit

The point of this round. Each item is tested as it is today and recorded in `docs/misfits.md`
with what the engine would need; nothing is added to the engine in this round.

1. **«The current version».** A check cannot refer to a value handle, so a goal waits for
   approvals of a version written into it; every new version means changing the goal.
2. **«Before the deadline».** No check on time, and no negation: «not approved when the deadline
   passes» cannot be a goal. `late` is only a value.
3. **«Status is A or B».** `when.values` is one value per key, so `revision` is allowed only on
   `changes_requested`: an author cannot post a new version of a draft nobody reviews yet, which
   would need «draft or changes_requested», an OR.
4. **«Any two of three reviewers».** A goal is an AND of checks; a quorum is not expressible.
5. **«Who approved».** Rules read the payload, never the writer, so `stamp` repeats the writer's id
   in the payload; a rule kind reading the writer would remove it. Shown, in the case's test, as a
   custom rule kind registered in a kit (`collect-writer`), to prove extension by registration
   on a real need.

## 5 · The playground

A domain picker in the header bar: «Attività (SIBAR)» and «Revisione editoriale». Each domain is
its schema, its UI schema (labels, cards, compose, awaited — a second `ui-schema` module), its
people, its policy (none for the review) and its examples (the three scenarios). Switching resets
the thread. Nothing in the page's code names a gist outside the domains' modules.

## 6 · Done when

`cases/editorial-review/` holds the schema and the scenarios; the engine's suite runs the three
scenarios and the five misfits; the playground switches domains and runs the review's examples to
the end in a browser; `docs/misfits.md` records the five with, for each, the smallest engine
change that would make it fit.

## 7 · As built

Where the build had to choose:

- **A scenario** is a list of steps, `{ writer, gist, payload }`, in `scenarios.json`, a list of
  `{ id, title, steps }` (`published`, `late`, `left-alone`). A step may carry a `label`, so a later
  payload can point at the line it posted, `confirmed: true` for a `confirm` law, and `refused:
  <code>`, for a step the scenario expects the engine to refuse. The last step of «left alone» is
  that: the scenario ends on the refusal, and the playground leaves it under the bar.
- **Placeholders**, one resolver for all, `scenario.ts` of the engine package (the tests and the playground import it,
  and it knows no gist): `{ "$line": "<label>" }` is the id of the line a step posted; `{ "$goal":
  "<label>" }` is `goal::` and that id, the writer of what a goal writes; `{ "$find": <check> }` is the
  first line, in reading order, that the check matches, for a line no step posted. A placeholder may
  stand wherever a value does, a check's payload and its writer included.
- **SIBAR is in the same shape**: its two examples are `cases/sibar-activity/scenarios.json`, and its
  policy, which the playground had inline and the tests had no use for, is `policy.json`, so both read
  one file.
- **The domains of the playground** are `playground/src/domains/{sibar,editorial}.ts`, each a
  `defineDomain` of its case (read with `readSchema` and `BASE_KIT`) and its UI schema. The review has
  no policy, no document and no command; its goals stand one at a time and have no wrapper; a goal
  awaits «each reviewer approves the version this card names» (`awaited.by.members`), and the
  composer of an approval starts on the thread's current version and makes the stamp.
  `playground/test/fence.test.ts` fails on a gist named anywhere in `src/` but the two modules.
- **The misfits' tests** show today's behaviour; the third reviewer of the quorum test, `dferri`, is the
  test's own. The `collect-writer` kind is registered in the test, in a kit, and not in the package.
- **The engine did not change** this round, as §4 says.
