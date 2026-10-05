# Chosen dependencies

Status: settled 2026-10-05 by Egildo («let's loosen our dependency policy in general»).
Supersedes the principle «Zero dependencies».

## Context

The engine needs a condition language for `when` and for goals. kdlt, Egildo's KDL template
language, already has one — named guards, `is`, `has`, `not`, `all`, `any`, references, host
guards — and it is being taken out into a module, `kdlt-guards`, that both projects use
([conditions-are-kdlt-guards](conditions-are-kdlt-guards.md)). Writing schemas in KDL needs a KDL
parser too. «Zero dependencies» forbade both.

## Decision

The principle becomes «Chosen dependencies»: a dependency is allowed when it does more than a few
lines of ours would and its graph has been read; each is named in `architecture.md` with what it
does for us. The engine's reading stays pure, whatever it depends on.

## Consequences

`consequitur` may depend on `kdlt-guards`; `consequitur-kdl` on `@bgotink/kdl`. A consumer of the
engine now installs what those bring; `architecture.md` keeps the list honest.
