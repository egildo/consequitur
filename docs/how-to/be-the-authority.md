# How to be the authority of a thread

This guide gets you the host's side of a thread: you state who writes, post lines with your own clock, store what is added, read a refusal, check a stored thread, and answer the lines the thread expects of you.

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

## Give a nonce when two runs must agree

Leave the nonce out for a real thread: `post` draws one for the first line, so two threads opened with the same draft at the same instant stay two threads. Give one yourself when two runs must give the same ids, with `{ nonce }`:

- for a [dry run](../reference/glossary.md) and the post that follows it on an empty thread;
- for a test or a replay.

The nonce is part of the [declaration](../reference/thread.md#the-declaration).

```ts
const nonce = crypto.randomUUID().replaceAll('-', ''); // any string; 32 hex characters here
const preview = await dryRun(emptyState(schema), draft, schema, now, { nonce });
const sent = await post(emptyState(schema), draft, schema, now, { nonce });
// preview.added and sent.added hold the same ids
```

## Answer the lines the thread expects of you

A gist whose schema has an [`expect`](../reference/schema.md#expected-lines) is expected from a kin while its condition holds, and the reading denounces it with that kin. The engine never writes it, and the thread stays settled. When the kin is one of yours, a worker of yours does the work in the world and posts the line.

1. **Find the threads that expect something of your kin.** After each post, look at `result.reading.denunciations`; when one names your kin, put the thread on your worker's queue. A sweep over the threads still open finds the rest, after a restart for example.

2. **Read what is expected.** Read the thread again: the queue says where to look, the reading says what is due now.

   ```ts
   import { consequitur, type Denunciation } from 'consequitur';

   type Expected = Extract<Denunciation, { kin: string }>;

   const { lines, handles } = await store.load(threadId);
   const reading = consequitur(lines, handles, schema);
   const mine = reading.denunciations.filter((d): d is Expected => 'kin' in d && d.kin === 'system');
   // [{ sort: 'line', gist: 'published', kin: 'system', line: 'sha256:…' }]
   ```

   The denunciation names the gist, not its payload. Take what the work needs from `reading.expected`, as the condition read it.

3. **Do the work so that twice is once.** The worker may stop after the work and before the line is posted; the next reading denounces the same line, and the work runs again. Make it idempotent: key it by what it acts on, a tag for a publication, or by the thread, the gist and `line`, which stay the same while nothing the condition reads changes.

4. **Post the line, as your kin, through steps 3 to 5 above.** Give it the writer of your kin that does the work, `system::tabularium` for example, and store what the post adds. The line is admitted as any line is, so its gist's `when` must hold: a refusal here means the schema expects a line it does not allow, which is the schema's fault, not the worker's.

5. **Post a failure, if the schema has a gist for it.** The line is still expected after a failure, so a retry needs nothing new: the next reading finds it. A line such as `publish_failed` keeps on the thread that the work was tried and why it failed.

Nothing in this needs a table of messages beside the thread: what is expected is a reading of the lines you stored in one transaction, so the thread is your outbox. How long a line has been expected, the engine does not say, since it reads no clock: the timestamp of the line the denunciation names is when it became expected, at the latest, and lateness is yours to judge.

## Variations

- **What a writer may post.** `offers(lines, writer, schema)` lists the gists, for a menu.
- **Preview before sending.** `dryRun(state, draft, schema, now)` gives the same answer as `post` would, with `added`, `rounds` and every `verdicts` found, and changes nothing. See [How to preview a draft](preview-a-draft.md).
- **A line expected of a person.** An `expect` may name the kin `user`. The reading then lists what a person is expected to write, and your application decides whether to remind them, wait or ignore it.
- **A thread that is not settled.** `settle(state, schema, now, policy)` goes on where a bound stopped it; the next `post` does the same.

## See also

- [Posting](../reference/posting.md): admission, the dry run, the laws, the policy, `diff` and every refusal.
- [The thread](../reference/thread.md): `stamp`, `verify`, `inOrder` and the declaration.
- [The reading](../reference/reading.md): what `consequitur` returns.
- [Offers](../reference/offers.md): `offers` and `whenHolds`.
