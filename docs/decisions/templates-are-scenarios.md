# Templates are scenarios

Status: settled 2026-10-06, built in the round «Order and scenarios» ([plan](../plan.md) §4) without holes; completed by the round «Holes», which built them; the spec is [scenarios](../specs/scenarios.md).

## Context

A store manager spends half an hour configuring an activity by hand, many steps and goals, and then says «we do this all the time» and wants to keep it. Adaptive case management is built on that move: a case handled by hand becomes a template for the next. The ledger is append-only, and a template must not become a second truth beside it.

Two shapes were weighed. The plan could live in the schema and be written out by the opening line's consequences: rules that expect lines, and a cycle check in the reader so that a consequence never produces its own cause inside one post. Or the plan could be the manager's own lines, kept with holes and played again. The first makes every plan a schema, and then every thread must name the exact schema it was opened under, for ever, because the manager will edit the template next month. The second is what the glossary already calls a scenario: steps with placeholders, played one after the other into an empty thread, each through admission.

What the manager made in that half hour were lines. He never said what a kind of line means; he said which lines this task needs. Saving what he made is saving lines.

## Decision

A template is a scenario. It is the application's data; the engine never sees it, only the lines it becomes. Opening from it is posting its steps in order, as the person who opens. A hole is a reference ([holes are unstated values](holes-are-unstated-values.md)). What happens later is goals, all set at opening, each waiting on what the goal before it writes, or on a value stated later.

Saving a scenario from a thread is the reverse walk, and most of it is mechanical. Each line has one fate:

- written by the engine: never saved, the engine writes it again;
- out of force, or a revoke: dropped;
- from outside, a kin the schema does not judge: dropped, it is awaited again;
- found by a goal: dropped, it is awaited again;
- any other line of a person: the saver's choice, kept as a step, dropped, or turned into what a goal writes or awaits.

Ids become placeholders. A value that appears in several kept lines becomes one hole.

A saved scenario is checked by playing it against the thread it came from: the holes filled with the values that were there, the dropped lines fed in their order, and the handles at the end compared with the thread's.

## Consequences

The player and its reverse leave `cases/` for the engine package. «Template» is the user's word and gets no glossary entry.

Where a person acted by hand at the right moment, pruning and holing are not enough: the saving session has to say what they were waiting for, by turning the line into a goal's outcome. A recording has no waits in it, and a thread with no goals saves as an opening and a pile of lines posted at once.

Two things a scenario cannot say are recorded, not solved. A plan that goes round again: a repeating cycle is a new activity. And «for each»: one goal per item of a list discovered later. Either would reopen plans named in the schema, and the cycle check that comes with them. One writer plays every step.
