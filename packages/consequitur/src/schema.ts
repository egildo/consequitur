// The reader for gist schemas. Schemas are conf, so they come from outside and
// are checked once, here; `admit` and `reduce` then take them as given.
//
// Payloads are free and schemas are not: an unknown key in a schema or a binding
// is a problem, because a mistyped word there would silently change what a gist
// does. The reader never throws, and one bad schema does not stop the others.

import { validChecks } from './reduce.ts';
import type { GistSchema } from './types.ts';

const GIST_NAME = /^[a-z][a-z0-9_]{0,31}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

const isJson = (value: unknown): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isObject(value) && Object.values(value).every(isJson);
};

/** Whether the keys are exactly `required` plus any of `optional`, besides `rule`. */
const keysAre = (binding: Record<string, unknown>, required: string[], optional: string[] = []): boolean => {
  const keys = Object.keys(binding).filter((k) => k !== 'rule');
  return required.every((k) => keys.includes(k)) && keys.every((k) => required.includes(k) || optional.includes(k));
};

/** `required` may be left out, but when it is stated it is a boolean. */
const optionalFlag = (binding: Record<string, unknown>): boolean => !('required' in binding) || typeof binding.required === 'boolean';

/** The rule words and what each one's binding holds. */
function bindingFits(binding: Record<string, unknown>): boolean {
  switch (binding.rule) {
    case 'revoke':
      return keysAre(binding, ['from', 'gists']) && typeof binding.from === 'string' && isStrings(binding.gists) && binding.gists.length > 0;
    case 'assign':
      return keysAre(binding, ['from'], ['required']) && typeof binding.from === 'string' && optionalFlag(binding);
    case 'release':
    case 'goal':
      return keysAre(binding, []);
    case 'metadata': {
      // exactly one of `from`, `value` and `collect`; `required` only makes sense beside
      // a key read from the payload, which `value` does not read
      const reading = ['from', 'value', 'collect'].filter((k) => k in binding);
      if (reading.length !== 1 || typeof binding.key !== 'string') return false;
      if ('where' in binding && !(isObject(binding.where) && Object.keys(binding.where).length > 0 && isJson(binding.where))) return false;
      if (reading[0] === 'value') return keysAre(binding, ['key', 'value'], ['where']) && isJson(binding.value);
      return keysAre(binding, ['key', reading[0]], ['required', 'where']) && typeof binding[reading[0]] === 'string' && optionalFlag(binding);
    }
    default:
      return false;
  }
}

/** Whether a `when` holds only the parts it may, each of the shape the part has. */
function whenFits(when: unknown): boolean {
  if (!isObject(when) || Object.keys(when).some((k) => !['checks', 'assignee', 'metadata'].includes(k))) return false;
  if ('checks' in when && !validChecks(when.checks)) return false;
  if ('assignee' in when && when.assignee !== true) return false;
  if ('metadata' in when && !(isObject(when.metadata) && Object.keys(when.metadata).length > 0 && isJson(when.metadata))) return false;
  return true;
}

/** The first thing wrong with one element, as an English sentence, or undefined when it passes. */
function problemOf(element: unknown, names: Array<string | undefined>, at: number): string | undefined {
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
  if ('when' in element && !whenFits(element.when)) {
    return `${label}: when must be an object with only checks (valid, as a goal's), assignee (true) and metadata (an object with at least one key).`;
  }

  for (const [i, binding] of element.rules.entries()) {
    if (!isObject(binding)) return `${label}: binding ${i} is not an object.`;
    if (!['revoke', 'assign', 'release', 'metadata', 'goal'].includes(binding.rule as string)) {
      return `binding ${i} of ${label} names the rule ${JSON.stringify(binding.rule) ?? 'nothing'}, which does not exist.`;
    }
    if (!bindingFits(binding)) return `${label}: binding ${i} does not have exactly the keys and types of a ${String(binding.rule)} binding.`;
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
export function readGists(value: unknown): { gists: GistSchema[]; problems: string[] } {
  if (!Array.isArray(value)) return { gists: [], problems: ['The gist schemas must be an array.'] };
  const names = value.map((e) => (isObject(e) && typeof e.gist === 'string' ? e.gist : undefined));
  const gists: GistSchema[] = [];
  const problems: string[] = [];
  value.forEach((element, at) => {
    const problem = problemOf(element, names, at);
    if (problem === undefined) gists.push(element as GistSchema);
    else problems.push(problem);
  });
  return { gists, problems };
}
