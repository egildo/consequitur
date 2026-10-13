# consequitur

A ledger of what was said, and what follows from it.

> Status: the engine is built (`packages/consequitur`), and so are `consequitur-render`,
> `consequitur-kdl` and the playground, a sample application on two domains, SIBAR's activities and
> an editorial review; what the second showed that the engine cannot say is in
> [docs/misfits.md](docs/misfits.md). Version 0.1.0 of the three packages is prepared and not yet
> published; the plan is in [docs/plan.md](docs/plan.md). The example below is the API as it is.

A **thread** is an append-only list of **lines**. Each line has a **gist** — what happened — a
**writer**, a timestamp and a free JSON payload, and its id is the hash of its content and the
line before it. A **schema**, written as JSON, says who may write each gist, when, and what it
implies: a value on the record, someone joining or leaving a set, another line taken out of
force. consequitur reads the thread, compares what it implies with what the record holds, and
answers every difference by writing a line. **Goals** wait for lines and write one when met;
**laws** judge what a line would cause; a **dry run** tells you before you send it.

```ts
import { readSchema, BASE_KIT, emptyState, dryRun, post, offers } from 'consequitur';

const { schema, problems } = readSchema(activitySchema, BASE_KIT);
if (problems.length > 0) throw new Error(problems.join(' ')); // a schema with a problem reads as the empty one
let state = emptyState(schema);

const draft = { gist: 'create', writer: 'user::mrossi', payload: { name: 'Richiesta parere', assignTo: ['mrossi'] } };
const preview = await dryRun(state, draft, schema, new Date().toISOString());
// preview.added: the line, then «name → Richiesta parere», «status → open», «mrossi joins assignees»

state = (await post(state, draft, schema, new Date().toISOString())).state;
offers(state.lines, 'user::mrossi', schema); // memo, doc_ref, set_goal, close, quit…
```

## Where to go next

- **Run the playground**: `pnpm install`, then `pnpm dev`, and open http://localhost:5588. It writes
  a thread line by line, in either domain (a SIBAR activity, an editorial review), shows what each line
  will cause before it is sent, and shows the schema as code. `pnpm build` builds it into `playground/dist`; it is private and never published.
- [docs/vision.md](docs/vision.md) — what it is for, and what it is not
- [docs/principles.md](docs/principles.md) — how it is built
- [docs/glossary.md](docs/glossary.md) — every name
- [docs/misfits.md](docs/misfits.md) — what the second domain could not say, and the smallest change for each
- [docs/specs/consolidation.md](docs/specs/consolidation.md) — two threads made one by replay, with the derived schema and the drill
- [docs/plan.md](docs/plan.md) — the extraction, and the open questions
