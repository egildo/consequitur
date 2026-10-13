// The declaration's `from`: the sources a consolidation names on its first line. The golden ids
// pin that a thread that names none keeps the ids it always had.

import { describe, expect, it } from 'vitest';
import { canonical, consequitur, dryRun, emptyState, inOrder, post, stamp, verify, type EventLine, type LineDraft, type Seal } from '../src/index.ts';
import { PLAIN } from './helpers.ts';

const NOW = '2026-10-13T10:00:00.000Z';
const NONCE = '00'.repeat(16);
const first: LineDraft = { gist: 'create', writer: 'user::mrossi', payload: { name: 'A', assignTo: ['mrossi'] } };
const second: LineDraft = { gist: 'comment', writer: 'user::mrossi', payload: { text: 'uno' } };
const SEALS: Seal[] = [
  { first: 'sha256:' + 'a'.repeat(64), last: 'sha256:' + 'b'.repeat(64) },
  { first: 'sha256:' + 'c'.repeat(64), last: 'sha256:' + 'd'.repeat(64) },
];

describe('the declaration, before it names sources', () => {
  it('keeps the ids of a thread that names none', async () => {
    const one = await stamp(first, [], NOW, { schema: PLAIN, nonce: NONCE });
    const two = await stamp(second, [one], NOW, { schema: PLAIN });
    expect(one.id).toBe('sha256:256d8673f52252330ac6752bdc010369e675be602d8751a6e6c54f56cf95118e');
    expect(two.id).toBe('sha256:73e4d433d0cff1f3cc711555a89012226e92ad74e42e9379ff7d37682fea73a2');
  });
});

describe('the declaration, when it names sources', () => {
  const GOLDEN_FIRST = 'sha256:256d8673f52252330ac6752bdc010369e675be602d8751a6e6c54f56cf95118e';
  const idsOf = (lines: EventLine[]) => lines.map((l) => l.id);
  const sha256 = async (text: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  };

  it('writes from on the first line, beside the nonce and the schema name and version', async () => {
    const line = await stamp(first, [], NOW, { schema: PLAIN, nonce: NONCE, from: SEALS });
    expect(line.thread).toEqual({ nonce: NONCE, schema: 'sibar-activity', version: 1, from: SEALS });
  });

  it('never writes from on a later line, even when handed one', async () => {
    const one = await stamp(first, [], NOW, { schema: PLAIN, nonce: NONCE, from: SEALS });
    const two = await stamp(second, [one], NOW, { schema: PLAIN, from: SEALS });
    expect(two.thread).toBeUndefined();
    expect(two.id).toBe((await stamp(second, [one], NOW, { schema: PLAIN })).id);
  });

  it('leaves no from key at all when from is absent or empty, and gives the golden id', async () => {
    for (const opening of [{ schema: PLAIN, nonce: NONCE }, { schema: PLAIN, nonce: NONCE, from: [] }]) {
      const line = await stamp(first, [], NOW, opening);
      expect(line.id).toBe(GOLDEN_FIRST);
      expect(line.thread).toEqual({ nonce: NONCE, schema: 'sibar-activity', version: 1 });
      expect(line.thread).not.toHaveProperty('from');
    }
  });

  it('changes the id, and the id verifies; a from edited or removed does not verify; a JSON round trip still does', async () => {
    const named = await stamp(first, [], NOW, { schema: PLAIN, nonce: NONCE, from: SEALS });
    expect(named.id).not.toBe(GOLDEN_FIRST);
    expect(await verify(named)).toBe(true);
    expect(await verify(JSON.parse(JSON.stringify(named)) as EventLine)).toBe(true);
    const edits: EventLine[] = [
      { ...named, thread: { ...named.thread!, from: [SEALS[1], SEALS[0]] } },
      { ...named, thread: { ...named.thread!, from: [{ ...SEALS[0], last: SEALS[1].first }, SEALS[1]] } },
      { ...named, thread: { nonce: NONCE, schema: 'sibar-activity', version: 1 } },
    ];
    for (const edited of edits) expect(await verify(edited)).toBe(false);
  });

  it('is the sixth field of the hash: canonical of the five and the declaration, from included', async () => {
    const named = await stamp(first, [], NOW, { schema: PLAIN, nonce: NONCE, from: SEALS });
    const five = [named.previous, named.gist, named.writer, named.timestamp, named.payload];
    expect(named.id).toBe(await sha256(canonical([...five, named.thread!])));
  });

  it('post and dryRun write from on the first line of an empty thread, and two calls give the same ids', async () => {
    const options = { nonce: NONCE, from: SEALS };
    const [a, b] = [await post(emptyState(PLAIN), first, PLAIN, NOW, options), await post(emptyState(PLAIN), first, PLAIN, NOW, options)];
    const run = await dryRun(emptyState(PLAIN), first, PLAIN, NOW, options);
    expect(a.refusal).toBeUndefined();
    expect(a.state.lines[0].thread).toEqual({ nonce: NONCE, schema: 'sibar-activity', version: 1, from: SEALS });
    expect(idsOf(b.state.lines)).toEqual(idsOf(a.state.lines));
    expect(idsOf(run.state.lines)).toEqual(idsOf(a.state.lines));
  });

  it('a later post with from in its options writes none', async () => {
    const opened = await post(emptyState(PLAIN), first, PLAIN, NOW, { nonce: NONCE });
    const later = await post(opened.state, second, PLAIN, NOW, { from: SEALS });
    expect(later.refusal).toBeUndefined();
    expect(later.added.length).toBeGreaterThan(0);
    for (const line of later.added) expect(line.thread).toBeUndefined();
  });

  it('a thread whose first line has from is read as before', async () => {
    const opened = await post(emptyState(PLAIN), first, PLAIN, NOW, { nonce: NONCE, from: SEALS });
    const grown = await post(opened.state, second, PLAIN, NOW);
    const { lines, handles } = grown.state;
    expect(() => consequitur(lines, handles, PLAIN)).not.toThrow();
    expect(() => inOrder(lines, PLAIN)).not.toThrow();
    expect(idsOf(inOrder(lines, PLAIN))).toEqual(idsOf(lines));
  });
});
