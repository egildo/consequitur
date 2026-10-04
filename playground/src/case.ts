// The case the playground runs: SIBAR's activity, read from `cases/` with the base kit, and the
// authority's policy. The pieces the inspector shows as code are cut from the same file, so what
// is shown is what the engine reads.

import { BASE_KIT, readSchema, type Handles, type Json, type Policy, type Writer } from 'consequitur';
import caseText from '../../cases/sibar-activity/schema.json?raw';

/** The case as the file holds it: a head, then the gists and the laws. */
const file = JSON.parse(caseText) as Record<string, Json>;

const { schema, problems } = readSchema(file, BASE_KIT);
if (problems.length > 0) throw new Error(`The case has problems: ${problems.join(' ')}`);

export const SCHEMA = schema;

/** The authority writes what reconciliation records; the page plays the document system with it. */
export const SYSTEM: Writer = schema.authority;

/** The gist of a goal's warning. */
export const WARNING_GIST = schema.records.warning;

/**
 * The authority's policy: while an activity is closed, a quit is not answered, so whoever leaves a
 * done activity stays among its assignees, and the thread still counts as settled.
 */
export const POLICY: Policy = [{ leave: { kind: 'set', key: 'assignees' }, while: { values: { status: 'closed' } } }];

/** The head of the schema, as the file writes it: what is neither a gist nor a law. */
export const HEAD_DATA: Json = (({ gists: _gists, laws: _laws, ...head }) => head)(file);

/** The schema of one gist, as the file writes it. */
export const gistData = (gist: string): Json | undefined => (file.gists as Array<{ gist: string }>).find((entry) => entry.gist === gist);

/** The laws, as the file writes them. */
export const LAWS_DATA: Json = file.laws;

const record = (json: Json | undefined): Record<string, Json> => (typeof json === 'object' && json !== null && !Array.isArray(json) ? json : {});

/** One key of the value handle. */
export const valueIn = (handles: Handles, key: string): Json | undefined => record(handles.value)[key];

/** The names in one set of the set handle. */
export const membersIn = (handles: Handles, set = 'assignees'): string[] => {
  const names = record(handles.set)[set];
  return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [];
};
