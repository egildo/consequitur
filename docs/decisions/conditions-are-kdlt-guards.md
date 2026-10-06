# Conditions are kdlet's guards

Status: settled 2026-10-05, not built. Built in round 6 ([plan](../plan.md) §4).

## Context

Four of the five [misfits](../misfits.md) asked for conditions the engine could not say: a value
now held, «A or B», «not», «at least two of three». Answering each with a key of its own would add
four mechanisms. Prior art agrees on one small shape — XState's guards (`and`, `or`, `not`, named
guards), json-rules-engine (`all`, `any`, `not`, named conditions), and kdlet's guards (`is`, `has`,
`not`, `all`, `any`, named, host guards, no expressions), which are Egildo's own.

## Decision

One condition language for a gist's `when` and a goal's conditions: kdlet's guards, through the
module `kdlet-guards`, with two words consequitur registers — `line` (a line like this is in force,
today's check) and `at-least n` (a quorum of its children). References name what they read:
`(value)key`, `(set)name` (its members: `is (writer)id (set)reviewers` is membership),
`(writer)id`, `(writer)kin`, and `(draft)key` (the line being written, in `when` only). Named
guards live at the schema's level and are used by name in a `when` or in a goal. Comparisons beyond
equality and checks on time stay out until a real schema asks; a registered guard kind is how one
could come without changing the engine.

## Consequences

The SIBAR and editorial schemas are rewritten in the new form; today's `checks` and `when` shapes
are not kept. [Value references in checks](value-references-in-checks.md) becomes the `(value)`
reference. A goal warns when its condition can no longer hold: `line` by today's anchoring; `all`
when a child cannot; `any` when none can; `at-least n` when fewer than n can; `not` and `is` never.
