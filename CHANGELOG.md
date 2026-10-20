# Changelog

All notable changes to consequitur are written here, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The three packages, `consequitur`, `consequitur-kdl` and `consequitur-render`, share one version.

## [Unreleased]

## [0.3.1] — 2026-10-20

### Added

- [The release](cases/release/) is a case: one thread per package across its releases, a tag made, built, approved and published, a failed publication retried, and a retraction that puts the release before it back out. Its publication is an [expected line](docs/reference/schema.md#expected-lines) of the kin `system`, from the approval until it is posted, and not again once retracted; its scenarios play two releases, the failure, the retraction and five refusals.

## [0.3.0] — 2026-10-20

### Added

- [Expected lines](docs/reference/schema.md#expected-lines): a gist schema may hold an `expect`, the kin the thread expects a line of the gist from and the condition under `while` for as long as it does, for example a publication while the approved tag is not the published one. The reading denounces each as `{ sort: 'line', gist, kin }`, after every other denunciation, and lists it in `owed`. The engine never writes it: `answer` leaves it, the thread stays settled, and the law `settles` does not refuse the line that made it expected. [`dryRun`](docs/reference/posting.md#dryrun) shows it before a line is sent. `consequitur-kdl` reads and writes `expect kin=<kin> { <condition> }`, and `consequitur-render`'s [`keyOf`](docs/reference/render.md) keys it by the gist and the kin, so `changes` says when it is raised and answered. See [how to answer the lines the thread expects of you](docs/how-to/be-the-authority.md#answer-the-lines-the-thread-expects-of-you).

### Changed

- The `Denunciation` type has a new member of the `line` sort, `{ sort: 'line', gist, kin }`. TypeScript code that reads `writer`, `line` or `payload` on a `line` denunciation must narrow first, with `'kin' in d` or `'writer' in d`.

## [0.2.1] — 2026-10-19

### Changed

- The documents are reorganised into a [tutorial](docs/tutorial/your-first-thread.md), [how-to guides](docs/how-to/README.md), [reference](docs/reference/README.md) and [explanation](docs/explanation/README.md).

### Fixed

- `fromKdl` reports a property written twice on one node (`value key=k key=j`, `where a=1 a=2`, `records join=a join=b`) as a problem, at the second; it used to keep the last without a word.

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

[Unreleased]: https://codeberg.org/egildo/consequitur/compare/v0.3.1...main
[0.3.1]: https://codeberg.org/egildo/consequitur/releases/tag/v0.3.1
[0.3.0]: https://codeberg.org/egildo/consequitur/releases/tag/v0.3.0
[0.2.1]: https://codeberg.org/egildo/consequitur/releases/tag/v0.2.1
[0.2.0]: https://codeberg.org/egildo/consequitur/releases/tag/v0.2.0
[0.1.0]: https://codeberg.org/egildo/consequitur/releases/tag/v0.1.0
