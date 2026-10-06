# The reading is closed-world; only the draft is unknown

Status: settled 2026-10-06. The one unknown is built in the round «Conditions» ([plan](../plan.md) §4), in `kdlet-guards` first; the closed world needs no building, it is what the reading does.

## Context

Two places asked for a third truth value. A hole, a reference to a value no line states ([holes are unstated values](holes-are-unstated-values.md)), and the menu, which evaluates a gist's `when` before the draft exists and so cannot know what the draft will say. The conditions spec first answered the menu by treating every node that reads the draft as holding, which under `not` hides what admission would accept.

The reading was done against the prior art, not from memory. SQL gave an absent value the third value *unknown*, with Kleene's strong tables for `and`, `or` and `not`, and paid for it: `x = x` stops being a tautology, `p or not p` is unknown when `p` is, every aggregate needs a step that drops nulls, and Date and Darwen hold that nulls should go altogether. Logic programming and complete databases took the other road, the closed-world assumption: what is not known to be true is false, and negation is failure to prove. The well-founded semantics for negation in logic programs is three-valued too, and gives *undefined* to two rules that each depend on the other's failure; production systems answer the same case by firing one rule per cycle, chosen by a conflict-resolution strategy, the order the rules were written among them.

## Decision

- **The reading is closed-world.** Every change is a line, so the thread is complete by construction, more than any database is: what no line in force says is not so. An absent value is false, not unknown; an unfilled hole is absent. The reading has two truth values.
- **The draft is the one unknown.** A value the future will supply is not a fact missing from a complete record. A node of a `when` that reads the draft, evaluated for the menu, is *unknown*, and unknown spreads by Kleene's strong tables: `not` leaves it, `all` is the minimum, `any` the maximum, `atLeast n` is true with n children true and false when fewer than n could still be. Not the weak tables, where one unknown infects the whole condition: those would blank the menu. A gist is offered unless its `when` is false, which is SQL's stance for a `CHECK` constraint, not for a `WHERE`. Admission, with the draft present, has nothing unknown left.
- **Where the well-founded semantics says undefined, the thread's order decides** ([goals fire in thread order](goals-fire-in-thread-order.md)). That is a production system's conflict resolution by the order of the rules, with the thread as working memory, and it is kept.

## Consequences

`kdlet-guards` gains the one unknown: a host's resolver may answer that a reference is not yet known, and the evaluator carries the third value through its tables and into the trace, with `missing` untouched, so kdlet's own strictness does not change. The conditions spec's menu rule reads as this decision says. Two shapes stay parked with their tests: marking in the reading a goal whose firing the order decided, where the well-founded semantics would have said undefined, and a residual condition for the composer, what partial evaluation leaves once the known operands are folded, as Open Policy Agent and Hazel do it.
