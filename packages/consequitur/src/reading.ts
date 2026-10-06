// The reading, `consequitur`: thread, handles and schema in, a reading out. Rules state what
// the lines in force expect, into the accumulators of the handle kinds; the
// comparison with the handles is made here, once, by each kind, so a rule never
// compares.
//
// Pure and synchronous: it never hashes and never reads a clock, so client and
// authority read a thread the same way. It never throws either: a client may run
// it on any thread, so a payload that lacks what a binding reads, or holds it in
// another shape, states nothing.

import { conditionHolds, conditionProblem, evaluateCondition, lostAt, markLost } from './condition.ts';
import { referencesOf, resolvePayload } from './check.ts';
import { canonical, inForce, inOrder } from './line.ts';
import type {
  Check,
  Condition,
  Denunciation,
  EventLine,
  GistSchema,
  GoalReading,
  Handles,
  Hole,
  Json,
  LineId,
  Payload,
  Reading,
  Schema,
  Writer,
} from './types.ts';
import { compare, has, isObject, isRecord } from './util.ts';

/** A writer type cannot be built from a template without stating it, so one place states it. */
export const goalWriter = (id: LineId): Writer => `goal::${id}`;

interface StoredGoal {
  line: EventLine;
  name: string;
  then: string;
  when: Condition;
  with?: Payload;
  final: boolean;
}

/**
 * `with` that is present and not an object, like a `when` that is not a condition a goal may hold or a payload
 * that is not an object, leaves a goal stating nothing. Admission asks the same of a goal, so a goal that is
 * refused and a goal that states nothing agree.
 */
function readGoal(line: EventLine, schema: Schema): StoredGoal | undefined {
  if (!isRecord(line.payload)) return undefined;
  const { name, then, when } = line.payload;
  if (typeof name !== 'string' || typeof then !== 'string' || conditionProblem(when, schema, false) !== undefined) return undefined;
  const goal: StoredGoal = { line, name, then, when: when as unknown as Condition, final: line.payload.final === true };
  if (has(line.payload, 'with')) {
    const outcome = line.payload.with;
    if (!isObject(outcome)) return undefined;
    goal.with = outcome as Payload;
  }
  return goal;
}

/**
 * Whether the thread still holds what a check names. A `line` node is lost only when
 * the thread lost something its check names: a value no line ever held (a signer who has
 * not signed yet) is awaited, not lost. A value that is the id of a line is held
 * only by that line in force, since other lines quoting the id would keep a
 * revoked line's checks waiting; any other value, once some line held it under the
 * same key, by a line in force still holding it. The writer is not asked, since a
 * later line can bring the writer back.
 */
function anchored(check: Check, standing: EventLine[], ever: EventLine[], ids: Set<LineId>): boolean {
  if (check.payload === undefined) return true;
  const holds = (key: string, value: Json) => (l: EventLine) => has(l.payload, key) && canonical(l.payload[key]) === canonical(value);
  return Object.entries(check.payload).every(([key, value]) => {
    if (typeof value === 'string' && ids.has(value)) return standing.some((l) => l.id === value);
    return !ever.some(holds(key, value)) || standing.some(holds(key, value));
  });
}

/** What a thread expects, before anything is compared with the handles. */
export interface Expectations {
  standing: { inForce: EventLine[]; revoked: EventLine[] };
  /** One accumulator per handle kind of the kit, by the kind's name. */
  accumulators: Map<string, unknown>;
  /** What the thread expects each handle to be, by the kind's name. */
  handles: Handles;
  /** The lines in force as the rules and the conditions read them, each reference replaced. */
  read: EventLine[];
  /** The values a reference reads: what the lines whose payload holds no reference state, by key. */
  values: Payload;
  /** The values some line in force refers to and none states. */
  holes: Hole[];
  goals: GoalReading[];
  /** The lines the goals still owe, goal by goal: the outcome, then the warning. */
  missing: Denunciation[];
}

/**
 * The first three steps of the reading: which lines are in force, and what they expect, goals included.
 * It does not look at the handles, so `whenHolds` can ask what the thread expects without having a record
 * to compare it with. What they expect is read in two passes over the lines in force: the lines whose
 * payload holds no reference state their values; then every line is read with each reference replaced by
 * the value the first pass stated under its key, one that states nothing leaving the reference out. A
 * goal's line is read as it is written, since its `when` and its `with` carry references of their own.
 */
export function expectations(lines: EventLine[], schema: Schema): Expectations {
  const { gists, kit } = schema;
  // 1. which lines stand
  const standing = inForce(lines, gists);
  const isGoal = (l: EventLine) => gists.find((g) => g.gist === l.gist)?.rules.some((r) => r.rule === 'goal') === true;
  const refers = (l: EventLine) => !isGoal(l) && referencesOf(l.payload).length > 0;

  // 2. what they expect, the later line winning: the lines that refer to nothing first, for the values a reference reads
  const start = () => new Map(kit.handles.map((h) => [h.kind, h.start(schema)] as const));
  const state = (acc: Map<string, unknown>, from: EventLine[], read: (l: EventLine) => EventLine, goals?: Map<string, StoredGoal>) => {
    for (const line of from) {
      // the first schema of a gist is the one read
      const gist = gists.find((g) => g.gist === line.gist);
      if (!gist) continue;
      for (const binding of gist.rules) {
        if (binding.rule === 'revoke') continue; // step 1 has read it
        if (binding.rule === 'goal') {
          const goal = readGoal(line, schema);
          if (goal && goals) goals.set(goal.name, goal);
          continue;
        }
        kit.rules.find((r) => r.rule === binding.rule)?.expect(binding, read(line), (kind) => acc.get(kind));
      }
    }
  };
  const valuesOf = (acc: Map<string, unknown>): Payload => {
    const stated = kit.handles.find((h) => h.kind === 'value')?.expected(acc.get('value'));
    return isRecord(stated) ? stated : {};
  };
  const references = lines.some(refers);
  let values: Payload = {};
  const read = (l: EventLine): EventLine => (references && refers(l) ? { ...l, payload: resolvePayload(l.payload, values) } : l);
  const accumulators = start();
  const goals = new Map<string, StoredGoal>();
  if (references) {
    const first = start();
    state(first, standing.inForce.filter((l) => !refers(l)), (l) => l);
    values = valuesOf(first);
  }
  state(accumulators, standing.inForce, read, goals);
  // with nothing to resolve the one pass is the first, and states the values too
  if (!references) values = valuesOf(accumulators);

  // the values awaited: referred to by a line in force, a goal's `when` and `with` included, and stated by no line in the first pass
  const awaited = new Map<string, LineId[]>();
  for (const line of standing.inForce) {
    for (const key of new Set(referencesOf(line.payload))) if (!has(values, key)) awaited.set(key, [...(awaited.get(key) ?? []), line.id]);
  }
  const holes = [...awaited].sort(([a], [b]) => compare(a, b)).map(([key, held]): Hole => ({ key, lines: held }));

  // the goals read what the thread expects, so the handles come first
  const handles = Object.fromEntries(kit.handles.map((h) => [h.kind, h.expected(accumulators.get(h.kind))] as const));
  const goalReadings: GoalReading[] = [];
  const missing: Denunciation[] = [];
  const ordered = inOrder(lines);
  const revokedIds = new Set(standing.revoked.map((l) => l.id));
  // without a gist for the warning, the thread expects none and no node is judged lost
  const warning = schema.records.warning;
  const warns = warning !== undefined && gists.some((g) => g.gist === warning);
  // the lines a `line` node looks among are read as every rule read them; a goal states no value a check could rest on
  const resolved = standing.inForce.map(read);
  const candidates = resolved.filter((l) => !isGoal(l));
  const everHeld = lines.filter((l) => !isGoal(l)).map(read);
  const ids = new Set(lines.map((l) => l.id));
  for (const name of [...goals.keys()].sort(compare)) {
    const goal = goals.get(name)!;
    // the goal never meets its own `line` node
    const trace = evaluateCondition(goal.when, { handles, lines: resolved, guards: schema.guards, self: goal.line.id });
    const met = trace.holds;
    const writer = goalWriter(goal.line.id);
    // once: the goal's line anywhere in the thread, revoked or not, is its outcome
    const outcome = ordered.find((l) => l.gist === goal.then && l.writer === writer);
    const reading: GoalReading = { line: goal.line.id, name, then: goal.then, trace, met, final: goal.final };
    if (goal.with) reading.with = goal.with;
    if (outcome) {
      reading.outcome = outcome.id;
      if (revokedIds.has(outcome.id)) reading.outcomeRevoked = true;
    }
    goalReadings.push(reading);
    if (met && !outcome) missing.push({ sort: 'line', gist: goal.then, writer, line: goal.line.id, payload: goal.with ?? {} });
    if (warning === undefined || !warns) continue;
    // a `line` node is lost when the check it resolved to names what the thread lost; one whose reference
    // names a key the thread does not hold is awaited, not lost
    const others = candidates.filter((l) => l.id !== goal.line.id);
    markLost(trace, (node) => node.check !== undefined && !anchored(node.check, others, everHeld, ids));
    const path = lostAt(trace);
    if (path === undefined) continue;
    const written = lines.some((l) => l.gist === warning && l.writer === writer && has(l.payload, 'path') && l.payload.path === path);
    if (!written) missing.push({ sort: 'line', gist: warning, writer, line: goal.line.id, payload: { path } });
  }

  return { standing, accumulators, handles, read: resolved, values, holes, goals: goalReadings, missing };
}

/**
 * Whether a gist's `when` lets this writer write it, once the expectations are computed. Given the draft's
 * payload it is admission's question, and has two answers. Without one it is the menu's, asked before there
 * is a draft: a node that reads `$draft` is unknown, unknown spreads by Kleene's strong tables, and the
 * answer is no only when the `when` is false. So the menu may offer what admission refuses for its payload,
 * never the reverse.
 */
export function holds(expected: Expectations, writer: Writer, when: Condition, schema: Schema, payload?: Payload): boolean {
  // the draft is read as the lines are: each reference replaced, one that states nothing left out
  const draft = payload === undefined ? ('unknown' as const) : resolvePayload(payload, expected.values);
  const scope = { handles: expected.handles, lines: expected.read, guards: schema.guards, writer, draft };
  return conditionHolds(when, scope) !== false;
}

/**
 * Whether a gist may be written by this writer on this thread, with this payload, or, without one, whether
 * the menu offers it. A gist with no `when` holds. Admission and the offers both ask this, so a menu drawn
 * from the offers cannot refuse what the authority admits.
 */
export function whenHolds(lines: EventLine[], writer: Writer, gist: GistSchema, schema: Schema, payload?: Payload): boolean {
  return gist.when === undefined || holds(expectations(lines, schema), writer, gist.when, schema, payload);
}

export function consequitur(lines: EventLine[], handles: Handles, schema: Schema): Reading {
  const expected = expectations(lines, schema);

  // 3. the comparison with the handles
  const denunciations: Denunciation[] = [];
  const openings = expected.standing.inForce.filter((l) => l.gist === schema.opening).length;
  if (openings !== 1) denunciations.push({ sort: 'thread', rule: 'one-opening', found: openings });
  denunciations.push(...expected.missing);
  for (const kind of schema.kit.handles) {
    denunciations.push(...kind.compare(expected.accumulators.get(kind.kind), has(handles, kind.kind) ? handles[kind.kind] : null));
  }

  return {
    inForce: expected.standing.inForce.map((l) => l.id),
    revoked: expected.standing.revoked.map((l) => l.id),
    expected: expected.handles,
    holes: expected.holes,
    goals: expected.goals,
    denunciations,
    settled: denunciations.length === 0,
  };
}
