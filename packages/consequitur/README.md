# consequitur

**A ledger of what was said, and what follows from it.**

A **thread** is an append-only list of **lines**. Each line has a **gist** (what happened), a **writer**, a timestamp and a free JSON payload, and its id is the hash of its content and of the line before it, so a thread is a chain that cannot be changed behind your back. A **schema**, written as JSON, says who may write each gist, when, and what it implies: a value on the record, someone joining or leaving a set, another line taken out of force. consequitur reads the thread, compares what it implies with what the record holds, and answers every difference by writing a line. **Goals** wait for lines and write one when met; **laws** judge what a line would cause; a **dry run** tells you before you send it.

The reading is pure: no clock, no randomness, no I/O. Two readers of one thread agree.

```sh
npm install consequitur
```

```ts
import { readSchema, BASE_KIT, emptyState, dryRun, post, offers } from 'consequitur';

const { schema, problems } = readSchema(activitySchema, BASE_KIT); // your schema, as JSON
if (problems.length > 0) throw new Error(problems.join(' ')); // a schema with a problem reads as the empty one
let state = emptyState(schema);

const draft = { gist: 'create', writer: 'user::mrossi', payload: { name: 'Review request', assignTo: ['mrossi'] } };
const now = new Date().toISOString(); // the host's clock: the engine never reads one

const preview = await dryRun(state, draft, schema, now);
// preview.added: the line, then what reconciliation writes after it

const result = await post(state, draft, schema, now);
if (!result.refusal) state = result.state;
offers(state.lines, 'user::mrossi', schema); // what this writer may post on the thread as it stands
```

## What is in it

- [the line](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/thread.md), its id (`sha256:` and the hash, in RFC 8785's canonical form), the chain that is the reading order, and the first line's **declaration** (a nonce, and the name and version of the schema that reads it);
- [`readSchema`](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/schema.md), with **kinds** registered in a kit (`BASE_KIT` has the base handle, rule and law kinds): a domain is data, and a new kind of consequence is registered, not forked in;
- [conditions](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/conditions.md) (`when`, goals, laws) written in the condition language of [`kdlet-guards`](https://www.npmjs.com/package/kdlet-guards), the one runtime dependency;
- [the reading](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/reading.md), `consequitur`: what is in force, what the lines expect, the goals, the holes and the denunciations;
- [`post`, `dryRun`, `settle`, `diff`](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/posting.md) and a policy for what the authority leaves unanswered;
- [`offers`](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/offers.md): what a writer may post on the thread as it stands;
- [**scenarios**](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/scenarios.md) (`playScenario`, `prune`, `stepsOf`, `holed`): a domain's stories as data, and templates saved from a thread;
- [**consolidation**](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/consolidation.md): two threads made one by replay, never by merge. `consolidate`, `deriveSchema`, and a **drill** (`startDrill`, `stepDrill`) that walks the replay one step at a time and stops where a schema conflict or a refused step needs a choice.

A schema can also be written in KDL with [`consequitur-kdl`](https://www.npmjs.com/package/consequitur-kdl) ([reference](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/kdl.md)), and a reading drawn into the DOM with [`consequitur-render`](https://www.npmjs.com/package/consequitur-render) ([reference](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/render.md)).

## Documents

The documents are in five shelves: [tutorial](https://codeberg.org/egildo/consequitur/src/branch/main/docs/tutorial/), [how-to guides](https://codeberg.org/egildo/consequitur/src/branch/main/docs/how-to/), [reference](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/), [explanation](https://codeberg.org/egildo/consequitur/src/branch/main/docs/explanation/) and [project](https://codeberg.org/egildo/consequitur/src/branch/main/docs/project/), all in [`docs/`](https://codeberg.org/egildo/consequitur/src/branch/main/docs/) of the repository.

MIT.
