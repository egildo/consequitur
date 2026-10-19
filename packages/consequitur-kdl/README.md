# consequitur-kdl

**A consequitur schema written in KDL, read into the schema object and written back.**

A schema is JSON; this package reads and writes it as [KDL](https://kdl.dev), the form a person writes: the head, each gist, the laws, and every condition as nodes. Problems come back at their line and column.

```sh
npm install consequitur-kdl consequitur
```

```ts
import { readSchema, BASE_KIT } from 'consequitur';
import { fromKdl, toKdl } from 'consequitur-kdl';

const { json, problems } = fromKdl(text);
if (problems.length > 0) throw new Error(problems.map((p) => `${p.line}:${p.column} ${p.message}`).join('\n'));
const { schema, problems: more } = readSchema(json, BASE_KIT); // the same reader as for a JSON schema

toKdl(json); // back to text
```

`fromKdl` checks the text's shape; `readSchema` then reads the object exactly as it reads a `schema.json`. The text a schema is written to by `toKdl` reads back to the same object.

Dependencies: `consequitur`, `kdlet-guards` (its `kdlet-guards/kdl` entry reads and writes a condition's nodes) and `@bgotink/kdl`, which parses and formats KDL.

## Documents

The documents are in five shelves: [tutorial](https://codeberg.org/egildo/consequitur/src/branch/main/docs/tutorial/), [how-to guides](https://codeberg.org/egildo/consequitur/src/branch/main/docs/how-to/), [reference](https://codeberg.org/egildo/consequitur/src/branch/main/docs/reference/), [explanation](https://codeberg.org/egildo/consequitur/src/branch/main/docs/explanation/) and [project](https://codeberg.org/egildo/consequitur/src/branch/main/docs/project/), all in [`docs/`](https://codeberg.org/egildo/consequitur/src/branch/main/docs/) of the repository.

MIT.
