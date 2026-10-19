# Threads are consolidated, never merged

Status: settled 2026-10-13 by Egildo: everything comes over, by replay; conflicts are resolved in a drill; the new thread's schema is derived from the sources'; the order of play, one source after the other, was Claude's lean, which Egildo's «it matches» took. Built in the round «Consolidation» ([plan](../../project/plan.md) §4) before publishing 0.1.0, and the playground's panel in the round «The drill in the playground»; amended in the build, so that a seal's `last` is the source's head whether or not the replay took it, and by Egildo on 2026-10-13, after the build, so that a law only one source has is a question and not an addition (below).

## Context

Two threads sometimes have to become one: two activities that turn out to be one, two branches of an organisation that continue as one. "Merging two ledgers" names two different things.

**One thread, split and rejoined.** Two authorities extend one thread apart and their lines must be woven back. That is git's merge commit, a line with two parents, or logical clocks and CRDTs. [The chain is the order](the-chain-is-the-order.md) refuses a fork, because one authority stamps every line, and calls this case a later decision, if it is ever needed. It is not this one.

**Two threads, made one.** Two threads, each whole, each with its own first line and nonce ([the first line declares the thread](the-first-line-declares-the-thread.md)), continue as one. Accounting calls this **consolidation**: the journals of two entities are never interleaved; each is closed, and a new ledger opens with a reference to each. Interleaving two chains is ruled out here for the reasons a loose mode was: the order is the order things were known in, and each thread already has one.

The first draft brought forward only the sources' values, as an opening balance. Egildo asked for everything: goals, holes, revokes, the whole story. The canon has a form for that, and the engine already has its parts.

The canon, from memory and not re-read for this decision:

- **Replay.** Event sourcing rebuilds a state by playing its events again. Git's **rebase** takes the commits of one history and plays them again on a new base, one by one; where one does not apply, it stops, and the person goes on (`continue`), edits it, skips it, or abandons the whole (`abort`).
- **Schema integration.** Database theory's name for making one schema of two (Batini, Lenzerini and Navathe surveyed the methods). Its exact form is a **pushout** from category theory, which the Categorical Query Language builds on (Spivak and Wisnesky): two schemas glued along what they share. Glue a schema to itself, and it is unchanged.

The parts already here: `prune` says which lines of a thread the engine will bring back by itself (records, goal outcomes, warnings); `stepsOf` turns the other lines into steps, every id made a placeholder; the scenario player posts steps to a thread, and a step may be refused ([templates are scenarios](templates-are-scenarios.md)).

## Decision

**Two threads are never merged into one chain. A consolidation is a new thread, and the sources are replayed into it.** Each source is pruned of what the engine writes by itself, its other lines become steps, and the steps are played into the new thread through `post`, as any line is: admission, laws, goals and reconciliation do what they do. Goals, holes and revokes come over because they are lines.

**One source after the other.** All of the first source's steps, then all of the second's, in each source's own order. The person chooses which source goes first. Interleaving by timestamp would read the clock as the order, which [the chain is the order](the-chain-is-the-order.md) demoted to a statement.

**The new thread's first line names its sources.** The declaration gains `from`: a list, each `{ first, last }`, the id of a source's first line (which thread) and of the source's last line, its head (where it was closed), whether or not the replay took it. It is in the hash, as the rest of the declaration is. A thread with no `from` consolidates nothing, so no thread written so far changes. The first source's first step becomes the new thread's first line.

**A source is sealed by being named.** The `last` id is the head the chain decision said a thread cannot keep for itself: whoever holds the new thread holds the sources' heads. A line written to a source after its `last` is visibly after the seal. Whether a host refuses it is the host's business, as storage is.

**The new thread's schema is derived: the pushout of the sources'.** What both share is kept once, what only one has is added, except a law (below), and two parts with the same name and different content are a **schema conflict**. Parts are the head's words (`opening`, `authority`, `sets`, `records`, `judged`, each guard) and each gist and law, compared by canonical form. Sets and `judged` are unions; `opening`, `authority` and each record gist must agree. **A law only one source has is not added silently: it is asked, keep it or drop it.** The new thread applies one set of laws, chosen by the person, as consolidated accounts apply one set of policies chosen for the group and not each subsidiary's (IFRS 10 calls them uniform accounting policies, from memory, not re-read for this decision). A law both sources share stays, and the same law at two strengths is a schema conflict. Gists, guards, record gists and sets that only one source has are still added unasked: they only allow more, and a law forbids. Without the question, one source's laws would silently judge the other's lines, and the first `create` of one domain could be refused by the other's law. Two sources under one schema derive that schema itself, name and version unchanged. Otherwise the derived schema is new: the person names it, at version 1, and the host keeps it, since the new thread declares it.

**Conflicts are resolved in a drill.** The **drill** is the consolidation walked step by step, git's rebase stop made a tool. It meets two kinds of conflict, schema conflicts first, then refused steps:

- a schema conflict offers: take the first source's, take the second's, write one by hand, or abort; a law only one source has offers: keep it, drop it, or abort;
- a refused step stops the play and shows the refusal, and offers: take it again (once the cause is answered), edit it, skip it, or abort.

The typical refused step is the second source's opening line, which the one-opening rule refuses since the thread already has one: the person skips it, or edits it into a line that states what it stated, such as a memo that adds its team. Nothing is decided for the person; the drill only says where and why.

**The small function the host calls, with the sources' lines and schemas, does the preparing**: it refuses a source that is not one chain or not declared for its schema, derives the schema with its conflicts, and gives the steps and the `from` list. `stamp` writes the `from` it is handed, as it writes the nonce. The drill's stepping reuses the scenario player; the playground gets a minimal panel to try it.

## Nuance

**The ids change, the story does not.** Every replayed line is a new line, with a new id and a new timestamp, the instant it is replayed. What a line said, and in what order within its source, stays. A placeholder carries each reference to an old id over to the new one, as for a scenario.

**What the engine writes is written again.** Records, goal outcomes and warnings are not copied: the replay makes them, and they may differ where the sources' lines now meet, a goal of one source met by a line of the other. That is the point of consolidating, not a fault.

**A source may be consolidated more than once, or not closed at all.** The seal is a fact about the new thread, not a lock on the source.

## Consequences

The declaration gains `from?: { first: LineId; last: LineId }[]`, taken by `stamp`, `post`, `dryRun` and the player as the nonce is; `verify` covers it through the hash, unchanged. New in the package: the derived schema with its conflicts, the preparing function, and a drill that plays one step at a time and waits for a choice where a step is refused. The glossary gains **consolidation**, **source**, **derived schema**, **schema conflict** and **drill**. The reading does not read `from`. The playground gets a panel: pick two threads, derive, walk the drill, read the result.
