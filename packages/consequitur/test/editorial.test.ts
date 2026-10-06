// The editorial review, a second domain unlike SIBAR's activities, chosen so that what did not fit
// the engine would show. The case (`cases/editorial-review/`) is read as the playground reads it; the
// first describes play its three scenarios, and the last shows, one test each, that the five misfits of
// `docs/misfits.md` now fit.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_KIT,
  emptyState,
  lockedBy,
  offers,
  playScenario,
  post,
  readScenarios,
  readSchema,
  consequitur,
  type EventLine,
  type Json,
  type Labels,
  type LineDraft,
  type Refusal,
  type Schema,
  type Step,
  type ThreadState,
  type Writer,
} from '../src/index.ts';
import { lineNodes, membersOf, strict, valuesOf } from './helpers.ts';

const NOW = '2026-10-03T10:00:00.000Z';
const casePath = (file: string) => join(import.meta.dirname, '..', '..', '..', 'cases', 'editorial-review', file);

const SCHEMA_JSON = JSON.parse(readFileSync(casePath('schema.json'), 'utf8')) as { gists: Array<{ gist: string; rules: unknown[] }> };
const SCHEMA: Schema = strict(SCHEMA_JSON);
const SCENARIOS = new Map(readScenarios(readFileSync(casePath('scenarios.json'), 'utf8')).map((s) => [s.id, s]));
const stepsOf = (id: string): Step[] => SCENARIOS.get(id)!.steps;

const by = (id: string): Writer => `user::${id}`;
const draft = (who: string, gist: string, payload: LineDraft['payload']): LineDraft => ({ gist, writer: by(who), payload });
const approve = (who: string, version: string): LineDraft => draft(who, 'approve', { version });

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
    await t.play(stepsOf('published'), async ({ step }) => {
      seen.push(step.label ?? step.gist);
      const reading = t.reading().goals;
      switch (step.label) {
        case 'submit':
          expect(t.values).toEqual({ title: 'Le biblioteche civiche nel 2030', status: 'draft', version: 'v1' });
          expect(t.members('team')).toEqual(['aconti']);
          expect(t.members('editors')).toEqual(['drusso']);
          expect(t.members('reviewers')).toEqual([]);
          // the author may send a new version, ask for a review, say a word or leave; nobody else may do more
          expect(t.offered('aconti')).toEqual(['revision', 'request_review', 'comment', 'leave_team']);
          expect(t.offered('bgalli')).toEqual([]);
          expect(t.offered('drusso')).toEqual(['set_goal', 'deadline']);
          break;
        case 'request':
          expect(t.members('reviewers')).toEqual(['bgalli', 'cneri']);
          expect(t.members('team')).toEqual(['aconti', 'bgalli', 'cneri']);
          expect(t.values.status).toBe('in_review');
          expect(t.offered('bgalli')).toEqual(['request_review', 'approve', 'request_changes', 'comment', 'leave_team']);
          break;
        case 'goal':
          expect(reading).toHaveLength(1);
          expect(reading[0]).toMatchObject({ name: 'Pubblicazione', then: 'publish', met: false, final: true });
          // the goal reads the version the thread holds
          expect(lineNodes(reading[0]).map((n) => n.check?.payload)).toEqual([{ version: 'v1' }, { version: 'v1' }]);
          expect(t.offered('drusso')).toContain('set_goal_revoke');
          break;
        case 'bgalli-v1':
          expect(t.values.approvals).toEqual(['bgalli']);
          expect(lineNodes(reading[0]).map((n) => 'foundIn' in n)).toEqual([true, false]);
          break;
        case 'changes':
          expect(t.values.status).toBe('changes_requested');
          // approving waits for the review to be open again; the author may answer
          expect(t.offered('bgalli')).not.toContain('approve');
          expect(t.offered('aconti')).toContain('revision');
          break;
        case 'v2':
          expect(t.values).toMatchObject({ status: 'in_review', version: 'v2' });
          // the same goal now waits for v2: the approval of v1 no longer meets it, and nothing is lost
          expect(reading[0].met).toBe(false);
          expect(lineNodes(reading[0]).map((n) => [n.check?.payload, 'foundIn' in n])).toEqual([
            [{ version: 'v2' }, false],
            [{ version: 'v2' }, false],
          ]);
          expect(lineNodes(reading[0]).some((n) => n.lost)).toBe(false);
          expect(t.offered('aconti')).not.toContain('revision');
          break;
        case 'bgalli-v2':
          expect(lineNodes(reading[0]).map((n) => 'foundIn' in n)).toEqual([true, false]);
          expect(t.values.status).toBe('in_review');
          break;
        case 'cneri-v2':
          expect(t.values.status).toBe('published');
          expect(reading[0]).toMatchObject({ met: true, final: true });
          break;
      }
    });
    expect(seen).toHaveLength(stepsOf('published').length);
    expect(t.values.approvals).toEqual(['bgalli', 'cneri']);
  });

  it('has the goal publish, once, as itself, and nothing can take that line out of force', async () => {
    const t = thread();
    await t.play(stepsOf('published'));
    const publish = t.state.lines.filter((l) => l.gist === 'publish');
    expect(publish).toHaveLength(1);
    expect(publish[0].writer).toBe(`goal::${t.labels.get('goal')}`);
    // the goal wrote it as its outcome: after the approval that met it, and a record of the new status
    expect(t.log.at(-1)).toEqual(['approve', 'publish', 'value_set', 'value_set']);
    expect(lockedBy(publish[0], t.state.lines)).toBe(t.labels.get('goal'));
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

describe('what now fits', () => {
  // 1 · «the current version»
  it('1 · one goal follows the version the thread holds, and a key the thread does not hold is awaited, never lost', async () => {
    const t = thread();
    await t.play(until('published', 'v2'));
    // one goal, set at v1, now reads v2: the approval of v1 does not meet it
    expect(t.values.version).toBe('v2');
    expect(t.reading().goals.map((g) => g.name)).toEqual(['Pubblicazione']);
    await t.say(approve('bgalli', 'v2'));
    expect(t.values.status).toBe('in_review');
    await t.say(approve('cneri', 'v2'));
    expect(t.values.status).toBe('published');
    const [goal] = t.reading().goals;
    expect(goal.met).toBe(true);
    expect(lineNodes(goal).map((n) => n.foundIn)).toEqual([t.state.lines.find((l) => l.gist === 'approve' && l.payload.version === 'v2')!.id, t.state.lines.findLast((l) => l.gist === 'approve')!.id]);

    // a reference to a key no line states leaves its node unmet, and no warning is written
    const other = thread();
    await other.play(until('published', 'request'));
    expect(await other.say(draft('drusso', 'set_goal', { name: 'Altro', then: 'publish', when: { line: { gist: 'approve', payload: { version: { $value: 'nothing' } } } } }))).toBeUndefined();
    await other.say(approve('bgalli', 'v1'));
    const [unresolved] = other.reading().goals;
    expect(unresolved.trace).toEqual({ condition: { line: { gist: 'approve', payload: { version: { $value: 'nothing' } } } }, holds: false });
    expect(other.state.lines.filter((l) => l.gist === 'goal_warning')).toEqual([]);
  });

  // 2 · «before the deadline»
  it('2 · a goal with `not`: when the deadline passes and the current version is not approved by both, it asks for changes', async () => {
    const late = (reviewers: string[]): Json => ({
      name: 'Scadenza',
      then: 'request_changes',
      when: { all: [{ line: { gist: 'deadline_passed' } }, { not: { all: reviewers.map((who) => ({ line: { gist: 'approve', writer: by(who), payload: { version: { $value: 'version' } } } })) } }] },
    });
    const t = thread();
    await t.play(until('late', 'bgalli-v1'));
    expect(await t.say(draft('drusso', 'set_goal', late(['bgalli', 'cneri']) as LineDraft['payload']))).toBeUndefined();
    expect(await t.say(draft('drusso', 'deadline', { date: '2026-10-31' }))).toBeUndefined();
    expect(t.values.status).toBe('in_review');
    expect(await t.say({ gist: 'deadline_passed', writer: 'system::clock', payload: {} })).toBeUndefined();
    // cneri has not approved: the goal asks for changes, as itself, and nothing is published
    expect(t.values).toMatchObject({ late: true, status: 'changes_requested', approvals: ['bgalli'] });
    expect(t.state.lines.find((l) => l.gist === 'request_changes')?.writer).toMatch(/^goal::/);
    expect(t.reading().goals.find((g) => g.name === 'Scadenza')?.trace.children?.[1]).toMatchObject({ holds: true, children: [{ holds: false }] });

    // both approved before the deadline: the article is published, and the deadline's goal is not met
    const on = thread();
    await on.play(until('late', 'bgalli-v1'));
    await on.say(draft('drusso', 'set_goal', late(['bgalli', 'cneri']) as LineDraft['payload']));
    await on.say(approve('cneri', 'v1'));
    expect(on.values.status).toBe('published');
    await on.say({ gist: 'deadline_passed', writer: 'system::clock', payload: {} });
    expect(on.values.status).toBe('published');
    expect(on.reading().goals.find((g) => g.name === 'Scadenza')?.met).toBe(false);
  });

  // 3 · «status is A or B»
  it('3 · `is` with two values: an author may post a new version of a draft nobody has opened, or after a request for changes', async () => {
    const t = thread();
    await t.play(until('published', 'submit'));
    expect(t.values.status).toBe('draft');
    expect(t.offered('aconti')).toContain('revision');
    expect(await t.say(draft('aconti', 'revision', { version: 'v1b' }))).toBeUndefined();
    expect(t.values).toMatchObject({ version: 'v1b', status: 'in_review' });
    // in review it may not
    await t.say(draft('aconti', 'request_review', { reviewers: ['bgalli', 'cneri'] }));
    expect(t.offered('aconti')).not.toContain('revision');
    expect(await t.say(draft('aconti', 'revision', { version: 'v1c' }))).toMatchObject({ code: 'not-now' });
    await t.say(draft('cneri', 'request_changes', {}));
    expect(t.offered('aconti')).toContain('revision');
    expect(await t.say(draft('aconti', 'revision', { version: 'v1c' }))).toBeUndefined();
  });

  // 4 · «any two of three reviewers»
  it('4 · `atLeast`: one goal for «any two of three», which a third approval does not need', async () => {
    const t = thread();
    await t.play(until('published', 'submit'));
    await t.say(draft('aconti', 'request_review', { reviewers: ['bgalli', 'cneri', 'dferri'] }));
    const quorum = { atLeast: 2, of: ['bgalli', 'cneri', 'dferri'].map((who) => ({ line: { gist: 'approve', writer: by(who), payload: { version: { $value: 'version' } } } })) };
    expect(await t.say(draft('drusso', 'set_goal', { name: 'Due su tre', then: 'publish', final: true, when: quorum }))).toBeUndefined();
    await t.say(approve('bgalli', 'v1'));
    expect(t.values.status).toBe('in_review');
    expect(t.reading().goals[0].trace.children?.map((c) => c.holds)).toEqual([true, false, false]);
    await t.say(approve('dferri', 'v1'));
    expect(t.values.status).toBe('published');
    expect(t.reading().goals).toHaveLength(1);
    expect(t.reading().goals[0].trace.children?.map((c) => c.holds)).toEqual([true, false, true]);
  });

  // 5 · «who approved»
  it('5 · `collect-writer`, in the base kit: approvals come from the writers, with no stamp, and nobody signs for another', async () => {
    expect(BASE_KIT.rules.map((r) => r.rule)).toContain('collect-writer');
    expect(SCHEMA.gists.find((g) => g.gist === 'approve')?.rules).toEqual([{ rule: 'collect-writer', key: 'approvals' }]);
    const t = thread();
    await t.play(until('published', 'request'));
    // a key the rule does not read is free, and says nothing of who approved
    expect(await t.say(draft('bgalli', 'approve', { version: 'v1', stamp: 'v1:cneri' }))).toBeUndefined();
    expect(t.values.approvals).toEqual(['bgalli']);
    // a second approval by the same writer adds nothing
    await t.say(approve('bgalli', 'v1'));
    await t.say(approve('cneri', 'v1'));
    expect(t.values.approvals).toEqual(['bgalli', 'cneri']);
    // and the binding is read as strictly as any other
    const strictly = (rules: unknown[]) => readSchema({ ...SCHEMA_JSON, gists: SCHEMA_JSON.gists.map((g) => (g.gist === 'approve' ? { ...g, rules } : g)) }, BASE_KIT).problems;
    expect(strictly([{ rule: 'collect-writer' }])).toHaveLength(1);
    expect(strictly([{ rule: 'collect-writer', key: 'approvals', prefix: 'version' }])).toHaveLength(1);
  });
});
