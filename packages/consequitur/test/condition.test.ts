// The condition module: consequitur's form of a condition, read by the reader's rules, translated to
// `kdlet-guards`' form and back, evaluated with the references resolved from a scope, and its trace
// read for what can no longer hold.

import { describe, expect, it } from 'vitest';
import { conditionHolds, conditionProblem, evaluateCondition, fromModuleForm, lostAt, nodes, resolveCheck, toModuleForm, type Condition, type EventLine, type Names, type Scope, type Trace } from '../src/index.ts';
import { guardsProblems, markLost } from '../src/condition.ts';

const line = (id: string, gist: string, writer: EventLine['writer'], payload: EventLine['payload'] = {}): EventLine => ({ id, previous: null, gist, writer, timestamp: `2026-10-06T10:00:0${id}.000Z`, payload });

const NAMES: Names = { sets: ['reviewers'], guards: { reviewer: { is: { $writer: 'id' }, values: [{ $set: 'reviewers' }] } } };

const LINES = [line('1', 'submit', 'user::aconti', { version: 'v1' }), line('2', 'approve', 'user::bgalli', { version: 'v2' }), line('3', 'approve', 'user::cneri', { version: 'v1' })];

const scope = (extra: Partial<Scope> = {}): Scope => ({
  handles: { value: { status: 'in_review', version: 'v2', empty: '' }, set: { reviewers: ['bgalli', 'cneri'] } },
  lines: LINES,
  guards: NAMES.guards,
  ...extra,
});

const approved = (who: string): Extract<Condition, { line: unknown }> => ({ line: { gist: 'approve', writer: `user::${who}`, payload: { version: { $value: 'version' } } } });

describe('conditionProblem', () => {
  it('accepts every node, and the references where they may stand', () => {
    const every: Condition = {
      all: [
        { is: { $value: 'status' }, values: ['in_review', 'draft', 1, true, null] },
        { has: { $set: 'reviewers' } },
        { not: { guard: 'reviewer' } },
        { any: [approved('bgalli'), { line: { gist: 'submit' } }] },
        { atLeast: 1, of: [approved('cneri')] },
      ],
    };
    expect(conditionProblem(every, NAMES, true)).toBeUndefined();
    expect(conditionProblem({ all: [approved('bgalli'), { not: { has: { $set: 'reviewers' } } }] }, NAMES, false)).toBeUndefined();
    expect(conditionProblem({ is: { $draft: 'version' }, values: [{ $value: 'version' }, { $writer: 'kin' }] }, NAMES, true)).toBeUndefined();
  });

  it('names a node of the wrong shape, a key too many, an empty list, a quorum out of range', () => {
    const bad: unknown[] = [
      null,
      [],
      {},
      { is: 'a' },
      { is: 'a', values: [] },
      { is: 'a', values: ['b'], extra: 1 },
      { is: ['a'], values: ['b'] },
      { is: 'a', values: [{ b: 1 }] },
      { is: 'a', values: [Number.NaN] },
      { has: { $value: 'a', $set: 'reviewers' } },
      { has: { $value: 1 } },
      { has: { $other: 'x' } },
      { not: 'x' },
      { all: [] },
      { any: {} },
      { all: [{ is: 'a', values: ['a'] }, {}] },
      { guard: 'nobody' },
      { guard: 'toString' },
      { line: {} },
      { line: { gist: 'a', other: 1 } },
      { line: { payload: { version: { $value: 'version', more: 1 } } } },
      { atLeast: 0, of: [{ guard: 'reviewer' }] },
      { atLeast: 2, of: [{ guard: 'reviewer' }] },
      { atLeast: 1.5, of: [{ guard: 'reviewer' }, { guard: 'reviewer' }] },
      { atLeast: 1 },
      { has: { $set: 'editors' } },
      { has: { $writer: 'name' } },
    ];
    for (const value of bad) expect(conditionProblem(value, NAMES, true), JSON.stringify(value)).toEqual(expect.any(String));
  });

  it('keeps $writer and $draft to a `when`, and outside one refuses a guard that reads them', () => {
    expect(conditionProblem({ has: { $draft: 'x' } }, NAMES, false)).toMatch(/\$draft may stand only in a when/);
    expect(conditionProblem({ is: 'a', values: [{ $writer: 'id' }] }, NAMES, false)).toMatch(/\$writer may stand only in a when/);
    expect(conditionProblem({ all: [{ guard: 'reviewer' }] }, NAMES, false)).toMatch(/\$writer/);
    expect(conditionProblem({ all: [{ guard: 'reviewer' }] }, NAMES, true)).toBeUndefined();
  });
});

describe('guardsProblems', () => {
  it('reads guards that name each other, and names one that names a guard not there, or depends on itself', () => {
    expect(guardsProblems({ a: { guard: 'b' }, b: { has: { $value: 'x' } } }, [])).toEqual([]);
    expect(guardsProblems({ a: { guard: 'c' } }, [])).toEqual([expect.stringContaining('guard "a"')]);
    expect(guardsProblems({ a: { guard: 'b' }, b: { not: { guard: 'a' } } }, [])).toEqual(['guard "b" depends on itself', 'guard "a" depends on itself']);
    expect(guardsProblems({ a: { guard: 'a' } }, [])).toEqual([expect.stringContaining('depends on itself')]);
    expect(guardsProblems([], [])).toHaveLength(1);
    expect(guardsProblems({ a: { has: { $set: 'nowhere' } } }, [])).toEqual([expect.stringContaining('nowhere')]);
  });
});

describe('the translation', () => {
  const every: Condition = {
    any: [
      { is: { $writer: 'id' }, values: [{ $set: 'reviewers' }, 'drusso'] },
      { has: { $draft: 'version' } },
      { not: { all: [{ guard: 'reviewer' }, { is: { $value: 'late' }, values: [true] }] } },
      { atLeast: 2, of: [approved('bgalli'), approved('cneri'), { line: { gist: 'submit', kin: 'user' } }] },
    ],
  };

  it('writes references as refs and the two nodes as words', () => {
    expect(toModuleForm(every)).toEqual({
      any: [
        { is: { ref: { from: 'writer', field: 'id' } }, values: [{ ref: { from: 'set', field: 'reviewers' } }, 'drusso'] },
        { has: { ref: { from: 'draft', field: 'version' } } },
        { not: { all: [{ guard: 'reviewer' }, { is: { ref: { from: 'value', field: 'late' } }, values: [true] }] } },
        { word: 'at-least', args: 2, body: [{ word: 'line', args: approved('bgalli').line }, { word: 'line', args: approved('cneri').line }, { word: 'line', args: { gist: 'submit', kin: 'user' } }] },
      ],
    });
  });

  it('replaces a $set among the values of an `is` by its members, for an evaluation', () => {
    expect(toModuleForm({ is: { $writer: 'id' }, values: [{ $set: 'reviewers' }, 'drusso'] }, () => ['bgalli', 'cneri'])).toEqual({
      is: { ref: { from: 'writer', field: 'id' } },
      values: ['bgalli', 'cneri', 'drusso'],
    });
  });

  it('comes back the same way: a round trip gives the condition again', () => {
    expect(fromModuleForm(toModuleForm(every))).toEqual(every);
  });

  it('says what consequitur cannot say', () => {
    expect(fromModuleForm({ word: 'between', args: [1, 2] })).toMatch(/between/);
    expect(fromModuleForm({ has: { ref: { from: 'input', field: 'x' } } })).toMatch(/\(input\)x/);
    expect(fromModuleForm({ is: { ref: { from: 'writer', field: 'name' } }, values: [] })).toEqual(expect.any(String));
  });
});

describe('evaluateCondition', () => {
  it('finds a line, with the check as resolved, the reference replaced by the value the thread holds', () => {
    const trace = evaluateCondition(approved('bgalli'), scope());
    expect(trace).toEqual({ condition: approved('bgalli'), holds: true, foundIn: '2', check: { gist: 'approve', writer: 'user::bgalli', payload: { version: 'v2' } } });
    // cneri approved v1, and the thread is on v2
    expect(evaluateCondition(approved('cneri'), scope())).toMatchObject({ holds: false, check: { payload: { version: 'v2' } } });
    expect(evaluateCondition(approved('cneri'), scope()).foundIn).toBeUndefined();
  });

  it('leaves a check whose reference names a key the thread does not hold unmet, and unresolved', () => {
    const trace = evaluateCondition({ line: { gist: 'approve', payload: { version: { $value: 'nothing' } } } }, scope());
    expect(trace).toEqual({ condition: { line: { gist: 'approve', payload: { version: { $value: 'nothing' } } } }, holds: false });
    expect(resolveCheck({ gist: 'approve', payload: { version: { $value: 'nothing' } } }, scope().handles)).toBeUndefined();
  });

  it('never finds the line it is told to leave out', () => {
    expect(evaluateCondition({ line: { gist: 'submit' } }, scope({ self: '1' })).holds).toBe(false);
  });

  it('reads membership as a $set among the values, and the writer by id and kin', () => {
    expect(conditionHolds({ guard: 'reviewer' }, scope({ writer: 'user::cneri' }))).toBe(true);
    expect(conditionHolds({ guard: 'reviewer' }, scope({ writer: 'user::aconti' }))).toBe(false);
    expect(conditionHolds({ is: { $writer: 'kin' }, values: ['user'] }, scope({ writer: 'user::aconti' }))).toBe(true);
    // with no writer the reference is absent, and `is` is false
    expect(conditionHolds({ guard: 'reviewer' }, scope())).toBe(false);
  });

  it('reads `has` as the module does: an empty text, an empty set, an absent key have nothing', () => {
    expect(conditionHolds({ has: { $value: 'status' } }, scope())).toBe(true);
    expect(conditionHolds({ has: { $value: 'empty' } }, scope())).toBe(false);
    expect(conditionHolds({ has: { $value: 'absent' } }, scope())).toBe(false);
    expect(conditionHolds({ has: { $set: 'reviewers' } }, scope())).toBe(true);
    expect(conditionHolds({ has: { $set: 'reviewers' } }, scope({ handles: { value: {}, set: { reviewers: [] } } }))).toBe(false);
  });

  it('traces every child, those an `all` or an `any` did not need to ask included', () => {
    const condition: Condition = { all: [approved('cneri'), approved('bgalli'), { not: { line: { gist: 'submit' } } }] };
    const trace = evaluateCondition(condition, scope());
    expect(trace.holds).toBe(false);
    expect(trace.children?.map((c) => c.holds)).toEqual([false, true, false]);
    expect(trace.children?.[1].foundIn).toBe('2');
    expect(trace.children?.[2].children?.[0]).toMatchObject({ holds: true, foundIn: '1' });
    const any = evaluateCondition({ any: [approved('bgalli'), approved('cneri')] }, scope());
    expect(any.children?.map((c) => c.holds)).toEqual([true, false]);
  });

  it('gives a named guard its body as its one child, and `atLeast` every child', () => {
    const guard = evaluateCondition({ guard: 'reviewer' }, scope({ writer: 'user::bgalli' }));
    expect(guard).toEqual({ condition: { guard: 'reviewer' }, holds: true, children: [{ condition: NAMES.guards.reviewer, holds: true }] });
    const quorum = evaluateCondition({ atLeast: 2, of: [approved('bgalli'), approved('cneri'), { line: { gist: 'submit' } }] }, scope());
    expect(quorum.holds).toBe(true);
    expect(quorum.children?.map((c) => c.holds)).toEqual([true, false, true]);
    expect(nodes(quorum).map((n) => n.path)).toEqual(['', '0', '1', '2']);
  });
});

describe('the draft a menu does not have', () => {
  const unknown = scope({ writer: 'user::bgalli', draft: 'unknown' });
  const current: Condition = { is: { $draft: 'version' }, values: [{ $value: 'version' }] };

  it('is unknown, and unknown spreads by the strong tables', () => {
    expect(conditionHolds(current, unknown)).toBe('unknown');
    expect(conditionHolds({ not: current }, unknown)).toBe('unknown');
    expect(conditionHolds({ all: [{ guard: 'reviewer' }, current] }, unknown)).toBe('unknown');
    expect(conditionHolds({ all: [{ has: { $value: 'absent' } }, current] }, unknown)).toBe(false);
    expect(conditionHolds({ any: [{ guard: 'reviewer' }, current] }, unknown)).toBe(true);
    expect(conditionHolds({ any: [{ has: { $value: 'absent' } }, current] }, unknown)).toBe('unknown');
  });

  it('makes `atLeast n` true with n children true, false when fewer could still be, otherwise unknown', () => {
    const no: Condition = { has: { $value: 'absent' } };
    const yes: Condition = { has: { $value: 'status' } };
    expect(conditionHolds({ atLeast: 2, of: [yes, yes, current] }, unknown)).toBe(true);
    expect(conditionHolds({ atLeast: 2, of: [yes, current, no] }, unknown)).toBe('unknown');
    expect(conditionHolds({ atLeast: 2, of: [no, current, no] }, unknown)).toBe(false);
  });

  it('is known once the draft is there', () => {
    expect(conditionHolds(current, scope({ draft: { version: 'v2' } }))).toBe(true);
    expect(conditionHolds(current, scope({ draft: { version: 'v1' } }))).toBe(false);
    expect(conditionHolds(current, scope({ draft: {} }))).toBe(false);
  });
});

describe('what can no longer hold', () => {
  /** A trace of a condition where the `line` nodes named lost cannot come true. */
  const read = (condition: Condition, lost: string[]): Trace => {
    const trace = evaluateCondition(condition, scope());
    markLost(trace, (node) => {
      const c = node.condition;
      return 'line' in c && typeof c.line.gist === 'string' && lost.includes(c.line.gist);
    });
    return trace;
  };
  const awaited = (gist: string): Condition => ({ line: { gist } });

  it('loses an `all` with a child, and names the first lost child', () => {
    const trace = read({ all: [awaited('a'), awaited('b'), awaited('c')] }, ['b', 'c']);
    expect(nodes(trace).filter((n) => n.node.lost).map((n) => n.path)).toEqual(['', '1', '2']);
    expect(lostAt(trace)).toBe('1');
  });

  it('loses an `any` only with every child, and names the `any`', () => {
    expect(lostAt(read({ all: [awaited('a'), { any: [awaited('b'), awaited('c')] }] }, ['b']))).toBeUndefined();
    expect(lostAt(read({ all: [awaited('a'), { any: [awaited('b'), awaited('c')] }] }, ['b', 'c']))).toBe('1');
  });

  it('loses an `atLeast n` when fewer than n can still hold', () => {
    const quorum = (lost: string[]) => lostAt(read({ atLeast: 2, of: [awaited('a'), awaited('b'), awaited('c')] }, lost));
    expect(quorum(['a'])).toBeUndefined();
    expect(quorum(['a', 'b'])).toBe('');
  });

  it('never loses `not`, `is` or `has`, nor a node that holds; a guard as its body', () => {
    expect(lostAt(read({ not: awaited('a') }, ['a']))).toBeUndefined();
    expect(lostAt(read({ all: [{ has: { $value: 'absent' } }] }, []))).toBeUndefined();
    expect(lostAt(read({ any: [awaited('submit'), awaited('b')] }, ['submit', 'b']))).toBeUndefined();
    const guarded = evaluateCondition({ all: [{ guard: 'reviewer' }] }, scope({ guards: { reviewer: awaited('x') } }));
    markLost(guarded, () => true);
    expect(lostAt(guarded)).toBe('0.0');
  });
});
