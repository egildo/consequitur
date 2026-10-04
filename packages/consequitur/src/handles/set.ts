// The `set` handle: named sets of names. The thread's expectation is, per set,
// the names it expects and the line that asked first; a set the schema declares
// is always there, empty if nobody is in it.

import type { Change, HandleDenunciation, HandleKind, Json, LineId, Payload, Schema } from '../types.ts';
import { compare, isRecord } from '../util.ts';

/** The accumulator of the `set` handle: per set, each name with the line that asked first. */
export type SetAcc = Map<string, Map<string, LineId>>;

/** The names a handle holds in one set; anything that is not a list of names holds none. */
const namesIn = (handle: { [key: string]: Json }, set: string): string[] => {
  const list = handle[set];
  return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [];
};

const setsOf = (handle: Json): { [key: string]: Json } => (isRecord(handle) ? handle : {});

export const setHandle: HandleKind = {
  kind: 'set',
  roles: ['join', 'leave'],
  empty: (schema: Schema) => Object.fromEntries(schema.sets.map((set) => [set, []])),
  start: (schema: Schema): SetAcc => new Map(schema.sets.map((set) => [set, new Map()])),

  expected(acc) {
    const sets = acc as SetAcc;
    return Object.fromEntries([...sets].sort(([a], [b]) => compare(a, b)).map(([set, names]) => [set, [...names.keys()].sort(compare)]));
  },

  compare(acc, found) {
    const sets = acc as SetAcc;
    const held = setsOf(found);
    const out: HandleDenunciation[] = [];
    for (const set of [...new Set([...sets.keys(), ...Object.keys(held)])].sort(compare)) {
      const asked = sets.get(set) ?? new Map<string, LineId>();
      const present = new Set(namesIn(held, set));
      for (const member of [...new Set([...asked.keys(), ...present])].sort(compare)) {
        const line = asked.get(member);
        if (line !== undefined && !present.has(member)) out.push({ sort: 'handle', kind: 'set', key: set, member, expected: true, line });
        else if (line === undefined && present.has(member)) out.push({ sort: 'handle', kind: 'set', key: set, member, expected: false });
      }
    }
    return out;
  },

  answer(d, found) {
    const member = d.member ?? '';
    const handle = { ...setsOf(found) };
    const names = new Set(namesIn(handle, d.key));
    if (d.expected === true) names.add(member);
    else names.delete(member);
    handle[d.key] = [...names].sort(compare);
    const payload: Payload = { set: d.key, member };
    if (d.expected !== true) return { handle, role: 'leave', payload };
    if (d.line !== undefined) payload.line = d.line;
    return { handle, role: 'join', payload };
  },

  diff(before, after) {
    const was = setsOf(before);
    const is = setsOf(after);
    const out: Change[] = [];
    for (const key of [...new Set([...Object.keys(was), ...Object.keys(is)])].sort(compare)) {
      const had = new Set(namesIn(was, key));
      const now = new Set(namesIn(is, key));
      for (const member of [...new Set([...had, ...now])].sort(compare)) {
        if (now.has(member) && !had.has(member)) out.push({ kind: 'set', key, member, change: 'join' });
        else if (had.has(member) && !now.has(member)) out.push({ kind: 'set', key, member, change: 'leave' });
      }
    }
    return out;
  },
};
