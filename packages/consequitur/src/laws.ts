// The laws a dry run judges, held as plain data like the gist schemas: they come
// from outside, pass through the reader, and the typed form is what gets through.
// The reader never throws, and one bad element does not stop the others.

import type { Law, LawName } from './types.ts';

const LAW_NAMES: LawName[] = ['keeps-assignee', 'keeps-goals', 'settles'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The first thing wrong with one element, as an English sentence, or undefined when it passes. */
function problemOf(element: unknown, names: Array<string | undefined>, at: number): string | undefined {
  const label = typeof names[at] === 'string' ? `law "${names[at]}"` : `element ${at}`;
  if (!isObject(element)) return `${label}: not an object.`;
  const keys = Object.keys(element);
  if (keys.length !== 2 || !keys.includes('law') || !keys.includes('strength')) return `${label}: must have the keys law and strength, and no other.`;
  if (!LAW_NAMES.includes(element.law as LawName)) return `${label}: the law does not exist.`;
  if (names.indexOf(element.law as string) < at) return `${label}: the law already appears earlier in the list.`;
  if (element.strength !== 'refuse' && element.strength !== 'confirm') return `${label}: strength must be "refuse" or "confirm".`;
  return undefined;
}

/**
 * The laws a value holds. An element that fails is left out and named in
 * `problems`. A law that appears twice keeps its first element, whether or not
 * that one passed, as with gist schemas.
 */
export function readLaws(value: unknown): { laws: Law[]; problems: string[] } {
  if (!Array.isArray(value)) return { laws: [], problems: ['The laws must be an array.'] };
  const names = value.map((e) => (isObject(e) && typeof e.law === 'string' ? e.law : undefined));
  const laws: Law[] = [];
  const problems: string[] = [];
  value.forEach((element, at) => {
    const problem = problemOf(element, names, at);
    if (problem === undefined) laws.push(element as Law);
    else problems.push(problem);
  });
  return { laws, problems };
}

export const BASE_LAW_DATA: unknown = [
  { law: 'keeps-assignee', strength: 'refuse' },
  { law: 'keeps-goals', strength: 'confirm' },
  { law: 'settles', strength: 'refuse' },
];

export const BASE_LAWS: Law[] = readLaws(BASE_LAW_DATA).laws;
