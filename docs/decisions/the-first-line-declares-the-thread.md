# The first line declares the thread

Status: proposed 2026-10-08. The third of the three decisions that change ids for ever. The second, [the id names its recipe](the-id-names-its-recipe.md), is settled and makes this one postponable: a later recipe, under a new name, could add what this one adds, and old ids would still verify. Doing it before publishing spares carrying two recipes for ever.

## Context

A thread knows two things about itself only by where it is kept.

**Which thread it is.** A first line has no `previous`. Two threads whose first lines are identical, same gist, same writer, same instant, same payload, give the same first id, and every line after can be moved from one to the other unseen. It is rare where people write, and ordinary where a program does: a scenario played twice at one `now` gives two threads that are one.

**Which rules it is read by.** `consequitur(lines, handles, schema)` reads any thread against whatever schema it is handed. A schema has no name and no version. Edit a gist's rules, and every old thread is read by the new ones, without a word: an old line may state what it did not, a goal may fire that never would have.

The policy is not in the same case. It says which denunciations the authority leaves unanswered, and what it answers is written in the thread, as record lines. A thread already carries the policy's effects; it needs none of its name.

The canon, from memory and not re-read for this decision:

- **A document declares its type on its first line.** HTML's `<!DOCTYPE html>`, XML's namespace on the root element, a JSON document's `$schema`. The reader picks the rules from the document, not from the shelf it was found on.
- **A log's identity is fixed at its start.** In Secure Scuttlebutt and Hypercore a feed is named by a key made when it begins, and every entry belongs to it. Git has no such thing: two root commits are told apart only by their content.
- **Events outlive the code that wrote them.** In event-sourced systems, each event names its type and version, and a reader translates an old version into the current one before reading it, which is called *upcasting* (Greg Young, *Versioning in an Event Sourced System*).

## Decision, proposed

**The schema names itself.** Its head gains `name`, in lower kebab case, and `version`, a whole number from 1. `readSchema` requires both.

**The first line declares the thread.** The first line's envelope has one field more, `thread`: `{ schema, version, nonce }`, the schema's name and version and a nonce, a random value used once, 16 bytes in hex. Only the first line has it. It is in the hash, so the recipe named `sha256` covers it: nothing is stored yet, so the name does not change. `stamp` writes it when the thread is empty, from the schema it is given and a nonce it draws, or one it is handed, so a test or a scenario can be played twice to the same ids.

**The reading refuses a thread declared for another schema.** A first line that names another schema, or another version, is refused as a broken chain is: the reading throws, and the sentence names both. A host that keeps old threads keeps the schema versions they were written under, and reads each by its own.

## Open questions

1. **Another version: refuse, or read and say so?** Refusing is honest and strict: a host must keep every version. Reading and saying so (a field of the reading) keeps old threads open under a new schema, as today, but no longer silently. Upcasting, a translation from one version to the next, would be the full answer, and is later if ever.
2. **The nonce: in the first line, or the first line's id enough?** Without it, two identical first lines stay possible where a program writes. With it, `stamp` draws randomness, the first thing in the engine that does; the reading still never does.
3. **The name: required, or optional while the three cases are the only schemas?** Required costs three lines, one per case.

## Nuance

**The opening gist is unchanged.** The first line is still an opening line, written by its writer with its payload. The declaration is in the envelope, not the payload: a schema's rules never read it, and a payload stays the domain's.

**The thread's id is its first line's id.** With the nonce, it is unique; a host that keeps it, as the chain decision asks for the last id, also knows which thread a line claims to belong to.

**A schema edit becomes a new version.** Nothing forces a writer of schemas to bump it. A test could pin that a case's schema did not change under one version, by keeping its fingerprint; that is the round's choice.

## Consequences

`SchemaHead` gains `name` and `version`; `EventLine` gains `thread?`; `stamp` writes it on the first line and takes an optional nonce; `inOrder`, or the reading's first step, refuses a first line that lacks it or declares another schema; the three cases gain a name and version 1; the glossary gains **declaration**; the tests that build threads by hand give their first line one.
