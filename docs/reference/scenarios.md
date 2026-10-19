# Scenarios

This page covers [scenarios](glossary.md): a domain's story as data, a list of [steps](glossary.md) posted one after the other to an empty thread. It covers playing one (`playScenario`, `resolve`, `draftOf`), reading a file of them (`readScenarios`), saving one from a thread (`prune`, `stepsOf`, `holed`), and the lines a replay takes (`replayed`). The module knows no gist and no domain; the engine never sees a scenario, only the lines the player posts.

## Types

```ts
interface Step {
  /** Names the line this step posts, for a later `$line` or `$goal`. */
  label?: string;
  writer: Writer;
  gist: string;
  /** What the writer states, with placeholders. */
  payload: Payload;
  /** The writer confirms what a `confirm` law finds. */
  confirmed?: true;
  /** The engine is expected to refuse this step, with this code. */
  refused?: Refusal['code'];
}

interface Scenario {
  id: string;
  /** What the scenario shows, in English. */
  title: string;
  steps: Step[];
}

/** The id of the line each label named, as the steps posted them. */
type Labels = Map<string, LineId>;
```

## Placeholders

A line's id is a hash nobody can write down, so a step's payload points at an earlier line by a [placeholder](glossary.md): an object with one key, wherever a value may stand, a check's payload and a check's writer included.

| Placeholder | Stands for |
|---|---|
| `{ "$line": label }` | The id of the line the step labelled `label` posted. |
| `{ "$goal": label }` | `goal::` and that id: the writer of what that goal writes. |
| `{ "$find": check }` | The id of the first line, in reading order, that the [check](conditions.md#where-a-line-node-looks) matches: for a line no step posted, such as one a goal wrote. |

A [reference](conditions.md#references), `$value`, `$set`, `$writer` or `$draft`, is not a placeholder: the player leaves it in the line, and the reading resolves it. Any other object with one key that begins with `$`, `$now` included, is an unknown placeholder.

```json
[
  { "label": "goal", "writer": "user::mrossi", "gist": "set_goal",
    "payload": { "name": "sorted", "when": { "line": { "gist": "done" } }, "then": "memo", "with": { "assignTo": "lbianchi" } } },
  { "writer": "user::mrossi", "gist": "set_goal_revoke", "payload": { "target": { "$line": "goal" } } }
]
```

## `resolve` and `draftOf`

```ts
function resolve(value: Json, lines: EventLine[], labels: ReadonlyMap<string, LineId>): Json;
function draftOf(step: Step, lines: EventLine[], labels: ReadonlyMap<string, LineId>): LineDraft;
```

`resolve` replaces every placeholder in a value by what it stands for, against the thread as it stands, and leaves references alone. It throws an `Error` that names the placeholder when a `$line` or `$goal` names a label no step has posted, when a `$find` holds no check or no line matches it, and when the placeholder is unknown. `draftOf` is the draft a step posts: its gist, its writer and its payload resolved.

## `playScenario`

```ts
interface Io {
  lines(): EventLine[];
  /** Posts the draft, and answers the refusal, or nothing when the line was posted. */
  send(draft: LineDraft, confirmed: boolean, opening?: { nonce?: string; from?: Seal[] }): Promise<Refusal | undefined>;
}

interface Played {
  /** The first step that did not go as the scenario says. */
  failed?: { index: number; step: Step; why: string; refusal?: Refusal };
  /** The steps the scenario expects refused, each with the refusal that came. */
  refused: Array<{ index: number; step: Step; refusal: Refusal }>;
  labels: Labels;
}

function playScenario(
  steps: Step[],
  io: Io,
  options?: {
    after?(done: { index: number; step: Step; labels: Labels; refusal?: Refusal }): void | Promise<void>;
    labels?: Labels;
    as?: Writer;
    nonce?: string;
    from?: Seal[];
  },
): Promise<Played>;
```

Plays the steps in order. Each is resolved against the thread `io.lines()` gives, and posted through `io.send`, with its `confirmed`. Whatever `io.send` is decides where the lines go: [`post`](posting.md#post) on a state the host keeps, or an application's own way of sending.

- A step refused that the scenario does not expect refused, one posted that it expects refused, and one refused with another code, each stops the play, in `failed`, with why.
- A step refused with the code it expects is listed in `refused`, and the play goes on.
- A labelled step that is posted sets its label to the id of the first line the post appended.
- `after` is told of each step once it is done, so a test can look at the thread where it matters.
- `labels` carries the labels of an earlier play on; the map is changed in place.
- `as` is the writer every step is posted as, in place of its own: an application that plays a scenario for the person who opens it passes that person.
- `nonce` and `from` are handed to every `send`, for `post`: the first line declares the thread with them, so a scenario played twice with one nonce gives the same ids.

It throws what `resolve` throws.

```ts
let state = emptyState(schema);
const io: Io = {
  lines: () => state.lines,
  async send(draft, confirmed, opening) {
    const out = await post(state, draft, schema, now, { confirmed, ...opening });
    if (!out.refusal) state = out.state;
    return out.refusal;
  },
};
const played = await playScenario(scenario.steps, io, { nonce });
```

## `readScenarios`

```ts
function readScenarios(text: string): Scenario[];
```

Reads a scenarios file: a JSON list of scenarios, each with an `id`, a `title` and `steps`, each step with a writer that holds `::`, a gist and a payload object. It throws an `Error` that says what is wrong, and what `JSON.parse` throws on text that is not JSON. It does not check the rest of a step.

## `prune`

```ts
interface Pruned {
  /** The lines a person decides on, in reading order. */
  open: EventLine[];
  /** Every other line, in reading order, with why it is left out. */
  left: Array<{ line: EventLine; why: 'engine' | 'revoked' | 'outside' | 'found' }>;
}

function prune(lines: EventLine[], reading: Reading, schema: Schema): Pruned;
```

What of a thread a scenario need not say, line by line. `reading` is the reading of `lines` under `schema`. Each line gets the first answer that applies:

| `why` | The line |
|---|---|
| `engine` | Its writer is of kin `goal`, or its gist is a record gist. The engine writes it again. |
| `revoked` | It is out of force, or its gist has a `revoke` binding. A mistake and its undoing. |
| `outside` | Its writer's kin is not among the head's `judged`. The world will state it again. |
| `found` | A `line` node of a goal's trace found it. The goal will find it again. |

Every other line is `open`: a person decides whether to keep it as a step, drop it, or make it what a goal writes or awaits. It throws what `inOrder` throws.

## `stepsOf`

```ts
function stepsOf(kept: EventLine[], all: EventLine[], prefix?: string): Step[];
```

The steps of the lines a person kept, in the reading order of `all`, the whole thread, with every id in a payload made a placeholder:

- the id of an earlier kept line becomes `{ "$line": label }`, and `goal::` and such an id `{ "$goal": label }`;
- the id of a line of `all` that was not kept becomes `{ "$find": { gist, payload } }` of that line, or `{ "$find": { gist } }` when its payload is empty, since that line will be awaited and not replayed.

A step is labelled when a later step points at it, by its position among the kept lines from `"1"`, after `prefix`. A [consolidation](consolidation.md) gives each source its own prefix, so the labels of two sources stay apart. A step carries no `confirmed` and no `refused`.

## `holed`

```ts
function holed(steps: Step[], holes: Record<string, Json>): Step[];
```

The steps with each payload value equal to one of the values of `holes`, compared by its canonical form, replaced by `{ "$value": key }`, its key: a [hole](reading.md#holes). It looks wherever a value stands in a payload, a list's item and a check's payload included. One value in several lines becomes one hole; a value two keys share goes to the first of them. A placeholder or a reference is left as it is, and so is everything outside the payloads. Played, the steps open the thread with these holes; a [fill](schema.md#value) line states each value.

```ts
holed(steps, { ddt: 'DDT-4471', unloader: 'gverdi' });
```

## `replayed`

```ts
function replayed(lines: EventLine[], schema: Schema): EventLine[];
```

The lines a replay takes from a thread, in reading order: every line the engine would not write again, that is every line but those of kin `goal` and those of a record gist. Unlike `prune`, it keeps the revoked, the outside and the found lines, since in a new thread nobody awaits them. It throws what `inOrder` throws. [`consolidate`](consolidation.md#consolidate) uses it.
