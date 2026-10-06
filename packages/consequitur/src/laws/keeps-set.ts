// `keeps-set { set, while? }`: broken when, once the line has settled, the set is
// empty while the condition `while` holds, read on the handles the thread has then.

import { conditionHolds, conditionProblem } from '../condition.ts';
import type { Condition, LawBinding, LawKind } from '../types.ts';
import { isRecord, keysAre } from '../util.ts';

export const keepsSet: LawKind = {
  law: 'keeps-set',

  read(binding, schema) {
    if (!keysAre(binding, ['set', 'strength'], ['while']) || typeof binding.set !== 'string') return 'does not have exactly the keys and types of a keeps-set law.';
    if (!schema.sets.includes(binding.set)) return `the keeps-set law names the set "${binding.set}", which the schema does not declare.`;
    const problem = 'while' in binding ? conditionProblem(binding.while, schema, false) : undefined;
    return problem === undefined ? (binding as LawBinding) : `while: ${problem}`;
  },

  judge(binding, _before, after, schema) {
    const set = binding.set as string;
    const sets = isRecord(after.handles.set) ? after.handles.set : {};
    if (Array.isArray(sets[set]) && sets[set].length > 0) return [];
    if (binding.while !== undefined) {
      const standing = new Set(after.reading.inForce);
      const scope = { handles: after.handles, lines: after.lines.filter((l) => standing.has(l.id)), guards: schema.guards };
      if (conditionHolds(binding.while as unknown as Condition, scope) !== true) return [];
    }
    return [{ set, detail: `The set "${set}" would be empty${binding.while === undefined ? '' : ' while its condition holds'}.` }];
  },
};
