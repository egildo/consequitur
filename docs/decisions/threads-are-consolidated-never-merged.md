# Threads are consolidated, never merged

Status: proposed 2026-10-13. Egildo leans to consolidation over merging and wants it before publishing 0.1.0. Only the part that enters the hash binds before publishing; the rest is the reading's and can grow later.

## Context

Two threads sometimes have to become one: two activities that turn out to be one, two branches of an organisation reporting as one. "Merging two ledgers" names two different things.

**One thread, split and rejoined.** Two authorities extend one thread apart and their lines must be woven back. That is git's merge commit, a line with two parents, or logical clocks and CRDTs. [The chain is the order](the-chain-is-the-order.md) refuses a fork, because one authority stamps every line, and calls this case a later decision, if it is ever needed. It is not this one.

**Two threads, made one.** Two threads, each whole, each with its own first line and nonce ([the first line declares the thread](the-first-line-declares-the-thread.md)), continue as one. Accounting calls this **consolidation**, and its form is old: the journals of the two entities are never interleaved. Each is closed, and a new ledger opens with a reference to each and its closing balance carried in, **brought forward**. The originals stay as they were, closed and intact, and can be audited on their own.

Interleaving two threads by time is ruled out by the chain decision for the same reasons a loose mode was: the order is the order things were known in, and each thread already has one.

## Decision, proposed

**Two threads are never merged into one chain.** A consolidation is a new thread.

**The new thread's first line names its sources.** The declaration gains `from`: a list of sources, each `{ first, last }`, the id of a source's first line (which thread it is) and the id of the last line the consolidation took from it (where its books were closed). The list is in the hash, as the rest of the declaration is. A thread with no `from` consolidates nothing, so every thread written so far is unchanged.

**A source is sealed by being named.** The `last` id is the head the chain decision said a thread cannot keep for itself: whoever holds the new thread holds the sources' heads. A line written to a source after its `last` is visibly after the seal. Whether a host refuses it is the host's business, as storage is.

**Nothing is brought forward yet.** The new thread's reading starts empty, as any thread's does. What continues is written in it as lines, by its people or its application. Carrying the sources' values in, the opening balance, is a reading concern: it does not enter the hash, so it can be added after 0.1.0 without moving an id.

## Open questions

1. **Bring forward now, or later?** Later is the proposal: the forever part is only `from`. Now would mean deciding what a carried value is, and what happens when two sources disagree on one key (a conflict; a hole for a person to fill is the obvious answer, from [holes are unstated values](holes-are-unstated-values.md)).
2. **May the sources have another schema than the new thread?** The proposal says yes, since nothing is read from them yet. Once values are brought forward, a mapping between schemas would be needed, which is later.
3. **Should `stamp` check the sources?** That the `first` ids are first lines and the `last` ids are in those threads needs the sources' lines, which `stamp` does not have. The proposal: a helper the host calls with the sources, `consolidating(sources)`, which returns the `from` list and refuses a broken source; `stamp` writes what it is given.

## Consequences

The declaration gains `from?: { first: LineId; last: LineId }[]`; `stamp`, `post` and `dryRun` take it for an empty thread, as they take the nonce; `verify` covers it through the hash, unchanged; one helper builds it from the sources' lines and refuses a source that is not one chain; the glossary gains **consolidation** and **source**. The reading does not read `from`. A test consolidates two of a case's scenarios and checks the seal.
