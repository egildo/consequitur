// The `join` rule: the names under a payload key (a name, or a list of names)
// are expected in a set. Whoever asked first keeps the line that asked.

import { isValueReference } from '../check.ts';
import type { SetAcc } from '../handles/set.ts';
import type { Json, RuleBinding, RuleKind } from '../types.ts';
import { has, keysAre, optionalFlag } from '../util.ts';

// a reference no line states yet is a name to come: it is not checked
const isName = (value: Json): boolean => typeof value === 'string' || isValueReference(value);
const namesMembers = (value: Json): boolean => isName(value) || (Array.isArray(value) && value.every(isName));

export const joinRule: RuleKind = {
  rule: 'join',
  handles: ['set'],

  read(binding, schema) {
    if (!keysAre(binding, ['set', 'from'], ['required']) || typeof binding.set !== 'string' || typeof binding.from !== 'string' || !optionalFlag(binding)) {
      return 'does not have exactly the keys and types of a join binding.';
    }
    if (!schema.sets.includes(binding.set)) return `the join binding names the set "${binding.set}", which the schema does not declare.`;
    return binding as RuleBinding;
  },

  admit(binding, payload) {
    const from = binding.from as string;
    if (!has(payload, from)) return binding.required ? `The key "${from}" is required` : undefined;
    return namesMembers(payload[from]) ? undefined : `The key "${from}" must hold a string or a list of strings`;
  },

  expect(binding, line, acc) {
    const sets = acc('set') as SetAcc | undefined;
    if (!sets) return;
    const asked = has(line.payload, binding.from as string) ? line.payload[binding.from as string] : undefined;
    const names = typeof asked === 'string' ? [asked] : Array.isArray(asked) && asked.every((u) => typeof u === 'string') ? (asked as string[]) : [];
    const set = sets.get(binding.set as string) ?? new Map<string, string>();
    sets.set(binding.set as string, set);
    for (const name of names) if (!set.has(name)) set.set(name, line.id);
  },
};
