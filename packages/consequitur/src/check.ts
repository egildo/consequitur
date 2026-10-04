// How a check matches a line, how a `where` matches a payload, and who wrote a
// line. A check is an equality on a line's gist, kin, writer and payload keys:
// goals wait on them, `when` asks them, and a binding's `where` is the payload half.

import { canonical } from './line.ts';
import type { Check, EventLine, Payload } from './types.ts';
import { has, isObject } from './util.ts';

const CHECK_KEYS = ['gist', 'kin', 'writer', 'payload'];

/**
 * Whether a goal's checks can be read: a non-empty array whose every element is
 * an object stating at least one of `gist`, `kin`, `writer` (strings) and
 * `payload` (an object with a key), and nothing else. Admission uses the same
 * answer, so a goal that is refused and a goal that states nothing agree.
 */
export function validChecks(value: unknown): value is Check[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((check) => {
    if (!isObject(check)) return false;
    const keys = Object.keys(check);
    if (keys.length === 0 || keys.some((k) => !CHECK_KEYS.includes(k))) return false;
    return keys.every((k) => (k === 'payload' ? isObject(check[k]) && Object.keys(check[k]).length > 0 : typeof check[k] === 'string'));
  });
}

/** The part of a writer before the first `::`; a writer with no `::` has none. */
export const kinOf = (writer: string): string | undefined => {
  const at = writer.indexOf('::');
  return at < 0 ? undefined : writer.slice(0, at);
};

/** The part after the first `::`; a writer with no `::` has none. */
export const idOf = (writer: string): string | undefined => {
  const at = writer.indexOf('::');
  return at < 0 ? undefined : writer.slice(at + 2);
};

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
