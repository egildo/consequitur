// The reduction: thread, handles and gist schemas in, a reading out. Rules state
// what the lines in force expect; the comparison with the handles is made here,
// once, so a rule never compares.
//
// Pure and synchronous: it never hashes and never reads a clock, so client and
// server read a thread the same way. It never throws either: the client may run
// it on any thread, so a payload that lacks what a binding reads, or holds it in
// another shape, states nothing.

import { CREATE_GIST, WARNING_GIST, canonical, inForce, inOrder } from './line.ts';
import type {
  Check,
  Denunciation,
  EventLine,
  GistSchema,
  GoalReading,
  Handles,
  Json,
  LineId,
  Payload,
  Reading,
  Writer,
} from './types.ts';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A writer type cannot be built from a template without stating it, so one place states it. */
export const goalWriter = (id: LineId): Writer => `goal::${id}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A key is absent when the object has no property of that name; `null` is a value. */
const has = (object: unknown, key: string): boolean => isObject(object) && Object.hasOwn(object, key);

const CHECK_KEYS = ['gist', 'kin', 'writer', 'payload'];

/**
 * Whether a goal's checks can be read: a non-empty array whose every element is
 * an object stating at least one of `gist`, `kin`, `writer` (strings) and
 * `payload` (an object with a key), and nothing else. Admission uses the same
 * answer, so a goal that is refused and a goal that states nothing agree.
 */
export function validChecks(value: unknown): value is Check[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((check) => {
    if (!isObject(check)) return false;
    const keys = Object.keys(check);
    if (keys.length === 0 || keys.some((k) => !CHECK_KEYS.includes(k))) return false;
    return keys.every((k) => (k === 'payload' ? isObject(check[k]) && Object.keys(check[k]).length > 0 : typeof check[k] === 'string'));
  });
}

/** The part of a writer before the first `::`; a writer with no `::` has none. */
export const kinOf = (writer: string): string | undefined => {
  const at = writer.indexOf('::');
  return at < 0 ? undefined : writer.slice(0, at);
};

/** Whether a line equals every part a check states. */
function matches(check: Check, line: EventLine): boolean {
  if (check.gist !== undefined && check.gist !== line.gist) return false;
  if (check.kin !== undefined && check.kin !== kinOf(line.writer)) return false;
  if (check.writer !== undefined && check.writer !== line.writer) return false;
  if (check.payload === undefined) return true;
  return Object.keys(check.payload).every(
    (key) => has(line.payload, key) && canonical(line.payload[key]) === canonical(check.payload![key]),
  );
}

/**
 * Whether a binding's `where` lets it apply to this line: every key it names is
 * in the payload and equals the value given. A binding with no `where` applies
 * to every line of its gist.
 */
export function whereMatches(where: Payload | undefined, line: Pick<EventLine, 'payload'>): boolean {
  if (where === undefined) return true;
  return isObject(where) && Object.keys(where).every((key) => has(line.payload, key) && canonical(line.payload[key]) === canonical(where[key]));
}

interface StoredGoal {
  line: EventLine;
  name: string;
  then: string;
  checks: Check[];
  with?: Payload;
  final: boolean;
}

/** `with` that is present and not an object, like bad checks, leaves a goal stating nothing. */
function readGoal(line: EventLine): StoredGoal | undefined {
  const { name, then, checks } = line.payload;
  if (typeof name !== 'string' || typeof then !== 'string' || !validChecks(checks)) return undefined;
  const goal: StoredGoal = { line, name, then, checks, final: line.payload.final === true };
  if (has(line.payload, 'with')) {
    const outcome = line.payload.with;
    if (!isObject(outcome)) return undefined;
    goal.with = outcome as Payload;
  }
  return goal;
}

/**
 * Whether the thread still holds what a check names. A check is an orphan only when
 * the thread lost something it names: a value no line ever held (a signer who has
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
interface Expectations {
  standing: { inForce: EventLine[]; revoked: EventLine[] };
  /** `collected` marks a list built by `collect` bindings, which a later `collect` extends. */
  metadata: Map<string, { value: Json; line: LineId; collected: boolean }>;
  assignees: Map<string, LineId>;
  goals: GoalReading[];
  /** The lines the goals still owe, goal by goal: the outcome, then the warnings by check. */
  missing: Denunciation[];
}

/**
 * The first two steps of the reduction: which lines are in force, and what they
 * expect, goals included. It does not look at the handles, so `whenHolds` can ask
 * what the thread expects without having an activity to compare it with.
 */
function expectations(lines: EventLine[], gists: GistSchema[]): Expectations {
  // 1. which lines stand
  const standing = inForce(lines, gists);

  // 2. what they expect, the later line winning
  const metadata = new Map<string, { value: Json; line: LineId; collected: boolean }>();
  const assignees = new Map<string, LineId>();
  const goals = new Map<string, StoredGoal>();

  for (const line of standing.inForce) {
    // the first schema of a gist is the one read
    const schema = gists.find((g) => g.gist === line.gist);
    if (!schema) continue;
    for (const binding of schema.rules) {
      switch (binding.rule) {
        case 'revoke':
          // step 1 has read it
          break;
        case 'assign': {
          const asked = has(line.payload, binding.from) ? line.payload[binding.from] : undefined;
          const users = typeof asked === 'string' ? [asked] : Array.isArray(asked) && asked.every((u) => typeof u === 'string') ? (asked as string[]) : [];
          // whoever asked first keeps the line
          for (const user of users) if (!assignees.has(user)) assignees.set(user, line.id);
          break;
        }
        case 'release': {
          const at = line.writer.indexOf('::');
          if (at >= 0) assignees.delete(line.writer.slice(at + 2));
          break;
        }
        case 'metadata': {
          if (!whereMatches(binding.where, line)) break;
          if ('value' in binding) {
            metadata.set(binding.key, { value: binding.value, line: line.id, collected: false });
          } else if ('collect' in binding) {
            if (!has(line.payload, binding.collect)) break;
            const item = line.payload[binding.collect];
            const held = metadata.get(binding.key);
            // a key that held one value starts a new list; an equal value adds nothing
            const list = held?.collected ? (held.value as Json[]) : [];
            if (held?.collected && list.some((v) => canonical(v) === canonical(item))) break;
            metadata.set(binding.key, { value: [...list, item], line: line.id, collected: true });
          } else if (has(line.payload, binding.from)) {
            metadata.set(binding.key, { value: line.payload[binding.from], line: line.id, collected: false });
          }
          break;
        }
        case 'goal': {
          const goal = readGoal(line);
          if (goal) goals.set(goal.name, goal);
          break;
        }
      }
    }
  }

  const goalReadings: GoalReading[] = [];
  const missing: Denunciation[] = [];
  const ordered = inOrder(lines);
  const revokedIds = new Set(standing.revoked.map((l) => l.id));
  // without a schema for the warning, the thread expects none and no check is judged
  const warns = gists.some((g) => g.gist === WARNING_GIST);
  // a goal states no value a check could rest on
  const notGoal = (l: EventLine) => !gists.find((g) => g.gist === l.gist)?.rules.some((r) => r.rule === 'goal');
  const candidates = standing.inForce.filter(notGoal);
  const everHeld = lines.filter(notGoal);
  const ids = new Set(lines.map((l) => l.id));
  for (const name of [...goals.keys()].sort(compare)) {
    const goal = goals.get(name)!;
    const found = goal.checks.map((check): GoalReading['checks'][number] => {
      // the goal never satisfies its own check
      const hit = standing.inForce.find((l) => l.id !== goal.line.id && matches(check, l));
      return hit ? { check, foundIn: hit.id } : { check };
    });
    const met = found.every((f) => 'foundIn' in f);
    const writer = goalWriter(goal.line.id);
    // once: the goal's line anywhere in the thread, revoked or not, is its outcome
    const outcome = ordered.find((l) => l.gist === goal.then && l.writer === writer);
    const reading: GoalReading = { line: goal.line.id, name, then: goal.then, checks: found, met, final: goal.final };
    if (goal.with) reading.with = goal.with;
    if (outcome) {
      reading.outcome = outcome.id;
      if (revokedIds.has(outcome.id)) reading.outcomeRevoked = true;
    }
    goalReadings.push(reading);
    if (met && !outcome) missing.push({ sort: 'line', gist: goal.then, writer, line: goal.line.id, payload: goal.with ?? {} });
    if (!warns) continue;
    const others = candidates.filter((l) => l.id !== goal.line.id);
    found.forEach((f, i) => {
      if ('foundIn' in f || anchored(f.check, others, everHeld, ids)) return;
      f.orphan = true;
      const written = lines.some((l) => l.gist === WARNING_GIST && l.writer === writer && has(l.payload, 'check') && l.payload.check === i);
      if (!written) missing.push({ sort: 'line', gist: WARNING_GIST, writer, line: goal.line.id, payload: { check: i } });
    });
  }

  return { standing, metadata, assignees, goals: goalReadings, missing };
}

/**
 * Whether a gist may be written by this writer on this thread. A schema with no
 * `when`, or an empty one, holds. Admission and the offers both ask this, so a menu
 * drawn from the offers cannot disagree with the server.
 */
export function whenHolds(lines: EventLine[], writer: Writer, schema: GistSchema, gists: GistSchema[]): boolean {
  const { when } = schema;
  if (!when) return true;
  const expected = expectations(lines, gists);
  if (when.checks && !when.checks.every((check) => expected.standing.inForce.some((l) => matches(check, l)))) return false;
  if (when.assignee) {
    const at = writer.indexOf('::');
    if (at < 0 || !expected.assignees.has(writer.slice(at + 2))) return false;
  }
  if (when.metadata) {
    for (const [key, value] of Object.entries(when.metadata)) {
      const stated = expected.metadata.get(key);
      if (!stated || canonical(stated.value) !== canonical(value)) return false;
    }
  }
  return true;
}

export function reduce(lines: EventLine[], handles: Handles, gists: GistSchema[]): Reading {
  const { standing, metadata, assignees, goals: goalReadings, missing } = expectations(lines, gists);

  // 3. the comparison with the handles
  const denunciations: Denunciation[] = [];
  const creates = standing.inForce.filter((l) => l.gist === CREATE_GIST).length;
  if (creates !== 1) denunciations.push({ sort: 'thread', rule: 'one-create', found: creates });
  denunciations.push(...missing);

  const keys = [...new Set([...metadata.keys(), ...Object.keys(handles.metadata)])].sort(compare);
  for (const key of keys) {
    const expected = metadata.get(key);
    const found = has(handles.metadata, key);
    if (expected && found) {
      const value = handles.metadata[key];
      if (canonical(expected.value) !== canonical(value)) {
        denunciations.push({ sort: 'metadata', key, expected: expected.value, found: value, line: expected.line });
      }
    } else if (expected) {
      denunciations.push({ sort: 'metadata', key, expected: expected.value, line: expected.line });
    } else if (found) {
      denunciations.push({ sort: 'metadata', key, found: handles.metadata[key] });
    }
  }

  const present = new Set(handles.assignees);
  for (const user of [...new Set([...assignees.keys(), ...present])].sort(compare)) {
    const asked = assignees.get(user);
    if (asked !== undefined && !present.has(user)) denunciations.push({ sort: 'assignment', user, expected: true, line: asked });
    else if (asked === undefined && present.has(user)) denunciations.push({ sort: 'assignment', user, expected: false });
  }

  return {
    inForce: standing.inForce.map((l) => l.id),
    revoked: standing.revoked.map((l) => l.id),
    expected: {
      metadata: Object.fromEntries([...metadata].sort(([a], [b]) => compare(a, b)).map(([key, m]) => [key, m.value])),
      assignees: [...assignees.keys()].sort(compare),
    },
    goals: goalReadings,
    denunciations,
    settled: denunciations.length === 0,
  };
}
