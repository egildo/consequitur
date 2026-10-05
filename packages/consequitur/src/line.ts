// A line's envelope and its hash, and the two readings every other part of the
// thread builds on: reading order, and which lines are in force.
//
// Strings are compared with `<` everywhere, never `localeCompare`: two readers
// must agree on an order whatever their locale.

import type { EventLine, GistSchema, Json, LineDraft, LineId, Payload } from './types.ts';
import { compare } from './util.ts';

/**
 * What a gist's revoke binding says, or nothing when it has none: only the first
 * is read. Revoking is a mechanic, so the engine reads it, not a kind.
 */
export function revokeOf(gist: GistSchema | undefined): { from: string; gists: string[] } | undefined {
  const binding = gist?.rules.find((r) => r.rule === 'revoke');
  if (!binding || typeof binding.from !== 'string' || !Array.isArray(binding.gists)) return undefined;
  return { from: binding.from, gists: binding.gists.filter((g): g is string => typeof g === 'string') };
}

/** `JSON.stringify` with every object's keys sorted, at every depth, so equal values give one string. */
export function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort(compare);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function hashOf(line: Omit<EventLine, 'id'>): Promise<LineId> {
  const text = canonical([line.previous, line.gist, line.writer, line.timestamp, line.payload]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The authority's envelope for a draft. The id is computed here, once, and stored:
 * nothing else recomputes it but `verify`. A timestamp never repeats inside a
 * thread, because the reading order depends on it. The payload is stored as JSON
 * holds it, so what is hashed is what a stored line gives back: a key that holds
 * `undefined` or a function is left out, a date is its string.
 */
export async function stamp(draft: LineDraft, lines: EventLine[], now: string): Promise<EventLine> {
  const instant = new Date(now).toISOString();
  // the thread's last line is the last in reading order: the array's own order is never read
  const last = inOrder(lines).at(-1);
  const timestamp = last && instant <= last.timestamp ? new Date(Date.parse(last.timestamp) + 1).toISOString() : instant;
  const body = {
    previous: last?.id ?? null,
    gist: draft.gist,
    writer: draft.writer,
    timestamp,
    payload: JSON.parse(JSON.stringify(draft.payload)) as Payload,
  };
  return { id: await hashOf(body), ...body };
}

/** Whether the stored id is the hash of the stored fields. */
export async function verify(line: EventLine): Promise<boolean> {
  return (await hashOf(line)) === line.id;
}

/** The reading order: by timestamp, ties by id. The array's own order is never read. */
export function inOrder(lines: EventLine[]): EventLine[] {
  return [...lines].sort((a, b) => compare(a.timestamp, b.timestamp) || compare(a.id, b.id));
}

/**
 * The id of the final goal that wrote this line, if one did. A goal's writer is
 * `goal::<id of the goal's line>`; the lock outlives the goal: revoking a final
 * goal leaves what it wrote locked.
 */
export function lockedBy(line: EventLine, lines: EventLine[]): LineId | undefined {
  const at = line.writer.indexOf('::');
  if (at < 0 || line.writer.slice(0, at) !== 'goal') return undefined;
  const id = line.writer.slice(at + 2);
  return lines.some((l) => l.id === id && l.payload.final === true) ? id : undefined;
}

/**
 * Which lines stand and which a revoking line has taken out, both in reading
 * order. The walk goes from the last line to the first so that a revoking line
 * that is itself revoked has no say: its target is given back.
 */
export function inForce(lines: EventLine[], gists: GistSchema[]): { inForce: EventLine[]; revoked: EventLine[] } {
  const ordered = inOrder(lines);
  const position = new Map(ordered.map((l, i) => [l.id, i] as const));
  const schemaOf = (gist: string) => gists.find((g) => g.gist === gist);
  const revokedIds = new Set<LineId>();
  const standing: EventLine[] = [];
  const taken: EventLine[] = [];

  for (let i = ordered.length - 1; i >= 0; i--) {
    const line = ordered[i];
    if (revokedIds.has(line.id)) {
      taken.push(line);
      continue;
    }
    standing.push(line);
    const binding = revokeOf(schemaOf(line.gist));
    if (!binding) continue;
    const target = line.payload[binding.from];
    if (typeof target !== 'string') continue;
    const at = position.get(target);
    // only an earlier line can be revoked, only a listed gist, and never one a final goal wrote
    if (at !== undefined && at < i && binding.gists.includes(ordered[at].gist) && lockedBy(ordered[at], ordered) === undefined) {
      revokedIds.add(target);
    }
  }
  return { inForce: standing.reverse(), revoked: taken.reverse() };
}
