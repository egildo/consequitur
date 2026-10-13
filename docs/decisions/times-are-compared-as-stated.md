# Times are compared as stated, the clock only at the door

Status: settled 2026-10-13 by Egildo's answers: the words live in `kdlet-guards`; `$now` in a gist's `when` only; an offset in whole days on dates, now; numbers too. Built in two rounds ([plan](../plan.md) §4): kdlet's 0.3.0, then here: built in the round «Comparisons» ([conditions](../specs/conditions.md) §8 says where it chose; `$now` is written `{ "$now": "instant" }`).

## Context

A condition compares only by equality: `is`. A schema cannot say «submitted before the deadline», «unloaded within two days of the announced date» or «fewer pieces than announced». The settled table of 2026-10-04 put comparisons in checks («`gt`, `before`») for later; [the chain is the order](the-chain-is-the-order.md) added that a time a law compares is one a line states, never the envelope's timestamp, which is the authority's clock and not the domain's.

The editorial review already shows the other half of time: its deadline passing is a line the world writes, `deadline_passed`. The passage of time is an event, as BPMN's timer events are; the reading never reads a clock ([principles](../principles.md), «A pure reading»).

The canon, from memory and not re-read for this decision:

- **TC39's Temporal** keeps a calendar date (`PlainDate`) and an instant (`Instant`) as different types, and refuses to compare them: a date has no time zone, so which instant it is cannot be said.
- **RFC 3339** writes both: `full-date`, `2026-10-13`, and `date-time` with its offset, `2026-10-13T17:00:00Z`.
- **Bitemporal data**, already adopted in the chain decision: what a line states about the world (valid time) is data; when it was recorded (transaction time) is the chain.

## Decision

**Four words, in `kdlet-guards`.** `before` and `after` compare times, `less` and `more` compare numbers, each between two operands, left first, all four strict. «On or before» is `not` of `after`, «at least» is `not` of `less`. They belong to the condition language, not to consequitur: order is as general as equality, and any host of the module may need it. The module's own document says the rules (`docs/guards-module.md` §6 in kdlet); its version 0.3.0 carries them, its three packages bumped together.

**Two kinds of time, never compared with each other.** A date against an instant does not hold. A schema that compares a deadline with a moment states the deadline as an instant.

**An offset in whole calendar days, on dates only.** `{ "before": [a, b], "days": 5 }` is «a within five days of b»; a negative number moves b back. Days on instants are a later step, since a day is not always 24 hours where clocks change.

**Operands are what conditions already read.** `$value` and `$draft`, and literals. A reference to a value no line states is a hole: the comparison is false until it is filled, as `is` is ([holes are unstated values](holes-are-unstated-values.md)).

**`$now`, in a gist's `when` only: the clock at the door.** It is the instant `post` and `dryRun` are given, as `stamp` writes it, an RFC 3339 instant in UTC. Admission may refuse a late line: `{ "not": { "after": [{ "$now": "instant" }, { "$value": "deadline" }] } }`. The menu has no instant, so a node that reads `$now` is unknown there, as one that reads `$draft` is. A goal, a law or a `while` that names `$now` is a problem the reader names: the reading stays pure, and the passage of time inside the thread is still a line the world writes.

## Nuance

**A replay meets the clock again.** A consolidation replays lines at a new instant ([threads are consolidated, never merged](threads-are-consolidated-never-merged.md)); a line admitted on time then may be refused as late now. The drill shows it as any refused step: the person skips it, edits it, or abandons. That is honest: the new thread is admitted today.

**Numbers are JSON numbers.** `"7"` is text, and `less` on text does not hold.

**What does not compare is false, never an error that stops the reading.** A wrong kind or an absent operand makes the node false; the module records it where the host asks it to. A literal of the wrong kind is a problem of the schema, found when it is read.

## Consequences

In kdlet: `before`, `after`, `less`, `more` in the module's model, evaluator, `problems` and KDL reader and writer; 0.3.0 of the three packages, published by Egildo. Here: `kdlet-guards` ^0.3.0; the condition reader accepts the four words and `$now`, with `$now` refused outside a `when`; the translation to the module's form carries them; `admit` resolves `$now` from its `now`, `offers` answers it unknown; `consequitur-kdl` reads and writes them through the module; the cases use each word once, pinned by tests; the conditions spec, the glossary and the playground's words for conditions follow. The packages then move to 0.2.0 together.
