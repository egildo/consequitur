// How a check matches a line, and how a `where` matches a payload. A check is an equality on a line's gist, kin, writer and payload keys:
// a condition's `line` node asks one, and a binding's `where` is the payload half.

import { canonical } from './line.ts';
import type { Check, EventLine, Payload } from './types.ts';
import { has, isObject, kinOf } from './util.ts';

const CHECK_KEYS = ['gist', 'kin', 'writer', 'payload'];

/** A reference to the value handle, `{ "$value": key }`: what a check's payload value may be besides a plain one. */
export const isValueReference = (value: unknown): value is { $value: string } =>
  isObject(value) && Object.keys(value).length === 1 && typeof value.$value === 'string';

/**
 * Whether a check can be read: an object stating at least one of `gist`, `kin`, `writer` (strings) and `payload`
 * (an object with a key), and nothing else. A payload value that is an object holding `$value` is a reference, and
 * must be one: `$value` beside other keys is refused.
 */
export function validCheck(check: unknown): check is Check {
  if (!isObject(check)) return false;
  const keys = Object.keys(check);
  if (keys.length === 0 || keys.some((k) => !CHECK_KEYS.includes(k))) return false;
  return keys.every((k) => {
    if (k !== 'payload') return typeof check[k] === 'string';
    const payload = check[k];
    return isObject(payload) && Object.keys(payload).length > 0 && Object.values(payload).every((v) => !has(v, '$value') || isValueReference(v));
  });
}

/** Whether a line equals every part a check states. */
export function matches(check: Check, line: EventLine): boolean {
  if (check.gist !== undefined && check.gist !== line.gist) return false;
  if (check.kin !== undefined && check.kin !== kinOf(line.writer)) return false;
  if (check.writer !== undefined && check.writer !== line.writer) return false;
  if (check.payload === undefined) return true;
  return Object.keys(check.payload).every(
    (key) => has(line.payload, key) && canonical(line.payload[key]) === canonical(check.payload![key]),
  );
}

/**
 * Whether a binding's `where` lets it apply to this line: every key it names is
 * in the payload and equals the value given. A binding with no `where` applies
 * to every line of its gist.
 */
export function whereMatches(where: Payload | undefined, line: Pick<EventLine, 'payload'>): boolean {
  if (where === undefined) return true;
  return isObject(where) && Object.keys(where).every((key) => has(line.payload, key) && canonical(line.payload[key]) === canonical(where[key]));
}
