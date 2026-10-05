// The activity thread (sibardoc-prototype, docs/next/activity-threads-round.md): a line's envelope
// and stored id, the reading order, and revoking by gist. Pure: no HTTP layer.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_KIT,
  MAX_ROUNDS,
  admit,
  canonical,
  dryRun,
  inForce,
  goalWriter,
  inOrder,
  lockedBy,
  offers,
  payloadProblem,
  post,
  readGists,
  readLaws,
  readSchema,
  reconcile,
  reduce,
  settle,
  stamp,
  validChecks,
  verify,
  whenHolds,
  type Denunciation,
  type EventLine,
  type GistSchema,
  type HandleDenunciation,
  type Handles,
  type Json,
  type LineDraft,
  type Offer,
  type Payload,
  type Reading,
  type Refusal,
  type Schema,
  type ThreadState,
  type When,
  type Writer,
} from '../src/index.ts';
import { HEAD, PLAIN, RECORD_GISTS, SIBAR, SIBAR_JSON, SYSTEM_WRITER, custom, emptyHandles, hold, membersOf, sibar, unchecked, valuesOf } from './helpers.ts';

const NOW = '2026-10-03T10:00:00.000Z';

/** One word for a denunciation: its handle kind and key (and member), or its sort. */
const labelOf = (d: Denunciation): string => (d.sort === 'handle' ? [d.kind, d.key, d.member].filter((p) => p !== undefined).join(' ') : d.sort);

/** The denunciations of one handle kind, in the order they come. */
const ofKind = (reading: Reading, kind: string) => reading.denunciations.filter((d): d is HandleDenunciation => d.sort === 'handle' && d.kind === kind);

const GISTS: GistSchema[] = [
  { gist: 'note', writers: ['user'], rules: [] },
  { gist: 'note_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['note'] }] },
  { gist: 'note_restore', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['note_revoke'] }] },
  { gist: 'fact', writers: ['system'], rules: [] },
];

const note: LineDraft = { gist: 'note', writer: 'user::mrossi', payload: { text: 'uno' } };

/** Stamps each draft against the lines before it. */
async function thread(drafts: LineDraft[], now = NOW): Promise<EventLine[]> {
  const lines: EventLine[] = [];
  for (const draft of drafts) lines.push(await stamp(draft, lines, now));
  return lines;
}

const idsOf = (lines: EventLine[]) => lines.map((l) => l.id);

describe('canonical', () => {
  it('gives one string for two key orders, at every depth', () => {
    const a = { b: 1, a: { y: [1, { q: 1, p: 2 }], x: null } };
    const b = { a: { x: null, y: [1, { p: 2, q: 1 }] }, b: 1 };
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical(a)).toBe('{"a":{"x":null,"y":[1,{"p":2,"q":1}]},"b":1}');
  });

  it('keeps array order and tells values apart', () => {
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
    expect(canonical('1')).not.toBe(canonical(1));
    expect(canonical(null)).toBe('null');
  });
});

describe('stamp', () => {
  it('chains: the first previous is null, the second is the first id', async () => {
    const [first, second] = await thread([note, note]);
    expect(first.previous).toBeNull();
    expect(second.previous).toBe(first.id);
    expect(first.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats an instant inside a thread', async () => {
    const [first, second, third] = await thread([note, note, note]);
    expect(first.timestamp).toBe(NOW);
    expect(second.timestamp).toBe('2026-10-03T10:00:00.001Z');
    expect(third.timestamp).toBe('2026-10-03T10:00:00.002Z');
  });

  it('does the same when now has no milliseconds', async () => {
    const [first, second] = await thread([note, note], '2026-10-03T10:00:00Z');
    expect(first.timestamp).toBe('2026-10-03T10:00:00.000Z');
    expect(second.timestamp).toBe('2026-10-03T10:00:00.001Z');
  });

  it('takes now as it is when it is later than the thread', async () => {
    const [first] = await thread([note]);
    const later = await stamp(note, [first], '2026-10-03T10:00:05.000Z');
    expect(later.timestamp).toBe('2026-10-03T10:00:05.000Z');
  });

  it('keeps a payload with nested objects, numbers and unread keys as given', async () => {
    const payload = { n: 1.5, deep: { list: [1, 'two', null, { k: true }], empty: {} }, unread: 'x' };
    const line = await stamp({ gist: 'note', writer: 'user::mrossi', payload }, [], NOW);
    expect(line.payload).toEqual(payload);
    expect(await verify(line)).toBe(true);
  });

  it('chains to the last line in reading order, not the last of the array', async () => {
    const lines = await thread([note, note, note]);
    const next = await stamp(note, [...lines].reverse(), NOW);
    expect(next.previous).toBe(lines[2].id);
    expect(next.timestamp).toBe('2026-10-03T10:00:00.003Z');
    expect(next).toEqual(await stamp(note, lines, NOW));
  });

  it('stores the payload as JSON holds it, so a line verifies after a JSON round trip', async () => {
    // what a host may hand over whatever the type says: values JSON drops or writes otherwise
    const payload = { text: 'a', gone: undefined, at: new Date(0), run: () => 1, n: Number.NaN } as unknown as Payload;
    const line = await stamp({ gist: 'note', writer: 'user::mrossi', payload }, [], NOW);
    expect(Object.keys(line.payload)).toEqual(['text', 'at', 'n']);
    expect(line.payload).toEqual({ text: 'a', at: '1970-01-01T00:00:00.000Z', n: null });
    expect(await verify(line)).toBe(true);
    expect(await verify(JSON.parse(JSON.stringify(line)) as EventLine)).toBe(true);
  });

  it('changes none of its arguments', async () => {
    const lines = await thread([note]);
    const copy = structuredClone(lines);
    const draft: LineDraft = { gist: 'note', writer: 'user::mrossi', payload: { b: 1, a: 2 } };
    const draftCopy = structuredClone(draft);
    await stamp(draft, lines, NOW);
    expect(lines).toEqual(copy);
    expect(draft).toEqual(draftCopy);
  });
});

describe('verify', () => {
  it('is true on a stamped line and false once any field changes', async () => {
    const [first, second] = await thread([note, note]);
    expect(await verify(second)).toBe(true);
    expect(await verify({ ...second, previous: null })).toBe(false);
    expect(await verify({ ...second, previous: first.previous })).toBe(false);
    expect(await verify({ ...second, gist: 'fact' })).toBe(false);
    expect(await verify({ ...second, writer: 'user::lbianchi' })).toBe(false);
    expect(await verify({ ...second, timestamp: NOW })).toBe(false);
    expect(await verify({ ...second, payload: { text: 'due' } })).toBe(false);
    expect(await verify({ ...second, id: first.id })).toBe(false);
  });
});

describe('a stored id', () => {
  it('does not change when lines are added after it or the array is reordered', async () => {
    const [first] = await thread([note]);
    const longer = await thread([note, note, note]);
    expect(longer[0].id).toBe(first.id);
    const reversed = [...longer].reverse();
    expect(idsOf(reversed)).toEqual(idsOf(longer).reverse());
    for (const line of reversed) expect(await verify(line)).toBe(true);
  });
});

describe('inOrder', () => {
  it('gives the same result from a reversed array, and leaves the argument alone', async () => {
    const lines = await thread([note, note, note, note]);
    const reversed = [...lines].reverse();
    const before = idsOf(reversed);
    expect(idsOf(inOrder(reversed))).toEqual(idsOf(lines));
    expect(idsOf(reversed)).toEqual(before);
  });

  it('breaks a tie by id, in either order', async () => {
    const [a, b] = await thread([note, { ...note, payload: { text: 'due' } }]);
    const tied = { ...b, timestamp: a.timestamp };
    const [low, high] = a.id < tied.id ? [a, tied] : [tied, a];
    expect(idsOf(inOrder([a, tied]))).toEqual([low.id, high.id]);
    expect(idsOf(inOrder([tied, a]))).toEqual([low.id, high.id]);
  });
});

describe('inForce', () => {
  const revoke = (gist: string, target: string): LineDraft => ({ gist, writer: 'user::mrossi', payload: { target } });

  it('a revoke takes the note out, a restore of it puts the note back, a second revoke takes it out again', async () => {
    const [n] = await thread([note]);
    const alone = inForce([n], GISTS);
    expect(idsOf(alone.inForce)).toEqual([n.id]);
    expect(alone.revoked).toEqual([]);

    const withRevoke = await thread([note]).then(async (l) => [...l, await stamp(revoke('note_revoke', n.id), l, NOW)]);
    const [, r] = withRevoke;
    expect(idsOf(inForce(withRevoke, GISTS).inForce)).toEqual([r.id]);
    expect(idsOf(inForce(withRevoke, GISTS).revoked)).toEqual([n.id]);

    const withRestore = [...withRevoke, await stamp(revoke('note_restore', r.id), withRevoke, NOW)];
    const [, , s] = withRestore;
    expect(idsOf(inForce(withRestore, GISTS).inForce)).toEqual([n.id, s.id]);
    expect(idsOf(inForce(withRestore, GISTS).revoked)).toEqual([r.id]);

    const again = [...withRestore, await stamp(revoke('note_revoke', n.id), withRestore, NOW)];
    const [, , , r2] = again;
    expect(idsOf(inForce(again, GISTS).inForce)).toEqual([s.id, r2.id]);
    expect(idsOf(inForce(again, GISTS).revoked)).toEqual([n.id, r.id]);

    // the same from a reversed array, in reading order
    expect(inForce([...again].reverse(), GISTS)).toEqual(inForce(again, GISTS));
  });

  it('a revoke that names a fact, a stranger id or a number revokes nothing', async () => {
    const lines = await thread([{ gist: 'fact', writer: 'system::sibardoc', payload: {} }, note]);
    const [fact] = lines;
    for (const target of [fact.id, 'f'.repeat(64), 7]) {
      const all = [...lines, await stamp({ gist: 'note_revoke', writer: 'user::mrossi', payload: { target } }, lines, NOW)];
      expect(inForce(all, GISTS)).toEqual({ inForce: inOrder(all), revoked: [] });
    }
  });

  it('a revoke names only an earlier line', async () => {
    const [n] = await thread([note]);
    const early = { ...(await stamp(revoke('note_revoke', n.id), [], NOW)), timestamp: '2000-01-01T00:00:00.000Z' };
    expect(inForce([n, early], GISTS).revoked).toEqual([]);
  });

  it('a gist without a schema is in force; the first schema and the first revoke binding are read', async () => {
    const odd: GistSchema[] = [
      { gist: 'note_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['note'] }, { rule: 'revoke', from: 'other', gists: ['fact'] }] },
      { gist: 'note_revoke', writers: ['user'], rules: [] },
    ];
    const [n] = await thread([note]);
    const r = await stamp({ gist: 'note_revoke', writer: 'user::mrossi', payload: { target: n.id } }, [n], NOW);
    const unknown = await stamp({ gist: 'mystery', writer: 'user::mrossi', payload: {} }, [n, r], NOW);
    const read = inForce([n, r, unknown], odd);
    expect(idsOf(read.revoked)).toEqual([n.id]);
    expect(idsOf(read.inForce)).toEqual([r.id, unknown.id]);
  });

  it('changes none of its arguments', async () => {
    const lines = await thread([note, note]);
    const copy = structuredClone(lines);
    const gists = structuredClone(GISTS);
    inForce([...lines].reverse(), gists);
    expect(lines).toEqual(copy);
    expect(gists).toEqual(GISTS);
  });
});

describe('the opening gist', () => {
  it('is named by the schema: in the case, create', () => {
    expect(SIBAR.opening).toBe('create');
  });
});

describe('reduce', () => {
  // gist schemas of the reduction, written here: the case's gists belong to a later step
  const RULES = custom([
    {
      gist: 'create',
      writers: ['user'],
      rules: [
        { rule: 'value', key: 'name', from: 'name', required: true },
        { rule: 'value', key: 'status', value: 'open' },
        { rule: 'join', set: 'assignees', from: 'assignTo', required: true },
      ],
    },
    { gist: 'memo', writers: ['user'], rules: [{ rule: 'join', set: 'assignees', from: 'assignTo' }] },
    { gist: 'memo_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['memo'] }] },
    { gist: 'memo_restore', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['memo_revoke'] }] },
    { gist: 'setk', writers: ['user'], rules: [{ rule: 'value', key: 'k', from: 'v' }] },
    { gist: 'setk_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['setk'] }] },
    { gist: 'quit', writers: ['user'], rules: [{ rule: 'leave', set: 'assignees' }] },
    { gist: 'got_it', writers: ['user'], rules: [] },
    { gist: 'proof', writers: ['user'], rules: [] },
    { gist: 'proof_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['proof'] }] },
    { gist: 'fact', writers: ['system'], rules: [] },
    { gist: 'goal', writers: ['user'], rules: [{ rule: 'goal' }] },
    { gist: 'done', writers: ['goal', 'user'], rules: [{ rule: 'value', key: 'status', value: 'closed' }] },
  ]);

  const by = (writer: Writer, gist: string, payload: LineDraft['payload']): LineDraft => ({ gist, writer, payload });
  const mrossi = (gist: string, payload: LineDraft['payload']) => by('user::mrossi', gist, payload);
  const lbianchi = (gist: string, payload: LineDraft['payload']) => by('user::lbianchi', gist, payload);
  const create = mrossi('create', { name: 'Parere', assignTo: ['mrossi'] });

  const empty: Handles = emptyHandles();
  const agreeing: Handles = hold({ name: 'Parere', status: 'open' }, ['mrossi']);
  const read = (lines: EventLine[], handles: Handles = empty): Reading => reduce(lines, handles, RULES);
  const add = async (lines: EventLine[], draft: LineDraft): Promise<EventLine[]> => [...lines, await stamp(draft, lines, NOW)];
  const last = (lines: EventLine[]) => lines[lines.length - 1];

  it('a create with a name and one user, against empty handles, gives three denunciations; agreeing handles settle', async () => {
    const [c] = await thread([create]);
    const reading = read([c]);
    expect(reading.denunciations).toStrictEqual([
      { sort: 'handle', kind: 'value', key: 'name', expected: 'Parere', line: c.id },
      { sort: 'handle', kind: 'value', key: 'status', expected: 'open', line: c.id },
      { sort: 'handle', kind: 'set', key: 'assignees', member: 'mrossi', expected: true, line: c.id },
    ]);
    expect(reading.settled).toBe(false);
    expect(reading.expected).toEqual(agreeing);
    expect(reading.inForce).toEqual([c.id]);
    expect(reading.revoked).toEqual([]);

    const settled = read([c], agreeing);
    expect(settled.denunciations).toEqual([]);
    expect(settled.settled).toBe(true);
  });

  it('is both ways: what no line expects is denounced, with no line and nothing expected', async () => {
    const lines = await thread([create]);
    const reading = read(lines, hold({ ...valuesOf(agreeing), stray: 1 }, ['mrossi', 'zed']));
    expect(reading.denunciations).toStrictEqual([
      { sort: 'handle', kind: 'value', key: 'stray', found: 1 },
      { sort: 'handle', kind: 'set', key: 'assignees', member: 'zed', expected: false },
    ]);
  });

  it('a differing value carries both sides and the line that expects it', async () => {
    const lines = await thread([create]);
    const reading = read(lines, hold({ name: 'Altro', status: 'open' }, ['mrossi']));
    expect(reading.denunciations).toStrictEqual([{ sort: 'handle', kind: 'value', key: 'name', expected: 'Parere', found: 'Altro', line: lines[0].id }]);
  });

  it('the later line wins, and a reversed array reads the same', async () => {
    const lines = await thread([create, mrossi('setk', { v: 1 }), mrossi('setk', { v: 2 })]);
    const reading = read(lines);
    expect(valuesOf(reading.expected).k).toBe(2);
    expect(reading.denunciations).toContainEqual({ sort: 'handle', kind: 'value', key: 'k', expected: 2, line: lines[2].id });
    expect(read([...lines].reverse())).toEqual(reading);
  });

  it('a value can be a number or an object; the same object in another key order agrees', async () => {
    const lines = await thread([create, mrossi('setk', { v: { b: [1, { y: 1, x: 2 }], a: 2.5 } })]);
    const agree = hold({ ...valuesOf(agreeing), k: { a: 2.5, b: [1, { x: 2, y: 1 }] } }, ['mrossi']);
    expect(read(lines, agree).settled).toBe(true);
    const other = hold({ ...valuesOf(agreeing), k: { a: 2.5, b: [{ x: 2, y: 1 }, 1] } }, ['mrossi']);
    expect(read(lines, other).settled).toBe(false);
    const number = await add([lines[0]], mrossi('setk', { v: 7 }));
    expect(valuesOf(read(number).expected).k).toBe(7);
  });

  it('a value key that holds null is a value; an absent key states nothing', async () => {
    const lines = await thread([create, mrossi('setk', { v: null }), mrossi('setk', { other: 1 })]);
    expect(valuesOf(read(lines).expected).k).toBeNull();
    expect(read(lines, hold({ ...valuesOf(agreeing), k: null }, ['mrossi'])).settled).toBe(true);
    const absent = await thread([create, mrossi('setk', { other: 1 })]);
    expect('k' in valuesOf(read(absent).expected)).toBe(false);
  });

  it('join reads a string and a list of strings; a number or a mixed list states nothing', async () => {
    const lines = await thread([
      create,
      mrossi('memo', { assignTo: 'lbianchi' }),
      mrossi('memo', { assignTo: ['abc', 'def'] }),
      mrossi('memo', { assignTo: 7 }),
      mrossi('memo', { assignTo: ['ghi', 1] }),
      mrossi('memo', { assignTo: null }),
      mrossi('memo', {}),
    ]);
    expect(membersOf(read(lines).expected)).toEqual(['abc', 'def', 'lbianchi', 'mrossi']);
  });

  it('a user keeps the line that asked first', async () => {
    const lines = await thread([create, mrossi('memo', { assignTo: ['mrossi', 'lbianchi'] })]);
    const asking = ofKind(read(lines), 'set');
    expect(asking).toEqual([
      { sort: 'handle', kind: 'set', key: 'assignees', member: 'lbianchi', expected: true, line: lines[1].id },
      { sort: 'handle', kind: 'set', key: 'assignees', member: 'mrossi', expected: true, line: lines[0].id },
    ]);
  });

  it('revoking a line withdraws its expectations; revoking that revoke restores them', async () => {
    const withMemo = await thread([create, mrossi('memo', { assignTo: ['lbianchi'] })]);
    const memo = last(withMemo);
    expect(membersOf(read(withMemo).expected)).toEqual(['lbianchi', 'mrossi']);

    const revoked = await add(withMemo, mrossi('memo_revoke', { target: memo.id }));
    expect(membersOf(read(revoked).expected)).toEqual(['mrossi']);
    expect(read(revoked).revoked).toEqual([memo.id]);

    const restored = await add(revoked, mrossi('memo_restore', { target: last(revoked).id }));
    expect(membersOf(read(restored).expected)).toEqual(['lbianchi', 'mrossi']);
    expect(read(restored).revoked).toEqual([last(revoked).id]);
  });

  it('revoking a line that set a value withdraws its value, and the earlier one stands again', async () => {
    const lines = await thread([create, mrossi('setk', { v: 1 }), mrossi('setk', { v: 2 })]);
    expect(valuesOf(read(lines).expected).k).toBe(2);
    const revoked = await add(lines, mrossi('setk_revoke', { target: lines[2].id }));
    expect(valuesOf(read(revoked).expected).k).toBe(1);
    const both = await add(revoked, mrossi('setk_revoke', { target: lines[1].id }));
    expect('k' in valuesOf(read(both).expected)).toBe(false);
  });

  it('leave removes the line writer and nobody else; a later join asks for them again', async () => {
    const asked = await thread([create, mrossi('memo', { assignTo: ['lbianchi'] })]);
    const quit = await add(asked, lbianchi('quit', {}));
    expect(membersOf(read(quit).expected)).toEqual(['mrossi']);
    expect(read(quit, hold(valuesOf(agreeing), ['mrossi', 'lbianchi'])).denunciations).toEqual([
      { sort: 'handle', kind: 'set', key: 'assignees', member: 'lbianchi', expected: false },
    ]);

    const again = await add(quit, mrossi('memo', { assignTo: ['lbianchi'] }));
    expect(membersOf(read(again).expected)).toEqual(['lbianchi', 'mrossi']);
    expect(read(again).denunciations).toContainEqual({ sort: 'handle', kind: 'set', key: 'assignees', member: 'lbianchi', expected: true, line: last(again).id });
  });

  it('a writer with no separator leaves nobody', async () => {
    const lines = await thread([create]);
    const odd = await stamp({ gist: 'quit', writer: 'mrossi' as Writer, payload: {} }, lines, NOW);
    expect(membersOf(read([...lines, odd]).expected)).toEqual(['mrossi']);
  });

  describe('goals', () => {
    const checks: Json[] = [
      { gist: 'got_it', writer: 'user::lbianchi' },
      { gist: 'fact', kin: 'system', payload: { document: '34' } },
    ];
    const goalLine = mrossi('goal', { name: 'closing', then: 'done', checks });
    const gotIt = lbianchi('got_it', {});
    const fact = by('system::sibardoc', 'fact', { document: '34', signedAt: 'x' });
    const closed: Handles = hold({ name: 'Parere', status: 'closed' }, ['mrossi']);

    it('is unmet with one check found and met with both', async () => {
      const lines = await thread([create, goalLine]);
      const none = read(lines, agreeing);
      expect(none.goals).toEqual([
        { line: lines[1].id, name: 'closing', then: 'done', checks: [{ check: checks[0] }, { check: checks[1] }], met: false, final: false },
      ]);
      expect(none.goals[0].checks.every((c) => !('foundIn' in c))).toBe(true);
      expect('outcome' in none.goals[0]).toBe(false);

      const one = await add(lines, gotIt);
      expect(read(one, agreeing).goals[0].checks).toEqual([{ check: checks[0], foundIn: last(one).id }, { check: checks[1] }]);
      expect(read(one, agreeing).goals[0].met).toBe(false);
      expect(read(one, agreeing).settled).toBe(true);

      const both = await add(one, fact);
      expect(read(both, agreeing).goals[0].met).toBe(true);
      expect(read(both, agreeing).goals[0].checks.map((c) => c.foundIn)).toEqual([one[2].id, last(both).id]);
    });

    it('a check matches on kin alone, on writer, and on a payload key', async () => {
      const lines = await thread([create, fact, gotIt]);
      const goalOf = async (check: Json) => {
        const all = await add(lines, mrossi('goal', { name: 'g', then: 'done', checks: [check] }));
        return read(all).goals[0];
      };
      expect((await goalOf({ kin: 'system' })).checks[0].foundIn).toBe(lines[1].id);
      expect((await goalOf({ writer: 'user::lbianchi' })).checks[0].foundIn).toBe(lines[2].id);
      expect((await goalOf({ payload: { signedAt: 'x' } })).checks[0].foundIn).toBe(lines[1].id);
      expect((await goalOf({ kin: 'user', gist: 'got_it' })).checks[0].foundIn).toBe(lines[2].id);
      // the first line in reading order wins
      expect((await goalOf({ kin: 'user' })).checks[0].foundIn).toBe(lines[0].id);
      // a key the payload lacks does not match; a value is compared by canonical form
      expect((await goalOf({ payload: { missing: null } })).met).toBe(false);
      expect((await goalOf({ payload: { document: '34', extra: 1 } })).met).toBe(false);
    });

    it('compares payload values by their canonical form', async () => {
      const lines = await thread([create, mrossi('proof', { deep: { b: 1, a: [2, 3] } })]);
      const all = await add(lines, mrossi('goal', { name: 'g', then: 'done', checks: [{ payload: { deep: { a: [2, 3], b: 1 } } }] }));
      expect(read(all).goals[0].met).toBe(true);
    });

    it('the goal line never satisfies its own check', async () => {
      const lines = await thread([create, mrossi('goal', { name: 'g', then: 'done', checks: [{ gist: 'goal' }] })]);
      const [goal] = read(lines).goals;
      expect(goal.met).toBe(false);
      expect('foundIn' in goal.checks[0]).toBe(false);
      // another goal line can satisfy it
      const other = await add(lines, mrossi('goal', { name: 'h', then: 'done', checks: [{ gist: 'goal' }] }));
      expect(read(other).goals.map((g) => [g.name, g.met])).toEqual([['g', true], ['h', true]]);
    });

    it('a met goal with no outcome is one line denunciation; with the outcome in force, none', async () => {
      const lines = await thread([create, goalLine, gotIt, fact]);
      const goalId = lines[1].id;
      const missing = read(lines, agreeing);
      expect(missing.denunciations).toStrictEqual([{ sort: 'line', gist: 'done', writer: goalWriter(goalId), line: goalId, payload: {} }]);
      expect(missing.goals[0].met).toBe(true);

      const outcome = await add(lines, by(goalWriter(goalId), 'done', {}));
      const satisfied = read(outcome, closed);
      expect(satisfied.denunciations).toEqual([]);
      expect(satisfied.goals[0].outcome).toBe(last(outcome).id);
    });

    it('an outcome written by another writer is not the goal outcome, whatever its payload', async () => {
      const lines = await thread([create, goalLine, gotIt, fact]);
      const goalId = lines[1].id;
      const stranger = await add(lines, mrossi('done', {}));
      expect(read(stranger, closed).goals[0].outcome).toBeUndefined();
      const withPayload = await add(lines, by(goalWriter(goalId), 'done', { anything: [1, 2] }));
      expect(read(withPayload, closed).goals[0].outcome).toBe(last(withPayload).id);
    });

    it('revoking a line a check had found leaves the goal unmet and the outcome in force, with no denunciation', async () => {
      const proofGoal = mrossi('goal', { name: 'g', then: 'done', checks: [{ gist: 'proof' }] });
      const base = await thread([create, proofGoal, mrossi('proof', {})]);
      const goalId = base[1].id;
      const withOutcome = await add(base, by(goalWriter(goalId), 'done', {}));
      expect(read(withOutcome, closed).goals[0].met).toBe(true);
      expect(read(withOutcome, closed).settled).toBe(true);

      const revoked = await add(withOutcome, mrossi('proof_revoke', { target: base[2].id }));
      const reading = read(revoked, closed);
      expect(reading.goals[0].met).toBe(false);
      expect(reading.goals[0].outcome).toBe(withOutcome[3].id);
      expect(reading.inForce).toContain(withOutcome[3].id);
      expect(reading.denunciations).toEqual([]);
    });

    it('of two goals of one name only the later is read', async () => {
      const lines = await thread([
        create,
        mrossi('goal', { name: 'g', then: 'done', checks: [{ gist: 'nothing' }] }),
        mrossi('goal', { name: 'g', then: 'done', checks: [{ gist: 'create' }] }),
      ]);
      const reading = read(lines, closed);
      expect(reading.goals.map((g) => [g.line, g.met])).toEqual([[lines[2].id, true]]);
    });

    it('goals come in name order', async () => {
      const lines = await thread([
        create,
        mrossi('goal', { name: 'b', then: 'done', checks: [{ gist: 'nothing' }] }),
        mrossi('goal', { name: 'a', then: 'done', checks: [{ gist: 'nothing' }] }),
      ]);
      expect(read(lines).goals.map((g) => g.name)).toEqual(['a', 'b']);
    });

    it('does not throw on a goal that is not readable: it states nothing', async () => {
      const bad: Array<LineDraft['payload']> = [
        {},
        { name: 'g', then: 'done' },
        { name: 'g', then: 'done', checks: [] },
        { name: 'g', then: 'done', checks: 'got_it' },
        { name: 'g', then: 'done', checks: [null] },
        { name: 'g', then: 'done', checks: [[]] },
        { name: 'g', then: 'done', checks: [{}] },
        { name: 'g', then: 'done', checks: [{ gist: 'x', color: 'red' }] },
        { name: 'g', then: 'done', checks: [{ gist: 7 }] },
        { name: 'g', then: 'done', checks: [{ payload: {} }] },
        { name: 'g', then: 'done', checks: [{ payload: [1] }] },
        { name: 7, then: 'done', checks: [{ gist: 'x' }] },
        { name: 'g', then: null, checks: [{ gist: 'x' }] },
      ];
      for (const payload of bad) {
        const lines = await thread([create, mrossi('goal', payload)]);
        const reading = read(lines, agreeing);
        expect(reading.goals).toEqual([]);
        expect(reading.settled).toBe(true);
      }
    });

    it('an unreadable later goal does not take the place of a readable one', async () => {
      const lines = await thread([create, goalLine, mrossi('goal', { name: 'closing' })]);
      expect(read(lines, agreeing).goals.map((g) => g.line)).toEqual([lines[1].id]);
    });
  });

  describe('validChecks', () => {
    it('accepts a non-empty list of checks that state something and nothing else', () => {
      expect(validChecks([{ gist: 'a' }])).toBe(true);
      expect(validChecks([{ kin: 'a' }, { writer: 'user::a' }, { payload: { k: null } }, { gist: 'a', kin: 'b', writer: 'c::d', payload: { k: 1 } }])).toBe(true);
    });

    it('refuses everything else', () => {
      for (const value of [undefined, null, 'a', 7, {}, [], [1], [null], [[]], [{}], [{ gist: 1 }], [{ payload: {} }], [{ payload: null }], [{ payload: [] }], [{ gist: 'a', other: 1 }], [{ gist: 'a' }, {}]]) {
        expect(validChecks(value)).toBe(false);
      }
    });
  });

  describe('the rest', () => {
    it('no opening line, and two, each denounce one-opening with the count', async () => {
      const none = await thread([mrossi('memo', { assignTo: ['mrossi'] })]);
      expect(read(none).denunciations[0]).toStrictEqual({ sort: 'thread', rule: 'one-opening', found: 0 });
      expect(read([]).denunciations).toStrictEqual([{ sort: 'thread', rule: 'one-opening', found: 0 }]);

      const two = await thread([create, create]);
      expect(read(two, agreeing).denunciations).toStrictEqual([{ sort: 'thread', rule: 'one-opening', found: 2 }]);
    });

    it('a line whose gist has no schema is in force and states nothing', async () => {
      const lines = await thread([create, mrossi('mystery', { assignTo: ['x'], v: 1 })]);
      const reading = read(lines, agreeing);
      expect(reading.inForce).toContain(lines[1].id);
      expect(reading.settled).toBe(true);
    });

    it('lists denunciations in the fixed order: thread, line, then each handle kind in the kit\'s order', async () => {
      const lines = await thread([
        mrossi('goal', { name: 'b', then: 'done', checks: [{ gist: 'got_it' }] }),
        mrossi('goal', { name: 'a', then: 'done', checks: [{ gist: 'got_it' }] }),
        lbianchi('got_it', {}),
      ]);
      const reading = read(lines, hold({ z: 1, a: 1 }, ['z', 'a']));
      expect(reading.denunciations.map((d) => (d.sort === 'handle' ? d.kind : d.sort))).toEqual(['thread', 'line', 'line', 'value', 'value', 'set', 'set']);
      expect(reading.denunciations.filter((d) => d.sort === 'line').map((d) => d.line)).toEqual([lines[1].id, lines[0].id]);
      expect(ofKind(reading, 'value').map((d) => d.key)).toEqual(['a', 'z']);
      expect(ofKind(reading, 'set').map((d) => d.member)).toEqual(['a', 'z']);
    });

    it('sorts the expected members of a set with <, not by locale', async () => {
      const lines = await thread([create, mrossi('memo', { assignTo: ['b', 'B', 'a', 'Z'] })]);
      expect(membersOf(read(lines).expected)).toEqual(['B', 'Z', 'a', 'b', 'mrossi']);
    });

    it('changes none of its arguments, and a reversed array reads the same', async () => {
      const lines = await thread([create, mrossi('memo', { assignTo: ['lbianchi'] }), mrossi('goal', { name: 'g', then: 'done', checks: [{ gist: 'create' }] })]);
      const handles: Handles = hold({ stray: { a: 1 } }, ['z']);
      const linesCopy = structuredClone(lines);
      const handlesCopy = structuredClone(handles);
      // the kit holds functions, which cannot be cloned: the gists are what the reduction reads
      const gists = structuredClone(RULES.gists);
      const reading = reduce(lines, handles, { ...RULES, gists });
      expect(lines).toEqual(linesCopy);
      expect(handles).toEqual(handlesCopy);
      expect(gists).toEqual(RULES.gists);
      expect(reduce([...lines].reverse(), handles, RULES)).toEqual(reading);
    });
  });
});

describe('a value that collects, and where', () => {
  const by = (writer: Writer, gist: string, payload: LineDraft['payload']): LineDraft => ({ gist, writer, payload });
  const mrossi = (gist: string, payload: LineDraft['payload']) => by('user::mrossi', gist, payload);
  const create = mrossi('create', { name: 'A', assignTo: ['mrossi'] });
  const settledHandles = (extra: Record<string, Json>): Handles => hold({ name: 'A', status: 'open', ...extra }, ['mrossi']);
  const none: Handles = hold({}, []);
  const expectedOf = (lines: EventLine[], schema: Schema = PLAIN) => valuesOf(reduce(lines, none, schema).expected);
  const ref = (document: Json | undefined, direction?: string) =>
    mrossi('doc_ref', { ...(document === undefined ? {} : { document }), ...(direction ? { direction } : {}) });

  // test-only gists: what a later binding does to a collected key, and `where` on the other forms
  const TEST = sibar({
    laws: [],
    add: [
    { gist: 'setk', writers: ['user'], rules: [{ rule: 'value', key: 'documents', from: 'v' }] },
    { gist: 'setv', writers: ['user'], rules: [{ rule: 'value', key: 'documents', value: 'fixed' }] },
    {
      gist: 'tag',
      writers: ['user'],
      rules: [
        { rule: 'value', key: 'tag', value: 'x', where: { kind: 'a' } },
        { rule: 'value', key: 'copy', from: 'v', where: { kind: 'a' } },
        { rule: 'value', key: 'deep', value: 1, where: { meta: { a: 1, b: 2 }, kind: 'a' } },
      ],
    },
    ],
  });

  it('three references, one inbound and two outbound, give three lists in reading order; a reversed array reads the same', async () => {
    const lines = await thread([create, ref('1', 'inbound'), ref('2', 'outbound'), ref('3', 'outbound')]);
    const copy = structuredClone(lines);
    const reading = reduce(lines, none, PLAIN);
    expect(valuesOf(reading.expected)).toEqual({
      name: 'A',
      status: 'open',
      documents: ['1', '2', '3'],
      documents_in: ['1'],
      documents_out: ['2', '3'],
    });
    expect(reduce([...lines].reverse(), none, PLAIN)).toEqual(reading);
    expect(lines).toEqual(copy);
    expect(reduce(lines, settledHandles({ documents: ['1', '2', '3'], documents_in: ['1'], documents_out: ['2', '3'] }), PLAIN).settled).toBe(true);
  });

  it('an array is compared by its canonical form: the order counts', async () => {
    const lines = await thread([create, ref('1', 'outbound'), ref('2', 'outbound')]);
    const handles = settledHandles({ documents: ['2', '1'], documents_out: ['1', '2'] });
    const { denunciations } = reduce(lines, handles, PLAIN);
    expect(denunciations).toStrictEqual([{ sort: 'handle', kind: 'value', key: 'documents', expected: ['1', '2'], found: ['2', '1'], line: lines[2].id }]);
  });

  it('the same document referenced twice appears once, and the denunciation carries the last line that added', async () => {
    const lines = await thread([create, ref('1', 'inbound'), ref('2'), ref('1', 'outbound')]);
    const expected = expectedOf(lines);
    expect(expected.documents).toEqual(['1', '2']);
    expect(expected.documents_in).toEqual(['1']);
    expect(expected.documents_out).toEqual(['1']);
    const lineOf = (key: string) => reduce(lines, none, PLAIN).denunciations.find((d) => d.sort === 'handle' && d.kind === 'value' && d.key === key);
    // the second reference to document 1 added nothing to `documents`, so line 2 stands
    expect(lineOf('documents')).toMatchObject({ line: lines[2].id });
    expect(lineOf('documents_in')).toMatchObject({ line: lines[1].id });
    expect(lineOf('documents_out')).toMatchObject({ line: lines[3].id });
  });

  it('a reference with no direction, or another one, is in documents only', async () => {
    const lines = await thread([create, ref('1'), ref('2', 'sideways')]);
    const expected = expectedOf(lines);
    expect(expected.documents).toEqual(['1', '2']);
    expect('documents_in' in expected).toBe(false);
    expect('documents_out' in expected).toBe(false);
  });

  it('a key no line in force states is not expected, never an empty list', async () => {
    const expected = expectedOf(await thread([create]));
    expect('documents' in expected).toBe(false);
    expect(reduce(await thread([create]), settledHandles({}), PLAIN).settled).toBe(true);
  });

  it('an absent payload key adds nothing, and null is a value', async () => {
    const lines = await thread([create, mrossi('doc_ref', { direction: 'inbound' })]);
    const expected = expectedOf(lines);
    expect('documents' in expected).toBe(false);
    expect('documents_in' in expected).toBe(false);
    expect(expectedOf(await thread([create, ref(null, 'inbound')])).documents_in).toEqual([null]);
    expect(expectedOf(await thread([create, ref('1'), mrossi('doc_ref', {})])).documents).toEqual(['1']);
  });

  it('values are told apart by their canonical form', async () => {
    const lines = await thread([create, ref({ b: 1, a: 2 }), ref({ a: 2, b: 1 }), ref(1), ref('1')]);
    expect(expectedOf(lines).documents).toEqual([{ b: 1, a: 2 }, 1, '1']);
  });

  it('revoking a reference takes its document off every list, and revoking that revoke gives it back', async () => {
    const lines = await thread([create, ref('1', 'inbound'), ref('2', 'outbound'), ref('3', 'outbound')]);
    const revoke = await stamp(mrossi('doc_ref_revoke', { target: lines[2].id }), lines, NOW);
    const expected = expectedOf([...lines, revoke]);
    expect(expected.documents).toEqual(['1', '3']);
    expect(expected.documents_in).toEqual(['1']);
    expect(expected.documents_out).toEqual(['3']);
    const both = [...lines, revoke, await stamp(mrossi('doc_ref_revoke', { target: lines[1].id }), [...lines, revoke], NOW)];
    expect(expectedOf(both).documents).toEqual(['3']);
    expect('documents_in' in expectedOf(both)).toBe(false);
  });

  it('revoking the only reference leaves no documents key expected, and the reconciliation removes it from the handles', async () => {
    const empty: ThreadState = { lines: [], handles: hold({}, []) };
    const created = await post(empty, create, PLAIN, NOW);
    const referenced = await post(created.state, ref('1', 'inbound'), PLAIN, NOW);
    expect(referenced.refusal).toBeUndefined();
    expect(valuesOf(referenced.state.handles)).toEqual({ name: 'A', status: 'open', documents: ['1'], documents_in: ['1'] });

    const target = referenced.state.lines.find((l) => l.gist === 'doc_ref')!.id;
    const revoked = await post(referenced.state, mrossi('doc_ref_revoke', { target }), PLAIN, NOW);
    expect(revoked.refusal).toBeUndefined();
    expect(valuesOf(revoked.reading.expected)).toEqual({ name: 'A', status: 'open' });
    expect(valuesOf(revoked.state.handles)).toEqual({ name: 'A', status: 'open' });
    expect(revoked.reading.settled).toBe(true);
    const records = revoked.state.lines.slice(referenced.state.lines.length);
    expect(records.map((l) => l.gist)).toEqual(['doc_ref_revoke', 'metadata_set', 'metadata_set']);
    expect(records.slice(1).map((l) => l.payload)).toEqual([{ key: 'documents' }, { key: 'documents_in' }]);
  });

  it('a later from binding replaces a collected list with one value, and a collect after it starts a new list', async () => {
    const lines = await thread([create, ref('1'), ref('2'), mrossi('setk', { v: 'one' })]);
    expect(expectedOf(lines, TEST).documents).toBe('one');
    expect(reduce(lines, none, TEST).denunciations).toContainEqual({ sort: 'handle', kind: 'value', key: 'documents', expected: 'one', line: lines[3].id });
    const again = await thread([create, ref('1'), ref('2'), mrossi('setk', { v: 'one' }), ref('3'), ref('4')]);
    expect(expectedOf(again, TEST).documents).toEqual(['3', '4']);
    // a from binding whose key is absent states nothing, so the list stands
    const absent = await thread([create, ref('1'), mrossi('setk', { other: 1 })]);
    expect(expectedOf(absent, TEST).documents).toEqual(['1']);
  });

  it('a later value binding replaces a collected list with one value, and a collect after it starts a new list', async () => {
    const lines = await thread([create, ref('1'), mrossi('setv', {})]);
    expect(expectedOf(lines, TEST).documents).toBe('fixed');
    const again = await thread([create, ref('1'), mrossi('setv', {}), ref('2')]);
    expect(expectedOf(again, TEST).documents).toEqual(['2']);
    // a collect with no value before it starts a list as well
    expect(expectedOf(await thread([create, mrossi('setv', {}), ref('1'), ref('1')]), TEST).documents).toEqual(['1']);
  });

  const tagged = async (payload: LineDraft['payload']) => expectedOf(await thread([create, mrossi('tag', payload)]), TEST);

  it('where: a value binding applies only when the payload holds the value', async () => {
    expect((await tagged({ kind: 'a' })).tag).toBe('x');
    expect('tag' in (await tagged({ kind: 'b' }))).toBe(false);
    expect('tag' in (await tagged({}))).toBe(false);
    expect('tag' in (await tagged({ kind: null }))).toBe(false);
  });

  it('where: a from binding applies only when it matches, and states nothing otherwise', async () => {
    expect((await tagged({ kind: 'a', v: 5 })).copy).toBe(5);
    expect('copy' in (await tagged({ kind: 'b', v: 5 }))).toBe(false);
    expect('copy' in (await tagged({ v: 5 }))).toBe(false);
  });

  it('where: every key must match, compared by canonical form', async () => {
    expect((await tagged({ kind: 'a', meta: { b: 2, a: 1 } })).deep).toBe(1);
    expect('deep' in (await tagged({ kind: 'a', meta: { a: 1 } }))).toBe(false);
    expect('deep' in (await tagged({ meta: { a: 1, b: 2 } }))).toBe(false);
  });

  it('where on a collect binding reads the direction as it is, whatever its shape', async () => {
    // a direction that is not the string `inbound` or `outbound` matches neither list
    const lines = await thread([create, mrossi('doc_ref', { document: '1', direction: 5 }), mrossi('doc_ref', { document: '2', direction: ['inbound'] })]);
    const expected = expectedOf(lines);
    expect(expected.documents).toEqual(['1', '2']);
    expect('documents_in' in expected).toBe(false);
  });

  it('never throws on a binding or a payload it cannot read', async () => {
    // the reader would refuse this binding, so the schema is built without it
    const odd = unchecked([...PLAIN.gists, { gist: 'odd', writers: ['user'], rules: [{ rule: 'value', key: 'k', collect: 'v', where: null }] }]);
    const lines = await thread([create, mrossi('odd', { v: 1 })]);
    expect(() => reduce(lines, none, odd)).not.toThrow();
    expect('k' in expectedOf(lines, odd)).toBe(false);
  });
});

describe('readGists', () => {
  const good = { gist: 'memo', writers: ['user'], rules: [] };
  const other = (rules: unknown[], extra: Record<string, unknown> = {}) => ({ gist: 'other', writers: ['user'], rules, ...extra });
  const readOf = (value: unknown) => readGists(value, BASE_KIT, HEAD);

  it('reads the case: nineteen gists, no problem', () => {
    const { gists, problems } = readOf(SIBAR_JSON.gists);
    expect(problems).toEqual([]);
    expect(gists).toHaveLength(19);
    expect(gists).toEqual(SIBAR_JSON.gists);
    expect(SIBAR.gists).toEqual(gists);
  });

  const bad: Array<[string, unknown]> = [
    ['a rule word that does not exist', other([{ rule: 'compare' }])],
    ['a binding with a key it does not have', other([{ rule: 'leave', set: 'assignees', from: 'x' }])],
    ['a binding without a key it needs', other([{ rule: 'join' }])],
    ['a binding that is not an object', other(['join'])],
    ['a join that names a set the schema does not declare', other([{ rule: 'join', set: 'owners', from: 'x' }])],
    ['a leave that names a set the schema does not declare', other([{ rule: 'leave', set: 'owners' }])],
    ['a join whose set is not a string', other([{ rule: 'join', set: 1, from: 'x' }])],
    ['a value binding with both from and value', other([{ rule: 'value', key: 'k', from: 'v', value: 1 }])],
    ['a value binding with neither', other([{ rule: 'value', key: 'k' }])],
    ['a value binding with required beside value', other([{ rule: 'value', key: 'k', value: 1, required: true }])],
    ['a value binding with both collect and from', other([{ rule: 'value', key: 'k', collect: 'v', from: 'v' }])],
    ['a value binding with both collect and value', other([{ rule: 'value', key: 'k', collect: 'v', value: 1 }])],
    ['a value collect that is not a string', other([{ rule: 'value', key: 'k', collect: 1 }])],
    ['a value binding with an empty where', other([{ rule: 'value', key: 'k', collect: 'v', where: {} }])],
    ['a value where that is a list', other([{ rule: 'value', key: 'k', value: 1, where: ['a'] }])],
    ['a value where that holds something that is not JSON', other([{ rule: 'value', key: 'k', from: 'v', where: { a: undefined } }])],
    ['a where on a binding that is not a value rule', other([{ rule: 'join', set: 'assignees', from: 'x', where: { a: 1 } }])],
    ['a value value that is not JSON', other([{ rule: 'value', key: 'k', value: undefined }])],
    ['a required that is not a boolean', other([{ rule: 'join', set: 'assignees', from: 'x', required: 'yes' }])],
    ['a revoke with an empty gists', other([{ rule: 'revoke', from: 'target', gists: [] }])],
    ['a revoke that lists a gist the array lacks', other([{ rule: 'revoke', from: 'target', gists: ['absent'] }])],
    ['a revoke that lists something that is not a string', other([{ rule: 'revoke', from: 'target', gists: [1] }])],
    ['two revoke bindings', other([{ rule: 'revoke', from: 'a', gists: ['memo'] }, { rule: 'revoke', from: 'b', gists: ['memo'] }])],
    ['two goal bindings', other([{ rule: 'goal' }, { rule: 'goal' }])],
    ['empty writers', { gist: 'other', writers: [], rules: [] }],
    ['writers that are not strings', { gist: 'other', writers: [1], rules: [] }],
    ['rules that are not a list', { gist: 'other', writers: ['user'], rules: {} }],
    ['a gist named Memo', { gist: 'Memo', writers: ['user'], rules: [] }],
    ['a gist name of thirty-three characters', { gist: 'a'.repeat(33), writers: ['user'], rules: [] }],
    ['a key the schema does not have', other([], { label: 'x' })],
    ['a when with a key it does not have', other([], { when: { after: 'x' } })],
    ['a when whose in is not a name', other([], { when: { in: false } })],
    ['a when whose in names a set the schema does not declare', other([], { when: { in: 'owners' } })],
    ['a when whose values are empty', other([], { when: { values: {} } })],
    ['a when whose values are not an object', other([], { when: { values: ['open'] } })],
    ['a when whose values hold something that is not JSON', other([], { when: { values: { status: undefined } } })],
    ['the old words of a when', other([], { when: { assignee: true } })],
    ['a when with checks that are empty', other([], { when: { checks: [] } })],
    ['a when with a check that states nothing', other([], { when: { checks: [{}] } })],
    ['a when that is a list', other([], { when: [] })],
    ['a when that is null', other([], { when: null })],
    ['a schema without its rules', { gist: 'other', writers: ['user'] }],
    ['an element that is a string', 'memo'],
    ['an element that is null', null],
  ];

  it.each(bad)('%s: one problem, and the good schema is kept', (_, element) => {
    const { gists, problems } = readOf([good, element]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^[A-Za-z]/);
    expect(gists).toEqual([good]);
  });

  it('names the gist the problem is about', () => {
    expect(readOf([good, other([{ rule: 'compare' }])]).problems[0]).toContain('other');
  });

  it('the same gist twice: the first is kept, the second is a problem', () => {
    const second = { gist: 'memo', writers: ['system'], rules: [] };
    const { gists, problems } = readOf([good, second]);
    expect(gists).toEqual([good]);
    expect(problems).toHaveLength(1);
  });

  it('a revoke may list a gist that comes later in the array', () => {
    const revoke = { gist: 'memo_revoke', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['memo'] }] };
    expect(readOf([revoke, good])).toEqual({ gists: [revoke, good], problems: [] });
  });

  it('the first of two schemas of one gist is the one that stands, even when it failed', () => {
    const { gists, problems } = readOf([{ gist: 'memo', writers: [], rules: [] }, good]);
    expect(gists).toEqual([]);
    expect(problems).toHaveLength(2);
  });

  it('accepts the shapes a binding may have', () => {
    const ok = other([
      { rule: 'value', key: 'a', value: null },
      { rule: 'value', key: 'b', value: { deep: [1, 'x', false] } },
      { rule: 'value', key: 'c', from: 'c', required: false },
      { rule: 'value', key: 'd', collect: 'd', required: true },
      { rule: 'value', key: 'e', collect: 'e', where: { direction: 'inbound', n: [1, null] } },
      { rule: 'value', key: 'f', from: 'f', required: true, where: { kind: 'x' } },
      { rule: 'value', key: 'g', value: 1, where: { kind: 'x' } },
      { rule: 'join', set: 'assignees', from: 'who', required: true },
      { rule: 'leave', set: 'assignees' },
      { rule: 'goal' },
    ]);
    expect(readOf([ok])).toEqual({ gists: [ok], problems: [] });
  });

  it('accepts a when with any of its three parts, or none', () => {
    const whens = [
      {},
      { in: 'assignees' },
      { values: { status: 'open', n: 1, deep: { k: [null] } } },
      { checks: [{ gist: 'memo' }, { kin: 'system', payload: { x: 1 } }] },
      { checks: [{ gist: 'memo' }], in: 'assignees', values: { status: 'open' } },
    ];
    for (const when of whens) {
      const ok = other([], { when });
      expect(readOf([ok])).toEqual({ gists: [ok], problems: [] });
    }
  });

  it('a value that is not an array gives no gist and one problem', () => {
    for (const value of ['memo', 7, null, undefined, {}, { gist: 'memo', writers: ['user'], rules: [] }]) {
      const { gists, problems } = readOf(value);
      expect(gists).toEqual([]);
      expect(problems).toHaveLength(1);
    }
  });

  it('never throws, whatever it is given', () => {
    const odd = [undefined, 3, [], { gist: {} }, { gist: 'x', writers: ['u'], rules: [null] }, { gist: 'y', writers: ['u'], rules: [{ rule: {} }] }];
    const { gists, problems } = readOf(odd);
    expect(gists).toEqual([]);
    expect(problems).toHaveLength(odd.length);
  });

  it('changes nothing it is given', () => {
    const value = structuredClone(SIBAR_JSON.gists);
    readOf(value);
    expect(value).toEqual(SIBAR_JSON.gists);
  });
});

describe('posting to a thread', () => {
  const EMPTY: ThreadState = { lines: [], handles: hold({}, []) };
  const by = (writer: Writer, gist: string, payload: LineDraft['payload']): LineDraft => ({ gist, writer, payload });
  const mrossi = (gist: string, payload: LineDraft['payload']) => by('user::mrossi', gist, payload);
  const lbianchi = (gist: string, payload: LineDraft['payload']) => by('user::lbianchi', gist, payload);
  const gistsOf = (lines: EventLine[]) => lines.map((l) => l.gist);
  const gistNamed = (lines: EventLine[], gist: string) => lines.filter((l) => l.gist === gist);

  describe('the scenario', () => {
    type Posted = Awaited<ReturnType<typeof post>>;

    /** Egildo's case, line by line, each posted to the state the one before left. */
    async function replay(goalExtra: LineDraft['payload'] = {}): Promise<Posted[]> {
      const out: Posted[] = [];
      let state = EMPTY;
      const step = async (draft: LineDraft): Promise<void> => {
        const posted = await post(state, draft, PLAIN, NOW);
        out.push(posted);
        state = posted.state;
      };
      await step(mrossi('create', { name: 'Richiesta parere', assignTo: ['mrossi'] }));
      await step(mrossi('memo', { text: 'Serve un parere', assignTo: ['lbianchi'] }));
      const memoId = gistNamed(state.lines, 'memo')[0].id;
      await step(lbianchi('doc_ref', { document: '34132412', direction: 'outbound', about: memoId }));
      await step(
        mrossi('set_goal', {
          name: 'done',
          then: 'closed',
          checks: [
            { gist: 'got_it', writer: 'user::lbianchi', payload: { about: memoId } },
            { gist: 'doc_signed', kin: 'system', payload: { document: '34132412' } },
          ],
          ...goalExtra,
        }),
      );
      await step(lbianchi('got_it', { about: memoId }));
      await step(lbianchi('quit', {}));
      await step(mrossi('memo', { text: 'Ancora una cosa', assignTo: ['lbianchi'] }));
      await step(by(SYSTEM_WRITER, 'doc_signed', { document: '34132412', signedAt: '2026-09-30' }));
      return out;
    }

    it('settles after every line as the brief reads', async () => {
      const [create, memo, link, goal, gotIt, quit, memoAgain, signed] = await replay();
      for (const posted of [create, memo, link, goal, gotIt, quit, memoAgain, signed]) {
        expect('refusal' in posted).toBe(false);
        expect(posted.reading).toEqual(reduce(posted.state.lines, posted.state.handles, PLAIN));
      }

      // 1. name and status open; mrossi; two metadata_set and one assigned
      expect(create.state.handles).toEqual(hold({ name: 'Richiesta parere', status: 'open' }, ['mrossi']));
      expect(create.reading.settled).toBe(true);
      expect(gistsOf(create.state.lines)).toEqual(['create', 'metadata_set', 'metadata_set', 'assigned']);
      expect(create.state.lines.slice(1).map((l) => [l.writer, l.payload])).toEqual([
        [SYSTEM_WRITER, { key: 'name', value: 'Richiesta parere' }],
        [SYSTEM_WRITER, { key: 'status', value: 'open' }],
        [SYSTEM_WRITER, { set: 'assignees', member: 'mrossi', line: create.state.lines[0].id }],
      ]);

      // 2. lbianchi and mrossi
      expect(membersOf(memo.state.handles)).toEqual(['lbianchi', 'mrossi']);
      expect(memo.reading.settled).toBe(true);
      expect(gistsOf(memo.state.lines.slice(4))).toEqual(['memo', 'assigned']);
      expect(memo.state.lines[5].payload).toEqual({ set: 'assignees', member: 'lbianchi', line: memo.state.lines[4].id });

      // 3. metadata documents and documents_out, and no documents_in
      expect(valuesOf(link.state.handles)).toEqual({
        name: 'Richiesta parere',
        status: 'open',
        documents: ['34132412'],
        documents_out: ['34132412'],
      });
      expect('documents_in' in valuesOf(link.state.handles)).toBe(false);
      expect(link.reading.settled).toBe(true);
      expect(gistsOf(link.state.lines.slice(6))).toEqual(['doc_ref', 'metadata_set', 'metadata_set']);
      expect(link.state.lines.slice(7).map((l) => l.payload)).toEqual([
        { key: 'documents', value: ['34132412'] },
        { key: 'documents_out', value: ['34132412'] },
      ]);

      // 4. the goal is read, unmet, no check found
      expect(goal.reading.settled).toBe(true);
      expect(goal.reading.goals).toHaveLength(1);
      expect(goal.reading.goals[0]).toMatchObject({ name: 'done', then: 'closed', met: false });
      expect(goal.reading.goals[0].checks.map((c) => 'foundIn' in c)).toEqual([false, false]);
      expect('outcome' in goal.reading.goals[0]).toBe(false);
      expect(goal.state.handles).toEqual(link.state.handles);
      expect(gistsOf(goal.state.lines.slice(9))).toEqual(['set_goal']);

      // 5. acknowledged; unmet, one check found
      const memoId = memo.state.lines[4].id;
      expect(valuesOf(gotIt.state.handles).acknowledged).toBe(memoId);
      expect(gotIt.reading.goals[0].met).toBe(false);
      expect(gotIt.reading.goals[0].checks.map((c) => c.foundIn)).toEqual([gotIt.state.lines[10].id, undefined]);
      expect(gotIt.reading.settled).toBe(true);

      // 6. mrossi alone; the record is unassigned
      expect(membersOf(quit.state.handles)).toEqual(['mrossi']);
      expect(gistsOf(quit.state.lines.slice(12))).toEqual(['quit', 'unassigned']);
      expect(quit.state.lines[13].payload).toEqual({ set: 'assignees', member: 'lbianchi' });
      expect(quit.reading.settled).toBe(true);

      // 7. lbianchi again; a new assigned record
      expect(membersOf(memoAgain.state.handles)).toEqual(['lbianchi', 'mrossi']);
      expect(gistsOf(memoAgain.state.lines.slice(14))).toEqual(['memo', 'assigned']);
      expect(memoAgain.state.lines[15].payload).toEqual({ set: 'assignees', member: 'lbianchi', line: memoAgain.state.lines[14].id });
      expect(memoAgain.reading.settled).toBe(true);

      // 8. the goal is met; a closed line by the goal; status closed; both stay; settled
      const goalId = goal.state.lines[9].id;
      const [closed] = gistNamed(signed.state.lines, 'closed');
      expect(signed.reading.goals).toHaveLength(1);
      expect(signed.reading.goals[0]).toMatchObject({ line: goalId, met: true, outcome: closed.id });
      expect(signed.reading.goals[0].checks.every((c) => 'foundIn' in c)).toBe(true);
      expect(closed.writer).toBe(`goal::${goalId}`);
      expect(closed.payload).toEqual({});
      expect(valuesOf(signed.state.handles).status).toBe('closed');
      expect(membersOf(signed.state.handles)).toEqual(['lbianchi', 'mrossi']);
      expect(signed.reading.settled).toBe(true);
      expect(signed.reading.denunciations).toEqual([]);
      expect(gistsOf(signed.state.lines.slice(16))).toEqual(['doc_signed', 'closed', 'metadata_set']);
    });

    it('every line of the final thread passes verify, and each previous is the line before it', async () => {
      const { state } = (await replay()).at(-1)!;
      expect(state.lines).toHaveLength(19);
      for (const line of state.lines) expect(await verify(line)).toBe(true);
      expect(state.lines[0].previous).toBeNull();
      state.lines.slice(1).forEach((line, i) => expect(line.previous).toBe(state.lines[i].id));
      const stamps = state.lines.map((l) => l.timestamp);
      expect(stamps).toEqual([...stamps].sort());
      expect(new Set(stamps).size).toBe(stamps.length);
    });

    it('reduce on the final state is settled; with the handles emptied it denounces each, and settle brings them back', async () => {
      const { state } = (await replay()).at(-1)!;
      expect(reduce(state.lines, state.handles, PLAIN).settled).toBe(true);

      const emptied: ThreadState = { lines: state.lines, handles: hold({}, []) };
      const reading = reduce(emptied.lines, emptied.handles, PLAIN);
      expect(reading.denunciations.map(labelOf)).toEqual([
        'value acknowledged',
        'value documents',
        'value documents_out',
        'value name',
        'value status',
        'set assignees lbianchi',
        'set assignees mrossi',
      ]);

      const back = await settle(emptied, PLAIN, NOW);
      expect(back.reading.settled).toBe(true);
      expect(back.state.handles).toEqual(state.handles);
      expect(back.state.lines).toHaveLength(state.lines.length + 7);
      for (const line of back.state.lines) expect(await verify(line)).toBe(true);
    });

    it('a memo_revoke of the memo, from the state after the second line, takes lbianchi off', async () => {
      const [, memo] = await replay();
      const target = memo.state.lines[4].id;
      const out = await post(memo.state, mrossi('memo_revoke', { target }), PLAIN, NOW);
      expect(out.refusal).toBeUndefined();
      expect(membersOf(out.state.handles)).toEqual(['mrossi']);
      expect(gistsOf(out.state.lines.slice(6))).toEqual(['memo_revoke', 'unassigned']);
      expect(out.reading.revoked).toEqual([target]);
      expect(out.reading.settled).toBe(true);
    });

    describe('reopening, from the final state', () => {
      const finalOf = async () => (await replay()).at(-1)!.state;

      it('revoking the goal and then the closed line gives status open', async () => {
        const state = await finalOf();
        const goal = gistNamed(state.lines, 'set_goal')[0];
        const closed = gistNamed(state.lines, 'closed')[0];

        const first = await post(state, mrossi('set_goal_revoke', { target: goal.id }), PLAIN, NOW);
        expect(first.refusal).toBeUndefined();
        expect(first.reading.goals).toEqual([]);
        // a line that no goal expects is never denounced: the closed line stands
        expect(valuesOf(first.state.handles).status).toBe('closed');
        expect(first.reading.settled).toBe(true);

        const second = await post(first.state, mrossi('closed_revoke', { target: closed.id }), PLAIN, NOW);
        expect(second.refusal).toBeUndefined();
        expect(valuesOf(second.state.handles).status).toBe('open');
        expect(second.reading.settled).toBe(true);
      });

      it('revoking the closed line alone ends open: the goal has written its line, and does not write it again', async () => {
        const state = await finalOf();
        const closed = gistNamed(state.lines, 'closed')[0];

        const out = await post(state, mrossi('closed_revoke', { target: closed.id }), PLAIN, NOW);
        expect(out.refusal).toBeUndefined();
        expect(valuesOf(out.state.handles).status).toBe('open');
        expect(out.reading.settled).toBe(true);
        expect(out.reading.denunciations).toEqual([]);
        expect(out.reading.revoked).toEqual([closed.id]);
        expect(gistNamed(out.state.lines, 'closed')).toHaveLength(1);
        expect(out.reading.goals[0]).toMatchObject({ met: true, outcome: closed.id, outcomeRevoked: true });
      });

      it('a goal posted again, with the same name, is a new line with a new writer: it closes the activity again', async () => {
        const state = await finalOf();
        const goal = gistNamed(state.lines, 'set_goal')[0];
        const closed = gistNamed(state.lines, 'closed')[0];
        const reopened = await post(state, mrossi('set_goal_revoke', { target: goal.id }), PLAIN, NOW);
        const open = await post(reopened.state, mrossi('closed_revoke', { target: closed.id }), PLAIN, NOW);
        expect(valuesOf(open.state.handles).status).toBe('open');

        const again = await post(open.state, { ...mrossi('set_goal', goal.payload) }, PLAIN, NOW);
        expect(again.refusal).toBeUndefined();
        const renewed = gistNamed(again.state.lines, 'closed').filter((l) => l.id !== closed.id);
        expect(renewed).toHaveLength(1);
        expect(renewed[0].writer).toBe(`goal::${gistNamed(again.state.lines, 'set_goal').at(-1)!.id}`);
        expect(valuesOf(again.state.handles).status).toBe('closed');
        expect(again.reading.settled).toBe(true);
        expect(again.reading.goals[0]).toMatchObject({ met: true, outcome: renewed[0].id });
        expect(again.reading.goals[0].outcomeRevoked).toBeUndefined();
      });
    });

    describe('goals that are final, carry an outcome, and warn', () => {
      /** Posts each draft to the state the one before left, as a test of its own. */
      async function run(drafts: LineDraft[], from: ThreadState = EMPTY): Promise<Posted[]> {
        const out: Posted[] = [];
        let state = from;
        for (const draft of drafts) {
          const posted = await post(state, draft, PLAIN, NOW);
          out.push(posted);
          state = posted.state;
        }
        return out;
      }
      const opening = [mrossi('create', { name: 'A', assignTo: ['mrossi'] })];
      const goalOf = (state: ThreadState) => gistNamed(state.lines, 'set_goal').at(-1)!;
      const names = (list: Offer[]) => list.map((o) => o.gist);

      describe('final', () => {
        const finalOf = async () => (await replay({ final: true })).at(-1)!.state;

        it('the goal closes the activity, and the closed line cannot be revoked', async () => {
          const state = await finalOf();
          const closed = gistNamed(state.lines, 'closed')[0];
          expect(valuesOf(state.handles).status).toBe('closed');
          expect(lockedBy(closed, state.lines)).toBe(gistNamed(state.lines, 'set_goal')[0].id);
          expect(reduce(state.lines, state.handles, PLAIN).goals[0]).toMatchObject({ final: true, met: true, outcome: closed.id });
          // not offered, and posted anyway it is refused
          expect(names(offers(state.lines, 'user::mrossi', PLAIN))).toEqual(['comment', 'set_goal_revoke', 'quit']);
          const before = structuredClone(state);
          const out = await post(state, mrossi('closed_revoke', { target: closed.id }), PLAIN, NOW);
          expect(out.refusal?.code).toBe('not-revocable');
          expect(out.refusal?.detail).toMatch(/written by a final goal/);
          expect(out.state).toEqual(before);
          expect(admit(state.lines, mrossi('closed_revoke', { target: closed.id }), PLAIN)?.code).toBe('not-revocable');
        });

        it('a revoke already in the thread, stamped past admission, revokes nothing', async () => {
          const state = await finalOf();
          const closed = gistNamed(state.lines, 'closed')[0];
          const lines = [...state.lines, await stamp(mrossi('closed_revoke', { target: closed.id }), state.lines, NOW)];
          const reading = reduce(lines, state.handles, PLAIN);
          expect(reading.inForce).toContain(closed.id);
          expect(reading.inForce).toContain(lines[lines.length - 1].id);
          expect(reading.revoked).not.toContain(closed.id);
          expect(valuesOf(reading.expected).status).toBe('closed');
          expect(reading.goals[0].outcomeRevoked).toBeUndefined();
          expect(reading.settled).toBe(true);
        });

        it('revoking the final goal leaves its line locked', async () => {
          const state = await finalOf();
          const goal = gistNamed(state.lines, 'set_goal')[0];
          const closed = gistNamed(state.lines, 'closed')[0];
          const out = await post(state, mrossi('set_goal_revoke', { target: goal.id }), PLAIN, NOW);
          expect(out.refusal).toBeUndefined();
          expect(out.reading.goals).toEqual([]);
          expect(out.reading.revoked).toEqual([goal.id]);
          expect(lockedBy(closed, out.state.lines)).toBe(goal.id);
          expect(names(offers(out.state.lines, 'user::mrossi', PLAIN))).not.toContain('closed_revoke');
          expect((await post(out.state, mrossi('closed_revoke', { target: closed.id }), PLAIN, NOW)).refusal?.code).toBe('not-revocable');
          expect(valuesOf(out.state.handles).status).toBe('closed');
        });

        it('only a line a final goal wrote is locked', async () => {
          const state = await finalOf();
          const goal = gistNamed(state.lines, 'set_goal')[0];
          const closed = gistNamed(state.lines, 'closed')[0];
          expect(lockedBy(goal, state.lines)).toBeUndefined();
          // a goal that is not final, an unknown goal, a writer of another kin, a final that is not true
          const soft = (await replay()).at(-1)!.state;
          expect(lockedBy(gistNamed(soft.lines, 'closed')[0], soft.lines)).toBeUndefined();
          expect(lockedBy({ ...closed, writer: 'goal::nothing' }, state.lines)).toBeUndefined();
          expect(lockedBy({ ...closed, writer: `user::${goal.id}` }, state.lines)).toBeUndefined();
          expect(lockedBy({ ...closed, writer: 'goal' as Writer }, state.lines)).toBeUndefined();
          const lines = await thread([opening[0], mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'create' }], final: 'true' })]);
          const written = await stamp(by(goalWriter(lines[1].id), 'closed', {}), lines, NOW);
          expect(lockedBy(written, [...lines, written])).toBeUndefined();
        });
      });

      describe('with', () => {
        const goalPost = (payload: LineDraft['payload']) => mrossi('set_goal', { name: 'g', checks: [{ gist: 'create' }], ...payload });

        it('a goal that writes a memo assigns whom the memo names, with the payload it states', async () => {
          const [, out] = await run([...opening, goalPost({ then: 'memo', with: { text: 'Protocolla', assignTo: ['gverdi'] } })]);
          expect(out.refusal).toBeUndefined();
          const goal = goalOf(out.state);
          const [memo] = gistNamed(out.state.lines, 'memo');
          expect(memo.writer).toBe(`goal::${goal.id}`);
          expect(memo.payload).toEqual({ text: 'Protocolla', assignTo: ['gverdi'] });
          expect(membersOf(out.state.handles)).toEqual(['gverdi', 'mrossi']);
          expect(out.reading.settled).toBe(true);
          expect(out.reading.goals[0]).toMatchObject({ met: true, outcome: memo.id, with: { text: 'Protocolla', assignTo: ['gverdi'] }, final: false });
        });

        it('a goal that writes a stage sets the value', async () => {
          const [, out] = await run([...opening, goalPost({ then: 'stage', with: { stage: 'firma' } })]);
          expect(out.refusal).toBeUndefined();
          expect(valuesOf(out.state.handles)).toEqual({ name: 'A', status: 'open', stage: 'firma' });
          expect(gistNamed(out.state.lines, 'stage')[0].payload).toEqual({ stage: 'firma' });
          expect(out.reading.settled).toBe(true);
        });

        it('a goal with no `with` states none, and is not final', async () => {
          const [, out] = await run([...opening, goalPost({ then: 'closed' })]);
          expect('with' in out.reading.goals[0]).toBe(false);
          expect(out.reading.goals[0].final).toBe(false);
          expect(gistNamed(out.state.lines, 'closed')[0].payload).toEqual({});
        });

        it.each<[string, LineDraft['payload']]>([
          ['a stage with no `with`: its key is required', { then: 'stage' }],
          ['a stage with an empty `with`', { then: 'stage', with: {} }],
          ['a `with` that is not an object', { then: 'memo', with: 'x' }],
          ['a `with` that is null', { then: 'memo', with: null }],
          ['a `with` that is a list', { then: 'memo', with: [1] }],
          ['a `with` that does not fit the gist it is for', { then: 'memo', with: { assignTo: 5 } }],
          ['a `final` that is not a boolean', { then: 'closed', final: 'yes' }],
          ['an outcome that revokes', { then: 'memo_revoke' }],
          ['an outcome that is a goal', { then: 'set_goal', with: { name: 'h', checks: [{ gist: 'create' }], then: 'closed' } }],
          ['an outcome a goal may not write', { then: 'comment' }],
          ['an outcome only the mechanic writes', { then: 'goal_warning', with: { check: 0 } }],
        ])('refuses %s', async (_label, payload) => {
          const [created] = await run(opening);
          const before = structuredClone(created.state);
          const out = await post(created.state, goalPost(payload), PLAIN, NOW);
          expect(out.refusal?.code).toBe('invalid-payload');
          expect(out.state).toEqual(before);
        });

        it('a goal that states a `with` or a `final` it cannot, reads as no goal', async () => {
          for (const payload of [{ with: 'x' }, { with: null }, { with: [] }]) {
            const lines = await thread([opening[0], mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'create' }], ...payload })]);
            expect(reduce(lines, hold({ name: 'A', status: 'open' }, ['mrossi']), PLAIN).goals).toEqual([]);
          }
          // `final` is read only when it is exactly true
          const lines = await thread([opening[0], mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'create' }], final: 1 })]);
          expect(reduce(lines, hold({}, []), PLAIN).goals[0].final).toBe(false);
        });
      });

      describe('payloadProblem', () => {
        const schema = (rules: GistSchema['rules']): GistSchema => ({ gist: 'g', writers: ['user'], rules });

        it('is undefined for a payload the rules accept, and free keys are accepted', () => {
          expect(payloadProblem(PLAIN, schema([]), { any: 1 })).toBeUndefined();
          expect(payloadProblem(PLAIN, schema([{ rule: 'join', set: 'assignees', from: 'to', required: true }]), { to: ['a'], free: null })).toBeUndefined();
          expect(payloadProblem(PLAIN, schema([{ rule: 'value', key: 'k', value: 1 }]), {})).toBeUndefined();
        });

        it('says in English which key is wrong', () => {
          expect(payloadProblem(PLAIN, schema([{ rule: 'join', set: 'assignees', from: 'to', required: true }]), {})).toBe('The key "to" is required in a "g" line.');
          expect(payloadProblem(PLAIN, schema([{ rule: 'join', set: 'assignees', from: 'to' }]), { to: 3 })).toBe('The key "to" must hold a string or a list of strings in a "g" line.');
          expect(payloadProblem(PLAIN, schema([{ rule: 'value', key: 'k', from: 'v', required: true }]), {})).toBe('The key "v" is required in a "g" line.');
          expect(payloadProblem(PLAIN, schema([{ rule: 'revoke', from: 'target', gists: ['x'] }]), { target: 3 })).toBe('The key "target" must hold a line id in a "g" line.');
        });

        it('does not ask for a key whose `where` the payload does not match', () => {
          const rules: GistSchema['rules'] = [{ rule: 'value', key: 'k', collect: 'v', required: true, where: { d: 'in' } }];
          expect(payloadProblem(PLAIN, schema(rules), { d: 'out' })).toBeUndefined();
          expect(payloadProblem(PLAIN, schema(rules), { d: 'in' })).toMatch(/"v" is required/);
        });
      });

      describe('warnings', () => {
        /** The scenario up to the goal row, which is the fourth post. */
        const afterGoal = async () => (await replay())[3].state;
        const warningsOf = (lines: EventLine[]) => gistNamed(lines, 'goal_warning');
        const documentCheck = (reading: Reading) => reading.goals[0].checks[1];

        it('the scenario of the brief writes no warning: both checks stay anchored', async () => {
          for (const posted of await replay()) {
            expect(warningsOf(posted.state.lines)).toEqual([]);
            expect(posted.reading.goals.every((g) => g.checks.every((c) => !('orphan' in c)))).toBe(true);
          }
        });

        it('revoking the reference orphans the document check, writes one warning, and the goal stays', async () => {
          const state = await afterGoal();
          const reference = gistNamed(state.lines, 'doc_ref')[0];
          const goal = goalOf(state);
          const out = await post(state, mrossi('doc_ref_revoke', { target: reference.id }), PLAIN, NOW);
          expect(out.refusal).toBeUndefined();
          expect(documentCheck(out.reading)).toMatchObject({ orphan: true });
          expect('orphan' in out.reading.goals[0].checks[0]).toBe(false);
          expect(out.reading.goals[0].line).toBe(goal.id);
          const [warning] = warningsOf(out.state.lines);
          expect(warningsOf(out.state.lines)).toHaveLength(1);
          expect(warning).toMatchObject({ writer: `goal::${goal.id}`, payload: { check: 1 } });
          expect(out.reading.settled).toBe(true);
          expect(out.reading.denunciations).toEqual([]);
          expect(out.reading.inForce).toContain(goal.id);
        });

        it('an anchored check is not orphaned again, and an orphaned one writes nothing more', async () => {
          const state = await afterGoal();
          const reference = gistNamed(state.lines, 'doc_ref')[0];
          const orphaned = await post(state, mrossi('doc_ref_revoke', { target: reference.id }), PLAIN, NOW);

          const anchoredAgain = await post(orphaned.state, lbianchi('doc_ref', { document: '34132412', direction: 'outbound' }), PLAIN, NOW);
          expect(anchoredAgain.refusal).toBeUndefined();
          expect('orphan' in documentCheck(anchoredAgain.reading)).toBe(false);
          expect(warningsOf(anchoredAgain.state.lines)).toHaveLength(1);

          const second = gistNamed(anchoredAgain.state.lines, 'doc_ref').at(-1)!;
          const orphanedAgain = await post(anchoredAgain.state, mrossi('doc_ref_revoke', { target: second.id }), PLAIN, NOW);
          expect(documentCheck(orphanedAgain.reading)).toMatchObject({ orphan: true });
          expect(warningsOf(orphanedAgain.state.lines)).toHaveLength(1);
          expect(orphanedAgain.reading.settled).toBe(true);
        });

        it('a revoked warning is still written once: nothing writes it again', async () => {
          const state = await afterGoal();
          const reference = gistNamed(state.lines, 'doc_ref')[0];
          const orphaned = await post(state, mrossi('doc_ref_revoke', { target: reference.id }), PLAIN, NOW);
          const before = orphaned.state.lines.length;
          const again = await settle(orphaned.state, PLAIN, NOW);
          expect(again.state.lines).toHaveLength(before);
          expect(PLAIN.gists.find((g) => g.gist === 'goal_warning')!.rules.some((r) => r.rule === 'revoke')).toBe(false);
        });

        it('revoking the memo a check names orphans it, when no line in force holds its id any more', async () => {
          const [created, memo] = await run([...opening, mrossi('memo', { text: 'Serve un parere', assignTo: ['lbianchi'] })]);
          const id = gistNamed(memo.state.lines, 'memo')[0].id;
          const goalSet = await post(memo.state, mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'got_it', writer: 'user::lbianchi', payload: { about: id } }] }), PLAIN, NOW);
          expect('orphan' in goalSet.reading.goals[0].checks[0]).toBe(false);
          const revoked = await post(goalSet.state, mrossi('memo_revoke', { target: id }), PLAIN, NOW);
          expect(created.refusal).toBeUndefined();
          expect(memo.refusal).toBeUndefined();
          expect('orphan' in revoked.reading.goals[0].checks[0]).toBe(true);
          expect(warningsOf(revoked.state.lines)).toHaveLength(1);
          expect(warningsOf(revoked.state.lines)[0].payload).toEqual({ check: 0 });
        });

        it('a line id is held only by that line in force, not by another line quoting it', async () => {
          // in the scenario the reference names the memo under `about`; revoking the memo still orphans the check
          const posted = await replay();
          const memoId = gistNamed(posted[1].state.lines, 'memo')[0].id;
          const out = await post(posted[3].state, mrossi('memo_revoke', { target: memoId }), PLAIN, NOW);
          expect(out.refusal).toBeUndefined();
          expect(out.reading.goals[0].checks[0]).toMatchObject({ orphan: true });
          expect(warningsOf(out.state.lines).map((l) => l.payload)).toEqual([{ check: 0 }]);
        });

        it('a value that is no line id is held by any line in force holding it under the same key, whatever its gist', async () => {
          // a memo whose payload names the document keeps the document check anchored once the reference goes
          const state = await afterGoal();
          const withMemo = await post(state, mrossi('memo', { text: 'Vedi #34132412', document: '34132412' }), PLAIN, NOW);
          const reference = gistNamed(withMemo.state.lines, 'doc_ref')[0];
          const out = await post(withMemo.state, mrossi('doc_ref_revoke', { target: reference.id }), PLAIN, NOW);
          expect(out.refusal).toBeUndefined();
          expect('orphan' in documentCheck(out.reading)).toBe(false);
          expect(warningsOf(out.state.lines)).toEqual([]);
        });

        it('a check on a signer who has not signed yet is awaited, not an orphan', async () => {
          const state = await afterGoal();
          const out = await post(
            state,
            mrossi('set_goal', { name: 'firme', then: 'closed', checks: [{ gist: 'doc_signed', kin: 'system', payload: { document: '34132412', by: 'lbianchi' } }] }),
            PLAIN,
            NOW,
          );
          const g = out.reading.goals.find((x) => x.name === 'firme')!;
          expect('orphan' in g.checks[0]).toBe(false);
          expect(warningsOf(out.state.lines)).toEqual([]);
        });

        it('a check with no payload is never an orphan', async () => {
          const [, out] = await run([...opening, mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'got_it' }, { kin: 'sapServer' }] })]);
          expect(out.reading.goals[0].checks.some((c) => 'orphan' in c)).toBe(false);
          expect(warningsOf(out.state.lines)).toEqual([]);
        });

        it('a value no line ever held is awaited, not lost; the id of a goal is no value to rest on', async () => {
          const [, other] = await run([...opening, mrossi('set_goal', { name: 'other', then: 'closed', checks: [{ gist: 'got_it' }] })]);
          const out = await post(
            other.state,
            mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ payload: { target: goalOf(other.state).id } }, { payload: { document: 'zzz' } }] }),
            PLAIN,
            NOW,
          );
          const g = out.reading.goals.find((x) => x.name === 'g')!;
          expect(g.checks.map((c) => c.orphan)).toEqual([true, undefined]);
          expect(warningsOf(out.state.lines).map((l) => l.payload)).toEqual([{ check: 0 }]);
          expect(out.reading.settled).toBe(true);
        });

        it('expects none where the gists have no goal_warning', async () => {
          // a schema that names no gist for the warning expects none
          const { warning: _warning, ...records } = SIBAR_JSON.records;
          const bare = sibar({ drop: ['goal_warning'], laws: [], head: { records } });
          const lines = await thread([opening[0], mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ payload: { document: 'zzz' } }] })]);
          const reading = reduce(lines, hold({ name: 'A', status: 'open' }, ['mrossi']), bare);
          expect(reading.goals[0].checks).toEqual([{ check: { payload: { document: 'zzz' } } }]);
          expect(reading.denunciations).toEqual([]);
          const out = await post(EMPTY, opening[0], bare, NOW);
          const goalled = await post(out.state, mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ payload: { document: 'zzz' } }] }), bare, NOW);
          expect(gistNamed(goalled.state.lines, 'goal_warning')).toEqual([]);
        });

        it('denounces in order: a goal at a time by name, its warnings by check index, then the value and the set', async () => {
          // checks 0 and 2 name the id of goal b, a line no check can rest on
          const goalB = mrossi('set_goal', { name: 'b', then: 'closed', checks: [{ gist: 'create' }] });
          const b = (await thread([opening[0], goalB]))[1].id;
          const lines = await thread([
            opening[0],
            goalB,
            mrossi('set_goal', { name: 'a', then: 'closed', checks: [{ payload: { x: b } }, { gist: 'got_it' }, { payload: { y: b } }] }),
          ]);
          expect(lines[1].id).toBe(b);
          const reading = reduce(lines, hold({}, []), PLAIN);
          expect(reading.denunciations.map((d) => (d.sort === 'line' ? `line ${d.gist} ${JSON.stringify(d.payload)}` : labelOf(d)))).toEqual([
            'line goal_warning {"check":0}',
            'line goal_warning {"check":2}',
            'line closed {}',
            'value name',
            'value status',
            'set assignees mrossi',
          ]);
        });
      });

      describe('reconcile', () => {
        it('writes the denunciation\'s writer and payload', async () => {
          const lines = await thread([opening[0]]);
          const reading: Reading = {
            ...reduce(lines, hold({ name: 'A', status: 'open' }, ['mrossi']), PLAIN),
            denunciations: [{ sort: 'line', gist: 'memo', writer: 'goal::abc', line: 'abc', payload: { text: 't', assignTo: ['x'] } }],
          };
          const out = reconcile(reading, hold({}, []), PLAIN);
          expect(out.drafts).toEqual([{ gist: 'memo', writer: 'goal::abc', payload: { text: 't', assignTo: ['x'] } }]);
          expect(out.handles).toEqual(hold({}, []));
        });
      });
    });

    describe('a dry run, and laws', () => {
      const signing = by(SYSTEM_WRITER, 'doc_signed', { document: '34132412', signedAt: '2026-09-30' });
      const afterQuit = async () => (await replay())[5].state;
      const afterGoal = async () => (await replay())[3].state;
      const reference = (state: ThreadState) => gistNamed(state.lines, 'doc_ref')[0];
      const goalLine = (state: ThreadState) => gistNamed(state.lines, 'set_goal')[0];

      it('leaves the state given unchanged, and gives what post gives with no options', async () => {
        const state = (await replay())[6].state;
        const copy = structuredClone(state);
        const dry = await dryRun(state, signing, PLAIN, NOW);
        expect(state).toEqual(copy);
        const posted = await post(state, signing, PLAIN, NOW);
        expect(dry.refusal).toBeUndefined();
        expect(dry.state).toEqual(posted.state);
        expect(dry.reading).toEqual(posted.reading);
        expect(dry.added).toEqual(posted.added);
        expect(dry.rounds).toEqual(posted.rounds);
        expect(dry.verdicts).toEqual([]);
        expect(dry.added).toEqual(dry.state.lines.slice(state.lines.length));
      });

      it('records the denunciations each round answered: the goal\'s closing, then the status', async () => {
        const state = (await replay())[6].state;
        const { added, rounds } = await dryRun(state, signing, PLAIN, NOW);
        expect(gistsOf(added)).toEqual(['doc_signed', 'closed', 'metadata_set']);
        expect(rounds).toHaveLength(2);
        expect(rounds[0]).toMatchObject([{ sort: 'line', gist: 'closed', line: goalLine(state).id }]);
        expect(rounds[1]).toMatchObject([{ sort: 'handle', kind: 'value', key: 'status', expected: 'closed' }]);
        expect(rounds.flat()).toHaveLength(added.length - 1);
      });

      it('settle records no round when nothing is denounced', async () => {
        const state = (await replay()).at(-1)!.state;
        expect((await settle(state, PLAIN, NOW)).rounds).toEqual([]);
      });

      describe('keeps-set', () => {
        const quit = mrossi('quit', {});

        it('is broken by the last assignee leaving an open activity, and post refuses it', async () => {
          const state = await afterQuit();
          expect(membersOf(state.handles)).toEqual(['mrossi']);
          const dry = await dryRun(state, quit, SIBAR, NOW);
          expect(dry.verdicts).toEqual([
            { law: 'keeps-set', strength: 'refuse', set: 'assignees', detail: 'The set "assignees" would be empty while status is "open".' },
          ]);
          const out = await post(state, quit, SIBAR, NOW);
          expect(out.refusal?.code).toBe('law');
          expect(out.refusal?.verdicts).toEqual(dry.verdicts);
          expect(out.state).toBe(state);
          expect(out.added).toEqual([]);
          expect(out.rounds).toEqual([]);
          // a refusal that is not confirmable stays one when confirmed
          expect((await post(state, quit, SIBAR, NOW, { confirmed: true })).refusal?.code).toBe('law');
        });

        it('passes without laws, as before', async () => {
          const state = await afterQuit();
          const out = await post(state, quit, PLAIN, NOW);
          expect(out.refusal).toBeUndefined();
          expect(membersOf(out.state.handles)).toEqual([]);
          expect(gistsOf(out.added)).toEqual(['quit', 'unassigned']);
        });

        it('gives no verdict on a closed activity', async () => {
          const state = (await replay()).at(-1)!.state;
          expect(valuesOf(state.handles).status).toBe('closed');
          const only = (await post(state, lbianchi('quit', {}), PLAIN, NOW)).state;
          const dry = await dryRun(only, quit, SIBAR, NOW);
          expect(dry.refusal).toBeUndefined();
          expect(membersOf(dry.state.handles)).toEqual([]);
          expect(dry.verdicts).toEqual([]);
        });
      });

      describe('keeps-goals', () => {
        const revoke = (state: ThreadState) => mrossi('doc_ref_revoke', { target: reference(state).id });

        it('is broken by a line that orphans a check of a goal in force, one verdict per check', async () => {
          const state = await afterGoal();
          const dry = await dryRun(state, revoke(state), SIBAR, NOW);
          expect(dry.verdicts).toEqual([
            { law: 'keeps-goals', strength: 'confirm', detail: 'The check 1 of goal "done" would be orphaned.', goal: goalLine(state).id, check: 1 },
          ]);
        });

        it('asks for confirmation, and with it the line passes and the warning is written', async () => {
          const state = await afterGoal();
          const dry = await dryRun(state, revoke(state), SIBAR, NOW);
          const asked = await post(state, revoke(state), SIBAR, NOW);
          expect(asked.refusal?.code).toBe('unconfirmed');
          expect(asked.refusal?.verdicts).toEqual(dry.verdicts);
          expect(asked.state).toBe(state);

          const out = await post(state, revoke(state), SIBAR, NOW, { confirmed: true });
          expect(out.refusal).toBeUndefined();
          expect(gistNamed(out.state.lines, 'goal_warning')).toHaveLength(1);
          expect(gistNamed(out.added, 'goal_warning')[0].payload).toEqual({ check: 1 });
        });

        it('gives no verdict for a check that was already orphaned', async () => {
          const state = await afterGoal();
          const orphaned = await post(state, revoke(state), PLAIN, NOW);
          const dry = await dryRun(orphaned.state, mrossi('comment', { text: 'ok' }), SIBAR, NOW);
          expect(dry.refusal).toBeUndefined();
          expect(dry.verdicts).toEqual([]);
        });
      });

      it('does not judge a fact', async () => {
        const drop: GistSchema = { gist: 'drop', writers: ['system'], rules: [{ rule: 'revoke', from: 'target', gists: ['doc_ref'] }] };
        const schema = sibar({ add: [drop] });
        const state = await afterGoal();
        const draft = by(SYSTEM_WRITER, 'drop', { target: reference(state).id });
        const dry = await dryRun(state, draft, schema, NOW);
        expect(dry.refusal).toBeUndefined();
        expect(dry.verdicts).toEqual([]);
        // the reading still shows it: the check is orphaned
        expect(dry.reading.goals[0].checks[1]).toMatchObject({ orphan: true });
        const out = await post(state, draft, schema, NOW);
        expect(out.refusal).toBeUndefined();
        expect(gistNamed(out.state.lines, 'goal_warning')).toHaveLength(1);
      });

      it('settles: a thread that would stay unsettled gives the verdict, and post refuses it', async () => {
        const extra: GistSchema[] = [
          { gist: 'start', writers: ['user'], rules: [] },
          { gist: 'step_a', writers: ['goal'], rules: [] },
          { gist: 'step_b', writers: ['goal'], rules: [] },
          { gist: 'step_c', writers: ['goal'], rules: [{ rule: 'value', key: 'reached', value: 'yes' }] },
        ];
        const withLaws = sibar({ add: extra });
        const withoutLaws = sibar({ add: extra, laws: [] });
        let state = EMPTY;
        for (const draft of [
          mrossi('create', { name: 'Catena', assignTo: ['mrossi'] }),
          mrossi('set_goal', { name: 'a', then: 'step_a', checks: [{ gist: 'start' }] }),
          mrossi('set_goal', { name: 'b', then: 'step_b', checks: [{ gist: 'step_a' }] }),
          mrossi('set_goal', { name: 'c', then: 'step_c', checks: [{ gist: 'step_b' }] }),
        ]) {
          state = (await post(state, draft, withoutLaws, NOW)).state;
        }
        const start = mrossi('start', {});
        const dry = await dryRun(state, start, withLaws, NOW);
        expect(dry.reading.settled).toBe(false);
        expect(dry.rounds).toHaveLength(3);
        expect(dry.verdicts).toEqual([{ law: 'settles', strength: 'refuse', detail: 'The thread would not settle.' }]);
        expect((await post(state, start, withLaws, NOW)).refusal?.code).toBe('law');
        expect((await post(state, start, withoutLaws, NOW)).reading.settled).toBe(false);
      });

      it('gives verdicts in the order of the laws', async () => {
        const state = await afterQuit();
        const schema = sibar({
          laws: [
            { law: 'settles', strength: 'refuse' },
            { law: 'keeps-set', set: 'assignees', while: { status: 'open' }, strength: 'confirm' },
          ],
        });
        const dry = await dryRun(state, mrossi('quit', {}), schema, NOW);
        expect(dry.verdicts.map((v) => [v.law, v.strength])).toEqual([['keeps-set', 'confirm']]);
      });

      it('answers an admission refusal before any law: no verdicts, nothing added', async () => {
        const state = await afterQuit();
        for (const draft of [mrossi('doc_signed', { document: '1' }), mrossi('nothing', {}), mrossi('create', { name: 'x', assignTo: ['mrossi'] })]) {
          const dry = await dryRun(state, draft, SIBAR, NOW);
          expect(dry.refusal).toBeDefined();
          expect(dry.verdicts).toEqual([]);
          expect(dry.added).toEqual([]);
          expect(dry.rounds).toEqual([]);
          expect(dry.state).toBe(state);
          expect(dry.reading).toEqual(reduce(state.lines, state.handles, PLAIN));
        }
      });
    });

    describe('when a gist may be written', () => {
      /** The four states of the scenario the offers are read in. */
      const states = async () => {
        const posted = await replay();
        return { empty: EMPTY, afterCreate: posted[0].state, afterMemo: posted[1].state, final: posted[7].state };
      };
      const gverdi = (gist: string, payload: LineDraft['payload']) => by('user::gverdi', gist, payload);
      const names = (list: Offer[]) => list.map((o) => o.gist);

      it('refuses not-now, and leaves the state as it was', async () => {
        const { afterCreate, afterMemo, final } = await states();
        const table: Array<[string, ThreadState, LineDraft]> = [
          ['a memo by someone who is no assignee', afterMemo, gverdi('memo', { assignTo: ['x'] })],
          ['a memo on the closed thread', final, mrossi('memo', { assignTo: ['x'] })],
          ['a got_it before any memo', afterCreate, mrossi('got_it', { about: afterCreate.lines[0].id })],
          ['a quit by someone who is no assignee', afterMemo, gverdi('quit', {})],
        ];
        for (const [label, state, draft] of table) {
          const before = structuredClone(state);
          const out = await post(state, draft, PLAIN, NOW);
          expect(out.refusal?.code, label).toBe('not-now');
          expect(out.refusal?.detail, label).toMatch(/^[A-Za-z]/);
          expect(out.state, label).toEqual(before);
          expect(state, label).toEqual(before);
          expect(out.reading, label).toEqual(reduce(before.lines, before.handles, PLAIN));
        }
      });

      it('comes after the writer and before the payload', async () => {
        const { final } = await states();
        // the wrong kin on a closed thread: the writer is refused first
        expect(admit(final.lines, by(SYSTEM_WRITER, 'memo', { assignTo: ['x'] }), PLAIN)?.code).toBe('writer-not-allowed');
        // a bad payload on a closed thread: the moment is refused first
        expect(admit(final.lines, mrossi('memo', { assignTo: 5 }), PLAIN)?.code).toBe('not-now');
        expect((await post(final, mrossi('memo', { assignTo: 5 }), PLAIN, NOW)).refusal?.code).toBe('not-now');
      });

      it('does not stop the lines settle writes: a goal writes its line whatever that when says', async () => {
        const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] }), mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'create' }] })]);
        const closed = PLAIN.gists.find((g) => g.gist === 'closed')!;
        expect(whenHolds(lines, `goal::${lines[1].id}`, closed, PLAIN)).toBe(false);
        const state: ThreadState = { lines, handles: hold({ name: 'A', status: 'open' }, ['mrossi']) };
        const out = await settle(state, PLAIN, NOW);
        expect(out.reading.settled).toBe(true);
        expect(gistNamed(out.state.lines, 'closed')[0]).toMatchObject({ writer: `goal::${lines[1].id}` });
        expect(valuesOf(out.state.handles).status).toBe('closed');
      });

      describe('whenHolds', () => {
        const probe = (when?: When): GistSchema => ({ gist: 'probe', writers: ['user'], rules: [], ...(when ? { when } : {}) });
        const conf: GistSchema = { gist: 'conf', writers: ['user'], rules: [{ rule: 'value', key: 'conf', from: 'conf' }] };
        const all = sibar({ add: [conf], laws: [] });
        const open = () => thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] }), mrossi('memo', { assignTo: ['lbianchi'] })]);

        it('holds when the schema has no when, or an empty one, whoever writes', async () => {
          const lines = await open();
          for (const writer of ['user::mrossi', 'user::gverdi', 'nobody'] as Writer[]) {
            expect(whenHolds(lines, writer, probe(), all)).toBe(true);
            expect(whenHolds(lines, writer, probe({}), all)).toBe(true);
          }
          expect(whenHolds([], 'user::mrossi', probe(), all)).toBe(true);
        });

        it('in: the writer after the first :: is an expected assignee, whatever the kin', async () => {
          const lines = await open();
          const when = probe({ in: 'assignees' });
          expect(whenHolds(lines, 'user::mrossi', when, all)).toBe(true);
          expect(whenHolds(lines, 'user::lbianchi', when, all)).toBe(true);
          expect(whenHolds(lines, 'system::lbianchi', when, all)).toBe(true);
          expect(whenHolds(lines, 'user::gverdi', when, all)).toBe(false);
          expect(whenHolds(lines, 'lbianchi' as Writer, when, all)).toBe(false);
          expect(whenHolds([], 'user::mrossi', when, all)).toBe(false);
        });

        it('in follows what the thread expects: a quit and a revoked memo take an assignee away', async () => {
          const lines = await open();
          const quit = await thread([...lines, by('user::lbianchi', 'quit', {})]);
          expect(whenHolds(quit, 'user::lbianchi', probe({ in: 'assignees' }), all)).toBe(false);
          const revoked = await thread([...lines, mrossi('memo_revoke', { target: lines[1].id })]);
          expect(whenHolds(revoked, 'user::lbianchi', probe({ in: 'assignees' }), all)).toBe(false);
          expect(whenHolds(revoked, 'user::mrossi', probe({ in: 'assignees' }), all)).toBe(true);
        });

        it('values: each key is expected, and equals the value by its canonical form', async () => {
          const lines = await thread([...(await open()), mrossi('conf', { conf: { b: 2, a: [1, null] } })]);
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { status: 'open' } }), all)).toBe(true);
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { status: 'open', name: 'A' } }), all)).toBe(true);
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { conf: { a: [1, null], b: 2 } } }), all)).toBe(true);
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { status: 'closed' } }), all)).toBe(false);
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { status: 'open', name: 'B' } }), all)).toBe(false);
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { conf: { a: [null, 1], b: 2 } } }), all)).toBe(false);
          // a key the thread does not expect fails, even if it is asked to be null
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { absent: null } }), all)).toBe(false);
          expect(whenHolds([], 'user::mrossi', probe({ values: { status: 'open' } }), all)).toBe(false);
        });

        it('values read the thread, not the handles', async () => {
          const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
          expect(reduce(lines, hold({}, []), all).settled).toBe(false);
          expect(whenHolds(lines, 'user::mrossi', probe({ values: { status: 'open' } }), all)).toBe(true);
        });

        it('checks: each finds a line in force, as a goal check does', async () => {
          const lines = await open();
          const check = (...checks: NonNullable<When['checks']>) => probe({ checks });
          expect(whenHolds(lines, 'user::mrossi', check({ gist: 'memo' }), all)).toBe(true);
          expect(whenHolds(lines, 'user::mrossi', check({ gist: 'memo' }, { kin: 'user', writer: 'user::mrossi', payload: { assignTo: ['lbianchi'] } }), all)).toBe(true);
          expect(whenHolds(lines, 'user::mrossi', check({ gist: 'memo' }, { gist: 'got_it' }), all)).toBe(false);
          expect(whenHolds(lines, 'user::mrossi', check({ gist: 'memo', payload: { assignTo: ['x'] } }), all)).toBe(false);
          expect(whenHolds([], 'user::mrossi', check({ gist: 'memo' }), all)).toBe(false);
          const revoked = await thread([...lines, mrossi('memo_revoke', { target: lines[1].id })]);
          expect(whenHolds(revoked, 'user::mrossi', check({ gist: 'memo' }), all)).toBe(false);
        });

        it('all three parts must hold', async () => {
          const lines = await open();
          const when = (over: When = {}) => probe({ checks: [{ gist: 'memo' }], in: 'assignees', values: { status: 'open' }, ...over });
          expect(whenHolds(lines, 'user::lbianchi', when(), all)).toBe(true);
          expect(whenHolds(lines, 'user::gverdi', when(), all)).toBe(false);
          expect(whenHolds(lines, 'user::lbianchi', when({ values: { status: 'closed' } }), all)).toBe(false);
          expect(whenHolds(lines, 'user::lbianchi', when({ checks: [{ gist: 'got_it' }] }), all)).toBe(false);
        });

        it('never throws on a thread it cannot read, and changes none of its arguments', async () => {
          const odd = await thread([
            mrossi('set_goal', { name: 3, checks: 'x' }),
            mrossi('memo', { assignTo: 7 }),
            by('nobody' as Writer, 'mystery', { a: null }),
          ]);
          const when = probe({ checks: [{ gist: 'memo' }], in: 'assignees', values: { status: 'open' } });
          const copies = [structuredClone(odd), structuredClone(when), structuredClone(all.gists)] as const;
          expect(whenHolds(odd, 'user::mrossi', when, all)).toBe(false);
          expect(whenHolds(odd, 'user' as Writer, when, all)).toBe(false);
          expect([odd, when, all.gists]).toEqual(copies);
        });
      });

      describe('offers', () => {
        it('on an empty thread a user may only open, and the system nothing', () => {
          expect(offers([], 'user::mrossi', PLAIN)).toEqual([{ gist: 'create' }]);
          expect(offers([], 'system::sibardoc', PLAIN)).toEqual([]);
        });

        it('after the opening line: the creator, a stranger and the system', async () => {
          const { afterCreate } = await states();
          const { lines } = afterCreate;
          expect(names(offers(lines, 'user::mrossi', PLAIN))).toEqual(['memo', 'comment', 'doc_ref', 'set_goal', 'stage', 'closed', 'quit']);
          expect(offers(lines, 'user::gverdi', PLAIN)).toEqual([]);
          expect(names(offers(lines, 'system::sibardoc', PLAIN))).toEqual(['doc_signed', 'doc_created', 'assigned', 'unassigned', 'metadata_set']);
        });

        it('after the memo to lbianchi: a revoking gist comes with its targets, the others with none', async () => {
          const { afterMemo } = await states();
          const memo = afterMemo.lines[4];
          const list = offers(afterMemo.lines, 'user::lbianchi', PLAIN);
          expect(names(list)).toEqual(['memo', 'memo_revoke', 'comment', 'got_it', 'doc_ref', 'set_goal', 'stage', 'closed', 'quit']);
          expect(list.find((o) => o.gist === 'memo_revoke')).toEqual({ gist: 'memo_revoke', targets: [memo.id] });
          // a member that does not apply is left out, not set to undefined
          expect(list.filter((o) => 'targets' in o).map((o) => o.gist)).toEqual(['memo_revoke']);
        });

        it('once a reference is in force on an open thread, doc_ref_revoke is offered with it as its target', async () => {
          const posted = await replay();
          const afterRef = posted[2].state;
          const reference = afterRef.lines.find((l) => l.gist === 'doc_ref')!;
          for (const writer of ['user::mrossi', 'user::lbianchi'] as Writer[]) {
            const list = offers(afterRef.lines, writer, PLAIN);
            expect(list.find((o) => o.gist === 'doc_ref_revoke')).toEqual({ gist: 'doc_ref_revoke', targets: [reference.id] });
            expect(names(list)).toContain('doc_ref');
          }
          expect(names(offers(afterRef.lines, 'user::lbianchi', PLAIN))).toEqual([
            'memo', 'memo_revoke', 'comment', 'got_it', 'doc_ref', 'doc_ref_revoke', 'set_goal', 'stage', 'closed', 'quit',
          ]);
          // none before the reference, and none once it is revoked
          expect(names(offers(posted[1].state.lines, 'user::lbianchi', PLAIN))).not.toContain('doc_ref_revoke');
          const revoked = await post(afterRef, lbianchi('doc_ref_revoke', { target: reference.id }), PLAIN, NOW);
          expect(revoked.refusal).toBeUndefined();
          expect(names(offers(revoked.state.lines, 'user::lbianchi', PLAIN))).not.toContain('doc_ref_revoke');
          // and not on a closed thread
          expect(names(offers(posted[7].state.lines, 'user::mrossi', PLAIN))).not.toContain('doc_ref_revoke');
          expect(admit(afterRef.lines, lbianchi('doc_ref_revoke', { target: reference.id }), PLAIN)).toBeUndefined();
          expect(admit(posted[7].state.lines, mrossi('doc_ref_revoke', { target: reference.id }), PLAIN)?.code).toBe('not-now');
        });

        it('on the closed thread: only what undoes it, and quit', async () => {
          const { final } = await states();
          const goal = gistNamed(final.lines, 'set_goal')[0];
          const closed = gistNamed(final.lines, 'closed')[0];
          expect(offers(final.lines, 'user::mrossi', PLAIN)).toEqual([
            { gist: 'comment' },
            { gist: 'set_goal_revoke', targets: [goal.id] },
            { gist: 'closed_revoke', targets: [closed.id] },
            { gist: 'quit' },
          ]);
        });

        it('every offer is admitted and posted without refusal, in each of the four states', async () => {
          const s = await states();
          const writers: Writer[] = ['user::mrossi', 'user::lbianchi', 'user::gverdi', 'system::sibardoc'];
          const payloads: Record<string, LineDraft['payload']> = {
            create: { name: 'B', assignTo: ['x'] },
            memo: { assignTo: ['x'] },
            comment: { text: 'x' },
            got_it: { about: 'x' },
            doc_ref: { document: '1' },
            set_goal: { name: 'other', then: 'closed', checks: [{ gist: 'create' }] },
            stage: { stage: 'firma' },
            closed: {},
            quit: {},
            doc_signed: { document: '1' },
            doc_created: { document: '1' },
            assigned: { set: 'assignees', member: 'x' },
            unassigned: { set: 'assignees', member: 'x' },
            metadata_set: { key: 'k' },
          };
          let offered = 0;
          for (const [label, state] of Object.entries(s)) {
            for (const writer of writers) {
              for (const offer of offers(state.lines, writer, PLAIN)) {
                const payload = offer.targets ? { target: offer.targets[0] } : payloads[offer.gist];
                expect(payload, `${label} ${writer} ${offer.gist}: a payload is tabled`).toBeDefined();
                const draft: LineDraft = { gist: offer.gist, writer, payload };
                expect(admit(state.lines, draft, PLAIN), `${label} ${writer} ${offer.gist}`).toBeUndefined();
                expect((await post(state, draft, PLAIN, NOW)).refusal, `${label} ${writer} ${offer.gist}`).toBeUndefined();
                offered++;
              }
            }
          }
          expect(offered).toBeGreaterThan(20);
        });

        it('follows the order of the gists and reads the first schema of a gist', async () => {
          const { afterCreate } = await states();
          // the reader refuses a gist twice, so the schema is built without it
          const gists = unchecked([
            ...PLAIN.gists,
            { gist: 'zed', writers: ['user'], rules: [] },
            { gist: 'abc', writers: ['user'], rules: [] },
            { gist: 'zed', writers: ['system'], rules: [] },
          ]);
          expect(names(offers(afterCreate.lines, 'user::mrossi', gists))).toEqual(['memo', 'comment', 'doc_ref', 'set_goal', 'stage', 'closed', 'quit', 'zed', 'abc']);
          expect(names(offers(afterCreate.lines, 'system::sibardoc', gists))).not.toContain('zed');
        });

        it('offers a gist only where a line of it keeps the opening rule', async () => {
          const { afterCreate } = await states();
          const second = await stamp(mrossi('create', { name: 'B', assignTo: ['x'] }), afterCreate.lines, NOW);
          const two = [...afterCreate.lines, second];
          // two creates in force: a create is not offered, and nor is anything a create would not mend
          expect(offers(two, 'user::mrossi', PLAIN)).toEqual([]);
          expect(offers(two, 'system::sibardoc', PLAIN)).toEqual([]);
        });

        it('offers nothing to a writer with no kin, or a kin no gist lists', async () => {
          const { afterCreate } = await states();
          expect(offers(afterCreate.lines, 'mrossi' as Writer, PLAIN)).toEqual([]);
          expect(offers(afterCreate.lines, 'robot::x', PLAIN)).toEqual([]);
        });

        it('lists targets in reading order, from a reversed array too, and leaves out revoked lines', async () => {
          const base = await thread([
            mrossi('create', { name: 'A', assignTo: ['mrossi'] }),
            mrossi('memo', { text: 'uno' }),
            mrossi('memo', { text: 'due' }),
            mrossi('memo', { text: 'tre' }),
          ]);
          const revoked = [...base, await stamp(mrossi('memo_revoke', { target: base[2].id }), base, NOW)];
          const target = (lines: EventLine[]) => offers(lines, 'user::mrossi', PLAIN).find((o) => o.gist === 'memo_revoke')?.targets;
          expect(target(base)).toEqual([base[1].id, base[2].id, base[3].id]);
          expect(target([...base].reverse())).toEqual([base[1].id, base[2].id, base[3].id]);
          expect(target(revoked)).toEqual([base[1].id, base[3].id]);
        });

        it('changes none of its arguments', async () => {
          const { afterMemo } = await states();
          const copies = [structuredClone(afterMemo.lines), structuredClone(PLAIN.gists)] as const;
          offers(afterMemo.lines, 'user::lbianchi', PLAIN);
          expect([afterMemo.lines, PLAIN.gists]).toEqual(copies);
        });
      });
    });
  });

  describe('the cap', () => {
    const EXTRA: GistSchema[] = [
      { gist: 'start', writers: ['user'], rules: [] },
      { gist: 'step_a', writers: ['goal'], rules: [] },
      { gist: 'step_b', writers: ['goal'], rules: [] },
      { gist: 'step_c', writers: ['goal'], rules: [{ rule: 'value', key: 'reached', value: 'yes' }] },
    ];
    const CAPPED = sibar({ add: EXTRA, laws: [] });

    async function buildChain(): Promise<ThreadState> {
      let state = EMPTY;
      const go = async (draft: LineDraft) => {
        const out = await post(state, draft, CAPPED, NOW);
        expect(out.refusal).toBeUndefined();
        expect(out.reading.settled).toBe(true);
        state = out.state;
      };
      await go(mrossi('create', { name: 'Catena', assignTo: ['mrossi'] }));
      await go(mrossi('set_goal', { name: 'a', then: 'step_a', checks: [{ gist: 'start' }] }));
      await go(mrossi('set_goal', { name: 'b', then: 'step_b', checks: [{ gist: 'step_a' }] }));
      await go(mrossi('set_goal', { name: 'c', then: 'step_c', checks: [{ gist: 'step_b' }] }));
      return state;
    }

    it('a thread that needs a fourth reconciliation pauses after three, and a second settle finishes it', async () => {
      expect(MAX_ROUNDS).toBe(3);
      const chain = await buildChain();
      const paused = await post(chain, mrossi('start', {}), CAPPED, NOW);

      expect(paused.refusal).toBeUndefined();
      expect(paused.reading.settled).toBe(false);
      const written = paused.state.lines.slice(chain.lines.length);
      expect(gistsOf(written)).toEqual(['start', 'step_a', 'step_b', 'step_c']);
      const goalIds = gistNamed(paused.state.lines, 'set_goal').map((l) => l.id);
      expect(written.slice(1).map((l) => l.writer)).toEqual(goalIds.map((id) => `goal::${id}`));
      const [stepC] = gistNamed(paused.state.lines, 'step_c');
      expect(paused.reading.denunciations).toEqual([{ sort: 'handle', kind: 'value', key: 'reached', expected: 'yes', line: stepC.id }]);
      expect('reached' in valuesOf(paused.state.handles)).toBe(false);

      const done = await settle(paused.state, CAPPED, NOW);
      expect(done.reading.settled).toBe(true);
      expect(valuesOf(done.state.handles).reached).toBe('yes');
      expect(done.state.lines.at(-1)).toMatchObject({ gist: 'metadata_set', payload: { key: 'reached', value: 'yes' } });
      for (const line of done.state.lines) expect(await verify(line)).toBe(true);
      done.state.lines.slice(1).forEach((line, i) => expect(line.previous).toBe(done.state.lines[i].id));
    });

    it('the next post resumes from a pause', async () => {
      const paused = await post(await buildChain(), mrossi('start', {}), CAPPED, NOW);
      const out = await post(paused.state, mrossi('memo', { assignTo: ['lbianchi'] }), CAPPED, NOW);
      expect(out.reading.settled).toBe(true);
      expect(valuesOf(out.state.handles).reached).toBe('yes');
      expect(membersOf(out.state.handles)).toEqual(['lbianchi', 'mrossi']);
    });
  });

  describe('admit', () => {

    it('lets a good draft through', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      expect(admit(lines, mrossi('memo', { assignTo: 'lbianchi', free: { any: ['thing', 1] } }), PLAIN)).toBeUndefined();
      expect(admit(lines, mrossi('memo', {}), PLAIN)).toBeUndefined();
      expect(admit(lines, mrossi('memo', { assignTo: [] }), PLAIN)).toBeUndefined();
    });

    it.each<[string, LineDraft, Refusal['code']]>([
      ['a gist with no schema', mrossi('mystery', {}), 'unknown-gist'],
      ['a gist with no schema, from a writer that has no kin either', by('nobody' as Writer, 'mystery', {}), 'unknown-gist'],
      ['a kin the gist does not list', mrossi('doc_signed', { document: '1' }), 'writer-not-allowed'],
      ['a writer with no ::', by('mrossi' as Writer, 'memo', {}), 'writer-not-allowed'],
      ['a required assign key that is absent', mrossi('create', { name: 'A' }), 'invalid-payload'],
      ['an assign key that holds a number', mrossi('memo', { assignTo: 7 }), 'invalid-payload'],
      ['an assign key that holds null', mrossi('memo', { assignTo: null }), 'invalid-payload'],
      ['an assign key that holds a mixed list', mrossi('memo', { assignTo: ['a', 1] }), 'invalid-payload'],
      ['a required metadata key that is absent', mrossi('create', { assignTo: ['mrossi'] }), 'invalid-payload'],
      ['a required metadata key that is absent, on got_it', lbianchi('got_it', {}), 'invalid-payload'],
      ['a doc_ref with no document', mrossi('doc_ref', {}), 'invalid-payload'],
      ['a doc_ref with a direction and no document', mrossi('doc_ref', { direction: 'inbound' }), 'invalid-payload'],
      ['a revoke key that holds a number', mrossi('memo_revoke', { target: 5 }), 'invalid-payload'],
      ['a revoke key that is absent', mrossi('memo_revoke', {}), 'invalid-payload'],
      ['a goal with no name', mrossi('set_goal', { then: 'closed', checks: [{ gist: 'x' }] }), 'invalid-payload'],
      ['a goal with a name that is not a string', mrossi('set_goal', { name: 1, then: 'closed', checks: [{ gist: 'x' }] }), 'invalid-payload'],
      ['a goal with no checks', mrossi('set_goal', { name: 'g', then: 'closed' }), 'invalid-payload'],
      ['a goal with empty checks', mrossi('set_goal', { name: 'g', then: 'closed', checks: [] }), 'invalid-payload'],
      ['a goal with a check that states nothing', mrossi('set_goal', { name: 'g', then: 'closed', checks: [{}] }), 'invalid-payload'],
      ['a goal with no then', mrossi('set_goal', { name: 'g', checks: [{ gist: 'x' }] }), 'invalid-payload'],
      ['a goal whose then has no schema', mrossi('set_goal', { name: 'g', then: 'mystery', checks: [{ gist: 'x' }] }), 'invalid-payload'],
      ['a goal whose then the goal kin may not write', mrossi('set_goal', { name: 'g', then: 'doc_signed', checks: [{ gist: 'x' }] }), 'invalid-payload'],
    ])('refuses %s', async (_, draft, code) => {
      // an open thread where mrossi and lbianchi are assignees and a memo exists, so
      // what each case lacks is its payload and not the moment
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] }), mrossi('memo', { assignTo: ['lbianchi'] })]);
      const refusal = admit(lines, draft, PLAIN);
      expect(refusal?.code).toBe(code);
      expect(refusal?.detail).toMatch(/^[A-Za-z]/);
    });

    it.each<[string, unknown, Refusal['code']]>([
      ['no draft at all', null, 'writer-not-allowed'],
      ['a draft that is a list', [], 'writer-not-allowed'],
      ['a writer that is not a string', { gist: 'comment', writer: 7, payload: {} }, 'writer-not-allowed'],
      ['no payload', { gist: 'comment', writer: 'user::mrossi' }, 'invalid-payload'],
      ['a payload that is null', { gist: 'comment', writer: 'user::mrossi', payload: null }, 'invalid-payload'],
      ['a payload that is a list', { gist: 'comment', writer: 'user::mrossi', payload: [1] }, 'invalid-payload'],
      ['a payload that is a string', { gist: 'comment', writer: 'user::mrossi', payload: 'text' }, 'invalid-payload'],
      ['a payload that is a date', { gist: 'comment', writer: 'user::mrossi', payload: new Date(0) }, 'invalid-payload'],
    ])('refuses %s, and post says so without throwing', async (_, draft, code) => {
      // a host hands over what it was sent: the type is a promise the engine cannot rely on
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      expect(admit(lines, draft as LineDraft, PLAIN)?.code).toBe(code);
      const state: ThreadState = { lines, handles: hold({}, []) };
      const out = await post(state, draft as LineDraft, PLAIN, NOW);
      expect(out.refusal?.code).toBe(code);
      expect(out.added).toEqual([]);
    });

    it('refuses a revoke of an id that no line has, and of a line whose gist is not listed', async () => {
      const lines = await thread([
        mrossi('create', { name: 'A', assignTo: ['mrossi'] }),
        by(SYSTEM_WRITER, 'doc_signed', { document: '1' }),
      ]);
      expect(admit(lines, mrossi('memo_revoke', { target: 'f'.repeat(64) }), PLAIN)?.code).toBe('unknown-line');
      expect(admit(lines, mrossi('memo_revoke', { target: lines[1].id }), PLAIN)?.code).toBe('not-revocable');
      expect(admit(lines, mrossi('memo_revoke', { target: lines[0].id }), PLAIN)?.code).toBe('not-revocable');
      expect(admit(lines, mrossi('set_goal_revoke', { target: lines[1].id }), PLAIN)?.code).toBe('not-revocable');
    });

    it('admits a revoke of a line of a listed gist', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] }), mrossi('memo', { assignTo: ['x'] })]);
      expect(admit(lines, mrossi('memo_revoke', { target: lines[1].id }), PLAIN)).toBeUndefined();
    });

    it('keeps its order: unknown gist, then writer, then payload, then unknown line, then not revocable', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      // a payload that is wrong and a writer that is wrong: the writer is refused first
      expect(admit(lines, by('system::sibardoc', 'memo_revoke', { target: 5 }), PLAIN)?.code).toBe('writer-not-allowed');
      // a target that is wrong in shape is a payload matter before it is an unknown line
      expect(admit(lines, mrossi('memo_revoke', { target: 5 }), PLAIN)?.code).toBe('invalid-payload');
      // an unknown id is reported before a gist that cannot be revoked
      expect(admit(lines, mrossi('memo_revoke', { target: 'abc' }), PLAIN)?.code).toBe('unknown-line');
    });

    it('a goal may only name a gist that needs no payload', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      const gists = sibar({ laws: [], add: [
        { gist: 'needs_key', writers: ['goal'], rules: [{ rule: 'value', key: 'k', from: 'k', required: true }] },
        { gist: 'needs_user', writers: ['goal'], rules: [{ rule: 'join', set: 'assignees', from: 'who', required: true }] },
        { gist: 'needs_doc', writers: ['goal'], rules: [{ rule: 'value', key: 'docs', collect: 'document', required: true }] },
        // a goal's line has an empty payload, which no `where` can match, so nothing is asked for
        { gist: 'when_doc', writers: ['goal'], rules: [{ rule: 'value', key: 'docs', collect: 'document', required: true, where: { kind: 'a' } }] },
        { gist: 'optional_doc', writers: ['goal'], rules: [{ rule: 'value', key: 'docs', collect: 'document' }] },
        { gist: 'optional_key', writers: ['goal'], rules: [{ rule: 'value', key: 'k', from: 'k' }, { rule: 'join', set: 'assignees', from: 'who' }] },
        { gist: 'revokes', writers: ['goal'], rules: [{ rule: 'revoke', from: 'target', gists: ['memo'] }] },
        { gist: 'goals', writers: ['goal'], rules: [{ rule: 'goal' }] },
      ] });
      const goal = (then: string) => mrossi('set_goal', { name: 'g', then, checks: [{ gist: 'x' }] });
      for (const then of ['needs_key', 'needs_user', 'needs_doc', 'revokes', 'goals']) expect(admit(lines, goal(then), gists)?.code).toBe('invalid-payload');
      expect(admit(lines, goal('optional_key'), gists)).toBeUndefined();
      expect(admit(lines, goal('optional_doc'), gists)).toBeUndefined();
      expect(admit(lines, goal('when_doc'), gists)).toBeUndefined();
      expect(admit(lines, goal('closed'), gists)).toBeUndefined();
    });

    it('admits a doc_ref with a document, whatever else it carries', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      expect(admit(lines, mrossi('doc_ref', { document: '1' }), PLAIN)).toBeUndefined();
      expect(admit(lines, mrossi('doc_ref', { document: null, direction: 'inbound', about: 'x', free: [1] }), PLAIN)).toBeUndefined();
    });

    it('does not ask for a required key of a binding whose where does not match the payload', async () => {
      const gists = sibar({ laws: [], add: [
        {
          gist: 'conditional',
          writers: ['user'],
          rules: [
            { rule: 'value', key: 'a', from: 'va', required: true, where: { kind: 'a' } },
            { rule: 'value', key: 'b', collect: 'vb', required: true, where: { kind: 'b' } },
          ],
        },
      ] });
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      const check = (payload: LineDraft['payload']) => admit(lines, mrossi('conditional', payload), gists)?.code;
      expect(check({})).toBeUndefined();
      expect(check({ kind: 'c' })).toBeUndefined();
      expect(check({ kind: 'a' })).toBe('invalid-payload');
      expect(check({ kind: 'a', va: 1 })).toBeUndefined();
      expect(check({ kind: 'b' })).toBe('invalid-payload');
      expect(check({ kind: 'b', vb: null })).toBeUndefined();
    });

    it('reads only the first revoke binding of a gist', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] }), mrossi('memo', {})]);
      // the reader refuses two revoke bindings, so the schema is built without it
      const gists = unchecked([
        ...PLAIN.gists,
        { gist: 'twice', writers: ['user'], rules: [{ rule: 'revoke', from: 'first', gists: ['memo'] }, { rule: 'revoke', from: 'second', gists: ['create'] }] },
      ]);
      expect(admit(lines, mrossi('twice', { first: lines[1].id }), gists)).toBeUndefined();
      expect(admit(lines, mrossi('twice', { first: lines[1].id, second: 7 }), gists)).toBeUndefined();
    });

    it('changes none of its arguments', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      const draft = mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'x' }] });
      const copies = [structuredClone(lines), structuredClone(draft), structuredClone(PLAIN.gists)] as const;
      admit(lines, draft, PLAIN);
      expect([lines, draft, PLAIN.gists]).toEqual(copies);
    });
  });

  describe('refusals through post', () => {
    const cases = async () => {
      const states: ThreadState[] = [];
      let state = EMPTY;
      for (const draft of [
        mrossi('create', { name: 'Richiesta parere', assignTo: ['mrossi'] }),
        mrossi('memo', { text: 'Serve un parere', assignTo: ['lbianchi'] }),
        by(SYSTEM_WRITER, 'doc_signed', { document: '1' }),
      ]) {
        state = (await post(state, draft, PLAIN, NOW)).state;
        states.push(state);
      }
      return { empty: EMPTY, afterMemo: states[1], afterSigned: states[2] };
    };

    it('each leaves the state as it was and says why', async () => {
      const { empty, afterMemo, afterSigned } = await cases();
      const signedId = afterSigned.lines.at(-1)!.id;

      const table: Array<[string, ThreadState, LineDraft, Refusal['code']]> = [
        ['a gist with no schema', afterMemo, mrossi('mystery', {}), 'unknown-gist'],
        ['doc_signed from a user', afterMemo, mrossi('doc_signed', { document: '1' }), 'writer-not-allowed'],
        ['a create with no name', afterMemo, mrossi('create', { assignTo: ['x'] }), 'invalid-payload'],
        ['a memo whose assignTo is a number', afterMemo, mrossi('memo', { assignTo: 3 }), 'invalid-payload'],
        ['a goal whose then is doc_signed', afterMemo, mrossi('set_goal', { name: 'g', then: 'doc_signed', checks: [{ gist: 'got_it' }] }), 'invalid-payload'],
        ['a goal with no checks', afterMemo, mrossi('set_goal', { name: 'g', then: 'closed' }), 'invalid-payload'],
        ['a memo_revoke of an id that is not in the thread', afterMemo, mrossi('memo_revoke', { target: 'e'.repeat(64) }), 'unknown-line'],
        ['a memo_revoke of the doc_signed line', afterSigned, mrossi('memo_revoke', { target: signedId }), 'not-revocable'],
        ['a line that is not a create as the first line of an empty thread', empty, by(SYSTEM_WRITER, 'doc_signed', { document: '1' }), 'unreconcilable'],
        ['a second create', afterMemo, mrossi('create', { name: 'B', assignTo: ['x'] }), 'unreconcilable'],
      ];

      for (const [label, state, draft, code] of table) {
        const before = structuredClone(state);
        const out = await post(state, draft, PLAIN, NOW);
        expect(out.refusal?.code, label).toBe(code);
        expect(out.refusal?.detail, label).toMatch(/^[A-Za-z]/);
        expect(out.state, label).toEqual(before);
        expect(state, label).toEqual(before);
        expect(out.reading, label).toEqual(reduce(before.lines, before.handles, PLAIN));
      }
    });

    it('a refusal on an empty thread reads one-opening with found 0', async () => {
      const out = await post(EMPTY, by(SYSTEM_WRITER, 'doc_signed', { document: '1' }), PLAIN, NOW);
      expect(out.refusal?.code).toBe('unreconcilable');
      expect(out.reading.denunciations).toEqual([{ sort: 'thread', rule: 'one-opening', found: 0 }]);
      expect(out.reading.settled).toBe(false);
    });

    it('a refusal reads the state without settling it', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      const unsettled: ThreadState = { lines, handles: hold({}, []) };
      const out = await post(unsettled, mrossi('mystery', {}), PLAIN, NOW);
      expect(out.state).toEqual(unsettled);
      expect(out.reading.settled).toBe(false);
      expect(out.reading.denunciations).toHaveLength(3);
    });

    it('a second opening line is refused even though it would have been admitted', async () => {
      const { afterMemo } = await cases();
      const draft = mrossi('create', { name: 'B', assignTo: ['x'] });
      expect(admit(afterMemo.lines, draft, PLAIN)).toBeUndefined();
      expect((await post(afterMemo, draft, PLAIN, NOW)).refusal?.code).toBe('unreconcilable');
    });

    it('revoking the only opening line is not offered: nothing revokes it', async () => {
      const { afterMemo } = await cases();
      const out = await post(afterMemo, mrossi('memo_revoke', { target: afterMemo.lines[0].id }), PLAIN, NOW);
      expect(out.refusal?.code).toBe('not-revocable');
    });
  });

  describe('reconcile', () => {
    const at = async () => {
      const lines = await thread([mrossi('create', { name: 'Richiesta', assignTo: ['mrossi', 'lbianchi'] })]);
      return lines;
    };

    it('answers each denunciation, in their order, with the line that records it', async () => {
      const lines = await at();
      const handles: Handles = hold({ stray: 1, name: 'Altro' }, ['zed', 'mrossi']);
      const reading = reduce(lines, handles, PLAIN);
      const out = reconcile(reading, handles, PLAIN);

      expect(out.drafts).toEqual([
        { gist: 'metadata_set', writer: SYSTEM_WRITER, payload: { key: 'name', value: 'Richiesta' } },
        { gist: 'metadata_set', writer: SYSTEM_WRITER, payload: { key: 'status', value: 'open' } },
        { gist: 'metadata_set', writer: SYSTEM_WRITER, payload: { key: 'stray' } },
        { gist: 'assigned', writer: SYSTEM_WRITER, payload: { set: 'assignees', member: 'lbianchi', line: lines[0].id } },
        { gist: 'unassigned', writer: SYSTEM_WRITER, payload: { set: 'assignees', member: 'zed' } },
      ]);
      expect('value' in out.drafts[2].payload).toBe(false);
      expect(out.handles).toEqual(hold({ name: 'Richiesta', status: 'open' }, ['lbianchi', 'mrossi']));
      expect(reduce(lines, out.handles, PLAIN).settled).toBe(true);
    });

    it('answers a missing goal line with the goal as writer and an empty payload, and leaves the handles', async () => {
      const lines = await thread([
        mrossi('create', { name: 'A', assignTo: ['mrossi'] }),
        mrossi('set_goal', { name: 'g', then: 'closed', checks: [{ gist: 'create' }] }),
      ]);
      const handles: Handles = hold({ name: 'A', status: 'open' }, ['mrossi']);
      const reading = reduce(lines, handles, PLAIN);
      const out = reconcile(reading, handles, PLAIN);
      expect(out.drafts).toEqual([{ gist: 'closed', writer: `goal::${lines[1].id}`, payload: {} }]);
      expect(out.handles).toEqual(handles);
    });

    it('has no answer to a denunciation of the thread', () => {
      const handles: Handles = hold({}, []);
      const reading = reduce([], handles, PLAIN);
      expect(reading.denunciations).toHaveLength(1);
      expect(reconcile(reading, handles, PLAIN)).toEqual({ handles, drafts: [] });
    });

    it('returns the members of a set sorted with <, and changes none of its arguments', async () => {
      // a handle is sorted when an answer changes it: one name joins, and the list comes out in order
      const handles: Handles = hold({ k: { a: 1 } }, ['b', 'mrossi', 'B', 'a']);
      const joining: Denunciation = { sort: 'handle', kind: 'set', key: 'assignees', member: 'c', expected: true, line: 'x' };
      const reading: Reading = { ...reduce([], handles, PLAIN), denunciations: [joining] };
      const readingCopy = structuredClone(reading);
      const handlesCopy = structuredClone(handles);
      const out = reconcile(reading, handles, PLAIN);
      expect(membersOf(out.handles)).toEqual(['B', 'a', 'b', 'c', 'mrossi']);
      expect(reading).toEqual(readingCopy);
      expect(handles).toEqual(handlesCopy);
      expect(out.handles.set).not.toBe(handles.set);
      expect(membersOf(out.handles)).not.toBe(membersOf(handles));
    });

    it('sets a value key to null when the thread expects null, and records the value', () => {
      const reading: Reading = {
        inForce: [],
        revoked: [],
        expected: hold({ k: null }, []),
        goals: [],
        denunciations: [{ sort: 'handle', kind: 'value', key: 'k', expected: null, line: 'x' }],
        settled: false,
      };
      const out = reconcile(reading, hold({}, []), PLAIN);
      expect(valuesOf(out.handles)).toEqual({ k: null });
      expect(out.drafts[0].payload).toEqual({ key: 'k', value: null });
      expect('value' in out.drafts[0].payload).toBe(true);
    });
  });

  describe('settle', () => {
    it('adds nothing to a thread that already agrees', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi'] })]);
      const state: ThreadState = { lines, handles: hold({ name: 'A', status: 'open' }, ['mrossi']) };
      const out = await settle(state, PLAIN, NOW);
      expect(out.state).toEqual(state);
      expect(out.reading.settled).toBe(true);
    });

    it('stamps each draft against the thread with the drafts before it appended, and changes none of its arguments', async () => {
      const lines = await thread([mrossi('create', { name: 'A', assignTo: ['mrossi', 'lbianchi'] })]);
      const state: ThreadState = { lines, handles: hold({}, []) };
      const copy = structuredClone(state);
      const out = await settle(state, PLAIN, NOW);
      expect(state).toEqual(copy);
      expect(out.reading.settled).toBe(true);
      expect(out.state.lines).toHaveLength(1 + 2 + 2);
      out.state.lines.slice(1).forEach((line, i) => expect(line.previous).toBe(out.state.lines[i].id));
      for (const line of out.state.lines) expect(await verify(line)).toBe(true);
      expect(new Set(out.state.lines.map((l) => l.timestamp)).size).toBe(out.state.lines.length);
    });

    it('does not admit its drafts: they are the server own', async () => {
      // a thread brought in from outside can carry a goal that admission would have refused
      const lines = await thread([
        mrossi('create', { name: 'A', assignTo: ['mrossi'] }),
        mrossi('set_goal', { name: 'g', then: 'doc_signed', checks: [{ gist: 'create' }] }),
      ]);
      expect(admit(lines.slice(0, 1), mrossi('set_goal', { name: 'g', then: 'doc_signed', checks: [{ gist: 'create' }] }), PLAIN)?.code).toBe('invalid-payload');
      const state: ThreadState = { lines, handles: hold({ name: 'A', status: 'open' }, ['mrossi']) };
      const out = await settle(state, PLAIN, NOW);
      expect(out.reading.settled).toBe(true);
      expect(out.state.lines.at(-1)).toMatchObject({ gist: 'doc_signed', writer: `goal::${lines[1].id}`, payload: {} });
    });

    it('does not act on a denunciation of the thread, and stops', async () => {
      const lines = await thread([mrossi('memo', { assignTo: ['x'] })]);
      const state: ThreadState = { lines, handles: hold({}, []) };
      const out = await settle(state, PLAIN, NOW);
      // the one answerable denunciation is acted on; the thread one stays
      expect(out.reading.settled).toBe(false);
      expect(out.reading.denunciations).toEqual([{ sort: 'thread', rule: 'one-opening', found: 0 }]);
      expect(membersOf(out.state.handles)).toEqual(['x']);
    });
  });
});

describe('readLaws', () => {
  const readOf = (value: unknown) => readLaws(value, BASE_KIT, HEAD);

  it('reads the case with no problem', () => {
    const { laws, problems } = readOf(SIBAR_JSON.laws);
    expect(problems).toEqual([]);
    expect(laws).toEqual([
      { law: 'keeps-set', set: 'assignees', while: { status: 'open' }, strength: 'refuse' },
      { law: 'keeps-goals', strength: 'confirm' },
      { law: 'settles', strength: 'refuse' },
    ]);
    expect(SIBAR.laws).toEqual(laws);
  });

  it.each([
    ['an unknown law', [{ law: 'keeps-quiet', strength: 'refuse' }]],
    ['a bad strength', [{ law: 'settles', strength: 'warn' }]],
    ['an extra key', [{ law: 'settles', strength: 'refuse', why: 'x' }]],
    ['a missing key', [{ law: 'settles' }]],
    ['an element that is not an object', ['settles']],
    ['a keeps-set without its set', [{ law: 'keeps-set', strength: 'refuse' }]],
    ['a keeps-set that names a set the schema does not declare', [{ law: 'keeps-set', set: 'owners', strength: 'refuse' }]],
    ['a keeps-set whose while is empty', [{ law: 'keeps-set', set: 'assignees', while: {}, strength: 'refuse' }]],
  ])('leaves out, and names, %s', (_, value) => {
    const out = readOf(value);
    expect(out.laws).toEqual([]);
    expect(out.problems).toHaveLength(1);
  });

  it('keeps the first of a law named twice with the same keys', () => {
    const out = readOf([
      { law: 'settles', strength: 'confirm' },
      { law: 'settles', strength: 'refuse' },
      { law: 'keeps-goals', strength: 'refuse' },
    ]);
    expect(out.laws).toEqual([
      { law: 'settles', strength: 'confirm' },
      { law: 'keeps-goals', strength: 'refuse' },
    ]);
    expect(out.problems).toHaveLength(1);
  });

  it('keeps one law for each set it is asked of', () => {
    const head = { ...HEAD, sets: ['assignees', 'owners'] };
    const out = readLaws([{ law: 'keeps-set', set: 'assignees', strength: 'refuse' }, { law: 'keeps-set', set: 'owners', strength: 'refuse' }], BASE_KIT, head);
    expect(out.problems).toEqual([]);
    expect(out.laws).toHaveLength(2);
  });

  it.each([[null], [{}], ['laws'], [undefined]])('gives no law and one problem for %j', (value) => {
    const out = readOf(value);
    expect(out.laws).toEqual([]);
    expect(out.problems).toHaveLength(1);
  });
});

describe('the package', () => {
  const dir = join(import.meta.dirname, '..', 'src');
  /** The path of every `import … from` and `export … from`, over several lines or one. */
  const sourcesOf = (text: string): string[] => [...text.matchAll(/^[ \t]*(?:import|export)\b[^;]*?\bfrom\s+(['"])(.+?)\1/gms)].map((m) => m[2]);
  /** Every .ts file under a folder, as a path relative to it. */
  const filesUnder = (folder: string): string[] =>
    readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? filesUnder(join(folder, name)).map((f) => join(name, f)) : name.endsWith('.ts') ? [name] : []));

  it('reads the statements it means to', () => {
    expect(sourcesOf("import type {\n  A,\n  B,\n} from '../x';\nexport * from './y';\nconst from = 1;")).toEqual(['../x', './y']);
  });

  it('imports and re-exports only from inside itself, and no file imports outside src', () => {
    const files = filesUnder(dir).sort();
    expect(files).toEqual([
      'check.ts',
      'handles/set.ts',
      'handles/value.ts',
      'index.ts',
      'kit.ts',
      'laws/keeps-goals.ts',
      'laws/keeps-set.ts',
      'laws/settles.ts',
      'line.ts',
      'offers.ts',
      'reduce.ts',
      'rules/join.ts',
      'rules/leave.ts',
      'rules/value.ts',
      'schema.ts',
      'settle.ts',
      'types.ts',
      'util.ts',
    ]);
    let seen = 0;
    for (const file of files) {
      for (const path of sourcesOf(readFileSync(join(dir, file), 'utf8'))) {
        seen++;
        expect(path, `${file} imports ${path}`).toMatch(/^\.\.?\/(?:[a-z-]+\/)*[a-z-]+\.ts$/);
        const target = relative(dir, resolve(dir, join(file, '..', path)));
        expect(files, `${file} imports ${path}`).toContain(target);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(40);
  });

  it('has no runtime dependency', () => {
    const manifest = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest.dependencies).toBeUndefined();
  });
});
