# How to be the authority of a thread

This guide gets you the host's side of a thread: you state who writes, post lines with your own clock, store what is added, read a refusal, and check a stored thread.

The host is the [authority](../reference/glossary.md): the engine trusts the writer, the instant and the nonce you give it, and reads no clock and no database of its own.

## Before you begin

You need a schema that reads without a problem (see [How to write a schema](write-a-schema.md)), here as `schema`, and somewhere to keep lines. `store` below stands for yours.

## Steps

1. **State the writer from the identity you authenticated.** A writer is `KIN::ID`. Build it on the server from the session, never from the request body, since the engine cannot tell who is really speaking. The kin must be one the gist lists.

   ```ts
   import type { LineDraft, Writer } from 'consequitur';

   const writer: Writer = `user::${session.userId}`;
   const draft: LineDraft = { gist: 'approve', writer, payload: {} };
   ```

   A draft of kin `goal` or of a record gist is never admitted: the engine writes those.

2. **Load the thread.** The state is the lines and the handles: your own copy of the record that the thread governs. A new thread starts from `emptyState(schema)`.

   ```ts
   import { emptyState, type ThreadState } from 'consequitur';

   const state: ThreadState = (await store.load(threadId)) ?? emptyState(schema);
   ```

3. **Post with your clock.** `now` is an argument of every call; give the same instant to everything you do for one request. An invalid `now` is your mistake, not a refusal: `post` throws a `RangeError`.

   ```ts
   import { post } from 'consequitur';

   const result = await post(state, draft, schema, new Date().toISOString(), { policy });
   ```

4. **Read the refusal.** A refusal leaves the state as it was and adds nothing. `code` is for your program, `detail` is an English sentence for a developer. Tell the person in your own words.

   ```ts
   if (result.refusal) {
     const { code, detail, verdicts } = result.refusal;
     // code: 'not-now', detail: 'The gist "approve" may not be written by "user::zzz" on the thread as it stands.'
     return reply(code, detail);
   }
   ```

   The codes are in [one table](../reference/posting.md#refusal-codes). Two come from the [laws](../reference/glossary.md). `law` is a `refuse` verdict: the line would leave the thread in a state the schema forbids, and `verdicts` says which law and why. `unconfirmed` is a `confirm` verdict: show the verdicts to the writer, and if they agree, post the same draft again with `confirmed: true`.

5. **Store what was added, then keep the new state.** `result.added` is the draft's line and every line reconciliation wrote after it, in order. Store them all or none, and the new handles with them, in one transaction. `diff` says what changed in the handles, for you to apply to your own copy.

   ```ts
   import { diff } from 'consequitur';

   const changes = diff(state.handles, result.state.handles, schema.kit);
   // [{ kind: 'value', key: 'status', before: 'open', after: 'closed' }, …]
   await store.append(threadId, result.added, changes);
   ```

   Run one post at a time for each thread. A second post made against the same state would write a line with the same `previous`, and `inOrder` refuses a thread that forks.

6. **Use a policy for what you do not enforce.** The [policy](../reference/glossary.md) is your configuration, outside the thread: it lists denunciations the authority leaves unanswered. Read it once against the schema, and pass it to every `post` and `dryRun`.

   ```ts
   import { readPolicy } from 'consequitur';

   const { policy, problems } = readPolicy(JSON.parse(policyText), schema);
   if (problems.length > 0) throw new Error(problems.join('\n'));
   ```

   A policy with a problem reads as the empty policy. The entries are on the [posting](../reference/posting.md#the-policy) page.

7. **Verify a stored thread.** Check each line against its hash, then the chain, then the reading. Do it when you load lines from a place you do not control, or on a schedule.

   ```ts
   import { consequitur, inOrder, verify } from 'consequitur';

   const { lines, handles } = await store.load(threadId);
   const sound = await Promise.all(lines.map((line) => verify(line)));
   if (sound.includes(false)) throw new Error('A line does not match its hash.');
   const ordered = inOrder(lines, schema); // throws a sentence naming the break
   const reading = consequitur(ordered, handles, schema);
   console.log(reading.settled, reading.denunciations);
   ```

   `verify` is false for a line whose stored fields changed. `inOrder` throws when the thread has no first line, two, a fork, a gap or a cut, and when its first line declares another schema. The reading is `settled` when the handles you hold agree with the thread; a denunciation says where they do not.

## Where a nonce matters

Only a thread's first line declares a nonce, a value used once. `post` draws 16 random bytes for it when you give none, and that is right for a real thread: it is why two threads that open with the same draft at the same instant are two threads. Give one yourself when two runs must give the same ids:

- a [dry run](../reference/glossary.md) and the post that follows it, on an empty thread: both with `{ nonce }`, and their `added` lines have the same ids;
- a test, or a replay.

```ts
const nonce = crypto.randomUUID().replaceAll('-', ''); // any string; 32 hex characters here
const preview = await dryRun(emptyState(schema), draft, schema, now, { nonce });
const sent = await post(emptyState(schema), draft, schema, now, { nonce });
// preview.added and sent.added hold the same ids
```

## Variations

- **What a writer may post now.** `offers(lines, writer, schema)` lists the gists, for a menu.
- **Preview before sending.** `dryRun(state, draft, schema, now)` gives the same answer as `post` would, with `added`, `rounds` and every `verdicts` found, and changes nothing. See [How to preview a draft](preview-a-draft.md).
- **A thread that is not settled.** `settle(state, schema, now, policy)` goes on where a bound stopped it; the next `post` does the same.

## See also

- [Posting](../reference/posting.md): admission, the dry run, the laws, the policy, `diff` and every refusal.
- [The thread](../reference/thread.md): `stamp`, `verify`, `inOrder` and the declaration.
- [The reading](../reference/reading.md): what `consequitur` returns.
- [Offers](../reference/offers.md): `offers` and `whenHolds`.
