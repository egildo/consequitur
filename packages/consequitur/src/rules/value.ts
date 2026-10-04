// The `value` rule: a key of the value handle is expected to be a payload key's
// value (`from`), a fixed one (`value`), or the list of every one the lines in
// force state (`collect`). `where` makes a binding apply only to lines whose
// payload holds the values it names.

import { whereMatches } from '../check.ts';
import type { ValueAcc } from '../handles/value.ts';
import { canonical } from '../line.ts';
import type { Json, Payload, RuleBinding, RuleKind } from '../types.ts';
import { has, isJson, isObject, keysAre, optionalFlag } from '../util.ts';

const whereOf = (binding: RuleBinding): Payload | undefined => binding.where as Payload | undefined;

export const valueRule: RuleKind = {
  rule: 'value',
  handles: ['value'],

  read(binding) {
    // exactly one of `from`, `value` and `collect`; `required` only makes sense beside
    // a key read from the payload, which `value` does not read
    const forms = ['from', 'value', 'collect'].filter((k) => k in binding);
    if (forms.length !== 1 || typeof binding.key !== 'string') return 'a value binding has a key and exactly one of from, value and collect.';
    if ('where' in binding && !(isObject(binding.where) && Object.keys(binding.where).length > 0 && isJson(binding.where))) {
      return 'where must be an object with at least one key, of JSON values.';
    }
    const [form] = forms;
    const fits =
      form === 'value'
        ? keysAre(binding, ['key', 'value'], ['where']) && isJson(binding.value)
        : keysAre(binding, ['key', form], ['required', 'where']) && typeof binding[form] === 'string' && optionalFlag(binding);
    return fits ? (binding as RuleBinding) : 'does not have exactly the keys and types of a value binding.';
  },

  admit(binding, payload) {
    if ('value' in binding) return undefined;
    // a binding whose `where` does not match this payload is not asked for
    const key = (binding.collect ?? binding.from) as string;
    if (binding.required && !has(payload, key) && whereMatches(whereOf(binding), { payload })) return `The key "${key}" is required`;
    return undefined;
  },

  expect(binding, line, acc) {
    const stated = acc('value') as ValueAcc | undefined;
    if (!stated || !whereMatches(whereOf(binding), line)) return;
    const key = binding.key as string;
    if ('value' in binding) {
      stated.set(key, { value: binding.value as Json, line: line.id, collected: false });
    } else if ('collect' in binding) {
      const from = binding.collect as string;
      if (!has(line.payload, from)) return;
      const item = line.payload[from];
      const held = stated.get(key);
      // a key that held one value starts a new list; an equal value adds nothing
      const list = held?.collected ? (held.value as Json[]) : [];
      if (held?.collected && list.some((v) => canonical(v) === canonical(item))) return;
      stated.set(key, { value: [...list, item], line: line.id, collected: true });
    } else if (has(line.payload, binding.from as string)) {
      stated.set(key, { value: line.payload[binding.from as string], line: line.id, collected: false });
    }
  },
};
