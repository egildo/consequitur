# consequitur-render

This page covers every export of `consequitur-render`: helpers that turn a [reading](glossary.md) into DOM, owning no markup and no style. `lineFacts` and `changes` are pure and touch no DOM; `keyed`, `previewer` and `band` touch the DOM, which they take as an argument or from `document`. The application builds every node and paints every class.

Its one dependency is `consequitur`.

## `lineFacts`

```ts
interface LineFacts {
  line: EventLine;
  inForce: boolean;
  /** The line in force that revokes this one. */
  revokedBy?: EventLine;
  /** This line is a goal: its reading. */
  goal?: GoalReading;
  /** This line was written by a goal: that goal's line id. */
  writtenBy?: LineId;
  /** A goal line: its warning lines, by the path of the node each names. */
  warnings?: Record<string, EventLine>;
  /** A goal line: whether its outcome is locked against revoking. */
  locked?: boolean;
}

function lineFacts(lines: EventLine[], reading: Reading, schema: Schema): LineFacts[];
```

The facts the reading holds about each line of a thread, one entry for each line, in reading order whatever the order given. `reading` is the reading of `lines` under `schema`.

- `inForce` says whether the line is in force.
- `revokedBy` is the line in force that revokes it, by a `revoke` binding of the schema: an earlier line, of a gist the binding lists. When several do, the last in reading order.
- `goal`, `warnings` and `locked` are set on a [goal](glossary.md)'s line only: its reading, its [warning](glossary.md) lines by path (empty when it has none), and its `final`.
- `writtenBy` is set on a line whose writer is `goal::<id>`.

It throws what [`inOrder`](thread.md#inorder) throws. A domain's own facts are the application's.

```ts
for (const facts of lineFacts(state.lines, reading, schema)) {
  // facts.line, facts.inForce, facts.revokedBy, facts.goal …
}
```

## `changes`, `keyOf` and `keyOfCheck`

```ts
type ReadingChange =
  /** A line newly in force, or newly out of force. */
  | { of: 'line'; key: LineId; change: 'in-force' | 'revoked' }
  /** A goal newly read, newly met, unmet, or gone from the reading. */
  | { of: 'goal'; key: LineId; change: 'set' | 'met' | 'unmet' | 'gone' }
  /** A goal's `line` node that found its line, lost it, or became an orphan; `key` is from `keyOfCheck`. */
  | { of: 'check'; key: string; change: 'found' | 'lost' | 'orphan' }
  /** A denunciation that appeared, or disappeared; `key` is from `keyOf`. */
  | { of: 'denunciation'; key: string; change: 'raised' | 'answered' }
  /** A hole newly open, or newly filled; `key` is the hole's key. */
  | { of: 'hole'; key: string; change: 'opened' | 'filled' }
  /** The thread's settling flipped. */
  | { of: 'settled'; change: 'settled' | 'unsettled' };

function changes(before: Reading, after: Reading): ReadingChange[];
function keyOf(denunciation: Denunciation): string;
function keyOfCheck(goal: GoalReading, path: string): string;
```

`changes` says what changed from one reading to another: what a host animates, or tells a person. Two equal readings give none. The list is ordered by `of`, in the order above, then by key with `compare`, the changes of one key in the order they were found.

- **A line** is `in-force` when it is newly in force, `revoked` when it is newly revoked.
- **A goal** is `set` when the reading holds it for the first time, and also `met` if it is met already; `met` and `unmet` when that flips; `gone` when the reading no longer holds it.
- **A check**, a `line` node of a goal's [trace](conditions.md#the-trace), is `found` when it finds a line it did not have (none, or another), `lost` when it finds none and had one, `orphan` when it is newly marked as one that can no longer hold. The checks of a goal newly set are read against checks that found nothing.
- **A denunciation** is `raised` when its key is new, `answered` when its key is gone. A denunciation whose expectation changes keeps its key, and is no change.
- **A [hole](glossary.md)** is `opened` when its key is newly listed, `filled` when it is gone.
- **The thread** is `settled` or `unsettled` when its settling flips.

A reading is built fresh each time, so a host that keeps nodes by reference needs a key for what has no id of its own. `keyOf` gives one for a denunciation: equal for two that say the same thing in two readings, different otherwise. A `handle` one is keyed by its kind, key and member; a `line` one by the goal's line, the gist and the payload; a `thread` one by its rule. It does not read what is expected or found. `keyOfCheck` gives one for a node of a goal's condition: the goal's line id and the node's path, so two equal checks of one goal have two keys.

```ts
for (const change of changes(before, after)) if (change.of === 'goal' && change.change === 'met') flash(change.key);
```

## `keyed`

```ts
interface Keyed<T> {
  /** Brings the root up to the items, in their order. */
  update(items: T[]): void;
  node(id: string): HTMLElement | undefined;
  clear(): void;
}

function keyed<T>(
  root: HTMLElement,
  spec: {
    id(item: T): string;
    /** Everything the node shows that can change; a change rebuilds the node. */
    key(item: T): string;
    build(item: T): HTMLElement;
  },
): Keyed<T>;
```

Nodes kept by id under `root`. `update` builds a node once for each id and builds it again only when its key changes. A new item's node is inserted at its place, a node whose item is gone is removed, and a node whose id and key are unchanged is not touched, so focus, scroll and hover stay where they are. `node` gives the node of an id; `clear` forgets every node and empties the root.

**The `key` must include everything the node shows.** `keyed` compares nothing but the key: a node whose key is unchanged is never built again, so a part of the item that the node shows and the key leaves out stays as it was drawn. Put every part of the item the node draws into `key`, as a string, for example with `JSON.stringify` of a list of those parts.

What changes often and costs nothing to redraw, such as selected or lit, is a class the application sets on `node(id)`, outside the key. A node built again starts without it, so those classes are set after every `update`.

## `previewer`

```ts
interface Previewer<D, A> {
  /** The draft changed (or closed, with null). */
  change(draft: D | null): void;
  /** The answer on screen, and whether it answers the draft as it is. */
  current(): { key: string; answer: A; fresh: boolean } | null;
  dispose(): void;
}

function previewer<D, A>(spec: {
  /** Default 250 ms. */
  delay?: number;
  keyOf(draft: D): string;
  run(draft: D): Promise<A>;
  /** Called with the answer to show, or null; `fresh` false while a newer draft waits. */
  show(answer: A | null, fresh: boolean): void;
  /** Called when the run of the draft on screen rejects. */
  onError?(error: unknown, draft: D): void;
}): Previewer<D, A>;
```

The [dry run](glossary.md) while a draft is composed. After `delay` milliseconds with no change, it runs the draft, and shows the answer with the key of the draft it answers.

- While a newer draft waits, the last answer is shown with `fresh: false`.
- An answer that arrives for a draft that has moved on, closed or been disposed is dropped.
- A draft whose key is the one in hand changes nothing. One whose key is the answer's on screen shows it fresh again, with no new run.
- `change(null)` forgets the answer and shows `null`.
- A run that rejects leaves the answer on screen, stale, and calls `onError` with the error and the draft, when the draft is still the one on screen; without `onError` the rejection is dropped. The same draft coming back is run again.

The answer is advice: the authority judges again on sending. An application confirms only what `current()` says is `fresh`, with the draft's key. Timers only, no `requestAnimationFrame`, so a hidden page still settles.

```ts
const preview = previewer({
  keyOf: (draft) => JSON.stringify(draft),
  run: (draft) => dryRun(state, draft, schema, new Date().toISOString(), { policy }),
  show: (answer, fresh) => drawPreview(answer, fresh),
});
input.addEventListener('input', () => preview.change(readDraft()));
```

## `band`

```ts
interface Band {
  /** Whether a drag holds the band, from its start to its end. */
  readonly dragging: boolean;
  /** Starts a drag from `from`; resolves with the line id dropped on, or null. */
  drag(
    from: HTMLElement,
    event: PointerEvent,
    spec: {
      candidates: string[];
      /** The line an element stands for; default: the `data-line-id` of its closest ancestor. */
      lineOf?(element: Element): string | null;
      /** The candidate under the pointer, or null. */
      onTarget(id: string | null): void;
    },
  ): Promise<string | null>;
  /** Draws the line from one element to another (hover), or clears it. A drag owns the band: a hover leaves it alone. */
  point(from: HTMLElement | null, to: HTMLElement | null): void;
  /** Draws again where the ends are: the layer scrolled or an element moved. */
  redraw(): void;
  /** Ends a drag in hand with null, then removes the drawing and the window listener. */
  dispose(): void;
}

function band(layer: HTMLElement): Band;
```

The [band](glossary.md): a curve drawn over a layer from one end to another. `layer` is an element over the scroll area, and must be positioned: the band appends one `<svg>` to it that covers it, with a path and two dots.

- **Classes.** The svg has the class `band`, the path `band-path`, the dots `band-dot` and `band-start` or `band-end`. `data-mode` on the svg is `drag` or `hover`, and the svg is `hidden` when idle. The band sets no colour, and is never the target of a pointer (`pointer-events: none`).
- **`drag`** draws the band from `from` to the pointer, and resolves with the candidate dropped on, the id `lineOf` gives for the element under the pointer at `pointerup`, or `null`. `onTarget` is told each time the candidate under the pointer changes, and `null` once the drag ends over one. Esc, a `pointercancel`, and `from` leaving the page end it with `null`. A second drag while one holds the band, or a button other than the first, resolves `null` at once. Its listeners are on `window`, in the capture phase, so a synthetic `PointerEvent` drives it.
- **`dragging`** is true from the call of `drag` to the end of the drag.
- **`point`** draws the band from one element to another, for a hover, or clears it given `null`. It does nothing while a drag holds the band.
- An end that is a node with `data-line-id` is met at the edge that faces the other end; any other end at its centre. An element end that leaves the page ends the band.

```ts
const pointer = band(layer);
slot.addEventListener('pointerdown', async (event) => {
  const id = await pointer.drag(slot, event, { candidates, onTarget: (id) => highlight(id) });
  if (id !== null) attach(id);
});
```
