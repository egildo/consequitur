# Your first thread

We will build the record of a book club choosing its next book. It is a [schema](../reference/glossary.md) of three [gists](../reference/glossary.md) and a [thread](../reference/glossary.md) written against it, line by line. At the end the thread will hold a month, a set of readers, two votes and a vote closed by itself, and we will have seen a dry run, a refused line and a [goal](../reference/glossary.md) that waits and then fires.

Every step runs as a test, [`tutorial.test.ts`](../../packages/consequitur/test/tutorial.test.ts), so what the page shows is what the library does. The code of each step is dedented from that file. You need `consequitur` from npm and a place to run TypeScript.

## Step 1: read the schema

Write the schema as JSON and read it. A schema says which words the domain has and what each means.

```ts
const { schema, problems } = readSchema(
  {
    name: 'book-club',
    version: 1,
    opening: 'start',
    authority: 'system::club',
    sets: ['readers'],
    records: { value: 'value_set', join: 'joined', leave: 'left' },
    judged: [],
    guards: { reader: { is: { $writer: 'id' }, values: [{ $set: 'readers' }] } },
    gists: [
      {
        gist: 'start',
        writers: ['user'],
        rules: [
          { rule: 'value', key: 'month', from: 'month', required: true },
          { rule: 'value', key: 'status', value: 'voting' },
          { rule: 'join', set: 'readers', from: 'host', required: true },
        ],
      },
      { gist: 'join_club', writers: ['user'], rules: [{ rule: 'join', set: 'readers', from: 'reader', required: true }] },
      { gist: 'vote', writers: ['user'], rules: [{ rule: 'collect-writer', key: 'voters' }], when: { guard: 'reader' } },
      { gist: 'set_goal', writers: ['user'], rules: [{ rule: 'goal' }] },
      { gist: 'close_vote', writers: ['goal'], rules: [{ rule: 'value', key: 'status', value: 'closed' }] },
      { gist: 'value_set', writers: ['system'], rules: [] },
      { gist: 'joined', writers: ['system'], rules: [] },
      { gist: 'left', writers: ['system'], rules: [] },
    ],
    laws: [],
  },
  BASE_KIT,
);
expect(problems).toEqual([]);
```

We see no problems: `problems` is the empty list. A schema with any problem is read as an empty one, so this is the line to check first. The three gists are `start`, `join_club` and `vote`. `set_goal` and `close_vote` carry the goal and what it writes, and the last three are the [records](../reference/glossary.md) the [authority](../reference/glossary.md) writes when the thread changes what it holds. The head and the bindings are on the [schema page](../reference/schema.md).

## Step 2: an empty thread

Make a thread with no lines, and read it.

```ts
let state = emptyState(schema);
expect(state.handles).toEqual({ value: {}, set: { readers: [] } });
expect(consequitur(state.lines, state.handles, schema).denunciations).toEqual([{ sort: 'thread', rule: 'one-opening', found: 0 }]);
expect(offers(state.lines, 'user::ana', schema)).toEqual([{ gist: 'start' }]);
```

We see two [handles](../reference/glossary.md), both empty: a [value handle](../reference/glossary.md), `{}`, and a [set handle](../reference/glossary.md), whose only set, `readers`, has no members. The [reading](../reference/glossary.md) has one [denunciation](../reference/glossary.md): the thread must have exactly one line of the [opening gist](../reference/glossary.md), and it has `found: 0`. The [offers](../reference/glossary.md) of `user::ana`, a [writer](../reference/glossary.md) of kin `user`, are one gist, `start`, since nothing else may come first. See [the reading](../reference/reading.md) and [offers](../reference/offers.md).

## Step 3: a dry run before the first post

Try the opening line before it is real.

```ts
const start = { gist: 'start', writer: 'user::ana', payload: { month: 'November', host: 'ana' } } as const;
const nonce = '00112233445566778899aabbccddeeff';
const trial = await dryRun(state, start, schema, NOW, { nonce });
expect(trial.refusal).toBeUndefined();
expect(trial.added.map((line) => line.gist)).toEqual(['start', 'value_set', 'value_set', 'joined']);
expect(state.lines).toEqual([]);
```

We see no refusal. The [dry run](../reference/glossary.md) says the post would add four lines: ours, then three records, one for each key the line sets and one for the reader it adds. And `state` has no lines: a dry run keeps its result and applies nothing. `NOW` is a fixed instant, `'2026-11-02T18:00:00Z'`, because the library reads no clock, and `nonce` is a fixed value for the thread's [declaration](../reference/glossary.md), so that the ids below are the same on every run. See [posting](../reference/posting.md#dryrun).

## Step 4: post it

Now post it for real.

```ts
const opened = await post(state, start, schema, NOW, { nonce });
expect(opened.refusal).toBeUndefined();
state = opened.state;
expect(state.lines[0]?.id).toBe('sha256:650b68ceb6f85359365c02f8f1cde9de40fd06e6af44fdff21ac2bccb5ff45af');
expect(state.handles).toEqual({ value: { month: 'November', status: 'voting' }, set: { readers: ['ana'] } });
```

We see the first [line](../reference/glossary.md)'s [id](../reference/glossary.md), a hash of the line and of the thread before it. The value handle holds `month` and `status`, and `readers` holds `ana`: the line said so through its [rules](../reference/glossary.md), and the authority brought the handles to match. `post` returns a new state and changes none it is given, so we keep `opened.state`. See [`post`](../reference/posting.md#post) and [the thread](../reference/thread.md).

## Step 5: a second writer joins

Ask what `user::bruno` may write, let him join, and ask again.

```ts
expect(offers(state.lines, 'user::bruno', schema)).toEqual([{ gist: 'join_club' }, { gist: 'set_goal' }]);
const joined = await post(state, { gist: 'join_club', writer: 'user::bruno', payload: { reader: 'bruno' } }, schema, NOW);
state = joined.state;
expect(state.handles.set).toEqual({ readers: ['ana', 'bruno'] });
expect(offers(state.lines, 'user::bruno', schema)).toEqual([{ gist: 'join_club' }, { gist: 'vote' }, { gist: 'set_goal' }]);
```

We see that before he joins, Bruno is offered `join_club` and `set_goal`, and not `vote`. After, `readers` holds both names and `vote` is offered. The gist `vote` has a [`when`](../reference/glossary.md), a [condition](../reference/glossary.md) that names the [guard](../reference/glossary.md) `reader`: the writer's id must be in the set. See [conditions](../reference/conditions.md).

## Step 6: a line refused, and why

Let someone who is not a reader vote.

```ts
const stranger = await post(state, { gist: 'vote', writer: 'user::carlo', payload: {} }, schema, NOW);
expect(stranger.refusal?.code).toBe('not-now');
expect(stranger.state).toBe(state);
```

We see the code `not-now`: the `when` of `vote` is not true for Carlo, who is not in `readers`. The state we get back is the one we gave, with nothing added. Every refusal has a code and a sentence in `detail` for the developer; the codes are listed under [refusal codes](../reference/posting.md#refusal-codes).

## Step 7: the goal fires

Set a goal that waits for both votes, then vote.

```ts
const everyoneVoted = {
  name: 'everyone-voted',
  when: { all: [{ line: { gist: 'vote', writer: 'user::ana' } }, { line: { gist: 'vote', writer: 'user::bruno' } }] },
  then: 'close_vote',
};
state = (await post(state, { gist: 'set_goal', writer: 'user::ana', payload: everyoneVoted }, schema, NOW)).state;
expect(consequitur(state.lines, state.handles, schema).goals.map((goal) => goal.met)).toEqual([false]);

state = (await post(state, { gist: 'vote', writer: 'user::ana', payload: {} }, schema, NOW)).state;
expect(consequitur(state.lines, state.handles, schema).goals.map((goal) => goal.met)).toEqual([false]);
expect(state.handles.value).toEqual({ month: 'November', status: 'voting', voters: ['ana'] });

const last = await post(state, { gist: 'vote', writer: 'user::bruno', payload: {} }, schema, NOW);
state = last.state;
expect(last.added.map((line) => line.gist)).toEqual(['vote', 'close_vote', 'value_set', 'value_set']);
expect(state.handles.value).toEqual({ month: 'November', status: 'closed', voters: ['ana', 'bruno'] });
const [goal] = consequitur(state.lines, state.handles, schema).goals;
expect(goal?.met).toBe(true);
expect(goal?.outcome).toBe(last.added[1]?.id);
```

We see the goal wait. It is a line like any other, and its `when` is met only when a `vote` by each of the two is in the thread: `met` is `false` after the goal is set, and still `false` after Ana votes, while `status` stays `voting` and `voters` holds `ana`.

Then Bruno votes, and one post adds four lines: his vote, the goal's [outcome](../reference/glossary.md) `close_vote`, and a record for `voters` and one for `status`. The value handle now holds `status: 'closed'` and both voters. The goal is `met`, and its `outcome` is the id of the `close_vote` line it wrote. Nobody posted that line: the goal wrote it, once, as the writer `goal::` and the goal's id. See [goals](../reference/reading.md#goals).

## Step 8: what we built

Read the thread once more.

```ts
expect(consequitur(state.lines, state.handles, schema).settled).toBe(true);
expect(state.lines).toHaveLength(13);
```

We see `settled` is `true`: nothing the thread expects differs from what the handles hold, and no goal owes a line. The thread has thirteen lines, five we posted and eight the authority and the goal wrote, and the handles are only their reading, which could be rebuilt from the thread at any time. To go on, read how a [schema is written in KDL](../reference/kdl.md), what [the conditions](../reference/conditions.md) can say, or why [the thread is the truth](../explanation/how-it-works.md).
