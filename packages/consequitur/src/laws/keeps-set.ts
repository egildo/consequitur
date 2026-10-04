// `keeps-set { set, while? }`: broken when, once the line has settled, the set is
// empty while every value in `while` holds in the value handle.

import { canonical } from '../line.ts';
import type { LawBinding, LawKind } from '../types.ts';
import { has, isJson, isObject, isRecord, keysAre } from '../util.ts';

export const keepsSet: LawKind = {
  law: 'keeps-set',

  read(binding, schema) {
    if (!keysAre(binding, ['set', 'strength'], ['while']) || typeof binding.set !== 'string') return 'does not have exactly the keys and types of a keeps-set law.';
    if (!schema.sets.includes(binding.set)) return `the keeps-set law names the set "${binding.set}", which the schema does not declare.`;
    if ('while' in binding && !(isObject(binding.while) && Object.keys(binding.while).length > 0 && isJson(binding.while))) {
      return 'while must be an object with at least one key, of JSON values.';
    }
    return binding as LawBinding;
  },

  judge(binding, _before, after) {
    const set = binding.set as string;
    const sets = isRecord(after.handles.set) ? after.handles.set : {};
    if (Array.isArray(sets[set]) && sets[set].length > 0) return [];
    const values = isRecord(after.handles.value) ? after.handles.value : {};
    const held = isRecord(binding.while) ? binding.while : {};
    if (!Object.entries(held).every(([key, value]) => has(values, key) && canonical(values[key]) === canonical(value))) return [];
    const when = Object.entries(held).map(([key, value]) => `${key} is ${canonical(value)}`);
    return [{ detail: `The set "${set}" would be empty${when.length ? ` while ${when.join(' and ')}` : ''}.` }];
  },
};
