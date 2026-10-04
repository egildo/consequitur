// Posting to a thread: a draft is admitted against what its gist's rules read,
// appended, and the thread is brought into agreement with its handles by
// reconciliation. The server is the authority here: it stamps every line, and
// the lines that record a reconciliation are its own, so they skip admission.

import { WARNING_GIST, lockedBy, stamp } from './line.ts';
import { kinOf, reduce, validChecks, whenHolds, whereMatches } from './reduce.ts';
import type { Denunciation, DryRun, EventLine, GistSchema, Handles, Json, Law, LineDraft, Payload, Reading, Refusal, ThreadState, Verdict, Writer } from './types.ts';

/** The server's writer on the lines that record a reconciliation. */
export const SYSTEM_WRITER: Writer = 'system::sibardoc';

/** Reaching the cap is a pause, not an error: the next `post` or `settle` resumes. */
export const MAX_ROUNDS = 3;

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const has = (payload: LineDraft['payload'], key: string): boolean => Object.hasOwn(payload, key);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const refuse = (code: Refusal['code'], detail: string): Refusal => ({ code, detail });

/** The users a payload value names: a string or a list of strings, otherwise nothing valid. */
const namesUsers = (value: Json): boolean => typeof value === 'string' || (Array.isArray(value) && value.every((u) => typeof u === 'string'));

/**
 * Why a payload does not satisfy what a gist's rules read, as an English
 * sentence, or undefined. Every other key is free. A draft and a goal's outcome
 * are held to the same checks, in the order of the bindings.
 */
export function payloadProblem(schema: GistSchema, payload: Payload): string | undefined {
  const problem = (detail: string) => `${detail} in a "${schema.gist}" line.`;
  // only the first revoke binding of a gist is read
  const revoking = schema.rules.find((r) => r.rule === 'revoke');

  for (const binding of schema.rules) {
    if (binding.rule === 'assign') {
      if (!has(payload, binding.from)) {
        if (binding.required) return problem(`The key "${binding.from}" is required`);
      } else if (!namesUsers(payload[binding.from])) {
        return problem(`The key "${binding.from}" must hold a string or a list of strings`);
      }
    } else if (binding.rule === 'metadata' && !('value' in binding)) {
      // a binding whose `where` does not match this payload is not asked for
      const key = 'collect' in binding ? binding.collect : binding.from;
      if (binding.required && !has(payload, key) && whereMatches(binding.where, { payload })) return problem(`The key "${key}" is required`);
    } else if (binding.rule === 'revoke') {
      if (binding !== revoking) continue;
      if (typeof payload[binding.from] !== 'string') return problem(`The key "${binding.from}" must hold a line id`);
    }
  }
  return undefined;
}

/**
 * Why a draft cannot join the thread, or undefined. It looks only at what the
 * gist's rules read: every other key of the payload is free. The refusals come in
 * a fixed order, so two readers give the same answer. The drafts `settle` writes
 * never come through here, so a goal writes its line whatever that gist's `when`
 * says.
 */
export function admit(lines: EventLine[], draft: LineDraft, gists: GistSchema[]): Refusal | undefined {
  const schema = gists.find((g) => g.gist === draft.gist);
  if (!schema) return refuse('unknown-gist', `The gist "${draft.gist}" has no schema.`);

  const kin = kinOf(draft.writer);
  if (kin === undefined || !schema.writers.includes(kin)) {
    return refuse('writer-not-allowed', `The writer "${draft.writer}" is not of a kin that may write "${draft.gist}".`);
  }

  if (!whenHolds(lines, draft.writer, schema, gists)) {
    return refuse('not-now', `The gist "${draft.gist}" may not be written by "${draft.writer}" on the thread as it stands.`);
  }

  const invalid = (detail: string) => refuse('invalid-payload', `${detail} in a "${draft.gist}" line.`);
  const { payload } = draft;

  const problem = payloadProblem(schema, payload);
  if (problem !== undefined) return refuse('invalid-payload', problem);

  if (schema.rules.some((r) => r.rule === 'goal')) {
    const { name, checks, then } = payload;
    if (typeof name !== 'string') return invalid('The key "name" must hold a string');
    if (!validChecks(checks)) return invalid('The key "checks" must hold a non-empty list of valid checks');
    if (has(payload, 'with') && !isObject(payload.with)) return invalid('The key "with" must hold an object');
    if (has(payload, 'final') && typeof payload.final !== 'boolean') return invalid('The key "final" must hold a boolean');
    const outcome = typeof then === 'string' ? gists.find((g) => g.gist === then) : undefined;
    if (!outcome) return invalid('The key "then" must name a gist that has a schema');
    if (!outcome.writers.includes('goal')) return invalid(`The gist "${outcome.gist}" named by "then" does not list the kin goal among its writers`);
    // the warning is the mechanic's own line
    if (outcome.gist === WARNING_GIST) return invalid(`The gist "${outcome.gist}" named by "then" is written by the mechanic only`);
    if (outcome.rules.some((r) => r.rule === 'revoke' || r.rule === 'goal')) {
      return invalid(`The gist "${outcome.gist}" named by "then" revokes or sets a goal, which a goal's line cannot`);
    }
    // the outcome's `when` is not asked: the server's own lines skip admission
    const wrong = payloadProblem(outcome, (payload.with ?? {}) as Payload);
    if (wrong !== undefined) return invalid(`The key "with" does not fit the gist "${outcome.gist}" named by "then" (${wrong.slice(0, -1)})`);
  }

  const revoking = schema.rules.find((r) => r.rule === 'revoke');
  if (revoking?.rule === 'revoke') {
    const target = payload[revoking.from] as string;
    const line = lines.find((l) => l.id === target);
    if (!line) return refuse('unknown-line', `No line of the thread has the id "${target}".`);
    if (!revoking.gists.includes(line.gist)) {
      return refuse('not-revocable', `A "${draft.gist}" line cannot revoke a "${line.gist}" line.`);
    }
    const final = lockedBy(line, lines);
    if (final !== undefined) return refuse('not-revocable', `The "${line.gist}" line "${target}" was written by a final goal.`);
  }
  return undefined;
}

/**
 * Changes the handles so that each denunciation stops holding, and drafts the
 * line that records it. A denunciation of the thread itself has no answer. Both
 * lists follow the order of the denunciations; assignees come out sorted.
 */
export function reconcile(reading: Reading, handles: Handles): { handles: Handles; drafts: LineDraft[] } {
  const metadata = new Map(Object.entries(handles.metadata));
  const assignees = new Set(handles.assignees);
  const drafts: LineDraft[] = [];

  for (const d of reading.denunciations) {
    switch (d.sort) {
      case 'metadata':
        if ('expected' in d) {
          metadata.set(d.key, d.expected as Json);
          drafts.push({ gist: 'metadata_set', writer: SYSTEM_WRITER, payload: { key: d.key, value: d.expected as Json } });
        } else {
          metadata.delete(d.key);
          drafts.push({ gist: 'metadata_set', writer: SYSTEM_WRITER, payload: { key: d.key } });
        }
        break;
      case 'assignment':
        if (d.expected) {
          assignees.add(d.user);
          drafts.push({ gist: 'assigned', writer: SYSTEM_WRITER, payload: d.line === undefined ? { user: d.user } : { user: d.user, line: d.line } });
        } else {
          assignees.delete(d.user);
          drafts.push({ gist: 'unassigned', writer: SYSTEM_WRITER, payload: { user: d.user } });
        }
        break;
      case 'line':
        drafts.push({ gist: d.gist, writer: d.writer, payload: d.payload });
        break;
      case 'thread':
        break;
    }
  }
  return { handles: { metadata: Object.fromEntries(metadata), assignees: [...assignees].sort(compare) }, drafts };
}

/**
 * Reduces, and while the reading holds a denunciation that can be answered and
 * fewer than `MAX_ROUNDS` reconciliations have run, reconciles and reduces again.
 * Each draft is stamped against the thread with the drafts before it already
 * appended, so the `previous` ids stay a chain. `settled: false` in the result
 * after the last round means the thread is not settled yet. `rounds` holds, for
 * each reconciliation that ran, the denunciations it answered.
 */
export async function settle(
  state: ThreadState,
  gists: GistSchema[],
  now: string,
): Promise<{ state: ThreadState; reading: Reading; rounds: Denunciation[][] }> {
  let { lines, handles } = state;
  let reading = reduce(lines, handles, gists);
  const rounds: Denunciation[][] = [];
  for (let round = 0; round < MAX_ROUNDS && reading.denunciations.some((d) => d.sort !== 'thread'); round++) {
    rounds.push(reading.denunciations.filter((d) => d.sort !== 'thread'));
    const answer = reconcile(reading, handles);
    handles = answer.handles;
    const next = [...lines];
    for (const draft of answer.drafts) next.push(await stamp(draft, next, now));
    lines = next;
    reading = reduce(lines, handles, gists);
  }
  return { state: { lines, handles }, reading, rounds };
}

/** The laws a dry run broke, in the order of `laws`; `before` reads the state given, `after` the settled one. */
function judge(laws: Law[], before: Reading, after: { handles: Handles; reading: Reading }): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const { law, strength } of laws) {
    if (law === 'keeps-assignee') {
      if (after.handles.metadata.status === 'open' && after.handles.assignees.length === 0) {
        verdicts.push({ law, strength, detail: 'The activity would stay open with no assignee.' });
      }
    } else if (law === 'keeps-goals') {
      for (const goal of after.reading.goals) {
        const was = before.goals.find((g) => g.line === goal.line);
        if (!was) continue;
        goal.checks.forEach((c, i) => {
          if (c.orphan && !was.checks[i]?.orphan) {
            verdicts.push({ law, strength, detail: `The check ${i} of goal "${goal.name}" would be orphaned.`, goal: goal.line, check: i });
          }
        });
      }
    } else if (!after.reading.settled) {
      verdicts.push({ law, strength, detail: 'The thread would not settle.' });
    }
  }
  return verdicts;
}

/**
 * What a post would do: admits the draft, appends it and settles, and returns the
 * result without applying it. A refusal at any of those steps returns the state as
 * it was, read but not settled. A line that would leave the thread breaking a rule
 * of its own is refused too: no reconciliation could ever answer that. When the
 * draft's writer is of kin `user`, each law is judged on what the line leaves
 * behind, what goals write in answer to it included; a fact from outside has
 * already happened, so it is never judged.
 */
export async function dryRun(state: ThreadState, draft: LineDraft, gists: GistSchema[], now: string, laws: Law[] = []): Promise<DryRun> {
  const before = reduce(state.lines, state.handles, gists);
  const refused = (refusal: Refusal): DryRun => ({ state, reading: before, refusal, added: [], rounds: [], verdicts: [] });
  const refusal = admit(state.lines, draft, gists);
  if (refusal) return refused(refusal);

  const lines = [...state.lines, await stamp(draft, state.lines, now)];
  const broken = reduce(lines, state.handles, gists).denunciations.find((d) => d.sort === 'thread');
  if (broken?.sort === 'thread') {
    return refused(refuse('unreconcilable', `The thread would hold ${broken.found} "create" lines in force; it must hold exactly one.`));
  }
  const settled = await settle({ lines, handles: state.handles }, gists, now);
  const verdicts = kinOf(draft.writer) === 'user' ? judge(laws, before, { handles: settled.state.handles, reading: settled.reading }) : [];
  return { state: settled.state, reading: settled.reading, added: settled.state.lines.slice(state.lines.length), rounds: settled.rounds, verdicts };
}

/**
 * Posts a draft: a dry run, then the decision. A `refuse` verdict refuses the line
 * as `law`; a `confirm` verdict refuses it as `unconfirmed` unless `confirmed` is
 * true; both carry every verdict found. Otherwise the dry run's state is the
 * result. A refusal returns the state as it was, read but not settled.
 */
export async function post(
  state: ThreadState,
  draft: LineDraft,
  gists: GistSchema[],
  now: string,
  options: { laws?: Law[]; confirmed?: boolean } = {},
): Promise<{ state: ThreadState; reading: Reading; refusal?: Refusal; added: EventLine[]; rounds: Denunciation[][] }> {
  const run = await dryRun(state, draft, gists, now, options.laws);
  const refused = (refusal: Refusal) => ({ state, reading: reduce(state.lines, state.handles, gists), refusal, added: [], rounds: [] });
  if (run.refusal) return refused(run.refusal);

  const names = (strength: Verdict['strength']) => run.verdicts.filter((v) => v.strength === strength).map((v) => v.law).join(', ');
  if (run.verdicts.some((v) => v.strength === 'refuse')) {
    return refused({ code: 'law', detail: `The line would break: ${names('refuse')}.`, verdicts: run.verdicts });
  }
  if (run.verdicts.length > 0 && options.confirmed !== true) {
    return refused({ code: 'unconfirmed', detail: `The line has consequences the writer has not confirmed: ${names('confirm')}.`, verdicts: run.verdicts });
  }
  return { state: run.state, reading: run.reading, added: run.added, rounds: run.rounds };
}
