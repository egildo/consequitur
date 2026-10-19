# The thread

This page covers the [line](glossary.md), its envelope and its [id](glossary.md), the [declaration](glossary.md) on a [thread](glossary.md)'s first line, and the reading order: `canonical`, `stamp`, `verify`, `inOrder`, and the helpers for [writers](glossary.md) and strings. All are exported by `consequitur`.

## Types

```ts
/** The recipe's name and the hash: `sha256:` and 64 hex characters. */
type LineId = string;

/** `KIN::ID`, for example `user::mrossi` or `goal::<line id>`. */
type Writer = `${string}::${string}`;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type Payload = { [key: string]: Json };

/** A source a consolidation names in its first line's declaration. */
type Seal = { first: LineId; last: LineId };

interface EventLine {
  id: LineId;
  /** The thread's last line in reading order when this one was written; null on the first. */
  previous: LineId | null;
  gist: string;
  writer: Writer;
  /** The authority's time, as `Date.prototype.toISOString` writes it. */
  timestamp: string;
  payload: Payload;
  /** The declaration, on a thread's first line only. */
  thread?: { nonce: string; schema?: string; version?: number; from?: Seal[] };
}

/** What a writer hands over. The host states `writer` from the identity it authenticated. */
type LineDraft = Pick<EventLine, 'gist' | 'writer' | 'payload'>;
```

A thread is an array of `EventLine`. The array's own order is never read: the order is the chain of `previous` ids. The payload is free JSON; the [schema](schema.md) says which of its keys the rules read.

## The declaration

A thread's first line carries `thread`, its declaration, and no other line does:

- `nonce`: a value used once, the one handed to `stamp` or 16 random bytes in lowercase hex. It makes two threads that open with the same draft at the same instant two threads.
- `schema` and `version`: the name and version of the schema the thread is read by, when that schema has them.
- `from`: the [seals](glossary.md) of a [consolidation](consolidation.md)'s two sources, when the thread is one. Each seal is the id of a source's first line and of its last line in reading order.

The declaration is inside the hash. A thread declared for one schema is refused whole by any other: see [`inOrder`](#inorder).

## `canonical`

```ts
function canonical(value: Json): string;
```

The value as `JSON.stringify` writes it, with the keys of every object sorted at every depth, by UTF-16 code unit. Lists keep their order. Two equal values give one string, whatever their key order. It is RFC 8785's form for the values a line holds, and the form every hash and every comparison of JSON values in the package is taken of.

```ts
canonical({ b: 1, a: [2, { d: null, c: 'x' }] }); // '{"a":[2,{"c":"x","d":null}],"b":1}'
```

## `stamp`

```ts
function stamp(
  draft: LineDraft,
  lines: EventLine[],
  now: string,
  opening?: { schema?: SchemaHead; nonce?: string; from?: Seal[] },
): Promise<EventLine>;
```

The authority's envelope for a draft: the line as it is stored. It does not judge the draft; admission is [`post`](posting.md#post)'s.

- `previous` is the id of the last line of `inOrder(lines)`, or `null` on an empty thread.
- `timestamp` is `new Date(now).toISOString()`. It is the instant given, as given: it may repeat, or go back. The chain is the order, not the clock.
- `payload` is the draft's payload after a JSON round trip: a key that holds `undefined` or a function is left out, and a date is its string.
- On an empty thread, `thread` is the declaration: the `nonce` given, or 16 random bytes drawn; the schema's `name` and `version` when `opening.schema` has both; `from` when it is given and not empty, each seal copied as `{ first, last }`. An empty `from` is left out.
- `id` is `sha256:` followed by the SHA-256, in hex, of `canonical([previous, gist, writer, timestamp, payload])`, with `thread` as a sixth field on the first line.

`stamp` is the one place the package draws randomness, and only for a nonce it is not handed.

It throws:

- a `RangeError` when `now` is not a date;
- a `TypeError` when the payload holds a number that is not finite, or a string or key that is not well-formed Unicode;
- what `JSON.stringify` throws, on a `BigInt` or an object that holds itself;
- what `inOrder` throws, when `lines` is not one chain.

It changes none of its arguments.

```ts
const first = await stamp(
  { gist: 'create', writer: 'user::mrossi', payload: { name: 'Review' } },
  [],
  '2026-10-19T09:00:00Z',
  { schema, nonce: '00112233445566778899aabbccddeeff' },
);
// first.previous === null; first.thread === { nonce: '0011…eeff', schema: 'sibar-activity', version: 1 }
```

## `verify`

```ts
function verify(line: EventLine): Promise<boolean>;
```

Whether the stored id is its recipe's hash of the stored fields. The id names its recipe before the first colon; `sha256` is the one recipe known. An id with another name, or with none, does not verify, as one that does not match. A line verifies after a JSON round trip, since `stamp` stored its payload as JSON holds it.

## `inOrder`

```ts
function inOrder(lines: EventLine[], schema?: SchemaHead): EventLine[];
```

The lines in reading order: the first line is the one with no `previous`, and each next line is the one that names the last. An empty thread gives an empty list.

It throws an `Error` when the thread is not one chain, and the sentence names the place:

| The thread | The sentence |
|---|---|
| has no line with no `previous` | «The thread has no first line: every line names a previous one.» |
| has two such lines | «The thread has two first lines: more than one line has no previous.» |
| has two lines that name one line | «The thread forks after line X: two lines name it as their previous.» |
| has a line whose `previous` is no line of the thread | «The thread has a gap after line X: …» |
| has a line the walk never reaches | «The thread is cut after line X: …» |

X is the last line read before the break.

Given a schema, it also throws when the first line's declaration does not name that schema: its `schema` and `version` must equal the schema's `name` and `version`. Absent counts as a value, so a first line that declares no schema is read only by a schema with no name, and a first line with no `thread` declares nothing. The sentence names both, for example «The thread is declared for the schema "sibar-activity" version 1, and is read by the schema "other-case" version 1.»

Every function that reads a thread against a schema calls `inOrder` with the schema, so a thread declared for another schema is refused there too: [`expectations`](reading.md#expectations), and so [`consequitur`](reading.md#consequitur), [`offers`](offers.md#offers), [`whenHolds`](offers.md#whenholds), [`settle`](posting.md#settle), [`dryRun`](posting.md#dryrun) and [`post`](posting.md#post); [`admit`](posting.md#admit); [`prune`](scenarios.md#prune) and [`replayed`](scenarios.md#replayed); [`consolidate`](consolidation.md#consolidate); and [`lineFacts`](render.md#linefacts).

## Writers and strings

```ts
function kinOf(writer: unknown): string | undefined;
function idOf(writer: unknown): string | undefined;
function compare(a: string, b: string): number;
function isJson(value: unknown): value is Json;
```

- `kinOf` gives the part of a writer before the first `::`, its [kin](glossary.md); `idOf` the part after it. A writer with no `::`, or a value that is not a string, has neither.
- `compare` orders two strings with `<`, never `localeCompare`, so two readers agree whatever their locale. Every sort in the package uses it.
- `isJson` says whether a value is `null`, a string, a boolean, a finite number, or a list or object of such values at every depth.

```ts
kinOf('goal::sha256:9f…'); // 'goal'
idOf('user::mrossi');      // 'mrossi'
```
