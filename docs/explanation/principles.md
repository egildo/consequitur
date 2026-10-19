# Design principles

Status: settled. Each principle says what it forbids and where it comes from. The
[vision](vision.md) decides what consequitur is and what it is for; these decide how it is built.

## The thread is the only truth

**Forbids** writing a handle directly, by anyone, the engine included: every change is a line,
and the handles are a cache the thread can always rebuild. Forbids a line that changes after it
is written: its id is the hash of its content and the previous id, computed once and stored. Forbids a third truth value in the reading: what no line in force says is not so, since every change is a line; only a line not yet written, the draft a menu is drawn for, is unknown.

**From** the record that grew one field and one function per client meeting until nobody could
say why it held what it held — and, for the third sentence, from SQL's null, which made an absent value unknown and never recovered ([decision](decisions/closed-world-reading.md)). Amended 2026-10-06.

## Conf, not code

**Forbids** domain behaviour in code: a domain is a schema — gists, writers, rule bindings,
goals, laws — and a schema is JSON. Code holds only the line's envelope, the rule kinds, the law
kinds, how a check matches a line, and the engine. Forbids special-casing a gist name in the
engine; the one gist the engine knows is the opening gist, and the schema names it.

**From** the SAP example that started it: a new external fact had to become a line someone
posts, not a feature someone codes.

## A pure reading

**Forbids** a clock, a locale, randomness or I/O in the reading: `now` is an argument, strings
compare with `<`, never `localeCompare`. Forbids the reading from throwing on any thread that is
one chain declared for its schema: a payload that lacks what a rule reads states nothing. A thread
that is not one chain, or is declared for another schema, is not this thread under these rules, and
is refused whole. Forbids the reading from writing anything.

**From** the reading being shared by the server and every client: two readers of one thread must
agree, and a client must be able to read what it was given. The refusals, from [the chain is the
order](decisions/the-chain-is-the-order.md) and [the first line declares the
thread](decisions/the-first-line-declares-the-thread.md). Amended 2026-10-08.

## The server decides, a client previews

**Forbids** a client sending a denunciation, a verdict or a reconciliation as a fact. A client
dry-runs and shows; the authority posts, judges and reconciles, and its answer is final.

**From** the dry run: a preview is advice against the thread as the client last saw it.

## Extension by registration

**Forbids** forking the engine to add a consequence. A new kind of rule, expectation or law is a
registered kind with its own validation, expectation, comparison and answer, written once and
named in schemas. Forbids a kind that reaches outside the thread it is given.

**From** ProseMirror's split between a schema that is data and the specs and plugins that give it
behaviour: the vocabulary grows without the core learning a domain.

## Chosen dependencies

**Forbids** a dependency for what a few lines of our own would do, and one whose transitive graph
nobody has read. Each runtime dependency of a package is named in [architecture](how-it-works.md)
with what it does for us; the engine's reading stays pure whatever it depends on. Hashing uses
the platform's WebCrypto.

**From** a library meant to be audited before it decides who may do what — and from the
[decision](decisions/chosen-dependencies.md) that a condition language shared with kdlet is worth
more than a copy kept dependency-free. Amended 2026-10-05; it was «Zero dependencies».

## Cases are the test truth

**Forbids** domain fixtures anywhere but `cases/<domain>/`. A domain's schema, its scenarios and
their expected readings live there, and the tests and the playground read the same files. A toy
schema isolating one engine rule may live inline in its test.

**From** fewrd, where the playground and the tests drifted apart when each kept its own examples.

## Strict types, no build in the loop

**Forbids** `any`, `@ts-ignore`, `@ts-expect-error`, and a build step in the loop contributors
run: `pnpm typecheck` and `pnpm test` run the TypeScript as written, type-stripped by Node. The
publish build is additive.

**From** type-checking being the first safety net, and ceremony being the first thing people skip.

## A closed vocabulary

**Forbids** a second name for one thing, in code, documents or conversation, and a term the
[glossary](../reference/glossary.md) does not hold. A term is added by amending the glossary, when the
existing ones cannot say what is needed.

**From** the round that renamed «guards» to rules and «shell» out of the model: every extra name
is a second thing to explain.
