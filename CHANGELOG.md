# Changelog

All notable changes to consequitur are written here, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The three packages, `consequitur`, `consequitur-kdl` and `consequitur-render`, share one version.

## [Unreleased]

### Changed

- The documents are reorganised into a [tutorial](docs/tutorial/your-first-thread.md), [how-to guides](docs/how-to/README.md), [reference](docs/reference/README.md) and [explanation](docs/explanation/README.md). No code changed.

## [0.2.0] — 2026-10-13

### Added

- Comparisons in [conditions](docs/reference/conditions.md#comparisons): `before` and `after` compare dates and instants, with `days` to move the right date by whole calendar days; `less` and `more` compare numbers. All four are strict, and what does not compare is false. `consequitur-kdl` reads and writes them.
- The [`$now` reference](docs/reference/conditions.md#references), `{ "$now": "instant" }` in JSON and `(now)instant` in KDL: a gist's `when` can read the instant a line is admitted at, for example to refuse a revision after a deadline. It stands only in a gist's `when`; a goal, a law's `while` or a guard they use that reads it is a problem of the schema.
- [`admit`](docs/reference/posting.md#admit), [`whenHolds` and `holds`](docs/reference/offers.md#whenholds) take an optional `now`. [`dryRun` and `post`](docs/reference/posting.md#dryrun) pass the instant they are given.

### Changed

- `admit` called without an instant refuses a line whose gist has a `when` that reads `$now`, as `not-now`. [`offers`](docs/reference/offers.md#offers) has no instant: it offers such a gist unless the rest of its `when` is false.
- `consequitur` and `consequitur-kdl` depend on `kdlet-guards` ^0.3.0.
- The `Condition`, `Operand` and `Reference` types have new members. TypeScript code that switches over them without a default needs the new cases.
- A schema written for 0.1.0 reads and behaves as before.

## [0.1.0] — 2026-10-13

The first release.

### Added

- `consequitur`, the engine:
  - [threads](docs/reference/thread.md): lines chained by hash, `stamp`, `verify` and `inOrder`, and a first line that declares its thread;
  - [schemas](docs/reference/schema.md) as data, read by `readSchema` against a kit of handle, rule and law kinds (`BASE_KIT`), which a host extends with kinds of its own;
  - [conditions](docs/reference/conditions.md) for a gist's `when`, goals and laws, with named guards and references to the thread's values;
  - [the reading](docs/reference/reading.md): lines in force and revoked, expectations, goals that write their outcome, holes, and denunciations;
  - [posting](docs/reference/posting.md): `admit`, `dryRun`, `post`, `settle`, laws with their verdicts, a policy for what the authority leaves unanswered, and `diff`;
  - [`offers`](docs/reference/offers.md), the menu of what a writer may post;
  - [scenarios](docs/reference/scenarios.md): stories played as data, and saved from a thread;
  - [consolidation](docs/reference/consolidation.md): two threads made one by replay, with a derived schema and a drill that stops where a person must choose.
- `consequitur-kdl`: [`fromKdl` and `toKdl`](docs/reference/kdl.md) read and write a schema as KDL, with problems at their line and column.
- `consequitur-render`: [`lineFacts`, `changes`, `keyed`, `previewer` and `band`](docs/reference/render.md) turn a reading into DOM, with no markup and no style of their own.
- ESM packages for Node 20 and later, with their types.

[Unreleased]: https://codeberg.org/egildo/consequitur/compare/v0.2.0...main
[0.2.0]: https://codeberg.org/egildo/consequitur/releases/tag/v0.2.0
[0.1.0]: https://codeberg.org/egildo/consequitur/releases/tag/v0.1.0
