# Vision

consequitur keeps a ledger of what was said, and deduces what follows.

Status: settled. The engine, the render toolkit and the playground are built (see
[plan.md](plan.md) §4); nothing is published yet.

## What it is for

Some software is mostly a conversation with consequences: an activity on a document, a
request for approval, a ticket, a purchase, a case file. Every client meeting adds a field, a
status and a function that changes them, and the record grows into something nobody can
explain.

consequitur replaces that with a **thread**: an append-only list of **lines**, each of one
**gist** (what happened), written by a **writer**, chained by hash. What the record *is* — its
name, its status, whom it concerns — is never written directly: it is **deduced** from the lines
in force by **rules** that a **schema** binds to each gist. The engine compares what the thread
expects with what the record holds, **denounces** every difference, and **reconciles** it by
writing a line that says so. **Goals** turn conditions on the thread into new lines; **laws**
judge what a line would cause before it is accepted; a **dry run** answers «what if this line
were sent?» without sending it.

A new workflow is then a new schema, not new code: the team that owns an external system only
has to post a line.

## Who it serves

- **The developer** of an application whose records are conversations. They get a pure engine:
  lines in, a reading out, the lines to write next; storage, transport and screens stay theirs.
- **The schema author**, who knows the domain and writes gists, rules, goals and laws as JSON,
  watching a thread re-read itself in the playground as they type.
- **The person using the application**, who sees, before sending a line, what it will cause.

## What it deliberately is not

Each exclusion has a price if it is ever added back.

**Not storage, not transport.** No database, no network, no sync. The engine takes a thread and
returns one. *Adding it back* means opinions on persistence and concurrency inside a library
whose value is being pure.

**Not collaborative editing.** Lines are appended and ordered by one authority; nothing is
merged character by character. *Adding it back* means CRDTs or operational transforms, a
different problem.

**Not a workflow engine with timers.** No clock inside: time enters as an argument or as a line.
*Adding it back* means the reading of a thread is no longer a function of the thread.

**Not a renderer.** It returns plain data; screens are the consumer's. The playground draws one
way of doing it. *Adding it back* means markup and styling contracts in the core.

**Not code in data.** A schema is JSON and names the rule kinds it uses; nothing in it is
evaluated. *Adding it back* means a schema becomes an attack surface and can no longer be
reviewed as configuration.

**Not general event sourcing.** You do not write reducers per event. Rules are declared, and the
comparison and the answer are the engine's. *Adding it back* means every schema author writes the
code this library exists to remove.

## When this and the principles collide

This document decides what consequitur is and what it is for; the [design principles](principles.md)
decide how it is built. Neither is overridden by a plan, a spec or convenience.
