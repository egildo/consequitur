// The readers for schemas, and for the policy passed with one. Both are conf, so
// they come from outside and are checked once, here; `admit`, `reduce` and
// `settle` then take them as given.
//
// Payloads are free and schemas are not: an unknown key in a schema or a binding
// is a problem, because a mistyped word there would silently change what a gist
// does. The reader never throws and names every problem it finds, and a schema
// with any problem is read as the empty schema: a gist or a law left out would
// change what the rest does, since the next post would answer as though what
// only that gist stated had never been said. `readGists` and `readLaws` read
// their lists alone, and there one bad element does not stop the others.

import { validChecks } from './check.ts';
import type { GistSchema, Kit, LawBinding, Policy, Schema, SchemaHead, Writer } from './types.ts';
import { isJson, isObject, isStrings, keysAre } from './util.ts';
import { canonical } from './line.ts';

const GIST_NAME = /^[a-z][a-z0-9_]{0,31}$/;

/** The rules the engine itself reads: they are mechanics, not kinds. */
const MECHANICS = ['revoke', 'goal'];

/** A schema that reads nothing: the answer when anything fails. */
const emptySchema = (kit: Kit): Schema => ({ opening: '', authority: '::', sets: [], records: {}, judged: [], gists: [], laws: [], kit });

/** Whether a `when` holds only the parts it may, each of the shape the part has. */
function whenProblem(when: unknown, head: SchemaHead): string | undefined {
  if (!isObject(when) || Object.keys(when).some((k) => !['checks', 'in', 'values'].includes(k))) {
    return 'when must be an object with only checks, in and values.';
  }
  if ('checks' in when && !validChecks(when.checks)) return "when.checks must be a non-empty list of valid checks, as a goal's.";
  if ('in' in when && !(typeof when.in === 'string' && head.sets.includes(when.in))) return 'when.in must name a set the schema declares.';
  if ('values' in when && !(isObject(when.values) && Object.keys(when.values).length > 0 && isJson(when.values))) {
    return 'when.values must be an object with at least one key.';
  }
  return undefined;
}

/** The first thing wrong with one binding of a gist, in English, or undefined. */
function bindingProblem(binding: unknown, kit: Kit, head: SchemaHead): string | undefined {
  if (!isObject(binding)) return 'it is not an object.';
  if (typeof binding.rule !== 'string' || !(MECHANICS.includes(binding.rule) || kit.rules.some((r) => r.rule === binding.rule))) {
    return `it names the rule ${JSON.stringify(binding.rule) ?? 'nothing'}, which the kit does not have.`;
  }
  if (binding.rule === 'revoke') {
    const fits = keysAre(binding, ['from', 'gists']) && typeof binding.from === 'string' && isStrings(binding.gists) && binding.gists.length > 0;
    return fits ? undefined : 'it does not have exactly the keys and types of a revoke binding.';
  }
  if (binding.rule === 'goal') return keysAre(binding, []) ? undefined : 'it does not have exactly the keys of a goal binding.';
  const kind = kit.rules.find((r) => r.rule === binding.rule)!;
  const lacking = kind.handles.find((h) => !kit.handles.some((k) => k.kind === h));
  if (lacking !== undefined) return `the rule ${kind.rule} states into the handle kind ${lacking}, which the kit does not have.`;
  const read = kind.read(binding, head);
  return typeof read === 'string' ? read : undefined;
}

/** The first thing wrong with one element, as an English sentence, or undefined when it passes. */
function gistProblem(element: unknown, names: Array<string | undefined>, at: number, kit: Kit, head: SchemaHead): string | undefined {
  const label = typeof names[at] === 'string' ? `gist "${names[at]}"` : `element ${at}`;
  if (!isObject(element)) return `${label}: not an object.`;
  const keys = Object.keys(element);
  if (!['gist', 'writers', 'rules'].every((k) => keys.includes(k)) || keys.some((k) => !['gist', 'writers', 'rules', 'when'].includes(k))) {
    return `${label}: must have the keys gist, writers and rules, and may have when, and no other.`;
  }
  if (typeof element.gist !== 'string' || !GIST_NAME.test(element.gist)) {
    return `${label}: the gist name must be lower snake case, at most 32 characters, starting with a letter.`;
  }
  if (names.indexOf(element.gist) < at) return `${label}: the gist already has a schema earlier in the list.`;
  if (!isStrings(element.writers) || element.writers.length === 0) return `${label}: writers must be a non-empty list of strings.`;
  if (!Array.isArray(element.rules)) return `${label}: rules must be a list.`;
  if ('when' in element) {
    const problem = whenProblem(element.when, head);
    if (problem !== undefined) return `${label}: ${problem}`;
  }

  for (const [i, binding] of element.rules.entries()) {
    const problem = bindingProblem(binding, kit, head);
    if (problem !== undefined) return `binding ${i} of ${label}: ${problem}`;
  }
  const words = (element.rules as Array<{ rule: string }>).map((b) => b.rule);
  if (words.filter((w) => w === 'revoke').length > 1) return `${label}: at most one revoke binding.`;
  if (words.filter((w) => w === 'goal').length > 1) return `${label}: at most one goal binding.`;

  for (const binding of element.rules as Array<Record<string, unknown>>) {
    if (binding.rule !== 'revoke') continue;
    for (const listed of binding.gists as string[]) {
      if (!names.includes(listed)) return `${label}: the revoke binding lists "${listed}", which has no schema in the list.`;
    }
  }
  return undefined;
}

/**
 * The gist schemas a value holds. An element that fails is left out and named in
 * `problems`; the others are kept. A gist that appears twice keeps its first
 * schema, whether or not that one passed, so a mistake cannot hand a gist to a
 * later schema unnoticed.
 */
export function readGists(value: unknown, kit: Kit, head: SchemaHead): { gists: GistSchema[]; problems: string[] } {
  if (!Array.isArray(value)) return { gists: [], problems: ['The gist schemas must be an array.'] };
  const names = value.map((e) => (isObject(e) && typeof e.gist === 'string' ? e.gist : undefined));
  const gists: GistSchema[] = [];
  const problems: string[] = [];
  value.forEach((element, at) => {
    const problem = gistProblem(element, names, at, kit, head);
    if (problem === undefined) gists.push(element as GistSchema);
    else problems.push(problem);
  });
  return { gists, problems };
}

/** The first thing wrong with one law, as an English sentence, or undefined when it passes. */
function lawProblem(element: unknown, label: string, kit: Kit, head: SchemaHead): string | undefined {
  if (!isObject(element)) return `${label}: not an object.`;
  if (element.strength !== 'refuse' && element.strength !== 'confirm') return `${label}: strength must be "refuse" or "confirm".`;
  const kind = kit.laws.find((l) => l.law === element.law);
  if (!kind) return `${label}: the kit does not have this law.`;
  const read = kind.read(element, head);
  return typeof read === 'string' ? `${label}: ${read}` : undefined;
}

/**
 * The laws a value holds. An element that fails is left out and named in
 * `problems`. The same law with the same keys twice keeps its first element,
 * whether or not that one passed, as with gist schemas; one law may appear again
 * with other keys, as `keeps-set` does for each set.
 */
export function readLaws(value: unknown, kit: Kit, head: SchemaHead): { laws: LawBinding[]; problems: string[] } {
  if (!Array.isArray(value)) return { laws: [], problems: ['The laws must be an array.'] };
  const identity = (e: unknown): string | undefined => {
    if (!isObject(e) || typeof e.law !== 'string') return undefined;
    const { strength: _strength, ...rest } = e;
    return isJson(rest) ? canonical(rest) : undefined;
  };
  const identities = value.map(identity);
  const laws: LawBinding[] = [];
  const problems: string[] = [];
  value.forEach((element, at) => {
    const label = isObject(element) && typeof element.law === 'string' ? `law "${element.law}"` : `element ${at}`;
    const earlier = identities[at] !== undefined && identities.indexOf(identities[at]) < at;
    const problem = earlier ? `${label}: the law already appears earlier in the list.` : lawProblem(element, label, kit, head);
    if (problem === undefined) laws.push(element as LawBinding);
    else problems.push(problem);
  });
  return { laws, problems };
}

/** The head's own faults: what it states, before it is set beside the gists. */
function headProblems(json: Record<string, unknown>, kit: Kit): string[] {
  const problems: string[] = [];
  const known = ['opening', 'authority', 'sets', 'records', 'judged', 'gists', 'laws'];
  for (const key of Object.keys(json)) if (!known.includes(key)) problems.push(`The schema has the key "${key}", which it may not.`);
  if (typeof json.opening !== 'string' || !GIST_NAME.test(json.opening)) problems.push('opening must name a gist, in lower snake case.');
  const at = typeof json.authority === 'string' ? json.authority.indexOf('::') : -1;
  if (typeof json.authority !== 'string' || at < 1 || at + 2 >= json.authority.length) problems.push('authority must be a writer, as KIN::ID.');
  if ('sets' in json && !(isStrings(json.sets) && json.sets.every((s) => s !== '') && new Set(json.sets).size === json.sets.length)) {
    problems.push('sets must be a list of distinct, non-empty names.');
  }
  if ('judged' in json && !(isStrings(json.judged) && json.judged.every((k) => k !== ''))) problems.push('judged must be a list of kins.');

  const roles = kit.handles.flatMap((h) => h.roles);
  if (!isObject(json.records) || !Object.values(json.records).every((g) => typeof g === 'string')) {
    problems.push('records must be an object that names a gist for each role.');
  } else {
    for (const role of Object.keys(json.records)) {
      if (role !== 'warning' && !roles.includes(role)) problems.push(`records names the role "${role}", which no handle kind of the kit answers with.`);
    }
    for (const role of roles) if (!(role in json.records)) problems.push(`records lacks the role "${role}".`);
  }
  if (!Array.isArray(json.gists)) problems.push('The gist schemas must be an array.');
  return problems;
}

/**
 * How the head sits beside the gists that were read: the gists it names must be there, writable
 * by whom it says, and a record gist has no rules: a record states nothing, or it could never settle.
 */
function fitProblems(head: SchemaHead, gists: GistSchema[]): string[] {
  const problems: string[] = [];
  if (!gists.some((g) => g.gist === head.opening)) problems.push(`The opening gist "${head.opening}" has no schema.`);
  const kin = head.authority.slice(0, head.authority.indexOf('::'));
  for (const [role, name] of Object.entries(head.records)) {
    const gist = gists.find((g) => g.gist === name);
    if (!gist) problems.push(`The record "${role}" is the gist "${name}", which has no schema.`);
    else if (gist.rules.length > 0) problems.push(`The record "${role}" is the gist "${name}", which has rules: a record states nothing.`);
    else if (role === 'warning' ? !gist.writers.includes('goal') : !gist.writers.includes(kin)) {
      problems.push(`The record "${role}" is the gist "${name}", which does not list the kin ${role === 'warning' ? 'goal' : kin} among its writers.`);
    }
  }
  return problems;
}

/**
 * Reads a schema from JSON against a kit: the head (`opening`, `authority`,
 * `sets`, `records`, `judged`), the gist schemas and the laws. Never throws. A
 * schema with any problem is empty, and its problems say why: a head that fails,
 * a gist schema or a law that fails, or a head that names a gist that is not
 * there or does not fit. A rule or a law that names a kind the kit lacks is a
 * problem.
 */
export function readSchema(json: unknown, kit: Kit): { schema: Schema; problems: string[] } {
  if (!isObject(json)) return { schema: emptySchema(kit), problems: ['The schema must be an object.'] };
  const faults = headProblems(json, kit);
  if (faults.length > 0) return { schema: emptySchema(kit), problems: faults };

  const head: SchemaHead = {
    opening: json.opening as string,
    authority: json.authority as Writer,
    sets: (json.sets as string[] | undefined) ?? [],
    records: json.records as Record<string, string>,
    judged: (json.judged as string[] | undefined) ?? [],
  };
  const { gists, problems } = readGists(json.gists, kit, head);
  const { laws, problems: lawProblems } = 'laws' in json ? readLaws(json.laws, kit, head) : { laws: [], problems: [] };
  problems.push(...lawProblems);
  const all = [...fitProblems(head, gists), ...problems];
  if (all.length > 0) return { schema: emptySchema(kit), problems: all };
  return { schema: { ...head, gists, laws, kit }, problems: [] };
}

/** Whether an object holds only the keys given. */
const only = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).every((k) => keys.includes(k));

/** The first thing wrong with one entry of a policy, as an English sentence, or undefined when it passes. */
function entryProblem(entry: unknown, label: string, schema: Schema): string | undefined {
  if (!isObject(entry) || !('leave' in entry) || !only(entry, ['leave', 'while'])) return `${label}: must have the key leave, and may have while, and no other.`;
  const { leave } = entry;
  if (!isObject(leave) || !only(leave, ['sort', 'kind', 'key', 'member', 'gist'])) return `${label}: leave must be an object with only sort, kind, key, member and gist.`;
  if ('sort' in leave && leave.sort !== 'handle' && leave.sort !== 'line') return `${label}: leave.sort must be "handle" or "line".`;
  if ('kind' in leave && !schema.kit.handles.some((h) => h.kind === leave.kind)) return `${label}: leave.kind must name a handle kind of the kit.`;
  if ('key' in leave && typeof leave.key !== 'string') return `${label}: leave.key must be a string.`;
  if ('member' in leave && typeof leave.member !== 'string') return `${label}: leave.member must be a string.`;
  if ('gist' in leave && !schema.gists.some((g) => g.gist === leave.gist)) return `${label}: leave.gist must name a gist of the schema.`;
  if (!('while' in entry)) return undefined;
  const { while: condition } = entry;
  const fits = isObject(condition) && only(condition, ['values']) && isObject(condition.values) && Object.keys(condition.values).length > 0 && isJson(condition.values);
  return fits ? undefined : `${label}: while must be an object with only values, an object with at least one key.`;
}

/**
 * Reads a policy from JSON against the schema it will be passed with. Never throws.
 * A policy is conf as a schema is, so every key is checked at every level: a
 * mistyped word would silently change what the authority answers. A policy with
 * any problem is the empty policy, and its problems say why.
 */
export function readPolicy(json: unknown, schema: Schema): { policy: Policy; problems: string[] } {
  if (!Array.isArray(json)) return { policy: [], problems: ['The policy must be a list.'] };
  const problems = json.flatMap((entry, at) => entryProblem(entry, `entry ${at}`, schema) ?? []);
  return { policy: problems.length > 0 ? [] : (json as Policy), problems };
}
