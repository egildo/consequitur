// How a check matches a line, and how a `where` matches a payload. A check is an equality on a line's gist, kin, writer and payload keys:
// a condition's `line` node asks one, and a binding's `where` is the payload half.

import { canonical } from './line.ts';
import type { Check, EventLine, Json, Payload } from './types.ts';
import { has, isObject, kinOf } from './util.ts';

const CHECK_KEYS = ['gist', 'kin', 'writer', 'payload'];

/** A reference to the value handle, `{ "$value": key }`: what a check's payload value may be besides a plain one. */
export const isValueReference = (value: unknown): value is { $value: string } =>
  isObject(value) && Object.keys(value).length === 1 && typeof value.$value === 'string';

/** The key of every `$value` reference a value holds, at any depth, in order, a key once for each. */
export function referencesOf(value: Json): string[] {
  if (isValueReference(value)) return [value.$value];
  if (Array.isArray(value)) return value.flatMap(referencesOf);
  return isObject(value) ? Object.values(value).flatMap((item) => referencesOf(item as Json)) : [];
}

/**
 * A value with each reference replaced by what `values` holds under its key. A reference to a key `values` lacks
 * is left out, as a key of its object or an item of its list, and so states nothing; with `keep` it stays as it
 * is, which is how admission treats it: present, and not yet checked.
 */
function resolveValue(value: Json, values: Payload, keep: boolean): Json | undefined {
  if (isValueReference(value)) return has(values, value.$value) ? values[value.$value] : keep ? value : undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => resolveValue(item, values, keep));
    return items.filter((item): item is Json => item !== undefined);
  }
  return isObject(value) ? resolvePayload(value as Payload, values, keep) : value;
}

/** A payload read against `values`, each reference replaced as `resolveValue` says; it is a new payload, the line's own is not touched. */
export function resolvePayload(payload: Payload, values: Payload, keep = false): Payload {
  const out: Payload = {};
  for (const [key, value] of Object.entries(payload)) {
    const resolved = resolveValue(value, values, keep);
    if (resolved !== undefined) out[key] = resolved;
  }
  return out;
}

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
