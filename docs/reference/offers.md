# Offers

This page covers what a [writer](glossary.md) may post to a thread as it stands: `offers`, the menu a screen draws from, and `whenHolds` and `holds`, the one question the menu and admission both ask of a gist's [`when`](glossary.md).

## Types

```ts
/** What a writer may post to a thread as it stands. */
interface Offer {
  gist: string;
  /** For a revoking gist: the lines in force it may name, in reading order. */
  targets?: LineId[];
}
```

## `offers`

```ts
function offers(lines: EventLine[], writer: Writer, schema: Schema): Offer[];
```

One [offer](glossary.md) for each gist this writer may post on the thread as it stands, in the order of the schema's gists. What the thread expects is read once for the whole call. It throws what [`inOrder`](thread.md#inorder) throws on a thread that is not one chain declared for the schema.

A gist is offered when all of these hold:

- the writer's kin is among the gist's writers, and is not `goal`;
- the gist is not a record gist;
- its `when` is not false (see below);
- the opening rule would stand: the opening gist only while no line of it is in force, any other gist only while exactly one is;
- for a gist with a `revoke` binding, some line in force is of a gist it may revoke and was not written by a final goal. Those lines are its `targets`.

The first gist schema of a gist is the one read. The lines the engine writes, a goal's and the records, are offered to nobody.

```ts
offers(state.lines, 'user::mrossi', schema);
// [{ gist: 'memo' }, { gist: 'quit' }, { gist: 'memo_revoke', targets: ['sha256:4be0…'] }]
```

The menu and admission give one answer. The menu has no draft and no instant, so a node of a `when` that reads `$draft` or `$now` is unknown, and a gist is offered unless its `when` is false ([the answer](conditions.md#the-answer)). The menu may offer what [`admit`](posting.md#admit) then refuses for its payload or its instant, never the reverse.

## `whenHolds`

```ts
function whenHolds(
  lines: EventLine[],
  writer: Writer,
  gist: GistSchema,
  schema: Schema,
  payload?: Payload,
  now?: string,
): boolean;
```

Whether a gist's `when` lets this writer write it on this thread. A gist with no `when` holds.

- **Given a payload**, it is admission's question: the `when` holds only when it is true, read with the payload, its references replaced by the values the thread states, and with `now` as [`stamp`](thread.md#stamp) writes it. Without `now`, a node that reads `$now` is unknown, and the answer is false.
- **Without a payload**, it is the menu's question: `now` is not read, a node that reads `$draft` or `$now` is unknown, and the answer is false only when the `when` is false.

It throws what `inOrder` throws, and a `RangeError` when it is given a payload and a `now` that is not a date.

## `holds`

```ts
function holds(expected: Expectations, writer: Writer, when: Condition, schema: Schema, payload?: Payload, now?: string): boolean;
```

The same question as `whenHolds`, of a condition, against [expectations](reading.md#expectations) already read. `offers` and `admit` ask it, so the expectations are read once for many questions.
