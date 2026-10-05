// Posting to a thread: a draft is admitted against what its gist's rules read,
// appended, and the thread is brought into agreement with its handles by
// reconciliation. The authority is the one that stamps every line, and the lines
// that record a reconciliation are its own, so they skip admission; admission
// refuses them, and a goal's lines, from anyone else.

import { kinOf, validChecks } from './check.ts';
import { asStored, canonical, inForce, lockedBy, revokeOf, stamp } from './line.ts';
import { reduce, whenHolds } from './reduce.ts';
import type {
  Change,
  Denunciation,
  DryRun,
  EventLine,
  GistSchema,
  Handles,
  Kit,
  LineDraft,
  Payload,
  Policy,
  PostResult,
  Reading,
  Refusal,
  Schema,
  ThreadState,
  Verdict,
} from './types.ts';
import { has, isObject, isRecord } from './util.ts';

/** Reaching the cap is a pause, not an error: the next `post` or `settle` resumes. */
export const MAX_ROUNDS = 3;

const refuse = (code: Refusal['code'], detail: string): Refusal => ({ code, detail });

/** A thread that holds nothing yet, with each handle kind's empty handle. */
export function emptyState(schema: Schema): ThreadState {
  return { lines: [], handles: Object.fromEntries(schema.kit.handles.map((h) => [h.kind, h.empty(schema)] as const)) };
}

/**
 * Why a payload does not satisfy what a gist's rules read, as an English
 * sentence, or undefined. Every other key is free. A draft and a goal's outcome
 * are held to the same checks, in the order of the bindings.
 */
export function payloadProblem(schema: Schema, gist: GistSchema, payload: Payload): string | undefined {
  // only the first revoke binding of a gist is read
  const revoking = gist.rules.find((r) => r.rule === 'revoke');

  for (const binding of gist.rules) {
    if (binding.rule === 'goal') continue;
    if (binding.rule === 'revoke') {
      if (binding !== revoking) continue;
      if (typeof payload[binding.from as string] !== 'string') return `The key "${binding.from}" must hold a line id in a "${gist.gist}" line.`;
      continue;
    }
    const why = schema.kit.rules.find((r) => r.rule === binding.rule)?.admit(binding, payload);
    if (why !== undefined) return `${why} in a "${gist.gist}" line.`;
  }
  return undefined;
}

/**
 * Why a draft cannot join the thread, or undefined. It looks only at what the
 * gist's rules read: every other key of the payload is free. The payload is judged
 * as it will be stored, after a JSON round trip, so a key that holds `undefined`
 * is absent and a payload JSON cannot write is refused. The refusals come in
 * a fixed order, so two readers give the same answer. The drafts `settle` writes
 * never come through here, so a goal writes its line whatever that gist's `when`
 * says; and a draft that would be one of them, a line by a goal or of a record
 * gist, is refused.
 */
export function admit(lines: EventLine[], draft: LineDraft, schema: Schema): Refusal | undefined {
  const { gists } = schema;
  // a draft comes from outside, so its type is a promise and not a fact
  if (!isObject(draft) || typeof draft.writer !== 'string') return refuse('writer-not-allowed', 'A draft must be an object whose writer is a string.');
  const gist = gists.find((g) => g.gist === draft.gist);
  if (!gist) return refuse('unknown-gist', `The gist "${draft.gist}" has no schema.`);

  const kin = kinOf(draft.writer);
  if (kin === 'goal') return refuse('writer-not-allowed', `The writer "${draft.writer}" is a goal, whose lines the engine writes.`);
  if (Object.values(schema.records).includes(gist.gist)) {
    return refuse('writer-not-allowed', `The gist "${draft.gist}" is a record, which the engine writes.`);
  }
  if (kin === undefined || !gist.writers.includes(kin)) {
    return refuse('writer-not-allowed', `The writer "${draft.writer}" is not of a kin that may write "${draft.gist}".`);
  }

  if (!whenHolds(lines, draft.writer, gist, schema)) {
    return refuse('not-now', `The gist "${draft.gist}" may not be written by "${draft.writer}" on the thread as it stands.`);
  }

  const invalid = (detail: string) => refuse('invalid-payload', `${detail} in a "${draft.gist}" line.`);
  // a plain object, judged as `stamp` will store it: what a JSON round trip gives back,
  // which must be an object too; a payload JSON cannot write is refused, not thrown
  const plain = isObject(draft.payload) && [Object.prototype, null].includes(Object.getPrototypeOf(draft.payload));
  let stored: unknown;
  try {
    stored = asStored(draft.payload);
  } catch {
    stored = undefined;
  }
  if (!plain || !isRecord(stored)) return invalid('The payload must be an object');
  const payload = stored;

  const problem = payloadProblem(schema, gist, payload);
  if (problem !== undefined) return refuse('invalid-payload', problem);

  if (gist.rules.some((r) => r.rule === 'goal')) {
    const { name, checks, then } = payload;
    if (typeof name !== 'string') return invalid('The key "name" must hold a string');
    if (!validChecks(checks)) return invalid('The key "checks" must hold a non-empty list of valid checks');
    if (has(payload, 'with') && !isObject(payload.with)) return invalid('The key "with" must hold an object');
    if (has(payload, 'final') && typeof payload.final !== 'boolean') return invalid('The key "final" must hold a boolean');
    const outcome = typeof then === 'string' ? gists.find((g) => g.gist === then) : undefined;
    if (!outcome) return invalid('The key "then" must name a gist that has a schema');
    if (!outcome.writers.includes('goal')) return invalid(`The gist "${outcome.gist}" named by "then" does not list the kin goal among its writers`);
    // the warning is the engine's own line
    if (outcome.gist === schema.records.warning) return invalid(`The gist "${outcome.gist}" named by "then" is written by the engine only`);
    if (outcome.rules.some((r) => r.rule === 'revoke' || r.rule === 'goal')) {
      return invalid(`The gist "${outcome.gist}" named by "then" revokes or sets a goal, which a goal's line cannot`);
    }
    // the outcome's `when` is not asked: the authority's own lines skip admission
    const wrong = payloadProblem(schema, outcome, (payload.with ?? {}) as Payload);
    if (wrong !== undefined) return invalid(`The key "with" does not fit the gist "${outcome.gist}" named by "then" (${wrong.slice(0, -1)})`);
  }

  const revoking = revokeOf(gist);
  if (revoking) {
    const target = payload[revoking.from] as string;
    const line = lines.find((l) => l.id === target);
    if (!line) return refuse('unknown-line', `No line of the thread has the id "${target}".`);
    if (!revoking.gists.includes(line.gist)) {
      return refuse('not-revocable', `A "${draft.gist}" line cannot revoke a "${line.gist}" line.`);
    }
    const final = lockedBy(line, lines);
    if (final !== undefined) return refuse('not-revocable', `The "${line.gist}" line "${target}" was written by a final goal.`);
    // a revoke of a line already out of force would change nothing, and the offers leave it out
    if (!inForce(lines, gists).inForce.some((l) => l.id === target)) return refuse('not-revocable', `The "${line.gist}" line "${target}" is already out of force.`);
  }
  return undefined;
}

/**
 * Changes the handles so that each denunciation stops holding, and drafts the
 * line that records it, written by the schema's authority. Each handle kind
 * answers its own denunciations and names the role of the record; the schema says
 * which gist the role is. A denunciation of the thread itself has no answer. Both
 * lists follow the order of the denunciations.
 */
export function reconcile(reading: Reading, handles: Handles, schema: Schema): { handles: Handles; drafts: LineDraft[] } {
  const next: Handles = { ...handles };
  const drafts: LineDraft[] = [];

  for (const d of reading.denunciations) {
    if (d.sort === 'line') {
      drafts.push({ gist: d.gist, writer: d.writer, payload: d.payload });
    } else if (d.sort === 'handle') {
      const kind = schema.kit.handles.find((k) => k.kind === d.kind);
      if (!kind) continue;
      const reply = kind.answer(d, has(next, d.kind) ? next[d.kind] : kind.empty(schema));
      const gist = schema.records[reply.role];
      // a role with no record could change a handle and say nothing: the thread is the only truth
      if (gist === undefined) continue;
      next[d.kind] = reply.handle;
      drafts.push({ gist, writer: schema.authority, payload: reply.payload });
    }
  }
  return { handles: next, drafts };
}

/** Whether a policy entry leaves a denunciation unanswered, reading the handles as they stand. */
function left(policy: Policy, d: Denunciation, handles: Handles): boolean {
  if (d.sort === 'thread') return false;
  const values = isRecord(handles.value) ? handles.value : {};
  return policy.some(({ leave, while: condition }) => {
    const part = (stated: string | undefined, is: string | undefined) => stated === undefined || stated === is;
    if (!part(leave.sort, d.sort)) return false;
    if (!part(leave.kind, d.sort === 'handle' ? d.kind : undefined)) return false;
    if (!part(leave.key, d.sort === 'handle' ? d.key : undefined)) return false;
    if (!part(leave.member, d.sort === 'handle' ? d.member : undefined)) return false;
    if (!part(leave.gist, d.sort === 'line' ? d.gist : undefined)) return false;
    return Object.entries(condition?.values ?? {}).every(([key, value]) => has(values, key) && canonical(values[key]) === canonical(value));
  });
}

/**
 * The denunciations the authority answers: all but those of the thread, which
 * nothing can reconcile, and those the policy leaves.
 */
export function answer(reading: Reading, handles: Handles, policy: Policy = []): Denunciation[] {
  return reading.denunciations.filter((d) => d.sort !== 'thread' && !left(policy, d, handles));
}

/** A reading whose only denunciations are the ones the policy leaves counts as settled. */
function counted(reading: Reading, handles: Handles, policy: Policy): Reading {
  return { ...reading, settled: reading.denunciations.every((d) => left(policy, d, handles)) };
}

/**
 * Reduces, and while the reading holds a denunciation the authority answers and
 * fewer than `MAX_ROUNDS` reconciliations have run, reconciles and reduces again.
 * Each draft is stamped against the thread with the drafts before it already
 * appended, so the `previous` ids stay a chain. `settled: false` in the result
 * after the last round means the thread is not settled yet. `rounds` holds, for
 * each reconciliation that ran, the denunciations it answered.
 */
export async function settle(
  state: ThreadState,
  schema: Schema,
  now: string,
  policy: Policy = [],
): Promise<{ state: ThreadState; reading: Reading; rounds: Denunciation[][] }> {
  let { lines, handles } = state;
  let reading = reduce(lines, handles, schema);
  const rounds: Denunciation[][] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const answered = answer(reading, handles, policy);
    if (answered.length === 0) break;
    rounds.push(answered);
    const out = reconcile({ ...reading, denunciations: answered }, handles, schema);
    handles = out.handles;
    const next = [...lines];
    for (const draft of out.drafts) next.push(await stamp(draft, next, now));
    lines = next;
    reading = reduce(lines, handles, schema);
  }
  return { state: { lines, handles }, reading: counted(reading, handles, policy), rounds };
}

/** The laws a dry run broke, in the order of the schema's laws; `before` reads the state given, `after` the settled one. */
function judge(schema: Schema, before: { reading: Reading; handles: Handles }, after: { reading: Reading; handles: Handles }): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const binding of schema.laws) {
    const kind = schema.kit.laws.find((l) => l.law === binding.law);
    if (!kind) continue;
    for (const found of kind.judge(binding, before, after)) verdicts.push({ law: binding.law, strength: binding.strength, ...found });
  }
  return verdicts;
}

/**
 * What a post would do: admits the draft, appends it and settles, and returns the
 * result without applying it. A refusal at any of those steps returns the state as
 * it was, read but not settled. A line that would leave the thread breaking the
 * opening rule is refused too: no reconciliation could ever answer that. When the
 * draft's writer is of a kin the schema judges, each law is judged on what the
 * line leaves behind, what goals write in answer to it included; a fact from
 * outside has already happened, so it is never judged.
 */
export async function dryRun(state: ThreadState, draft: LineDraft, schema: Schema, now: string, options: { policy?: Policy } = {}): Promise<DryRun> {
  const policy = options.policy ?? [];
  const before = counted(reduce(state.lines, state.handles, schema), state.handles, policy);
  const refused = (refusal: Refusal): DryRun => ({ state, reading: before, refusal, added: [], rounds: [], verdicts: [] });
  const refusal = admit(state.lines, draft, schema);
  if (refusal) return refused(refusal);

  const lines = [...state.lines, await stamp(draft, state.lines, now)];
  const broken = reduce(lines, state.handles, schema).denunciations.find((d) => d.sort === 'thread');
  if (broken?.sort === 'thread') {
    return refused(refuse('unreconcilable', `The thread would hold ${broken.found} "${schema.opening}" lines in force; it must hold exactly one.`));
  }
  const settled = await settle({ lines, handles: state.handles }, schema, now, policy);
  const kin = kinOf(draft.writer);
  const verdicts = kin !== undefined && schema.judged.includes(kin) ? judge(schema, { reading: before, handles: state.handles }, { reading: settled.reading, handles: settled.state.handles }) : [];
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
  schema: Schema,
  now: string,
  options: { confirmed?: boolean; policy?: Policy } = {},
): Promise<PostResult> {
  const run = await dryRun(state, draft, schema, now, options);
  // a refusal leaves the state as it was, so it reads that state, not the one the dry run settled
  const refused = (refusal: Refusal): PostResult => ({
    state,
    reading: counted(reduce(state.lines, state.handles, schema), state.handles, options.policy ?? []),
    refusal,
    added: [],
    rounds: [],
  });
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

/**
 * What changed between two handles, kind by kind in the kit's order, as each
 * kind says it: what a host applies to its own copy of the record.
 */
export function diff(before: Handles, after: Handles, kit: Kit): Change[] {
  return kit.handles.flatMap((kind) => kind.diff(has(before, kind.kind) ? before[kind.kind] : null, has(after, kind.kind) ? after[kind.kind] : null));
}
