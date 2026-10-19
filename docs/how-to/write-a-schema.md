# How to write a schema

This guide gets you a [schema](../reference/glossary.md) for a domain of your own, first in JSON and then in KDL, read without a problem.

The example is a review request: someone opens it and names the reviewers, a reviewer may approve it, add a reviewer or quit, and a goal can close it.

## Before you begin

Install the engine, and the KDL package if you want the second half:

```sh
npm install consequitur consequitur-kdl
```

## Steps

1. **Write the head and the opening gist.** Save this as `review.json`. The head says who the [authority](../reference/glossary.md) is, which [set](../reference/glossary.md) the thread keeps, and which gist opens it. `records` names the gist of each [record](../reference/glossary.md) the authority writes, and each of those gists needs a schema with no rules.

   ```json
   {
     "name": "review-request",
     "version": 1,
     "opening": "create",
     "authority": "system::reviews",
     "sets": ["reviewers"],
     "records": { "value": "metadata_set", "join": "assigned", "leave": "unassigned" },
     "judged": ["user"],
     "gists": [
       {
         "gist": "create",
         "writers": ["user"],
         "rules": [
           { "rule": "value", "key": "name", "from": "name", "required": true },
           { "rule": "value", "key": "status", "value": "open" },
           { "rule": "join", "set": "reviewers", "from": "assignTo", "required": true }
         ]
       },
       { "gist": "metadata_set", "writers": ["system"], "rules": [] },
       { "gist": "assigned", "writers": ["system"], "rules": [] },
       { "gist": "unassigned", "writers": ["system"], "rules": [] }
     ]
   }
   ```

   The three rules of `create` are [rule bindings](../reference/schema.md#rule-bindings): the line states the `name`, sets `status` to `open`, and puts the names under `assignTo` in the set.

2. **Read it.** `readSchema` never throws. It gives the schema and a list of problems, each a sentence. A schema with any problem is read as the empty schema, so act on `problems` before you use `schema`.

   ```ts
   import { readFileSync } from 'node:fs';
   import { BASE_KIT, readSchema } from 'consequitur';

   const { schema, problems } = readSchema(JSON.parse(readFileSync('review.json', 'utf8')), BASE_KIT);
   if (problems.length > 0) throw new Error(problems.join('\n'));
   ```

   Check that it catches a fault: change `"opening": "create"` to `"start"`. `problems` is then `['The opening gist "start" has no schema.']`. Change it back.

3. **Add the gists a writer may post.** Add these two to `gists`. A [gist](../reference/glossary.md) names what happened, and `writers` lists the [kins](../reference/glossary.md) that may write it.

   ```json
   { "gist": "approve", "writers": ["user"], "rules": [] },
   { "gist": "memo", "writers": ["user"], "rules": [{ "rule": "join", "set": "reviewers", "from": "assignTo", "required": true }] },
   { "gist": "quit", "writers": ["user"], "rules": [{ "rule": "leave", "set": "reviewers" }] }
   ```

   Read the schema again: `problems` is empty.

4. **Say when a gist may be written.** Only a reviewer should approve, add a reviewer or quit. Add a named [guard](../reference/glossary.md) at the top level of the schema, and a `when` on the three gists that points to it:

   ```json
   "guards": { "reviewer": { "is": { "$writer": "id" }, "values": [{ "$set": "reviewers" }] } }
   ```

   ```json
   { "gist": "approve", "writers": ["user"], "rules": [], "when": { "guard": "reviewer" } }
   ```

   The guard holds when the writer's id is in the set. Do the same on `memo` and `quit`. The condition language is on the [conditions](../reference/conditions.md) page.

5. **Add a goal.** A [goal](../reference/glossary.md) waits for lines and writes one when it is met. The schema needs a gist whose line is a goal, and a gist the goal writes, which lists `goal` among its writers:

   ```json
   { "gist": "set_goal", "writers": ["user"], "rules": [{ "rule": "goal" }], "when": { "guard": "reviewer" } },
   { "gist": "close", "writers": ["goal"], "rules": [{ "rule": "value", "key": "status", "value": "closed" }] }
   ```

   A reviewer then posts a `set_goal` line with the payload `{ "name": "approved", "when": { "line": { "gist": "approve" } }, "then": "close" }`. The reading is on the [reading](../reference/reading.md#goals) page.

6. **Add a law.** A [law](../reference/glossary.md) judges what a line would cause. This one refuses a line of a kin in `judged` that would leave the set empty while the status is `open`:

   ```json
   "laws": [{ "law": "keeps-set", "set": "reviewers", "while": { "is": { "$value": "status" }, "values": ["open"] }, "strength": "refuse" }]
   ```

7. **Check the schema against a thread.** Read it once more, then post two lines. The first is accepted. The second is refused, since `mrossi` is the only reviewer:

   ```ts
   import { emptyState, post } from 'consequitur';

   const now = new Date().toISOString();
   const open = await post(emptyState(schema), { gist: 'create', writer: 'user::mrossi', payload: { name: 'Review', assignTo: ['mrossi'] } }, schema, now);
   console.log(open.refusal); // undefined
   const quit = await post(open.state, { gist: 'quit', writer: 'user::mrossi', payload: {} }, schema, now);
   console.log(quit.refusal?.code); // 'law'
   ```

8. **Write it in KDL.** `toKdl` writes the schema object as KDL, and `fromKdl` reads KDL back into the object. The object is the model; the file is the form a person writes.

   ```ts
   import { writeFileSync } from 'node:fs';
   import type { Json } from 'consequitur';
   import { toKdl } from 'consequitur-kdl';

   const json = JSON.parse(readFileSync('review.json', 'utf8')) as Record<string, Json>;
   writeFileSync('review.kdl', toKdl(json));
   ```

   `review.kdl` begins like this:

   ```kdl
   name review-request
   version 1
   opening create
   authority system::reviews
   sets reviewers
   records join=assigned leave=unassigned value=metadata_set
   judged user
   guard reviewer {
       is (writer)id (set)reviewers
   }
   gist create user {
       value from=name key=name required=#true
       value key=status value=open
       join from=assignTo required=#true set=reviewers
   }
   ```

   It goes on with the other gists, `goal` for the goal binding, and the law as `law keeps-set set=reviewers strength=refuse { while { … } }`. The form is on the [consequitur-kdl](../reference/kdl.md#the-form) page.

9. **Read the KDL.** `fromKdl` never throws either. Its problems carry a line and a column and say what is wrong with the text; `readSchema` then says what the schema means.

   ```ts
   import { fromKdl } from 'consequitur-kdl';

   const read = fromKdl(readFileSync('review.kdl', 'utf8'));
   if (read.problems.length > 0) throw new Error(read.problems.map((p) => `${p.line}:${p.column} ${p.message}`).join('\n'));
   const again = readSchema(read.json, BASE_KIT);
   console.log(again.problems); // []
   ```

   `read.json` equals the object you started from.

## Variations

- **Keep the schema as JSON from a schema you hold.** `schemaJson(schema)` writes a read schema back as JSON, without its kit.
- **Warn when a goal is lost.** Name a gist for `warning` in `records` (`"warning": "goal_warning"`), and give that gist a schema with `"goal"` as its only writer.
- **Use a kind of your own.** Read against a larger kit: `readSchema(json, kit)`. See [How to add a kind to a kit](add-a-kind.md). `fromKdl` needs no kit.

## See also

- [The schema and the kit](../reference/schema.md): every key of the head, the gist schemas, the rule and law bindings.
- [Conditions](../reference/conditions.md): the nodes of a `when`, a guard and a goal.
- [consequitur-kdl](../reference/kdl.md): the KDL form, its conditions and its problems.
- [Posting](../reference/posting.md): what `post` refuses, and why.
