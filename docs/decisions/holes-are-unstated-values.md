# Holes are unstated values

Status: settled 2026-10-06, not built. Built in the round «Holes» ([plan](../plan.md) §4); the spec is [conditions](../specs/conditions.md) §7.

## Context

A template saved from an activity has holes: values the next run must supply, some at opening, some only later and by someone else. A memo may name one assignee and leave a second to be named before things move.

The first shape was a hole of its own: a placeholder kept inside a stored line, a `fill` mechanic beside revoke, filled once. Writing the warehouse and the memo by hand showed the thing was already there. The conditions round brings references, `{ "$value": "key" }`, «the value handle the thread expects under the key», and a hole is a reference to a value nobody has stated yet. Filling it is stating that value. The two ways differ in one question only: may a reference stand anywhere in a payload, or only where a goal reads?

Whether an open hole should be denounced was weighed and refused. A denunciation is what reconciliation answers, and the glossary pairs the two words; a hole is answered by a person. Denounced, a hole would leave the thread unsettled, and `settles` would refuse the very fill that closes it while another hole stands. And the settled reading of a reference to an unstated value is already «awaited, not lost» ([value references in checks](value-references-in-checks.md)): one situation keeps one meaning.

## Decision

- A reference may stand anywhere in a payload, not only in a condition. The reading resolves it before any rule, `when` or check reads the payload.
- Resolution is one pass, against the values stated by lines whose own payload holds no reference. A value stated through a reference serves no other reference. So a fill holds plain values, and there are neither chains nor circles.
- A fill is an ordinary line, of a gist whose `value` rule takes its key from the payload, the shape records already have. Later line wins, as for every value; revoking a fill restores what stood before.
- Admission refuses a fill that states a key some rule of the schema states, as `invalid-payload`: a template hole named `status` must not set the status.
- Open holes are awaited: the reading lists the unresolved references with the lines that hold them. Nothing is denounced and nothing is unsettled. A schema that wants the thread to stop while a hole is open registers a law for it.
- An unfilled hole is absent, not unknown: `has` is false, `is` is false, which is `missing: 'false'` in `kdlet-guards`. Holes need no third truth value.

## Consequences

No hole character in the engine, no fill mechanic, no new placeholder in scenarios: `$value` passes through the player into the line. The filled value lands in the value handle, listed and searched like any value. A text with a piece missing («Arrivo ‹supplier›») is not a hole: the application completes it before posting, and that is the one kind of hole that stays at the edge.

Settled the same day, and narrow: reconciliation is the engine's, and what a person owes the thread is the application's to chase. The engine lists it; the application decides whether to prompt, wait or ignore.
