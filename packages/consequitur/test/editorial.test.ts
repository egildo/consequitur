// Round 5: the editorial review, a second domain unlike SIBAR's activities, and what does not fit
// the engine. The case (`cases/editorial-review/`) is read as the playground reads it; the first
// describe plays its three scenarios, and the second pins, one test each, the five misfits of
// `docs/misfits.md`: what the engine says today, not what it should.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_KIT,
  canonical,
  emptyState,
  idOf,
  keysAre,
  lockedBy,
  offers,
  playScenario,
  post,
  readScenarios,
  readSchema,
  consequitur,
  type EventLine,
  type Handles,
  type Json,
  type Kit,
  type Labels,
  type LineDraft,
  type Refusal,
  type RuleBinding,
  type RuleKind,
  type Schema,
  type Step,
  type ThreadState,
  type ValueAcc,
  type Writer,
} from '../src/index.ts';
import { membersOf, strict, valuesOf } from './helpers.ts';

const NOW = '2026-10-03T10:00:00.000Z';
const casePath = (file: string) => join(import.meta.dirname, '..', '..', '..', 'cases', 'editorial-review', file);

const SCHEMA_JSON = JSON.parse(readFileSync(casePath('schema.json'), 'utf8')) as { gists: Array<{ gist: string; rules: unknown[] }> };
const SCHEMA: Schema = strict(SCHEMA_JSON);
const SCENARIOS = new Map(readScenarios(readFileSync(casePath('scenarios.json'), 'utf8')).map((s) => [s.id, s]));
const stepsOf = (id: string): Step[] => SCENARIOS.get(id)!.steps;

const by = (id: string): Writer => `user::${id}`;
const draft = (who: string, gist: string, payload: LineDraft['payload']): LineDraft => ({ gist, writer: by(who), payload });
const approve = (who: string, version: string): LineDraft => draft(who, 'approve', { version, stamp: `${version}:${who}` });
const approval = (who: string, version: string): Json => ({ gist: 'approve', writer: by(who), payload: { version } });

/** A thread of a schema with the posts a scenario, or a test, makes to it; what each post added is kept in `log`. */
function thread(schema: Schema = SCHEMA) {
  let state: ThreadState = emptyState(schema);
  const log: string[][] = [];
  const labels: Labels = new Map();
  const say = async (next: LineDraft, confirmed = false): Promise<Refusal | undefined> => {
    const out = await post(state, next, schema, NOW, { confirmed });
    if (out.refusal) return out.refusal;
    state = out.state;
    log.push(out.added.map((l) => l.gist));
    return undefined;
  };
  const io = { lines: () => state.lines, send: (next: LineDraft, confirmed: boolean) => say(next, confirmed) };
  return {
    say,
    log,
    labels,
    get state() {
      return state;
    },
    get values() {
      return valuesOf(state.handles);
    },
    members: (set: string) => membersOf(state.handles, set),
    /** Plays steps, and fails the test at the first that does not go as the scenario says. */
    async play(steps: Step[], after?: (done: { step: Step; labels: Labels }) => void) {
      const played = await playScenario(steps, io, { labels, ...(after ? { after } : {}) });
      expect(played.failed, played.failed?.why).toBeUndefined();
      return played;
    },
    /** What a writer is offered now, by gist. */
    offered: (who: string) => offers(state.lines, by(who), schema).map((o) => o.gist),
    /** The reading of the thread as it stands. */
    reading: () => consequitur(state.lines, state.handles, schema),
    line: (label: string): EventLine => state.lines.find((l) => l.id === labels.get(label))!,
  };
}

/** The steps of a scenario up to, and including, the one labelled so. */
const until = (id: string, label: string): Step[] => {
  const steps = stepsOf(id);
  return steps.slice(0, steps.findIndex((s) => s.label === label) + 1);
};

describe('the editorial review: the schema', () => {
  it('is read by the base kit with no problem, and says its own words', () => {
    const { schema, problems } = readSchema(SCHEMA_JSON, BASE_KIT);
    expect(problems).toEqual([]);
    expect(schema).toMatchObject({ opening: 'submit', authority: 'system::clock', sets: ['team', 'reviewers', 'editors'], judged: ['user'] });
    expect(schema.records).toEqual({ value: 'value_set', join: 'joined', leave: 'left', warning: 'goal_warning' });
    expect(schema.laws.map((l) => l.law)).toEqual(['keeps-set', 'keeps-set', 'keeps-goals', 'settles']);
  });

  it('opens with exactly one «submit», which only a user writes', async () => {
    const t = thread();
    expect(t.offered('aconti')).toEqual(['submit']);
    expect(await t.say({ gist: 'submit', writer: 'system::clock', payload: {} })).toMatchObject({ code: 'writer-not-allowed' });
    expect(await t.say(draft('aconti', 'submit', { title: 'T', version: 'v1' }))).toMatchObject({ code: 'invalid-payload' });
    expect(await t.say(draft('aconti', 'submit', { title: 'T', version: 'v1', authors: ['aconti'], editor: 'drusso' }))).toBeUndefined();
    expect(t.offered('aconti')).not.toContain('submit');
  });
});

describe('the editorial review: «published»', () => {
  it('runs to the end, and the reading says what it should at the steps that matter', async () => {
    const t = thread();
    const seen: string[] = [];
    await t.play(stepsOf('published'), async ({ step, labels }) => {
      seen.push(step.label ?? step.gist);
      const reading = t.reading().goals;
      switch (step.label) {
        case 'submit':
          expect(t.values).toEqual({ title: 'Le biblioteche civiche nel 2030', status: 'draft', version: 'v1' });
          expect(t.members('team')).toEqual(['aconti']);
          expect(t.members('editors')).toEqual(['drusso']);
          expect(t.members('reviewers')).toEqual([]);
          // the author may ask for a review, say a word or leave; nobody else may do more
          expect(t.offered('aconti')).toEqual(['request_review', 'comment', 'leave_team']);
          expect(t.offered('bgalli')).toEqual([]);
          expect(t.offered('drusso')).toEqual(['set_goal', 'deadline']);
          break;
        case 'request':
          expect(t.members('reviewers')).toEqual(['bgalli', 'cneri']);
          expect(t.members('team')).toEqual(['aconti', 'bgalli', 'cneri']);
          expect(t.values.status).toBe('in_review');
          expect(t.offered('bgalli')).toEqual(['request_review', 'approve', 'request_changes', 'comment', 'leave_team']);
          break;
        case 'goal-v1':
          expect(reading).toHaveLength(1);
          expect(reading[0]).toMatchObject({ name: 'Pubblicazione', then: 'publish', met: false, final: true });
          expect(t.offered('drusso')).toContain('set_goal_revoke');
          break;
        case 'bgalli-v1':
          expect(t.values.approvals).toEqual(['v1:bgalli']);
          expect(reading[0].checks.map((c) => 'foundIn' in c)).toEqual([true, false]);
          break;
        case 'changes':
          expect(t.values.status).toBe('changes_requested');
          // approving waits for the review to be open again; the author may answer
          expect(t.offered('bgalli')).not.toContain('approve');
          expect(t.offered('aconti')).toContain('revision');
          break;
        case 'v2':
          expect(t.values).toMatchObject({ status: 'in_review', version: 'v2' });
          // the goal still waits for v1: the thread holds v1 approvals, so nothing is orphaned
          expect(reading[0].met).toBe(false);
          expect(reading[0].checks.some((c) => c.orphan)).toBe(false);
          expect(t.offered('aconti')).not.toContain('revision');
          break;
        case 'goal-v2':
          // the goal was revoked and written new: one goal in force, which waits for v2
          expect(reading).toHaveLength(1);
          expect(reading[0].line).toBe(labels.get('goal-v2'));
          expect(reading[0].checks.map((c) => c.check.payload)).toEqual([{ version: 'v2' }, { version: 'v2' }]);
          break;
        case 'bgalli-v2':
          expect(reading[0].checks.map((c) => 'foundIn' in c)).toEqual([true, false]);
          expect(t.values.status).toBe('in_review');
          break;
        case 'cneri-v2':
          expect(t.values.status).toBe('published');
          expect(reading[0]).toMatchObject({ met: true, final: true });
          break;
        default:
          if (step.gist === 'set_goal_revoke') expect(reading).toHaveLength(0);
      }
    });
    expect(seen).toHaveLength(stepsOf('published').length);
    expect(t.values.approvals).toEqual(['v1:bgalli', 'v2:bgalli', 'v2:cneri']);
  });

  it('has the goal publish, once, as itself, and nothing can take that line out of force', async () => {
    const t = thread();
    await t.play(stepsOf('published'));
    const publish = t.state.lines.filter((l) => l.gist === 'publish');
    expect(publish).toHaveLength(1);
    expect(publish[0].writer).toBe(`goal::${t.labels.get('goal-v2')}`);
    // the goal wrote it as its outcome: after the approval that met it, and a record of the new status
    expect(t.log.at(-1)).toEqual(['approve', 'publish', 'value_set', 'value_set']);
    expect(lockedBy(publish[0], t.state.lines)).toBe(t.labels.get('goal-v2'));
    // no gist revokes a publication: none is offered, and the two that revoke refuse to name it
    const everyone = ['aconti', 'bgalli', 'cneri', 'drusso'].flatMap((who) => offers(t.state.lines, by(who), SCHEMA));
    expect(everyone.filter((o) => o.targets?.includes(publish[0].id))).toEqual([]);
    expect(await t.say(draft('drusso', 'set_goal_revoke', { target: publish[0].id }))).toMatchObject({ code: 'not-revocable' });
    expect(await t.say(draft('bgalli', 'approve_revoke', { target: publish[0].id }))).toMatchObject({ code: 'not-now' });
    // a published article takes no more approvals, and the thread is in agreement with its record
    expect(await t.say(approve('cneri', 'v3'))).toMatchObject({ code: 'not-now' });
    const out = await post(t.state, draft('aconti', 'comment', { text: 'Grazie a tutti.' }), SCHEMA, NOW);
    expect(out.refusal).toBeUndefined();
    expect(out.reading.settled).toBe(true);
  });
});

describe('the editorial review: «late»', () => {
  it('sets «late» when the clock says the deadline passed, and nothing else happens', async () => {
    const t = thread();
    await t.play(until('late', 'changes'));
    const before = { values: t.values, goals: t.reading().goals };
    expect(before.values).toMatchObject({ status: 'changes_requested' });
    expect(before.values).not.toHaveProperty('late');

    await t.play(stepsOf('late').slice(5));
    expect(t.values.deadline).toBe('2026-10-31');
    expect(t.values.late).toBe(true);
    // the only consequence is the value: the status, the approvals and the goal stand as they stood
    expect({ ...t.values, late: undefined, deadline: undefined }).toEqual({ ...before.values, late: undefined, deadline: undefined });
    expect(t.reading().goals).toEqual(before.goals);
    expect(t.log.at(-1)).toEqual(['deadline_passed', 'value_set']);
    expect(t.state.lines.at(-2)?.writer).toBe('system::clock');
    // the clock is not asked to be a member of anything, and an editor's deadline is not the clock's word
    expect(await t.say(draft('drusso', 'deadline_passed', {}))).toMatchObject({ code: 'writer-not-allowed' });
  });
});

describe('the editorial review: «left alone»', () => {
  it('lets one reviewer leave, and refuses the last, by the law on the reviewers', async () => {
    const t = thread();
    const played = await t.play(stepsOf('left-alone'), ({ step }) => {
      if (step.label === 'bgalli-leaves') {
        expect(t.members('reviewers')).toEqual(['cneri']);
        expect(t.members('team')).toEqual(['aconti', 'cneri']);
        expect(t.values.status).toBe('in_review');
      }
    });
    expect(played.refused).toHaveLength(1);
    const { refusal, step } = played.refused[0];
    expect(step.label).toBe('cneri-leaves');
    expect(refusal.code).toBe('law');
    expect(refusal.verdicts).toEqual([expect.objectContaining({ law: 'keeps-set', strength: 'refuse', set: 'reviewers' })]);
    // the refusal changed nothing
    expect(t.members('reviewers')).toEqual(['cneri']);
    expect(t.state.lines.at(-1)?.gist).not.toBe('leave_team');
  });

  it('would have let the last reviewer leave a review nobody had opened', async () => {
    const t = thread();
    await t.play(until('left-alone', 'submit'));
    // the author is the only member of the team, and the law is about the reviewers while in review
    expect(await t.say(draft('aconti', 'leave_team', {}))).toBeUndefined();
    expect(t.members('team')).toEqual([]);
  });
});

describe('what does not fit', () => {
  // 1 · «the current version»
  it('1 · a check holds a version written into it: the goal does not follow the current one', async () => {
    const t = thread();
    await t.play(until('published', 'v2'));
    // the goal of version v1 stands, and the review is on v2
    expect(t.values.version).toBe('v2');
    await t.say(approve('bgalli', 'v2'));
    await t.say(approve('cneri', 'v2'));
    expect(t.values.approvals).toEqual(['v1:bgalli', 'v2:bgalli', 'v2:cneri']);
    // both reviewers approved the current version, and the goal, which named v1, stands waiting
    expect(t.values.status).toBe('in_review');
    const [goal] = t.reading().goals;
    expect(goal.met).toBe(false);
    expect(goal.checks.map((c) => 'foundIn' in c)).toEqual([true, false]);

    // a check cannot say «the version the thread holds»: a reference is a value, compared as written
    const reference = { $value: 'version' };
    const asked = await t.say(
      draft('drusso', 'set_goal', { name: 'Corrente', then: 'publish', checks: [{ gist: 'approve', writer: by('bgalli'), payload: { version: reference } }] }),
    );
    expect(asked).toBeUndefined();
    const current = t.reading().goals.find((g) => g.name === 'Corrente')!;
    expect(current.met).toBe(false);
    expect(t.values.status).toBe('in_review');
    // the way today is to change the goal, which is a revoke and a new line
    expect(canonical(current.checks[0].check as unknown as Json)).toContain('$value');
  });

  // 2 · «before the deadline»
  it('2 · no check on time and no negation: the goal that waits for the deadline cannot ask who has not approved', async () => {
    const t = thread();
    await t.play(until('late', 'bgalli-v1'));
    // «publish at the deadline unless cneri still has to approve» has no words: a check cannot be negated,
    // and cannot read a value, so «late» is only a value that a gist's `when` may read
    const negated = { gist: 'approve', not: true, writer: by('cneri') };
    const reading = { gist: 'deadline_passed', values: { late: true } };
    for (const check of [negated, reading]) {
      expect(await t.say(draft('drusso', 'set_goal', { name: 'Scadenza', then: 'publish', checks: [check as unknown as Json] }))).toMatchObject({ code: 'invalid-payload' });
    }
    // the closest goal waits for the line the clock writes, and publishes whatever is missing
    expect(await t.say(draft('drusso', 'set_goal', { name: 'Scadenza', then: 'publish', checks: [{ gist: 'deadline_passed' }] }))).toBeUndefined();
    expect(await t.say(draft('drusso', 'deadline', { date: '2026-10-31' }))).toBeUndefined();
    expect(t.values.status).toBe('in_review');
    expect(await t.say({ gist: 'deadline_passed', writer: 'system::clock', payload: {} })).toBeUndefined();
    expect(t.values).toMatchObject({ late: true, status: 'published', approvals: ['v1:bgalli'] });
    expect(t.state.lines.filter((l) => l.gist === 'approve').map((l) => l.writer)).toEqual([by('bgalli')]);
  });

  // 3 · «status is A or B»
  it('3 · a `when` names one value per key: an author cannot post a new version of a draft nobody has opened', async () => {
    const t = thread();
    await t.play(until('published', 'submit'));
    expect(t.values.status).toBe('draft');
    expect(t.offered('aconti')).not.toContain('revision');
    expect(await t.say(draft('aconti', 'revision', { version: 'v1b' }))).toMatchObject({ code: 'not-now' });
    // nor can she while it is in review; only the one status the gist names lets it through
    await t.play(until('published', 'request').slice(1));
    expect(t.values.status).toBe('in_review');
    expect(await t.say(draft('aconti', 'revision', { version: 'v1b' }))).toMatchObject({ code: 'not-now' });
    await t.say(draft('cneri', 'request_changes', {}));
    expect(t.offered('aconti')).toContain('revision');
    expect(await t.say(draft('aconti', 'revision', { version: 'v1b' }))).toBeUndefined();
  });

  // 4 · «any two of three reviewers»
  it('4 · a goal is an AND of its checks: «two of three» is as many goals as there are pairs', async () => {
    const asked = (reviewers: string[]) => draft('aconti', 'request_review', { reviewers });
    const start = async () => {
      const t = thread();
      await t.play(until('published', 'submit'));
      await t.say(asked(['bgalli', 'cneri', 'dferri']));
      return t;
    };

    // one goal on the three: two approvals are not enough, all three are
    const all = await start();
    await all.say(draft('drusso', 'set_goal', { name: 'Tre su tre', then: 'publish', checks: ['bgalli', 'cneri', 'dferri'].map((who) => approval(who, 'v1')) }));
    await all.say(approve('bgalli', 'v1'));
    await all.say(approve('cneri', 'v1'));
    expect(all.values.status).toBe('in_review');
    expect(all.reading().goals[0].checks.map((c) => 'foundIn' in c)).toEqual([true, true, false]);
    await all.say(approve('dferri', 'v1'));
    expect(all.values.status).toBe('published');

    // «any two» is the three pairs, each its own goal, and for any k of n it is n choose k
    const pairs = await start();
    for (const [a, b] of [['bgalli', 'cneri'], ['bgalli', 'dferri'], ['cneri', 'dferri']]) {
      expect(await pairs.say(draft('drusso', 'set_goal', { name: `${a} e ${b}`, then: 'publish', checks: [approval(a, 'v1'), approval(b, 'v1')] }))).toBeUndefined();
    }
    expect(pairs.reading().goals).toHaveLength(3);
    await pairs.say(approve('bgalli', 'v1'));
    expect(pairs.values.status).toBe('in_review');
    await pairs.say(approve('dferri', 'v1'));
    expect(pairs.values.status).toBe('published');
    expect(pairs.reading().goals.filter((g) => g.met).map((g) => g.name)).toEqual(['bgalli e dferri']);
  });

  // 5 · «who approved»
  describe('5 · rules read the payload, never the writer: `stamp` repeats the writer', () => {
    /** A rule kind that reads the writer: the list under `key` holds `<payload[prefix]>:<writer's id>` for each line in force. */
    const collectWriter: RuleKind = {
      rule: 'collect-writer',
      handles: ['value'],
      read: (binding) =>
        keysAre(binding, ['key'], ['prefix']) && typeof binding.key === 'string' && (!('prefix' in binding) || typeof binding.prefix === 'string')
          ? (binding as RuleBinding)
          : 'a collect-writer binding has a key, and may have a prefix.',
      admit: (binding, payload) => (typeof binding.prefix === 'string' && typeof payload[binding.prefix] !== 'string' ? `The key "${binding.prefix}" must hold a string` : undefined),
      expect(binding, line, acc) {
        const stated = acc('value') as ValueAcc | undefined;
        const id = idOf(line.writer);
        const prefix = binding.prefix as string | undefined;
        const part = prefix === undefined ? undefined : line.payload[prefix];
        if (!stated || id === undefined || (prefix !== undefined && typeof part !== 'string')) return;
        const item = part === undefined ? id : `${String(part)}:${id}`;
        const key = binding.key as string;
        const held = stated.get(key);
        const list = held?.collected ? (held.value as Json[]) : [];
        if (list.some((v) => canonical(v) === canonical(item))) return;
        stated.set(key, { value: [...list, item], line: line.id, collected: true });
      },
    };
    const KIT: Kit = { ...BASE_KIT, rules: [...BASE_KIT.rules, collectWriter] };

    /** The case with `approve` reading the writer: no `stamp`. */
    const variant = {
      ...SCHEMA_JSON,
      gists: SCHEMA_JSON.gists.map((g) => (g.gist === 'approve' ? { ...g, rules: [{ rule: 'collect-writer', key: 'approvals', prefix: 'version' }] } : g)),
    };

    it('needs the stamp today, and refuses an approval without it', async () => {
      const t = thread();
      await t.play(until('published', 'request'));
      expect(await t.say(draft('bgalli', 'approve', { version: 'v1' }))).toMatchObject({ code: 'invalid-payload', detail: expect.stringContaining('"stamp"') });
      // and nothing checks that the stamp says what it should: it is the writer's own word
      expect(await t.say(draft('bgalli', 'approve', { version: 'v1', stamp: 'v1:cneri' }))).toBeUndefined();
      expect(t.values.approvals).toEqual(['v1:cneri']);
    });

    it('is a rule kind registered in a kit, which the base kit refuses', () => {
      expect(readSchema(variant, KIT).problems).toEqual([]);
      expect(readSchema(variant, BASE_KIT).problems).toEqual([expect.stringContaining('collect-writer')]);
      expect(readSchema({ ...variant, gists: variant.gists.map((g) => (g.gist === 'approve' ? { ...g, rules: [{ rule: 'collect-writer', prefix: 'version' }] } : g)) }, KIT).problems).toHaveLength(1);
    });

    it('removes the stamp: the scenario without it deduces the same approvals, from the writers', async () => {
      const withStamp = thread();
      await withStamp.play(stepsOf('published'));

      const stamped = (step: Step): Step => {
        if (step.gist !== 'approve') return step;
        const { stamp: _stamp, ...payload } = step.payload;
        return { ...step, payload };
      };
      const steps = stepsOf('published').map(stamped);
      expect(steps.filter((s) => s.gist === 'approve').every((s) => !('stamp' in s.payload))).toBe(true);

      const without = thread(strict(variant, KIT));
      await without.play(steps);
      expect(without.values.approvals).toEqual(['v1:bgalli', 'v2:bgalli', 'v2:cneri']);
      expect(without.values).toEqual(withStamp.values);
      expect(without.state.handles).toEqual(withStamp.state.handles as Handles);
      // and nobody can sign for another: the line's writer is the one the rule reads
      const t = thread(strict(variant, KIT));
      await t.play(until('published', 'request').map(stamped));
      expect(await t.say(draft('bgalli', 'approve', { version: 'v1', stamp: 'v1:cneri' }))).toBeUndefined();
      expect(t.values.approvals).toEqual(['v1:bgalli']);
      expect(await t.say(draft('bgalli', 'approve', {}))).toMatchObject({ code: 'invalid-payload' });
    });
  });
});
