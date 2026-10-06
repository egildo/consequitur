# consequitur-render — spec

Status: settled, built (round 4, [plan](../plan.md) §4). A small toolkit for showing a thread in a
browser, drawn from what the SIBAR bench proved: the screen is a deduction from the thread, its
reading and the draft; nothing is observed and nothing is read back from the DOM.

It is not a view layer. It draws no card and owns no markup or styles: the application builds
every node. It keeps nodes, schedules previews and draws a pointer line — the three things every
screen of a thread needed and that are easy to get wrong.

Zero runtime dependencies; it imports `consequitur` for types and for `inForce`, `inOrder`, `canonical` and `compare`.

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
  /** A goal line: its warning lines, by the path of the node each names. */
  warnings?: Record<string, EventLine>;
  /** A goal line: whether its outcome is locked against revoking. */
  locked?: boolean;
}

export function lineFacts(lines: EventLine[], reading: Reading, schema: Schema): LineFacts[];  // reading order
```

One entry per line, in reading order, whatever the order given. `revokedBy` is a line in force that
revokes it by a binding of the schema (an earlier line, a gist the binding lists); `goal`,
`warnings` (empty when none) and `locked` (the goal's `final`) are set on a goal line only,
`writtenBy` on any line whose writer is `goal::<id>`. What a card shows beyond its own line comes from here. A domain's own facts (the signatures on a
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
itself, outside the key, and sets them after every `update`, since a rebuilt node starts without them.

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
  /** Called when the run of the draft now on screen rejects. */
  onError?(error: unknown, draft: D): void;
}): Previewer<D, A>;
```

After `delay` of quiet it runs the draft; an answer arriving for an older key is dropped; while a
newer draft waits, the last answer is shown with `fresh: false`. An application confirms a send
only when `current()?.fresh` and its key is the draft's: a person confirms only what they saw.
A draft whose key is the one it already has changes nothing, unless the run of that draft rejected: then it
is run again; one that returns to the key of the answer on screen shows it fresh again, with no new run; `change(null)` forgets the answer and shows
null. A run that rejects leaves the answer on screen, stale, and calls `onError` with the error and the
draft: swallowing a failed dry run was ruled out, so `onError` is how an application hears it (a rejection
with no `onError` is dropped, silently). Only the draft now on screen is heard of: a run whose draft has
moved on, been closed or disposed is dropped as its answer would be. No `requestAnimationFrame`: timers
only, so a hidden page still settles.

## 4 · `band` — pointing from a slot to a line

```ts
export interface Band {
  /** Whether a drag holds the band, from its start to its end. Read only. */
  readonly dragging: boolean;
  /** Starts a drag from `from`; resolves with the line id dropped on, or null. */
  drag(from: HTMLElement, event: PointerEvent, spec: {
    candidates: string[];
    lineOf?(element: Element): string | null;  // default: closest('[data-line-id]')
    onTarget(id: string | null): void;         // the candidate under the pointer
  }): Promise<string | null>;
  /** Draws the line from one element to another (hover), or clears it. A drag owns the band: a hover leaves it alone. */
  point(from: HTMLElement | null, to: HTMLElement | null): void;
  /** Draws again where the ends are now: the layer scrolled, or an element moved. */
  redraw(): void;
  /** Ends a drag in hand with null, then removes the drawing and the `resize` listener. */
  dispose(): void;
}

export function band(layer: HTMLElement): Band;
```

The layer is an element over the scroll area; the band appends one `<svg>` to it with
`pointer-events: none`, a path and two dots, and sets `data-mode` (`drag`, `hover`) on it, `hidden`
when idle. Listeners on `window`, capture phase, so synthetic `PointerEvent`s drive it; the drop
target is `document.elementFromPoint` at the `pointerup`; Esc cancels. Drawn synchronously on each
move. Colours come from CSS: the band sets classes, never colours (`band`, `band-path`, `band-dot`,
`band-start`, `band-end`). The svg covers the layer (inline `position: absolute; inset: 0`, so the
layer is positioned), and a node with `data-line-id` is met at the edge that faces the other end.
`dragging` is true from the call of `drag` to the end of the drag (a drop, Esc, a `pointercancel`, or its
start leaving the page, which ends it with null), so an application asks the band whether one holds it and
keeps no flag of its own. `onTarget` is called when
the candidate under the pointer changes, and with null once the drag ends over one. A second drag while
one is going, or a button other than the first, resolves null.

## 5 · `changes`, `keyOf`, `keyOfCheck` — what a reading changed into (pure, no DOM)

```ts
export type ReadingChange =
  | { of: 'line'; key: LineId; change: 'in-force' | 'revoked' }
  | { of: 'goal'; key: LineId; change: 'set' | 'met' | 'unmet' | 'gone' }
  | { of: 'check'; key: string; change: 'found' | 'lost' | 'orphan' }
  | { of: 'denunciation'; key: string; change: 'raised' | 'answered' }
  | { of: 'hole'; key: string; change: 'opened' | 'filled' }
  | { of: 'settled'; change: 'settled' | 'unsettled' };

export function changes(before: Reading, after: Reading): ReadingChange[];
export function keyOf(denunciation: Denunciation): string;
export function keyOfCheck(goal: GoalReading, path: string): string;
```

What a host animates or tells a person when a reading becomes another. A line is `in-force` when
the thread newly holds it in force, `revoked` when it is newly out of force. A goal is `set` when
the reading holds it for the first time (and `met` too if it is met already), `met` or `unmet` when
that flips, `gone` when the reading no longer holds it. A check, a `line` node of a goal's trace found
by its goal and its path, `found` a line (it had none, or another), `lost` the one it had, or became an
`orphan` (it is marked as one that can no longer hold); the checks of a goal newly set are read against
checks that found nothing. A denunciation is `raised` when its key
is new, `answered` when its key is gone. A hole, a value some line in force refers to and no line states
(`Reading.holes`), is `opened` when its key is newly in the list and `filled` when it is gone, the key being the hole's
own; a hole is awaited and never denounced, so it is no denunciation and does not unsettle the thread.
`settled` and `unsettled` say the thread's settling flipped.
Two identical readings give no change. The list is ordered by kind, in the order above, then by key
with `compare`, so a host that is given the same two readings animates the same.

`consequitur` builds fresh objects every time, so a host that memoises by reference, or keeps nodes by
`keyed`, needs a string that stays the same across readings. Lines and goals have one already
(`line.id`, `goal.line`); a denunciation and a check do not. `keyOf` is equal for two
denunciations that say the same thing in two readings and different otherwise: a `handle` one by its
kind, key and member, a `line` one by the goal's line, the gist and the payload (the outcome and a
warning of one goal differ by both), a `thread` one by its rule. It does not read what a handle
expects or holds, so a denunciation whose expectation changes keeps its key, and `changes` says
nothing of it. `keyOfCheck` is the goal's line id and the node's path: two equal checks of one
goal still have two keys, and the `n`th check of a goal whose condition is an `all`, as a composer
builds it, keeps the key `n` it had when a goal's checks were a list *(round «Conditions»; it took the
check's index)*. The parts a person writes (a key, a member, a payload) are written
canonical or last, so no key can be read two ways.

## 6 · Tests

`lineFacts` on the SIBAR case's scenarios (revoked, goals, outcomes, warnings, locked); `changes`,
`keyOf` and `keyOfCheck` on the same scenarios, step by step: a goal that fires, a revoke, an orphan,
a denunciation answered; a post on top of a scenario's thread where the case does not show a change.
`keyed`, `previewer` (fake timers: debounce, stale drop, `fresh`), `band` (dispatched pointer
events, `elementFromPoint` stubbed, Esc) under vitest's jsdom environment.
