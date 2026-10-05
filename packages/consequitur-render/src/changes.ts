// Keys for the things a reading holds with no id of their own. `reduce` builds fresh objects every
// time, so a host that memoises by reference needs a string that stays the same across readings.
// Pure and without DOM.

import { canonical, type Denunciation, type GoalReading } from 'consequitur';

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
