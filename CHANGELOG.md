# Changelog

## Unreleased

Round 2: the monorepo, and the engine ported as it is. A pnpm workspace with two packages. `consequitur` holds the engine copied from `sibardoc-prototype` (`packages/core/src/thread/`) and its 250 tests, with no change of meaning: the only edits are `.ts` extensions on the relative imports, the test's import path, and the folder-fence test, which now reads `src/` and expects the extensions. `consequitur-render` is empty until round 4. Both are at 0.0.0 and export their sources directly; publishing is round 6.
