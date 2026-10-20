// What a host animates or tells a person when a reading becomes another: the changes between two
// readings, each with a key. `consequitur` builds fresh objects every time, so a host that memoises by
// reference needs a key for the things a reading holds with no id of their own. Pure and without
// DOM: the same two readings give the same list.

import { canonical, compare, nodes, type Denunciation, type GoalReading, type LineId, type Reading, type Trace } from 'consequitur';

export type ReadingChange =
  /** A line newly in force, or newly out of force. */
  | { of: 'line'; key: LineId; change: 'in-force' | 'revoked' }
  /** A goal newly read, newly met, met no more, or no longer in the reading. */
  | { of: 'goal'; key: LineId; change: 'set' | 'met' | 'unmet' | 'gone' }
  /** A goal's `line` node that found its line, lost it, or became an orphan (can no longer hold); `key` is from `keyOfCheck`. */
  | { of: 'check'; key: string; change: 'found' | 'lost' | 'orphan' }
  /** A denunciation that appeared, or disappeared; `key` is from `keyOf`. */
  | { of: 'denunciation'; key: string; change: 'raised' | 'answered' }
  /** A value awaited that a line in force newly refers to and no line states, or that a line newly states; `key` is the hole's key. */
  | { of: 'hole'; key: string; change: 'opened' | 'filled' }
  /** The thread's settling flipped. */
  | { of: 'settled'; change: 'settled' | 'unsettled' };

/**
 * A key for a denunciation, which has no id: equal for two denunciations that say the same thing
 * in two readings, different otherwise. The parts a person writes (a key, a member, a payload) come last
 * or canonical, so no separator is ambiguous.
 */
export function keyOf(denunciation: Denunciation): string {
  if (denunciation.sort === 'handle') return `handle:${canonical([denunciation.kind, denunciation.key, denunciation.member ?? null])}`;
  // a line a kin answers is keyed by the gist and the kin, canonical, so it never reads as a goal's line id
  if (denunciation.sort === 'line' && 'kin' in denunciation) return `line:${canonical([denunciation.gist, denunciation.kin])}`;
  if (denunciation.sort === 'line') return `line:${denunciation.line}:${denunciation.gist}:${canonical(denunciation.payload)}`;
  return `thread:${denunciation.rule}`;
}

/**
 * A key for one node of a goal's condition: the goal's line and the node's path, so two equal checks of a goal
 * differ. A goal that is an `all` of checks keeps the keys it had when it was a list: its `n`th check is `n`.
 */
export function keyOfCheck(goal: GoalReading, path: string): string {
  return `${goal.line}:${path}`;
}

/** The `line` nodes of a goal's trace, by path. */
const checksOf = (trace: Trace | undefined): Map<string, Trace> =>
  new Map(trace === undefined ? [] : nodes(trace).flatMap(({ path, node }) => ('line' in node.condition ? [[path, node] as const] : [])));

const ORDER = ['line', 'goal', 'check', 'denunciation', 'hole', 'settled'];

/** What changed from `before` to `after`: by kind (line, goal, check, denunciation, hole, settled), then by key. */
export function changes(before: Reading, after: Reading): ReadingChange[] {
  const out: ReadingChange[] = [];

  const standing = new Set(before.inForce);
  for (const key of after.inForce) if (!standing.has(key)) out.push({ of: 'line', key, change: 'in-force' });
  const revoked = new Set(before.revoked);
  for (const key of after.revoked) if (!revoked.has(key)) out.push({ of: 'line', key, change: 'revoked' });

  const goalsBefore = new Map(before.goals.map((g) => [g.line, g] as const));
  for (const goal of after.goals) {
    const old = goalsBefore.get(goal.line);
    if (!old) out.push({ of: 'goal', key: goal.line, change: 'set' });
    if (goal.met && !old?.met) out.push({ of: 'goal', key: goal.line, change: 'met' });
    if (!goal.met && old?.met) out.push({ of: 'goal', key: goal.line, change: 'unmet' });
    // the checks of a goal newly set are read against checks that found nothing
    const before = checksOf(old?.trace);
    for (const [path, check] of checksOf(goal.trace)) {
      const key = keyOfCheck(goal, path);
      const was = before.get(path);
      if (check.foundIn !== undefined && check.foundIn !== was?.foundIn) out.push({ of: 'check', key, change: 'found' });
      if (check.foundIn === undefined && was?.foundIn !== undefined) out.push({ of: 'check', key, change: 'lost' });
      if (check.lost && !was?.lost) out.push({ of: 'check', key, change: 'orphan' });
    }
  }
  const goalsAfter = new Set(after.goals.map((g) => g.line));
  for (const goal of before.goals) if (!goalsAfter.has(goal.line)) out.push({ of: 'goal', key: goal.line, change: 'gone' });

  const raised = new Set(before.denunciations.map(keyOf));
  const standingNow = new Set(after.denunciations.map(keyOf));
  for (const key of standingNow) if (!raised.has(key)) out.push({ of: 'denunciation', key, change: 'raised' });
  for (const key of raised) if (!standingNow.has(key)) out.push({ of: 'denunciation', key, change: 'answered' });

  const open = new Set(before.holes.map((h) => h.key));
  const awaited = new Set(after.holes.map((h) => h.key));
  for (const key of awaited) if (!open.has(key)) out.push({ of: 'hole', key, change: 'opened' });
  for (const key of open) if (!awaited.has(key)) out.push({ of: 'hole', key, change: 'filled' });

  if (before.settled !== after.settled) out.push({ of: 'settled', change: after.settled ? 'settled' : 'unsettled' });

  // the sort is stable: the changes of one key stay in the order they were found
  return out.sort((a, b) => ORDER.indexOf(a.of) - ORDER.indexOf(b.of) || compare('key' in a ? a.key : '', 'key' in b ? b.key : ''));
}
