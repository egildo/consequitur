// What a host animates or tells a person when a reading becomes another: the changes between two
// readings, each with a key. `consequitur` builds fresh objects every time, so a host that memoises by
// reference needs a key for the things a reading holds with no id of their own. Pure and without
// DOM: the same two readings give the same list.

import { canonical, compare, type Denunciation, type GoalReading, type LineId, type Reading } from 'consequitur';

export type ReadingChange =
  /** A line newly in force, or newly out of force. */
  | { of: 'line'; key: LineId; change: 'in-force' | 'revoked' }
  /** A goal newly read, newly met, met no more, or no longer in the reading. */
  | { of: 'goal'; key: LineId; change: 'set' | 'met' | 'unmet' | 'gone' }
  /** A check that found its line, lost it, or became an orphan; `key` is from `keyOfCheck`. */
  | { of: 'check'; key: string; change: 'found' | 'lost' | 'orphan' }
  /** A denunciation that appeared, or disappeared; `key` is from `keyOf`. */
  | { of: 'denunciation'; key: string; change: 'raised' | 'answered' }
  /** The thread's settling flipped. */
  | { of: 'settled'; change: 'settled' | 'unsettled' };

/**
 * A key for a denunciation, which has no id: equal for two denunciations that say the same thing
 * in two readings, different otherwise. The parts a person writes (a key, a member, a payload) come last
 * or canonical, so no separator is ambiguous.
 */
export function keyOf(denunciation: Denunciation): string {
  if (denunciation.sort === 'handle') return `handle:${canonical([denunciation.kind, denunciation.key, denunciation.member ?? null])}`;
  if (denunciation.sort === 'line') return `line:${denunciation.line}:${denunciation.gist}:${canonical(denunciation.payload)}`;
  return `thread:${denunciation.rule}`;
}

/** A key for one check of one goal: the goal's line and the check's index, so two equal checks of a goal differ. */
export function keyOfCheck(goal: GoalReading, index: number): string {
  return `${goal.line}:${index}`;
}

const ORDER = ['line', 'goal', 'check', 'denunciation', 'settled'];

/** What changed from `before` to `after`: by kind (line, goal, check, denunciation, settled), then by key. */
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
    goal.checks.forEach((check, index) => {
      const key = keyOfCheck(goal, index);
      const was = old?.checks[index];
      if (check.foundIn !== undefined && check.foundIn !== was?.foundIn) out.push({ of: 'check', key, change: 'found' });
      if (check.foundIn === undefined && was?.foundIn !== undefined) out.push({ of: 'check', key, change: 'lost' });
      if (check.orphan && !was?.orphan) out.push({ of: 'check', key, change: 'orphan' });
    });
  }
  const goalsAfter = new Set(after.goals.map((g) => g.line));
  for (const goal of before.goals) if (!goalsAfter.has(goal.line)) out.push({ of: 'goal', key: goal.line, change: 'gone' });

  const raised = new Set(before.denunciations.map(keyOf));
  const standingNow = new Set(after.denunciations.map(keyOf));
  for (const key of standingNow) if (!raised.has(key)) out.push({ of: 'denunciation', key, change: 'raised' });
  for (const key of raised) if (!standingNow.has(key)) out.push({ of: 'denunciation', key, change: 'answered' });

  if (before.settled !== after.settled) out.push({ of: 'settled', change: after.settled ? 'settled' : 'unsettled' });

  // the sort is stable: the changes of one key stay in the order they were found
  return out.sort((a, b) => ORDER.indexOf(a.of) - ORDER.indexOf(b.of) || compare('key' in a ? a.key : '', 'key' in b ? b.key : ''));
}
