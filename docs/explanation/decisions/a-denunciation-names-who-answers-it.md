# A denunciation names who answers it

Status: settled 2026-10-19 by Egildo, in the conversation on the release workflow: an expected line holds while its condition does, is expected of a kin, may fail by a line, carries no deadline, and is not a goal; it takes no word of its own, since it is an expectation, denounced, and the denunciation names who answers it; the binding is `expect`; the one who answers is a kin, with no name or plug of its own. The line a denunciation names was Claude's lean, which Egildo's «settled» took. To be built in the round «Expected lines» ([plan](../../project/plan.md) §4).

## Context

A release workflow was written as a thread, to see whether consequitur could carry it: one thread per package of a repository, across its releases. A person opens it with the approvers; `system::git` writes that a tag was made; `system::mac` or `system::gitlab` writes that the tag was built, with the hash of each output; an approver approves the built tag and no other; `system::tabularium` writes that the approved tag was published, and no other; an approver retracts a publication by revoking its line, and what is out is then the one before it, still in force. The schema read, and the engine played two releases, a retraction and five refusals as they should be.

It also showed a gap. After `approved`, the reading has no denunciation and `settled` is true, yet the host owes the world a publication. Nothing in the reading says what someone other than the engine must go and do. A host can only guess, in three ways, each wrong:

- **By watching what a post added.** It reacts to `approved` in `result.added`. That is an event, seen once: a crash between storing and acting loses it, and the thread does not remember it was owed.
- **By bending the offers.** An offer says what a writer may post. The menu reads a gist's `when` with no draft, so a node that reads `$draft` is unknown, and the gist is offered unless the `when` is false ([the reading is closed-world](closed-world-reading.md)). `published` checks `is (draft)tag (value)approved`, so it was offered to `system::tabularium` already at `built`, before anyone had approved. And a permission is not an obligation: a correction may stay offered for ever and never be owed.
- **By goals.** A goal is a line a person posts in one thread; it fires once; and its outcome is written by `goal::…`, by the engine, the instant the condition holds. A publication is written by the publisher after the files are out, or not at all.

The first draft of this decision added a list of its own to the reading, «duties». Egildo's doubt was that the reading already has the act: it compares what the thread expects with what is, and denounces each difference. A missing publication is that shape. The thread expects a line, and the line is not there. What is new is only who answers.

The canon, from memory and not re-read for this decision:

- **Deontic logic.** Von Wright's three modalities: what is permitted, what is forbidden, what is obligatory. consequitur has the first two: an offer is a permission, a law that refuses is a prohibition. Hohfeld calls the third a duty, and ODRL, the W3C's policy language, names its three rules permission, prohibition and duty. Symboleo writes an obligation as a debtor, a creditor, an antecedent and a consequent; the Accord Project's templates emit obligations as data, which the platform carries out and the contract does not. Here the third modality needs no word: it is an expectation of a line.
- **Reconciliation by controllers.** Kubernetes has no obligations either. It has the state wanted and the state found, and each controller reconciles the part it owns. Its controllers are level-triggered: each reads what is wanted and what is, and acts, so a missed event or a restart costs nothing. Here the engine is one controller, of the handles and the goals; a host's worker is another.
- **Effects outside a transaction.** Enterprise Integration Patterns' process manager, and the saga (Garcia-Molina and Salem), keep a long process as state and send the next command from it. The transactional outbox writes the message in the same transaction as the state, and an idempotent consumer makes a message delivered twice act once.

## Decision

**A gist may be expected.** A gist schema may hold one `expect`: the kin that writes the line, `kin`, required, and a condition, `while`. The thread expects a line of the gist from that kin for as long as the condition holds. The kin must be one of the gist's writers and not `goal`, and the gist may not be a record gist: the engine writes those. A gist that several kins may write names the one expected; the others may still write it. `expect` is a mechanic, as `when` is, read by the engine, not a rule kind.

```json
{ "gist": "published", "writers": ["system"],
  "rules": [ … ],
  "when": { … },
  "expect": { "kin": "system", "while": { "all": [
    { "has": { "$value": "approved" } },
    { "not": { "is": { "$value": "approved" }, "values": [{ "$value": "published" }] } },
    { "not": { "line": { "gist": "retracted", "payload": { "tag": { "$value": "approved" } } } } }
  ] } } }
```

In KDL the condition is the body of `expect`, as a `when`'s is the body of `when`:

```kdl
gist published system {
    value from=tag key=published required=#true
    value from=target key=target required=#true
    value collect=tag key=history required=#true
    when {
        is (writer)id tabularium
        is (draft)tag (value)approved
    }
    expect kin=system {
        has (value)approved
        not {
            is (value)approved (value)published
        }
        not {
            line gist=retracted {
                payload tag=(value)approved
            }
        }
    }
}
```

The JSON key is `while` and not `when`, since a gist's `when` is already its permission, and «while» says the level.

**The condition is a goal's.** It reads no `$draft`, `$now` or `$writer`, through a guard either, and the reader refuses one that does, as it refuses a goal's. It is read as a goal's is: against what the thread expects and the lines in force, each with its references replaced, with the schema's guards.

**An expectation unmet is denounced, and the denunciation names who answers it.** A denunciation that names a `kin` is that kin's to answer; every other is the engine's, as today. The expected line is a `line` denunciation in a second shape:

```ts
type Denunciation =
  | HandleDenunciation
  /** A line a goal owes the thread: its outcome once met, or a warning. The engine writes it. `line` is the goal. */
  | { sort: 'line'; gist: string; writer: Writer; line: LineId; payload: Payload }
  /** A line the thread expects from a kin, while the gist's `expect` holds. The kin writes it. `line` made it expected. */
  | { sort: 'line'; gist: string; kin: string; line: LineId }
  | { sort: 'thread'; rule: 'one-opening'; found: number };
```

They come last in the order of denunciations, after the handles', in the order of the schema's gists: the order is the order of the lines a post adds, and a post adds none of these.

**`line` is the line that made it expected:** the latest line in force, in reading order, among the lines the condition reads. For each `$value` key, the line that states the value; for each `$set`, the lines that joined its present members; for each `line` node, the lines in force it matches; through a guard too. A condition that reads no line names the opening line.

**The engine never answers one.** `answer` leaves it, so `reconcile` does not write it and `settle` does not count it. **`settled` keeps its meaning: nothing is left that the engine answers.** A thread that expects a publication is settled, so the law `settles` does not refuse the approval that made it expected. The kin does the work in the world, then posts the line, through admission like any line, and the denunciation clears because the line changes what the condition reads.

**It is level-triggered.** Nothing is stored: the denunciation is a reading of the thread, so it survives a restart, a replay and a consolidation, and fits a thread that goes round again, as a package goes from release to release. The price is that the author writes «not yet done» into the condition.

**A failure is an optional line.** A schema that wants to keep failures gives the host a gist for them, here `publish_failed`, and the host writes it when the work fails. The expectation stands while its condition holds, so a retry needs nothing new: the next reading denounces the same line again. The engine cannot promise that an effect happens once; the host makes it so (below).

**No deadline in the engine.** The reading has no clock ([times are compared as stated](times-are-compared-as-stated.md)). The denunciation names the line that made it, and that line carries the instant it was stamped at, so the host computes the age with its own clock, and decides what is late. A deadline the domain states is a value and a line, as the editorial review's `deadline_passed` already is.

**Goals stay as they are.** A goal is a line a person posts, in one thread; it fires once; its outcome is the engine's, written by `goal::…`. An expected gist is declared by the schema, for every thread it reads; it stands for as long as its condition holds; it is answered by a kin, after the act.

## The release, expected

The thread at the moment of the gap: `opened`, `tagged` R2.0, `built` R2.0, `approved` R2.0. The reading:

```json
"settled": true,
"denunciations": [{ "sort": "line", "gist": "published", "kin": "system", "line": "sha256:…the approved line" }]
```

`system::tabularium` reads it, uploads R2.0, and posts `published`. The denunciation clears, since `approved` and `published` now agree. Had the upload failed, it would post `publish_failed` instead, and the denunciation would stand, its `line` still the approval, so the next attempt knows how long the line has been expected.

The draft's own condition needed its third child. With only the first two, `has (value)approved` and `not { is (value)approved (value)published }`, a retraction brings the expectation back: revoking the publication of R2.1 puts `published` back to R2.0, while R2.1 is still approved, so the thread expects R2.1 again, the release just taken back. The `retracted` gist now carries the tag it takes out (its `when` checks `is (draft)tag (value)published`), and the condition excludes an approved tag that was retracted. This was played against the engine, with the condition as a guard: it holds after each approval and after a failure, and nowhere else, the retraction included. It is the price of level-triggering, met on the first schema.

## Nuance

**This amends a reason of [holes are unstated values](holes-are-unstated-values.md), not its decision.** That decision refused to denounce a hole because a denunciation was what reconciliation answers, and a denounced hole would leave the thread unsettled, so that `settles` would refuse the fill that closes it. A denunciation a kin answers leaves the thread settled, and the objection falls. Holes stay as they are; whether an open hole becomes a denunciation a person answers, so that the engine, a host and a person answer one list, is parked.

**The denunciation says what is expected, not how.** It carries no payload. The kin reads what it needs, here the approved tag and the target, from the reading's `expected`, as it would to do the work.

**The line is a lower bound of the age.** A line that changes what the condition reads without changing whether it holds moves `line` later: an approver added, where the condition reads the approvers, makes the expectation look younger than it is. The exact rule, the first line after which the condition has held without a break, needs a reading of every earlier stretch of the thread, a cost that grows with the square of its length; a host that needs the exact age keeps the instant it first saw the denunciation, since it has a clock.

**Permission and expectation are separate.** The engine does not prove that the gist's `when` holds wherever its `expect` does; in general it cannot. A line expected and refused by admission cannot be paid; the scenarios of the case that uses it pin the two together.

**A line expected of a person is a to-do.** The kin may be `user`. Then the reading lists what a person is expected to write, and the application chases it, as it chases an open hole.

**One condition, not Symboleo's two.** An antecedent and a consequent are written as one, `all { antecedent; not { consequent } }`: a level needs only whether the whole holds.

## Doing the work once

The host follows the transactional outbox with an idempotent consumer, and the thread is the outbox. The denunciation is a reading of lines stored in the same transaction as the post that made it, so the expectation and the state commit together, with no table of messages beside them. A worker reads the denunciations its kin answers, acts, and posts the line. An effect done and not yet posted, because the worker stopped in between, is done again on the next reading, so the effect must be idempotent: a publication keyed by its tag, or by the thread, the gist and the denunciation's `line`, which stays the same while nothing the condition reads changes. This belongs in the how-to, [be the authority](../../how-to/be-the-authority.md), as a section of its own.

## What lost, and why

- **A list of its own, «duties».** The first draft. It added a word and a list for what the reading already does: compare, and denounce the difference. Only the answerer was new, and a field says it.
- **A documented convention on offers.** The host treats an offer to its kin as an order. Offers are permissions drawn without a draft: `published` was offered before the approval. And a gist offered is not a gist expected.
- **Standing goals declared by the schema.** A goal for every thread, written in the schema. A goal fires once, so the second release would expect nothing; and its outcome is written by the engine when the condition holds, before anything happened in the world. Changing both makes a goal mean two things.
- **One thread per release.** Then a one-shot goal would be enough. But what is out is deduced across releases: the history, and the retraction that falls back to the release before. Split, no thread holds it. And the outcome would still be the engine's line.
- **Edge-triggered.** «When `approved` is written, publish.» It needs memory of which edges were handled, kept outside the thread or written into it as acknowledgements; a restart between the event and the act loses it; and a revoke cannot take back an edge already fired. Level-triggering recovers by reading again.

## The price

Each exclusion in the [vision](../vision.md) names what adding it back would cost; this is added, and costs this:

- **The author writes «not yet done».** A wrong condition expects for ever or never, and the first schema got it wrong at the retraction. Each `expect` wants a scenario that runs it past every revoke its gists allow.
- **No once-only.** The engine cannot promise that the world is changed once; the kin's effect must be idempotent.
- **A denunciation no longer means «the engine will answer this».** A host that answers every denunciation it reads must now read `kin`. The `line` sort has two shapes, and TypeScript makes a host that reads `writer` or `payload` on it narrow first.
- **One more condition per expected gist in every reading**, as dear as a goal's.
- **The age is a lower bound**, as the nuance says.
- **`expect` is a mechanic's name**, so a kit may not register a rule kind of that name.

## Consequences

`GistSchema` gains `expect?: { kin: string; while: Condition }`; `readSchema` names a problem for an `expect` whose kin the gist does not list, a kin `goal`, a record gist, and a condition that reads `$draft`, `$now` or `$writer`. `Denunciation` gains the second `line` shape; the reading lists it last; `answer` leaves it, and `settled`, `reconcile` and `settle` follow from that; a dry run shows it, so the person sees, before sending, that an approval makes a publication expected. `consequitur-render`'s `keyOf` gives it a key, and `changes` then says when it is raised and answered. `consequitur-kdl` reads and writes `expect` with its condition in the body. The glossary's **denunciation** gains the line a kin is expected to write, and **mechanic** gains `expect`; **expectation** already says «or that a line should exist»; the vision's first section says that the reading also says what others must do; the reference's reading and posting pages follow; the authority's how-to gains the section on doing the work once. A case shows it: the release, or an `expect` added to one of the three cases.
