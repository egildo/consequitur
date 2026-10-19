# How to consolidate two threads

This guide gets you one new thread that holds the story of two, built by replay, with every choice answered by a person or by your code, and its seals checked.

A [consolidation](../reference/glossary.md) is never a merge. Each [source](../reference/glossary.md) is replayed into the new thread through `post`, the first's lines and then the second's, and the sources are not changed.

## Before you begin

You need the lines of both threads and the schema each is read by (a `Source` is `{ lines, schema }`), and the host's `now`. The two threads may be read by one schema or by two.

## Steps

1. **Prepare the consolidation.** `consolidate` posts nothing. It throws an `Error` that begins «The first source» or «The second source» when a source has no lines, is not one chain, or is declared for another schema, so catch it and say so.

   ```ts
   import { consolidate, type Source } from 'consequitur';

   const first: Source = { lines: await store.lines(firstId), schema: firstSchema };
   const second: Source = { lines: await store.lines(secondId), schema: secondSchema };
   const c = consolidate(first, second); // the order of the arguments is the order of the replay
   ```

   Look at `c.steps` (the lines to replay, labels prefixed `1:` and `2:`), `c.taken` (how many each source gave), and `c.from` (the two seals).

2. **See whether the schemas conflict.** When the sources are read by one schema, `c.derived.same` is true and the new thread uses it: go to step 4. When they differ, `c.derived.conflicts` lists what disagrees. A conflict is a guard, gist, record, the opening or the authority that both state differently, or a law only one source has.

   ```ts
   for (const [index, conflict] of c.derived.conflicts.entries()) {
     console.log(index, conflict.part, conflict.name); // 0 'guard' 'reviewer', 1 'one-sided-law' '{"law":"settles"}'
   }
   ```

   Gists, guards, records and sets that only one source has are added without a question. A law forbids, so a law only one source has is asked.

3. **Try the answers before you start.** `deriveSchema` is what the drill calls. Give it an answer for each conflict, by index, and a name for the new schema (lower kebab case, which it takes at version 1).

   ```ts
   import { deriveSchema } from 'consequitur';

   const derived = deriveSchema(firstSchema, secondSchema, { answers: ['second', 'keep'], name: 'review-merged' });
   console.log(derived.problems, derived.schema?.name); // [] 'review-merged'
   ```

   The answers: `'first'`, `'second'` or `{ by: part }` for a conflict; `'keep'` or `'drop'` for a one-sided law. With a conflict unanswered there is no `schema` and no problem; with all answered, `problems` says what does not fit.

4. **Start the drill.** `startDrill` makes a value that waits for your choice. It throws before any step when the derived schema would not read even with every conflict answered the easy way: usually, a missing or ill-formed `name` when the schemas differ.

   ```ts
   import { startDrill } from 'consequitur';

   let drill = startDrill(c, { name: 'review-merged', policy });
   ```

   Pass a `nonce` to make the new thread's first line reproducible. Pass the `policy` your authority uses.

5. **Walk it, and answer each stop.** `stepDrill` plays one step a call, or takes your `choice` at a stop. A drill is never changed: keep the one it returns. A stop is a schema conflict, a law only one source has, or a step that was refused.

   ```ts
   import { stepDrill, type Choice, type Stop } from 'consequitur';

   const now = new Date().toISOString();
   while (drill.status === 'going') {
     const choice = drill.stop && (await ask(drill.stop)); // your code or your person
     drill = await stepDrill(drill, now, choice);
   }
   ```

   `ask` gives a `Choice` that fits the stop:

   | The stop | The choices |
   |---|---|
   | a schema conflict | `{ do: 'first' }`, `{ do: 'second' }`, `{ do: 'by-hand', part }` |
   | a law only one source has | `{ do: 'keep' }`, `{ do: 'drop' }` |
   | a step | `{ do: 'skip' }`, `{ do: 'edit', step }`, `{ do: 'again' }` |
   | any | `{ do: 'abort' }` |

   The usual step stop is the second source's opening line: the new thread already has one, so it is refused as `unreconcilable`. `stop.why` says so, and `stop.refusal` has the refusal. Skip the step, or edit it into a line that states what it stated (here, in the review domain, a `memo` by the first thread's reviewer):

   ```ts
   async function ask(stop: Stop): Promise<Choice> {
     if (stop.at === 'schema') return stop.conflict.part === 'one-sided-law' ? { do: 'keep' } : { do: 'first' };
     return { do: 'edit', step: { ...stop.step, gist: 'memo', writer: 'user::mrossi', payload: { assignTo: ['lbianchi'] } } };
   }
   ```

   A step that points at a skipped one stops again, at a placeholder that finds no line. A `by-hand` part that does not read is not kept: the drill stops at the same conflict and `stop.problems` says why. `again` plays the step against the thread as it stands; to answer the cause first, post a line to `drill.state` yourself and hand the drill back as `{ ...drill, state }`.

6. **Take the result.** When `drill.status` is `'done'`, `drill.state` is the new thread and `drill.schema` the schema it is read by, which you keep, since the thread declares it. Store the lines and the schema. `'aborted'` leaves nothing to keep.

   ```ts
   if (drill.status === 'done') await store.save(newId, drill.state!.lines, drill.schema!);
   ```

7. **Check the seals.** The new thread's first line names its sources in `thread.from`: for each, the id of its first line, and of its last line in reading order, where it was closed. They are the ones `consolidate` gave, and they name lines of the sources you handed over.

   ```ts
   import { inOrder, verify, type Seal } from 'consequitur';

   const seals = drill.state!.lines[0]!.thread!.from!;
   const sealed = (seal: Seal, source: Source) => {
     const lines = inOrder(source.lines, source.schema);
     return lines[0]!.id === seal.first && lines.some((line) => line.id === seal.last);
   };
   console.log(JSON.stringify(seals) === JSON.stringify(c.from), sealed(seals[0]!, first), sealed(seals[1]!, second)); // true true true
   console.log((await Promise.all(drill.state!.lines.map((line) => verify(line)))).every(Boolean)); // true
   ```

   A line posted to a source after the seal has another id and is visibly after it; a seal whose `last` is no line of the source says it is not that source.

## Variations

- **Always the same answer.** A host with no person can choose by rule: `'first'` for each conflict, `'keep'` for each one-sided law, `'skip'` for each refused step.
- **Show it and take it up again.** A drill is a plain value. Keep it, show `drill.steps`, `drill.skipped` and `drill.edited`, and call `stepDrill` later.
- **The playground.** Its «Consolida» tab is a working host: [`consolidation.ts`](../../playground/src/consolidation.ts) is the logic and [`consolidation-view.ts`](../../playground/src/consolidation-view.ts) the drawing.

## See also

- [Consolidation](../reference/consolidation.md): every type, the table of conflicts and the choices of a stop.
- [Scenarios](../reference/scenarios.md): the steps, and the placeholders that stand for a line's id.
- [The thread](../reference/thread.md#the-declaration): the declaration and its seals.
- [Threads are consolidated, never merged](../explanation/decisions/threads-are-consolidated-never-merged.md): why.
