// Small guards the other files share. Not part of the public surface, except
// `keysAre` and `compare`, which a kit author needs too (see `index.ts`).

import type { Json } from './types.ts';

/** Strings compare with `<`, never `localeCompare`: two readers must agree whatever their locale. */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A plain JSON object; anything else a handle was given reads as an empty one. */
export const isRecord = (value: unknown): value is { [key: string]: Json } => isObject(value);

/** A key is absent when the object has no property of that name; `null` is a value. */
export const has = (object: unknown, key: string): boolean => isObject(object) && Object.hasOwn(object, key);

export const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

export const isJson = (value: unknown): value is Json => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isObject(value) && Object.values(value).every(isJson);
};

/**
 * Whether the keys of a binding are exactly `required` plus any of `optional`,
 * besides its `rule` or `law`. A mistyped word in conf would silently change what
 * a gist does, so a kind reads its binding through this.
 */
export const keysAre = (binding: Record<string, unknown>, required: string[], optional: string[] = []): boolean => {
  const keys = Object.keys(binding).filter((k) => k !== 'rule' && k !== 'law');
  return required.every((k) => keys.includes(k)) && keys.every((k) => required.includes(k) || optional.includes(k));
};

/** `required` may be left out, but when it is stated it is a boolean. */
export const optionalFlag = (binding: Record<string, unknown>): boolean => !('required' in binding) || typeof binding.required === 'boolean';
