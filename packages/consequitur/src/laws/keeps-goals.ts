// `keeps-goals`: broken for each check of a goal in force that the line would
// orphan, one verdict per check. A check already orphaned before is not new.

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
      goal.checks.forEach((c, i) => {
        if (c.orphan && !was.checks[i]?.orphan) {
          out.push({ detail: `The check ${i} of goal "${goal.name}" would be orphaned.`, goal: goal.line, check: i });
        }
      });
    }
    return out;
  },
};
