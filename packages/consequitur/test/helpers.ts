// What the tests share: SIBAR's case, read from `cases/`, and small builders for
// schemas and handles so a test says only what it is about.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_KIT, nodes, readSchema, type Condition, type GistSchema, type GoalReading, type Handles, type Json, type Kit, type Schema, type SchemaHead, type ThreadState, type Trace, type Writer } from '../src/index.ts';

const root = join(import.meta.dirname, '..', '..', '..');

/** The case as the file holds it: the head, the gists and the laws. */
export const SIBAR_JSON = JSON.parse(readFileSync(join(root, 'cases', 'sibar-activity', 'schema.json'), 'utf8')) as {
  name: string;
  version: number;
  opening: string;
  authority: Writer;
  sets: string[];
  records: Record<string, string>;
  judged: string[];
  guards: Record<string, Condition>;
  gists: GistSchema[];
  laws: unknown[];
};

/** The authority of the case, which writes the records. */
export const SYSTEM_WRITER: Writer = SIBAR_JSON.authority;

export const HEAD: SchemaHead = {
  opening: SIBAR_JSON.opening,
  authority: SIBAR_JSON.authority,
  sets: SIBAR_JSON.sets,
  records: SIBAR_JSON.records,
  judged: SIBAR_JSON.judged,
  guards: SIBAR_JSON.guards,
};

/** Reads a schema and fails the test that built it if the reader found any problem. */
export function strict(json: unknown, kit: Kit = BASE_KIT): Schema {
  const { schema, problems } = readSchema(json, kit);
  if (problems.length > 0) throw new Error(`The test schema has problems: ${problems.join(' ')}`);
  return schema;
}

/**
 * The case with changes: gists added after its own, gists dropped by name, other
 * laws, other parts of the head. With no options it is the case as it stands.
 */
export function sibar(
  options: { add?: unknown[]; drop?: string[]; laws?: unknown[]; head?: Record<string, unknown>; kit?: Kit } = {},
): Schema {
  const gists = [...SIBAR_JSON.gists.filter((g) => !options.drop?.includes(g.gist)), ...(options.add ?? [])];
  return strict({ ...SIBAR_JSON, gists, laws: options.laws ?? SIBAR_JSON.laws, ...options.head }, options.kit);
}

/** The case without its laws: what a post did before laws were part of the schema. */
export const PLAIN: Schema = sibar({ laws: [] });

/** The case with its three laws. */
export const SIBAR: Schema = sibar();

/** The gist schemas that only record, for a schema that is built from other gists. */
export const RECORD_GISTS: GistSchema[] = ['metadata_set', 'assigned', 'unassigned'].map((gist) => ({ gist, writers: ['system'], rules: [] }));

/** A schema of its own gists, with the case's head and the records' gists added, and no warning. */
export function custom(gists: GistSchema[], head: Record<string, unknown> = {}): Schema {
  const { warning: _warning, ...records } = SIBAR_JSON.records;
  return strict({ ...HEAD, records, gists: [...RECORD_GISTS, ...gists], ...head });
}

/** A schema as the reader would refuse it, for a test that the reading never throws on conf it did not check. */
export function unchecked(gists: GistSchema[], from: Schema = PLAIN): Schema {
  return { ...from, gists };
}

/** The handles of the case: the value handle, and the `assignees` set. */
export const hold = (value: Record<string, Json>, assignees: string[]): Handles => ({ value, set: { assignees } });

export const emptyHandles = (): Handles => hold({}, []);

const recordOf = (handle: Json | undefined): Record<string, Json> => (typeof handle === 'object' && handle !== null && !Array.isArray(handle) ? handle : {});

/** The value handle of some handles. */
export const valuesOf = (all: Handles): Record<string, Json> => recordOf(all.value);

/** The names of one set of some handles. */
export const membersOf = (all: Handles, set = 'assignees'): string[] => {
  const list = recordOf(all.set)[set];
  return Array.isArray(list) ? (list as string[]) : [];
};

export const stateOf = (lines: ThreadState['lines'], value: Record<string, Json>, assignees: string[]): ThreadState => ({ lines, handles: hold(value, assignees) });

/** A goal's condition that every check finds a line in force: an `all` of `line` nodes, as a goal composed by hand is. */
export const allOf = (checks: Json[]): Json => ({ all: checks.map((line) => ({ line })) });

/** The `line` nodes of a goal's trace, in the order of the condition. */
export const lineNodes = (goal: GoalReading): Trace[] => nodes(goal.trace).flatMap(({ node }) => ('line' in node.condition ? [node] : []));
