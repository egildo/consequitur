// `keeps-goals`: broken for each goal in force that the line would make lost, one verdict per
// goal, with the path of the node that would make it lost. A goal lost before, through the same
// node, is not new.

import { lostAt } from '../condition.ts';
import type { LawBinding, LawKind } from '../types.ts';
import { keysAre } from '../util.ts';

export const keepsGoals: LawKind = {
  law: 'keeps-goals',

  read: (binding) => (keysAre(binding, ['strength']) ? (binding as LawBinding) : 'does not have exactly the keys of a keeps-goals law.'),

  judge(_binding, before, after) {
    const out: ReturnType<LawKind['judge']> = [];
    for (const goal of after.reading.goals) {
      const was = before.reading.goals.find((g) => g.line === goal.line);
      if (!was) continue;
      const path = lostAt(goal.trace);
      if (path !== undefined && path !== lostAt(was.trace)) {
        out.push({ detail: `The goal "${goal.name}" would be lost, at the node "${path}".`, goal: goal.line, path });
      }
    }
    return out;
  },
};
