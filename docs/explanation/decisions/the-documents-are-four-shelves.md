# The documents are four shelves and an archive

Status: settled 2026-10-19 by Egildo («let's do all of this»), taking the three leans below. Built in the rounds 17 to 21 ([plan](../../project/plan.md) §4).

## Context

0.1.0 and 0.2.0 are on npm, and the documents were written for the people building consequitur, not for the people using it. About 37,000 words, and none of them is a lesson or a set of directions. What a user needs to look up is told as history: the engine spec opens with five paragraphs that each begin «the round X changed», so the present is what a reader gets by replaying every round. The documents are written as a thread, when a reader needs its reading. The project's own principle says the same of the code: the thread is the truth, and the handles are a cache rebuilt from it. Here the decisions and the changelog are the thread, and the reference is the handles.

Three more symptoms. The specs mix a proposal, its «as built» and the current facts, which is the half-correct current document Google's guide warns against: a design document freezes when the code ships and becomes an archive of decisions. Some pages are dead: the root README says 0.1.0 is not yet published, and the misfits all fit since the round «Conditions». The changelog is six thousand words of rounds, written for us, not versions written for a user.

The canon, read in the summaries kept in `alpha/tech-writing/inspiration/summarized`: Diátaxis, by Daniele Procida, says documentation serves four needs, each with its own kind of writing, and a page serves one: a tutorial teaches by doing, a how-to guide leads to a goal, reference describes the machinery, explanation says why. Google's documentation guide adds the lifecycle: documents change with the code, dead ones are deleted, a design document is archived, and nothing is copied that can be linked. Write the Docs adds one entry point. Microsoft's guide is about the sentence: lead with the point, one action per step. Keep a Changelog, outside those summaries, says a changelog is for people, one entry per version.

## Decision

**The reader is someone who installed consequitur from npm.** The documents in `docs/` are shelved for that reader, by Diátaxis:

- `tutorial/`: one lesson, a first thread, run as a test so that it cannot drift;
- `how-to/`: directions to a goal, one goal per page;
- `reference/`: the machinery as it is today, one page per module, and the glossary; no history;
- `explanation/`: the vision, the principles, how it works, and `decisions/`.

**Our working documents are a fifth shelf, `project/`,** outside the four: the plan, the specs, the misfits. The reader may open it, and is never sent there to learn what is true.

**The specs freeze.** They stay as they are, as the archive of what each round proposed and built, and the reference is written fresh from the code. A spec is not amended again; a later change amends the reference, and a decision when it is one.

**The house voice stays.** Short plain sentences, the project's words, no second name for one thing. Diátaxis decides where a page goes and what kind of writing it is, Google decides the lifecycle, Microsoft shapes the steps of a how-to. Its contractions and its chatty «you» are not taken: they would not sit beside the decisions.

**The README is the entry point.** What consequitur is, how to install it, the tutorial, the four shelves. The packages' READMEs say what each package is and point to the shelves.

## Nuance

**A decision is explanation, and also history.** It is kept frozen, as a spec is, but on the explanation shelf: the reasons are what a reader asks for, and a decision says them better than a summary would. Its status line says when and by whom, in one sentence; what was built since is the plan's business.

**The reference must stay true.** The house rule that documents change in the same commit as the code now points at the reference, not the specs. Nothing generates it: the types are the code's, and a generator would give the signatures without the meaning.

**The changelog keeps its history.** Its entries for 0.1.0 and 0.2.0 are rewritten for a user, what a version adds, changes and fixes; the round prose is not lost, it is the plan's «Done» lines and the git log.

## Consequences

The rounds 17 to 21 in the plan: the shelves and the README; the reference; the tutorial; the how-to guides; the changelog and a style pass. A brief for an agent names the shelf a page goes on and the kind of writing it is. A page that cannot say which of the four it is has a problem, and that is the review's first question.
