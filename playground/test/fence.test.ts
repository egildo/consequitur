// The page names no gist: a domain's words, cards and examples are in its module under `src/domains/`,
// and the rest of `src/` reads whatever domain is in use. A string literal that is a gist of either
// case, anywhere else, is a domain leaking into the page.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const src = join(import.meta.dirname, '..', 'src');

const gistsOf = (domain: string): string[] =>
  (JSON.parse(readFileSync(join(root, 'cases', domain, 'schema.json'), 'utf8')) as { gists: Array<{ gist: string }> }).gists.map((g) => g.gist);

/** Words of the DOM that are also a gist of a case: `<button type="submit">` and the form's `submit` event are not the editorial review's. */
const DOM_WORDS = new Set(['submit']);

const GISTS = new Set([...gistsOf('sibar-activity'), ...gistsOf('editorial-review')].filter((g) => !DOM_WORDS.has(g)));

/** The string literals of a source, with the comments left out. */
function literals(source: string): string[] {
  const found: string[] = [];
  for (const [token] of source.matchAll(/(['"`])(?:\\.|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g)) {
    if (!token.startsWith('//') && !token.startsWith('/*')) found.push(token.slice(1, -1));
  }
  return found;
}

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? [] : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []));

describe('the playground and its domains', () => {
  it('has no gist in a string literal outside the domains', () => {
    const files = sources(src);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const leaks = literals(readFileSync(file, 'utf8')).filter((text) => GISTS.has(text));
      expect(leaks, file).toEqual([]);
    }
  });

  it('keeps the domains in their own folder, one module each', () => {
    expect(readdirSync(join(src, 'domains')).sort()).toEqual(['editorial.ts', 'index.ts', 'sibar.ts']);
  });
});
