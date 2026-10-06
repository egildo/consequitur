// The `value` rule: a key of the value handle is expected to be a payload key's
// value (`from`), a fixed one (`value`), or the list of every one the lines in
// force state (`collect`). Its fourth form, the fill, takes the key from the payload
// too: the value under `from` is stated under the key the payload holds under `keyFrom`.
// `where` makes a binding apply only to lines whose payload holds the values it names.

import { referencesOf, whereMatches } from '../check.ts';
import type { ValueAcc } from '../handles/value.ts';
import { canonical } from '../line.ts';
import type { Json, Payload, RuleBinding, RuleKind, Schema } from '../types.ts';
import { has, isJson, isObject, keysAre, optionalFlag } from '../util.ts';

const whereOf = (binding: RuleBinding): Payload | undefined => binding.where as Payload | undefined;

const whereFits = (binding: Record<string, unknown>): boolean =>
  !('where' in binding) || (isObject(binding.where) && Object.keys(binding.where).length > 0 && isJson(binding.where));

/** The keys some binding of the schema states: any binding with a `key`, whatever its rule. */
const statedKeys = (schema: Schema): Set<string> =>
  new Set(schema.gists.flatMap((g) => g.rules.flatMap((r) => (typeof r.key === 'string' ? [r.key] : []))));

export const valueRule: RuleKind = {
  rule: 'value',
  handles: ['value'],

  read(binding) {
    // the fill names no key and reads two payload keys; `required` has no meaning beside it, since a fill that lacks them states nothing
    if ('keyFrom' in binding) {
      const fits = keysAre(binding, ['keyFrom', 'from'], ['where']) && typeof binding.keyFrom === 'string' && typeof binding.from === 'string' && whereFits(binding);
      return fits ? (binding as RuleBinding) : 'a value binding that takes its key from the payload has exactly keyFrom and from, and may have where.';
    }
    // exactly one of `from`, `value` and `collect`; `required` only makes sense beside
    // a key read from the payload, which `value` does not read
    const forms = ['from', 'value', 'collect'].filter((k) => k in binding);
    if (forms.length !== 1 || typeof binding.key !== 'string') return 'a value binding has a key and exactly one of from, value and collect.';
    if (!whereFits(binding)) return 'where must be an object with at least one key, of JSON values.';
    const [form] = forms;
    const fits =
      form === 'value'
        ? keysAre(binding, ['key', 'value'], ['where']) && isJson(binding.value)
        : keysAre(binding, ['key', form], ['required', 'where']) && typeof binding[form] === 'string' && optionalFlag(binding);
    return fits ? (binding as RuleBinding) : 'does not have exactly the keys and types of a value binding.';
  },

  admit(binding, payload, written, schema) {
    if ('keyFrom' in binding) {
      // a fill is judged as it was written: a reference in it is no key and no value, whatever it would resolve to
      if (!whereMatches(whereOf(binding), { payload: written })) return undefined;
      const keyFrom = binding.keyFrom as string;
      const from = binding.from as string;
      if (has(written, keyFrom)) {
        const key = written[keyFrom];
        if (typeof key !== 'string') return `The key "${keyFrom}" must hold a string`;
        if (statedKeys(schema).has(key)) return `The key "${keyFrom}" names "${key}", which a value binding of the schema states`;
      }
      return has(written, from) && referencesOf(written[from]).length > 0 ? `The key "${from}" must not hold a reference` : undefined;
    }
    if ('value' in binding) return undefined;
    // a binding whose `where` does not match this payload is not asked for
    const key = (binding.collect ?? binding.from) as string;
    if (binding.required && !has(payload, key) && whereMatches(whereOf(binding), { payload })) return `The key "${key}" is required`;
    return undefined;
  },

  expect(binding, line, acc) {
    const stated = acc('value') as ValueAcc | undefined;
    if (!stated || !whereMatches(whereOf(binding), line)) return;
    if ('keyFrom' in binding) {
      const key = has(line.payload, binding.keyFrom as string) ? line.payload[binding.keyFrom as string] : undefined;
      if (typeof key === 'string' && has(line.payload, binding.from as string)) stated.set(key, { value: line.payload[binding.from as string], line: line.id, collected: false });
      return;
    }
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
