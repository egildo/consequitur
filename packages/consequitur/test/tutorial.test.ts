// The lesson «Your first thread» (docs/tutorial/your-first-thread.md), run. The page quotes this
// test, step by step, so a change here is a change there. The clock is never read: every post is
// stamped at NOW, and the thread is opened with a fixed nonce, so the ids are the ones the page shows.

import { describe, expect, it } from 'vitest';
import { BASE_KIT, consequitur, dryRun, emptyState, offers, post, readSchema } from '../src/index.ts';

const NOW = '2026-11-02T18:00:00Z';

describe('your first thread', () => {
  it('walks the lesson', async () => {
    // Step 1: read the schema.
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

    // Step 2: an empty thread.
    let state = emptyState(schema);
    expect(state.handles).toEqual({ value: {}, set: { readers: [] } });
    expect(consequitur(state.lines, state.handles, schema).denunciations).toEqual([{ sort: 'thread', rule: 'one-opening', found: 0 }]);
    expect(offers(state.lines, 'user::ana', schema)).toEqual([{ gist: 'start' }]);

    // Step 3: a dry run.
    const start = { gist: 'start', writer: 'user::ana', payload: { month: 'November', host: 'ana' } } as const;
    const nonce = '00112233445566778899aabbccddeeff';
    const trial = await dryRun(state, start, schema, NOW, { nonce });
    expect(trial.refusal).toBeUndefined();
    expect(trial.added.map((line) => line.gist)).toEqual(['start', 'value_set', 'value_set', 'joined']);
    expect(state.lines).toEqual([]);

    // Step 4: post it.
    const opened = await post(state, start, schema, NOW, { nonce });
    expect(opened.refusal).toBeUndefined();
    state = opened.state;
    expect(state.lines[0]?.id).toBe('sha256:650b68ceb6f85359365c02f8f1cde9de40fd06e6af44fdff21ac2bccb5ff45af');
    expect(state.handles).toEqual({ value: { month: 'November', status: 'voting' }, set: { readers: ['ana'] } });

    // Step 5: a second writer joins.
    expect(offers(state.lines, 'user::bruno', schema)).toEqual([{ gist: 'join_club' }, { gist: 'set_goal' }]);
    const joined = await post(state, { gist: 'join_club', writer: 'user::bruno', payload: { reader: 'bruno' } }, schema, NOW);
    state = joined.state;
    expect(state.handles.set).toEqual({ readers: ['ana', 'bruno'] });
    expect(offers(state.lines, 'user::bruno', schema)).toEqual([{ gist: 'join_club' }, { gist: 'vote' }, { gist: 'set_goal' }]);

    // Step 6: a line refused.
    const stranger = await post(state, { gist: 'vote', writer: 'user::carlo', payload: {} }, schema, NOW);
    expect(stranger.refusal?.code).toBe('not-now');
    expect(stranger.state).toBe(state);

    // Step 7: the goal fires.
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

    // Step 8: what we built.
    expect(consequitur(state.lines, state.handles, schema).settled).toBe(true);
    expect(state.lines).toHaveLength(13);
  });
});
