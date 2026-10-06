# Goals fire in thread order

Status: settled 2026-10-06, built in the round «Order and scenarios» ([plan](../plan.md) §4).

## Context

Reconciliation runs in rounds and stops after three. The cap was there so that a thread could not go on settling for ever. It no longer protects anything: a goal writes its outcome once, an outcome can neither set a goal nor revoke, and a record gist carries no rules (the reader refuses one since the bug-fix round). So the rounds a post can need are bounded by the goals in force. What the cap still does is cut: a chain of three goals is refused by `settles` when a person's line triggers it, and left unsettled when a fact from outside does.

Every goal met in one reading fires in the same round. That is harmless while a condition is a conjunction of lines. It is wrong once `not` arrives with the conditions round: two goals can each fire because the other has not fired yet, and both do. Synchronous languages refuse this as an instantaneous loop, and the artifact-centric process models process one event to quiescence as a single step with rules firing in an order; both from memory, not re-read for this decision.

Whether a goal should be allowed to set a goal, so that a plan could unfold over time, was asked and set aside: templates do not need it ([templates are scenarios](templates-are-scenarios.md)), and with the population of goals fixed during a post the bound below holds without a cycle check.

## Decision

A post runs to its end. Each round answers every handle denunciation and every warning, and the outcome of one goal: among the goals met and not yet fired, the one whose line comes first in reading order.

The bound is derived, not fixed: the goals in force that have not written their outcome, plus two. Past it the thread pauses, as the cap pauses it today, and `settles` refuses the line. Only a kit's handle kind that does not cure the difference it answers can reach it.

A goal still cannot set a goal, nor revoke.

## Consequences

`MAX_ROUNDS` goes, and the two tests of the cap become tests of the bound. `rounds` in a dry run grows with the goals one line fires: measured on a thread of three thousand lines, a line that fires twenty goals costs about fifty milliseconds against twelve today, and a line that fires one costs the same as today. The reading keeps listing goals by name; the order of firing is the thread's. A reading that carries forward between rounds would remove the growth, and is not worth building until a schema shows the need.
