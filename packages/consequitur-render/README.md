# consequitur-render

**A consequitur reading made into DOM: a small toolkit, not a view layer.**

The screen is a deduction from the thread, its reading and the draft: nothing is observed and nothing is read back from the DOM. This package draws no card and owns no markup or style; the application builds every node. It keeps nodes, schedules previews and draws a pointer line, the three things every screen of a thread needed and that are easy to get wrong.

```sh
npm install consequitur-render consequitur
```

- `lineFacts(lines, reading, schema)`: each line's facts, in reading order: in force, revoked by, its goal's reading, what wrote it (pure, no DOM);
- `changes(before, after)`: what a reading changed into, line by line (pure);
- `keyed`: nodes kept by line id, rebuilt only when their key changes;
- `previewer`: the debounced dry run while a draft is composed, with stale answers dropped and a failed run told to `onError`;
- `band`: the pointer line over a layer, a drag from a slot to a line.

```ts
import { consequitur } from 'consequitur';
import { lineFacts } from 'consequitur-render';

const reading = consequitur(state.lines, state.handles, schema);
for (const facts of lineFacts(state.lines, reading, schema)) {
  // facts.line, facts.inForce, facts.revokedBy, facts.goal …
}
```

Its one dependency is `consequitur`. `keyed`, `previewer` and `band` touch the DOM and take it as an argument or from `document`.

## Documents

The documents are in five shelves: [tutorial](https://codeberg.org/egildo/consequitur/src/branch/main/docs/tutorial/), [how-to guides](https://codeberg.org/egildo/consequitur/src/branch/main/docs/how-to/), [reference](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/), [explanation](https://codeberg.org/egildo/consequitur/src/branch/main/docs/explanation/) and [project](https://codeberg.org/egildo/consequitur/src/branch/main/docs/project/), all in [`docs/`](https://codeberg.org/egildo/consequitur/src/branch/main/docs/) of the repository.

MIT.
