# consequitur-render — spec

Status: proposed for round 4 ([plan](../plan.md) §4). A small toolkit for showing a thread in a
browser, drawn from what the SIBAR bench proved: the screen is a deduction from the thread, its
reading and the draft; nothing is observed and nothing is read back from the DOM.

It is not a view layer. It draws no card and owns no markup or styles: the application builds
every node. It keeps nodes, schedules previews and draws a pointer line — the three things every
screen of a thread needed and that are easy to get wrong.

Zero runtime dependencies; it imports `consequitur` for types and for `inForce`/`inOrder`.

## 1 · `lineFacts` — the reading, line by line (pure, no DOM)

```ts
export interface LineFacts {
  line: EventLine;
  inForce: boolean;
  /** The line in force that revokes this one. */
  revokedBy?: EventLine;
  /** This line is a goal: its reading. */
  goal?: GoalReading;
  /** This line was written by a goal: that goal's line id. */
  writtenBy?: LineId;
  /** A goal line: its warning lines, by check index. */
  warnings?: Record<number, EventLine>;
  /** A goal line: whether its outcome is locked against revoking. */
  locked?: boolean;
}

export function lineFacts(lines: EventLine[], reading: Reading, schema: Schema): LineFacts[];  // reading order
```

What a card shows beyond its own line comes from here. A domain's own facts (the signatures on a
document) are the application's.

## 2 · `keyed` — nodes kept by line id

```ts
export interface Keyed<T> {
  /** Brings the root up to the items, in their order. */
  update(items: T[]): void;
  node(id: string): HTMLElement | undefined;
  clear(): void;
}

export function keyed<T>(root: HTMLElement, spec: {
  id(item: T): string;
  /** What the node shows beyond what never changes; a change rebuilds the node. */
  key(item: T): string;
  build(item: T): HTMLElement;
}): Keyed<T>;
```

A node is built once per id and rebuilt only when its key changes; a new item is inserted at its
place; an item gone is removed; nodes whose id and key are unchanged are never touched, so focus,
scroll and hover survive. The application sets transient classes (selected, lit) on `node(id)`
itself, outside the key.

## 3 · `previewer` — the dry run while composing

```ts
export interface Previewer<D, A> {
  /** The draft changed (or closed, with null). */
  change(draft: D | null): void;
  /** The answer on screen, and whether it answers the draft as it is now. */
  current(): { key: string; answer: A; fresh: boolean } | null;
  dispose(): void;
}

export function previewer<D, A>(spec: {
  /** Default 250 ms. */
  delay?: number;
  keyOf(draft: D): string;
  run(draft: D): Promise<A>;
  /** Called with the answer to show, or null; `fresh` false while a newer draft waits. */
  show(answer: A | null, fresh: boolean): void;
}): Previewer<D, A>;
```

After `delay` of quiet it runs the draft; an answer arriving for an older key is dropped; while a
newer draft waits, the last answer is shown with `fresh: false`. An application confirms a send
only when `current()?.fresh` and its key is the draft's: a person confirms only what they saw.
No `requestAnimationFrame`: timers only, so a hidden page still settles.

## 4 · `band` — pointing from a slot to a line

```ts
export interface Band {
  /** Starts a drag from `from`; resolves with the line id dropped on, or null. */
  drag(from: HTMLElement, event: PointerEvent, spec: {
    candidates: string[];
    lineOf(element: Element): string | null;   // default: closest('[data-line-id]')
    onTarget(id: string | null): void;         // the candidate under the pointer
  }): Promise<string | null>;
  /** Draws the line from one element to another (hover), or clears it. */
  point(from: HTMLElement | null, to: HTMLElement | null): void;
}

export function band(layer: HTMLElement): Band;
```

The layer is an element over the scroll area; the band appends one `<svg>` to it with
`pointer-events: none`, a path and two dots, and sets `data-mode` (`drag`, `hover`) on it, `hidden`
when idle. Listeners on `window`, capture phase, so synthetic `PointerEvent`s drive it; the drop
target is `document.elementFromPoint` at the `pointerup`; Esc cancels. Drawn synchronously on each
move. Colours come from CSS: the band sets classes, never colours.

## 5 · Tests

`lineFacts` on the SIBAR case's scenarios (revoked, goals, outcomes, warnings, locked).
`keyed`, `previewer` (fake timers: debounce, stale drop, `fresh`), `band` (dispatched pointer
events, `elementFromPoint` stubbed, Esc) under vitest's jsdom environment.
