# The id names its recipe

Status: settled 2026-10-08 by Egildo (the label is the word `sha256`, not a standard code), built in the round «The id names its recipe» ([plan](../../project/plan.md) §4). It is the second of the three decisions that change ids for ever, so it binds before publishing 0.1.0.

## Context

A line's id is its fingerprint: the SHA-256 of five fields, written in one canonical form. The next line quotes it as `previous`, and that is the chain. Once threads are stored, the way the id is made, its recipe, cannot change without every stored id becoming wrong.

The recipe today has three parts:

- **The fields:** `previous`, `gist`, `writer`, `timestamp`, `payload`, in that order, as a JSON list. The id itself is not in it.
- **The form:** `canonical`, which is RFC 8785, the JSON Canonicalization Scheme. Its examples are tests, and what it refuses (a number that is not finite, a lone surrogate) is refused when a line is stamped. Encoded as UTF-8.
- **The hash:** SHA-256, written as 64 lowercase hex characters.

Nothing in an id says so. An id is 64 hex characters, and a reader must know from elsewhere which recipe made it. If the recipe ever changes (a field added, the payload hashed as its own fingerprint, a stronger hash), an old id and a new one look alike, and `verify` cannot tell which recipe to check against.

The canon, from memory and not re-read for this decision, has three answers:

- **One label for the whole store.** Git's move to SHA-256 sets the hash once per repository, in its configuration; the ids carry nothing. It is the shortest, but an id read alone, quoted in a payload or a log, says nothing of itself, and a thread has no configuration to keep it in.
- **A label in each id, made of standard codes.** IPFS writes a *multihash*: a code for the hash and its length before the digest (`1220` and then the hex, for SHA-256). Its content ids (CIDs) add a code for how the content was written. Fully standard, but the codes name a hash and a format, not our five fields: a change of fields would need a code of our own anyway.
- **A label in each id, as a word.** Container images name their layers `sha256:` and the hex (the OCI digest form, `algorithm:encoded`); password hashes in the modular crypt format begin with the scheme's name and version. The word is the recipe's name, and a later recipe is a later word.

## Decision

**What the hash covers stays as it is:** the five fields, in that order (and on a thread's first line a sixth, its declaration, by [the first line declares the thread](the-first-line-declares-the-thread.md)), in RFC 8785's form, as UTF-8, by SHA-256. The payload is hashed inline, not as its own fingerprint.

**Every id begins with its recipe's name, in the OCI digest form.** Today's recipe is named `sha256`, so an id is `sha256:` and the 64 hex characters, and `previous` quotes it whole. The name means the whole recipe, not the hash alone: a later recipe takes a name never used before, even with the same hash.

**`verify` reads the name before it checks.** An id whose name it does not know does not verify, and says so, as a stored id that does not match its fields.

## Nuance

**Nothing is stored yet.** No thread is kept outside the tests, and no id is written by hand in a case or a scenario: placeholders stand for them. So the label costs one change in `stamp` and `verify` and one test's pattern, and no migration.

**Seven characters more per id**, in every line and every `previous`. A place that shows a short id shows the hex after the name, never its first characters, which would be `sha256:` for all.

**Parked, under its own name: the payload as its own fingerprint.** Hashing a digest of the payload, not the payload, would let a payload be erased later, for privacy law, while the chain still verifies. It is a new recipe, and this decision is what makes it possible later without breaking old ids.

**Not covered here: the thread's identity.** Two threads whose first lines are identical still give one id. That belongs to the decision on whether a thread names its schema and policy, whose first line can carry what makes it unique.

## Consequences

`stamp` writes `sha256:` before the hex; `verify` reads the name, checks the recipe it names, and refuses a name it does not know. `LineId` stays a string. The test that pins an id's pattern pins the name. The glossary's **id** says the id names its recipe. Built in the round «The id names its recipe» ([plan](../../project/plan.md) §4), alone: the decision on the thread's schema and policy is not written yet, and may change the recipe again.
