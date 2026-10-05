import { describe, expect, it } from 'vitest';
import { post, reduce, stamp, type Json, type EventLine, type LineDraft, type Payload, type PostResult } from 'consequitur';
import { lineFacts } from '../src/index.ts';
import { NOW, SIBAR, lbianchi, mrossi, opening, system, written } from './helpers.ts';

const gistNamed = (lines: EventLine[], gist: string) => lines.filter((l) => l.gist === gist);

const factsOf = (r: PostResult) => lineFacts(r.state.lines, r.reading, SIBAR);
const of = (facts: ReturnType<typeof factsOf>, line: EventLine) => facts.find((f) => f.line.id === line.id)!;

describe('lineFacts', () => {
  it('reads a stored line whose payload is not an object as stating nothing, and does not throw', async () => {
    // the engine never writes one: such a line comes from storage the engine did not keep
    for (const payload of [null, 'text', [1]] as unknown as Payload[]) {
      const r = await written([opening]);
      const lines = [...r.state.lines];
      for (const draft of [mrossi('memo_revoke', payload), { gist: 'goal_warning', writer: 'goal::x', payload } satisfies LineDraft]) lines.push(await stamp(draft, lines, NOW));
      const facts = lineFacts(lines, reduce(lines, r.state.handles, SIBAR), SIBAR);
      expect(facts).toHaveLength(lines.length);
      expect(facts.every((f) => f.inForce && f.revokedBy === undefined && f.goal === undefined)).toBe(true);
    }
  });

  it('reads a stored line whose writer, gist, timestamp or id is not a string as stating nothing, and does not throw', async () => {
    // the engine never writes one: such a line comes from storage the engine did not keep
    const MISSING = Symbol('missing');
    const odd = (line: EventLine, field: keyof EventLine, value: unknown): EventLine => {
      const { [field]: _, ...rest } = line;
      return (value === MISSING ? rest : { ...rest, [field]: value }) as unknown as EventLine;
    };
    const r = await written([opening, mrossi('memo', { text: 'uno' })]);
    const memo = r.state.lines.at(-1)!;
    const lines = [
      ...r.state.lines,
      ...[7, null, MISSING].map((writer) => odd(memo, 'writer', writer)),
      odd(memo, 'gist', 7),
      odd(memo, 'timestamp', null),
      odd(memo, 'timestamp', 7),
      odd(memo, 'id', 7),
    ];
    const facts = lineFacts(lines, reduce(lines, r.state.handles, SIBAR), SIBAR);
    expect(facts).toHaveLength(lines.length);
    expect(facts.every((f) => f.writtenBy === undefined && f.goal === undefined && f.revokedBy === undefined)).toBe(true);
  });

  it('has one entry per line, in reading order, whatever the order given', async () => {
    const r = await written([opening, mrossi('memo', { text: 'uno' })]);
    const shuffled = [...r.state.lines].reverse();
    const facts = lineFacts(shuffled, r.reading, SIBAR);
    expect(facts.map((f) => f.line.id)).toEqual(r.state.lines.map((l) => l.id));
    expect(facts.every((f) => f.inForce)).toBe(true);
  });

  it('says a revoked line is out of force and names the line that revokes it', async () => {
    const memo = await written([opening, mrossi('memo', { text: 'uno' })]);
    const target = gistNamed(memo.state.lines, 'memo')[0];
    const r = await post(memo.state, mrossi('memo_revoke', { target: target.id }), SIBAR, NOW);
    const revoke = gistNamed(r.state.lines, 'memo_revoke')[0];
    const facts = factsOf(r);
    expect(of(facts, target)).toMatchObject({ inForce: false, revokedBy: revoke });
    expect(of(facts, revoke)).toMatchObject({ inForce: true });
    expect(of(facts, revoke).revokedBy).toBeUndefined();
    expect(of(facts, revoke).goal).toBeUndefined();
  });

  it('gives the target back when the revoking line is itself revoked', async () => {
    const memo = await written([opening, mrossi('memo', { text: 'uno' })]);
    const target = gistNamed(memo.state.lines, 'memo')[0];
    const first = await post(memo.state, mrossi('memo_revoke', { target: target.id }), SIBAR, NOW);
    // a revoking line is revoked by a line of a gist that lists it: add one to the case
    const revokeId = gistNamed(first.state.lines, 'memo_revoke')[0].id;
    const schema = { ...SIBAR, gists: [...SIBAR.gists, { gist: 'memo_restore', writers: ['user'], rules: [{ rule: 'revoke', from: 'target', gists: ['memo_revoke'] }] }] };
    const restored = await post(first.state, mrossi('memo_restore', { target: revokeId }), schema, NOW);
    expect(restored.refusal).toBeUndefined();
    const facts = lineFacts(restored.state.lines, restored.reading, schema);
    expect(of(facts, target)).toMatchObject({ inForce: true });
    expect(of(facts, target).revokedBy).toBeUndefined();
    expect(of(facts, gistNamed(restored.state.lines, 'memo_revoke')[0])).toMatchObject({ inForce: false, revokedBy: gistNamed(restored.state.lines, 'memo_restore')[0] });
  });

  describe('a goal', () => {
    const goalDraft = (extra: LineDraft['payload'] = {}, checks: Json = [{ gist: 'got_it', writer: 'user::lbianchi' }]) =>
      mrossi('set_goal', { name: 'visto', then: 'closed', checks, ...extra });
    const memoOf = (lines: EventLine[]) => gistNamed(lines, 'memo')[0];

    it('is read on its own line, with no warnings and its outcome unlocked, and writes its outcome', async () => {
      const r = await written([opening, mrossi('memo', { text: 'p', assignTo: ['lbianchi'] }), goalDraft()]);
      const goalLine = gistNamed(r.state.lines, 'set_goal')[0];
      const goal = of(factsOf(r), goalLine);
      expect(goal.goal).toBe(r.reading.goals[0]);
      expect(goal.warnings).toEqual({});
      expect(goal.locked).toBe(false);
      expect(goal.writtenBy).toBeUndefined();

      const met = await post(r.state, lbianchi('got_it', { about: memoOf(r.state.lines).id }), SIBAR, NOW);
      const closed = gistNamed(met.state.lines, 'closed')[0];
      expect(of(factsOf(met), closed)).toMatchObject({ writtenBy: goalLine.id, inForce: true });
      expect(of(factsOf(met), closed).goal).toBeUndefined();
      expect(of(factsOf(met), goalLine).goal).toMatchObject({ met: true, outcome: closed.id });
    });

    it('is locked when final, and what it wrote says who wrote it', async () => {
      const r = await written([opening, mrossi('memo', { text: 'p', assignTo: ['lbianchi'] }), goalDraft({ final: true }), lbianchi('got_it', { about: 'x' })]);
      const goalLine = gistNamed(r.state.lines, 'set_goal')[0];
      const facts = factsOf(r);
      expect(of(facts, goalLine)).toMatchObject({ locked: true });
      expect(of(facts, gistNamed(r.state.lines, 'closed')[0])).toMatchObject({ writtenBy: goalLine.id });
    });

    it('holds its warning lines by check index once a check is lost', async () => {
      const memo = await written([opening, mrossi('memo', { text: 'p', assignTo: ['lbianchi'] })]);
      const id = memoOf(memo.state.lines).id;
      const withGoal = await post(memo.state, goalDraft({}, [{ gist: 'got_it', writer: 'user::lbianchi', payload: { about: id } }]), SIBAR, NOW);
      const out = await post(withGoal.state, mrossi('memo_revoke', { target: id }), SIBAR, NOW, { confirmed: true });
      expect(out.refusal).toBeUndefined();
      const warning = gistNamed(out.state.lines, 'goal_warning')[0];
      const goalLine = gistNamed(out.state.lines, 'set_goal')[0];
      const facts = factsOf(out);
      expect(of(facts, goalLine).warnings).toEqual({ 0: warning });
      expect(of(facts, warning)).toMatchObject({ writtenBy: goalLine.id });
      expect(of(facts, warning).warnings).toBeUndefined();
    });

    it('a revoked goal line is out of force and names its revoking line', async () => {
      const r = await written([opening, goalDraft({}, [{ gist: 'got_it' }])]);
      const goalLine = gistNamed(r.state.lines, 'set_goal')[0];
      const out = await post(r.state, mrossi('set_goal_revoke', { target: goalLine.id }), SIBAR, NOW);
      const facts = factsOf(out);
      expect(of(facts, goalLine)).toMatchObject({ inForce: false, revokedBy: gistNamed(out.state.lines, 'set_goal_revoke')[0] });
    });
  });

  it('reads a thread the reading was made of, line for line, with the records of the authority', async () => {
    const r = await written([opening, system('doc_signed', { document: '1', signedAt: 'x' })]);
    expect(reduce(r.state.lines, r.state.handles, SIBAR)).toEqual(r.reading);
    expect(factsOf(r).map((f) => f.line.gist)).toEqual(['create', 'metadata_set', 'metadata_set', 'assigned', 'doc_signed']);
  });
});
