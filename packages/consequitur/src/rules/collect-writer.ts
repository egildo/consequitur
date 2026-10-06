// The `collect-writer` rule: the id of the line's writer is added to the list the value
// handle holds under `key`, as `collect` adds a payload key's value. It reads the envelope,
// so nobody can write it in another's name.

import type { ValueAcc } from '../handles/value.ts';
import type { Json, RuleBinding, RuleKind } from '../types.ts';
import { idOf, keysAre } from '../util.ts';

export const collectWriterRule: RuleKind = {
  rule: 'collect-writer',
  handles: ['value'],

  read: (binding) => (keysAre(binding, ['key']) && typeof binding.key === 'string' ? (binding as RuleBinding) : 'a collect-writer binding has exactly a key.'),

  admit: () => undefined,

  expect(binding, line, acc) {
    const stated = acc('value') as ValueAcc | undefined;
    const id = idOf(line.writer);
    if (!stated || id === undefined) return;
    const key = binding.key as string;
    const held = stated.get(key);
    // a key that held one value starts a new list; an id already there adds nothing
    const list = held?.collected ? (held.value as Json[]) : [];
    if (list.includes(id)) return;
    stated.set(key, { value: [...list, id], line: line.id, collected: true });
  },
};
