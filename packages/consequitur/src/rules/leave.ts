// The `leave` rule: the line's writer stops being expected in a set, until a
// later line asks again.

import type { SetAcc } from '../handles/set.ts';
import type { RuleBinding, RuleKind } from '../types.ts';
import { idOf, keysAre } from '../util.ts';

export const leaveRule: RuleKind = {
  rule: 'leave',
  handles: ['set'],

  read(binding, schema) {
    if (!keysAre(binding, ['set']) || typeof binding.set !== 'string') return 'does not have exactly the keys and types of a leave binding.';
    if (!schema.sets.includes(binding.set)) return `the leave binding names the set "${binding.set}", which the schema does not declare.`;
    return binding as RuleBinding;
  },

  admit: () => undefined,

  expect(binding, line, acc) {
    const sets = acc('set') as SetAcc | undefined;
    const id = idOf(line.writer);
    if (sets && id !== undefined) sets.get(binding.set as string)?.delete(id);
  },
};
