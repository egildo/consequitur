// Builds the package in the current folder into dist/ with tsc alone.
// Run by the package's build script, so cwd is the package folder.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const dist = path.join(process.cwd(), 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

// A stale dist would keep files whose source is gone.
fs.rmSync(dist, { recursive: true, force: true });

execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });

// tsc keeps './x.ts' in the .d.ts files, which no consumer can resolve; the .js files are already './x.js'.
const relativeTs = /(['"])(\.{1,2}\/[^'"\n]*?)\.ts\1/g;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dist);

for (const file of files.filter((f) => f.endsWith('.d.ts'))) {
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace(relativeTs, '$1$2.js$1'));
}

// Checked in every file, .js too: a leftover './x.ts' would fail at run time.
const leftovers = files.filter((file) => fs.readFileSync(file, 'utf8').match(relativeTs));
if (leftovers.length > 0) {
  for (const file of leftovers) console.error(`still a .ts specifier: ${file}`);
  process.exit(1);
}

console.log(`${pkg.name}: ${files.length} files in dist`);
