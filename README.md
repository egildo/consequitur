# consequitur

**A ledger of what was said, and what follows from it.**

A **thread** is an append-only list of **lines**. Each line has a **gist** (what happened), a **writer**, a timestamp and a free JSON payload, and its id is the hash of its content and of the line before it, so a thread is a chain that cannot be changed behind your back. A **schema**, written as JSON, says who may write each gist, when, and what it implies: a value on the record, someone joining or leaving a set, another line taken out of force. consequitur reads the thread, compares what it implies with what the record holds, and answers every difference by writing a line. **Goals** wait for lines and write one when met; **laws** judge what a line would cause; a **dry run** tells you before you send it.

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

The packages are [`consequitur`](packages/consequitur/README.md) ([reference](docs/reference/README.md)), [`consequitur-kdl`](packages/consequitur-kdl/README.md) (a schema written in KDL; [reference](docs/reference/kdl.md)) and [`consequitur-render`](packages/consequitur-render/README.md) (a reading drawn into the DOM; [reference](docs/reference/render.md)).

## The playground

`pnpm install`, then `pnpm dev`, and open http://localhost:5588. It writes a thread line by line, in either domain (a SIBAR activity, an editorial review), shows what each line will cause before it is sent, and shows the schema as code. `pnpm build` builds it into `playground/dist`; it is private and never published.

## Documents

Five shelves in [`docs/`](docs/):

- [Tutorial](docs/tutorial/your-first-thread.md): a lesson, your first thread.
- [How-to guides](docs/how-to/README.md): directions to one goal each.
- [Reference](docs/reference/README.md): the machinery as it is, and the glossary of every name.
- [Explanation](docs/explanation/README.md): the vision, the principles, how it works, and the decisions with their reasons.
- [Project](docs/project/README.md): the plan, the specs and the misfits; the working documents, kept as an archive.

MIT.
