// A line's envelope and its hash, and the two readings every other part of the
// thread builds on: reading order, and which lines are in force.
//
// Strings are compared with `<` everywhere, never `localeCompare`: two readers
// must agree on an order whatever their locale.

import type { EventLine, GistSchema, Json, LineDraft, LineId } from './types.ts';

/** The one gist the mechanic reserves: a thread opens with it. */
export const CREATE_GIST = 'create';

/** The gist a goal writes, once per check, when the thread holds nothing the check could match. */
export const WARNING_GIST = 'goal_warning';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
 * The server's envelope for a draft. The id is computed here, once, and stored:
 * nothing else recomputes it but `verify`. A timestamp never repeats inside a
 * thread, because the reading order depends on it.
 */
export async function stamp(draft: LineDraft, lines: EventLine[], now: string): Promise<EventLine> {
  const instant = new Date(now).toISOString();
  const latest = lines.reduce((max, l) => (l.timestamp > max ? l.timestamp : max), '');
  const timestamp = latest !== '' && instant <= latest ? new Date(Date.parse(latest) + 1).toISOString() : instant;
  const body = {
    previous: lines.length ? lines[lines.length - 1].id : null,
    gist: draft.gist,
    writer: draft.writer,
    timestamp,
    payload: draft.payload,
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
    const binding = schemaOf(line.gist)?.rules.find((r) => r.rule === 'revoke');
    if (binding?.rule !== 'revoke') continue;
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
