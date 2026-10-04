# consequitur

A ledger of what was said, and what follows from it.

> Status: the engine is built (`packages/consequitur`); `consequitur-render` and the
> playground come next, see [docs/plan.md](docs/plan.md). The example below is the API as it is.

A **thread** is an append-only list of **lines**. Each line has a **gist** — what happened — a
**writer**, a timestamp and a free JSON payload, and its id is the hash of its content and the
line before it. A **schema**, written as JSON, says who may write each gist, when, and what it
implies: a value on the record, someone joining or leaving a set, another line taken out of
force. consequitur reads the thread, compares what it implies with what the record holds, and
answers every difference by writing a line. **Goals** wait for lines and write one when met;
**laws** judge what a line would cause; a **dry run** tells you before you send it.

```ts
import { readSchema, BASE_KIT, emptyState, dryRun, post, offers } from 'consequitur';

const { schema } = readSchema(activitySchema, BASE_KIT);
let state = emptyState(schema);

const draft = { gist: 'create', writer: 'user::mrossi', payload: { name: 'Richiesta parere', assignTo: ['mrossi'] } };
const preview = await dryRun(state, draft, schema, new Date().toISOString());
// preview.added: the line, then «name → Richiesta parere», «status → open», «mrossi joins assignees»

state = (await post(state, draft, schema, new Date().toISOString())).state;
offers(state.lines, 'user::mrossi', schema); // memo, doc_ref, set_goal, close, quit…
```

## Where to go next

- [docs/vision.md](docs/vision.md) — what it is for, and what it is not
- [docs/principles.md](docs/principles.md) — how it is built
- [docs/glossary.md](docs/glossary.md) — every name
- [docs/plan.md](docs/plan.md) — the extraction, and the open questions
