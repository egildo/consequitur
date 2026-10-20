// The schema as a host keeps it: `schemaJson` writes what `readSchema` reads back, in the form the case
// files write, and without the kit. The cases are read from their own files, so the test holds for what
// they state.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_KIT, canonical, readSchema, type Json } from '../src/index.ts';
import { schemaJson } from '../src/schema.ts';
import { RECORD_GISTS, SIBAR, custom } from './helpers.ts';

const CASES = ['sibar-activity', 'editorial-review', 'warehouse-arrival', 'release'];

/** A case as its file holds it. */
const caseJson = (name: string): { [key: string]: Json } =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'cases', name, 'schema.json'), 'utf8')) as { [key: string]: Json };

describe('schemaJson', () => {
  it.each(CASES)('gives JSON that reads back as the same schema, for %s', (name) => {
    const { schema, problems } = readSchema(caseJson(name), BASE_KIT);
    expect(problems).toEqual([]);
    const json = schemaJson(schema);
    const again = readSchema(json, BASE_KIT);
    expect(again.problems).toEqual([]);
    expect(canonical(schemaJson(again.schema))).toBe(canonical(json));
  });

  it.each(CASES)('leaves the kit out, since it is code and not data, for %s', (name) => {
    const { schema } = readSchema(caseJson(name), BASE_KIT);
    expect('kit' in schemaJson(schema)).toBe(false);
  });

  it.each(CASES)('survives a JSON round trip unchanged, for %s', (name) => {
    const { schema } = readSchema(caseJson(name), BASE_KIT);
    const json = schemaJson(schema);
    expect(JSON.parse(JSON.stringify(json))).toStrictEqual(json);
  });

  it.each(CASES)('names the schema with its name and version, as the case file does, for %s', (name) => {
    const file = caseJson(name);
    const { schema } = readSchema(file, BASE_KIT);
    const json = schemaJson(schema);
    expect(json.name).toBe(file.name);
    expect(json.version).toBe(file.version);
  });

  it.each(CASES)('keeps the keys in the order the case file writes them, for %s', (name) => {
    const { schema } = readSchema(caseJson(name), BASE_KIT);
    expect(Object.keys(schemaJson(schema))).toEqual(Object.keys(caseJson(name)));
  });

  it('leaves out name and version for an unnamed schema, and keeps the rest in order', () => {
    const unnamed = custom(SIBAR.gists.filter((g) => !RECORD_GISTS.some((r) => r.gist === g.gist)));
    const json = schemaJson(unnamed);
    expect('name' in json).toBe(false);
    expect('version' in json).toBe(false);
    expect(Object.keys(json).slice(0, 2)).toEqual(['opening', 'authority']);
    expect(readSchema(json, BASE_KIT).problems).toEqual([]);
  });
});
