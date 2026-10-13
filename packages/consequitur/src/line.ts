// A line's envelope and its hash, and the two readings every other part of the
// thread builds on: reading order, and which lines are in force.
//
// Strings are compared with `<` everywhere, never `localeCompare`: two readers
// must agree on an order whatever their locale.

import type { EventLine, GistSchema, Json, LineDraft, LineId, Payload, Seal, SchemaHead } from './types.ts';
import { compare, idOf, isRecord, kinOf } from './util.ts';

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

// The id begins with the name of the recipe that made it, `algorithm:encoded`. Only
// `sha256` is known: the five fields, and the declaration as a sixth on the line that
// has one, in RFC 8785's form, as UTF-8, by SHA-256, in hex.
const RECIPE = 'sha256';

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashOf(line: Omit<EventLine, 'id'>): Promise<string> {
  const fields: Json[] = [line.previous, line.gist, line.writer, line.timestamp, line.payload];
  // every other line keeps the five fields, so no other id changes shape
  if (line.thread !== undefined) fields.push(line.thread);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(fields)));
  return hex(new Uint8Array(digest));
}

/**
 * A payload as a stored line gives it back: through a JSON round trip, as `stamp`
 * stores it. Throws where JSON does: on a BigInt, or an object that holds itself.
 * Throws too where RFC 8785, the canonical form the hash is taken of, refuses:
 * on a number that is not finite, which JSON would write as null, and on a string
 * or key that is not well-formed Unicode (a lone surrogate).
 */
export const asStored = (payload: unknown): unknown =>
  JSON.parse(
    JSON.stringify(payload, (key: string, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`The number ${value} has no JSON form.`);
      if (!key.isWellFormed() || (typeof value === 'string' && !value.isWellFormed())) throw new TypeError('A string is not well-formed Unicode.');
      return value;
    }),
  );

/**
 * The authority's envelope for a draft. The id is computed here, once, and stored:
 * nothing else recomputes it but `verify`. The timestamp is the instant it is
 * given, as given: it may repeat or go back, for the chain is the order, not the
 * clock. The payload is stored as JSON holds it, so what is hashed is what a
 * stored line gives back: a key that holds `undefined` or a function is left out,
 * a date is its string. On an empty thread the line declares it: the nonce given,
 * or 16 random bytes drawn here, the schema's name and version when it has them, and
 * the sources `from` names when there are any. An empty `from` is left out, so a
 * thread that names none keeps the ids it had.
 */
export async function stamp(draft: LineDraft, lines: EventLine[], now: string, opening?: { schema?: SchemaHead; nonce?: string; from?: Seal[] }): Promise<EventLine> {
  const schema = opening?.schema;
  // the thread's last line is the chain's last: the array's own order is never read
  const last = inOrder(lines).at(-1);
  const body: Omit<EventLine, 'id'> = {
    previous: last?.id ?? null,
    gist: draft.gist,
    writer: draft.writer,
    timestamp: new Date(now).toISOString(),
    payload: asStored(draft.payload) as Payload,
  };
  if (lines.length === 0) {
    const declared = schema?.name !== undefined && schema.version !== undefined ? { schema: schema.name, version: schema.version } : {};
    const from = opening?.from !== undefined && opening.from.length > 0 ? { from: opening.from.map(({ first, last }) => ({ first, last })) } : {};
    body.thread = { nonce: opening?.nonce ?? hex(crypto.getRandomValues(new Uint8Array(16))), ...declared, ...from };
  }
  return { id: `${RECIPE}:${await hashOf(body)}`, ...body };
}

/**
 * Whether the stored id is its recipe's hash of the stored fields. An id whose name
 * is not known, or that has none, does not verify, as one that does not match.
 */
export async function verify(line: EventLine): Promise<boolean> {
  const id: unknown = line.id;
  if (typeof id !== 'string' || !id.startsWith(`${RECIPE}:`)) return false;
  return id.slice(RECIPE.length + 1) === (await hashOf(line));
}

/** A declaration's schema, or a schema's own name and version, as a sentence says it. */
const named = (name: unknown, version: unknown): string =>
  name === undefined && version === undefined ? 'no schema' : `the schema ${JSON.stringify(name) ?? 'with no name'} version ${JSON.stringify(version) ?? 'none'}`;

/**
 * The reading order: the chain. The first line is the one with no `previous`, each
 * next line the one that names the last. The array's own order is never read.
 * A thread that is not one chain is refused, and the sentence names the place: the
 * last line read before the break. Broken is: no first line or two, a fork, a gap,
 * a line the walk never reaches. Given the schema it is read by, a thread whose
 * first line declares another schema is refused the same way, and the sentence names
 * both; absent counts as a value, so a first line that declares no schema is read only
 * by a schema that has no name. Every entry that reads a thread against a schema
 * comes through here with it.
 */
export function inOrder(lines: EventLine[], schema?: SchemaHead): EventLine[] {
  if (lines.length === 0) return [];
  const firsts = lines.filter((l) => l.previous === null);
  if (firsts.length === 0) throw new Error('The thread has no first line: every line names a previous one.');
  if (firsts.length > 1) throw new Error('The thread has two first lines: more than one line has no previous.');
  const next = new Map<LineId, EventLine>();
  for (const line of lines) {
    if (line.previous === null) continue;
    if (next.has(line.previous)) throw new Error(`The thread forks after line ${line.previous}: two lines name it as their previous.`);
    next.set(line.previous, line);
  }
  const ordered = [firsts[0]];
  for (let at = next.get(firsts[0].id); at !== undefined; at = next.get(at.id)) ordered.push(at);
  if (ordered.length < lines.length) {
    const last = ordered[ordered.length - 1].id;
    const ids = new Set(lines.map((l) => l.id));
    const gap = lines.some((l) => l.previous !== null && !ids.has(l.previous));
    throw new Error(`The thread ${gap ? 'has a gap' : 'is cut'} after line ${last}: ${lines.length - ordered.length} line(s) cannot be reached from the first.`);
  }
  // a stored line comes from outside, so its declaration may be any value
  const declared: { schema?: unknown; version?: unknown } | undefined = firsts[0].thread;
  if (schema !== undefined && (declared?.schema !== schema.name || declared?.version !== schema.version)) {
    throw new Error(`The thread is declared for ${named(declared?.schema, declared?.version)}, and is read by ${named(schema.name, schema.version)}.`);
  }
  return ordered;
}

/**
 * The id of the final goal that wrote this line, if one did. A goal's writer is
 * `goal::<id of the goal's line>`; the lock outlives the goal: revoking a final
 * goal leaves what it wrote locked.
 */
export function lockedBy(line: EventLine, lines: EventLine[]): LineId | undefined {
  // a stored writer that is not a string names no goal
  const id = kinOf(line.writer) === 'goal' ? idOf(line.writer) : undefined;
  if (id === undefined) return undefined;
  // a stored payload that is not an object states nothing, so it locks nothing
  return lines.some((l) => l.id === id && isRecord(l.payload) && l.payload.final === true) ? id : undefined;
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
    // a stored payload that is not an object states nothing, so it names no line
    const target = isRecord(line.payload) ? line.payload[binding.from] : undefined;
    if (typeof target !== 'string') continue;
    const at = position.get(target);
    // only an earlier line can be revoked, only a listed gist, and never one a final goal wrote
    if (at !== undefined && at < i && binding.gists.includes(ordered[at].gist) && lockedBy(ordered[at], ordered) === undefined) {
      revokedIds.add(target);
    }
  }
  return { inForce: standing.reverse(), revoked: taken.reverse() };
}
