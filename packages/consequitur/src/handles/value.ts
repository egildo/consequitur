// The `value` handle: one JSON value under each key. The thread's expectation is
// a map from key to the value, or to a list when the rules `collect`, together
// with the line that stated it.

import { canonical } from '../line.ts';
import type { Change, HandleDenunciation, HandleKind, Json, LineId, Payload } from '../types.ts';
import { compare, has, isRecord } from '../util.ts';

/** What the thread expects of one key. `collected` marks a list built by `collect`, which a later `collect` extends. */
export interface Stated {
  value: Json;
  line: LineId;
  collected: boolean;
}

/** The accumulator of the `value` handle: the rules write into it, and the kind compares it. */
export type ValueAcc = Map<string, Stated>;

const keysOf = (acc: ValueAcc, found: { [key: string]: Json }): string[] =>
  [...new Set([...acc.keys(), ...Object.keys(found)])].sort(compare);

export const valueHandle: HandleKind = {
  kind: 'value',
  roles: ['value'],
  empty: () => ({}),
  start: () => new Map(),

  expected(acc) {
    const stated = acc as ValueAcc;
    return Object.fromEntries([...stated].sort(([a], [b]) => compare(a, b)).map(([key, s]) => [key, s.value]));
  },

  compare(acc, found) {
    const stated = acc as ValueAcc;
    const held = isRecord(found) ? found : {};
    const out: HandleDenunciation[] = [];
    for (const key of keysOf(stated, held)) {
      const expected = stated.get(key);
      const present = has(held, key);
      if (expected && present) {
        if (canonical(expected.value) !== canonical(held[key])) {
          out.push({ sort: 'handle', kind: 'value', key, expected: expected.value, found: held[key], line: expected.line });
        }
      } else if (expected) {
        out.push({ sort: 'handle', kind: 'value', key, expected: expected.value, line: expected.line });
      } else if (present) {
        out.push({ sort: 'handle', kind: 'value', key, found: held[key] });
      }
    }
    return out;
  },

  answer(d, found) {
    const handle = { ...(isRecord(found) ? found : {}) };
    if ('expected' in d) {
      handle[d.key] = d.expected as Json;
      return { handle, role: 'value', payload: { key: d.key, value: d.expected as Json } };
    }
    delete handle[d.key];
    const payload: Payload = { key: d.key };
    return { handle, role: 'value', payload };
  },

  diff(before, after) {
    const was = isRecord(before) ? before : {};
    const is = isRecord(after) ? after : {};
    const out: Change[] = [];
    for (const key of [...new Set([...Object.keys(was), ...Object.keys(is)])].sort(compare)) {
      const inBefore = has(was, key);
      const inAfter = has(is, key);
      if (inBefore && inAfter) {
        if (canonical(was[key]) !== canonical(is[key])) out.push({ kind: 'value', key, before: was[key], after: is[key] });
      } else if (inAfter) out.push({ kind: 'value', key, after: is[key] });
      else out.push({ kind: 'value', key, before: was[key] });
    }
    return out;
  },
};
