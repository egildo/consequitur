# The playground — spec

Status: settled, built (round 4, [plan](../plan.md) §4). A sample application: what a real screen
built on consequitur looks like. It is private, never published, and built **only** on
`consequitur`, `consequitur-render` and the domain's files in `cases/`. Its UI schema, its words
and its styles are its own.

## 1 · Where it comes from

The SIBAR thread bench, in `sibardoc-prototype` on the branch `activities-as-threads`:
`bench/thread.html` and `bench/src/thread/` (commits `d14cf293`, `af3be6f2`, `56ceada9`), with
its briefs `docs/next/thread-bench-rebuild-round.md` and the earlier ones it names. It is ported
here, not reinvented: every behaviour it has, it keeps.

## 2 · What changes in the port

- **The engine's new shapes**: handles `{ value, set }`; denunciations `sort: 'handle'`; record
  payloads `{ set, member, line? }`; the opening gist from the schema; laws in the schema;
  verdicts with generic details — the playground words them in Italian from its own table, keyed
  by law and set.
- **The schema is the case**: `cases/sibar-activity/schema.json`, read with `readSchema` and
  `BASE_KIT`. The SIBAR **policy** («quits on a closed activity are not answered») is the
  playground's, passed to `post` and `dryRun`.
- **Render**: the ledger uses `keyed`, the composer's preview `previewer`, pointing `band`, and
  every card's reading `lineFacts`. What the bench had in its own `ledger.ts`, `deduce.ts` and
  `band.ts` and is now in `consequitur-render` is deleted from the port.
- **Styles**: there is no SIBAR CSS chain. The playground's stylesheet defines its own custom
  properties (a neutral ramp, the five hues of the card kinds and states, spacing) with the values
  the bench used, as one `:root` block, and the rest follows. The ground is the lightest grey.
- **«Schemi»** shows the whole schema of the case as code — its head, each gist, the laws — with
  the gist chips as now, and «Testa» for the head.
- The `UI schema` (`ui-schema.ts`: labels, cards, compose, awaited, the Italian words) stays the
  playground's.

## 3 · How it runs

`playground/` is a workspace package (`private: true`), Vite as its dev server and build, plain
TypeScript and DOM, no framework; `markdown-it` its one dependency besides the two packages.
`pnpm dev` at the root starts it on port 5588 (`--strictPort`). `pnpm build` builds it into
`playground/dist`, never published.

## 4 · Done when

Both examples run to the end in a browser with a clean console; the checks the bench met hold:
the thread written by hand writer by writer, refusals in words, the dry-run preview with
«Conferma e invia», the band filling a slot, the goal dock with two goals and the wrapper,
«Cambia» as revoke and new, the inspector's four tabs with the schema as code, the records and
goal lines switchable.

## 5 · As built

Where the build had to choose:

- **The schema as code** reads the same file the engine does: `case.ts` imports
  `cases/sibar-activity/schema.json` as text (`?raw`), parses it once, hands it to `readSchema`, and cuts
  the head, each gist and the laws out of it for the inspector. «Schemi» has the chips «Testa» and one
  per gist; the laws keep their own tab, «Leggi», so the four tabs stay.
- **Verdicts in Italian**: a `Verdict` carries the law and an English detail, and no structured set.
  The playground words `keeps-set` by the set, which it reads from the detail's first quoted name
  (`LAW_WORDS` in `ui-schema.ts`); a law or a set the table lacks says so in general words.
- **The policy** is one entry in `case.ts`, passed to `post` and `dryRun`. The panel lists the
  denunciations it leaves, marked «lasciata senza risposta», beside «In accordo con le righe».
- **Render** takes the place of the bench's ledger cache (`keyed`), preview scheduling (`previewer`),
  band (`band`, with a thin adapter in `pointing.ts` that knows whether a drag holds it, since the
  band does not say) and the per-line reading (`lineFacts`, which also yields the goals the dock
  draws and the warnings of each). What render lacks is on the page: the application's own facts
  (a document's signatures), the actions on a card, and what a goal being composed may await.
- **Styles** are one file, `style.css`: a `:root` block with the neutral ramp, the five hues and the
  spacing, then the rules. No font is fetched; Inter is named first and the system's sans follows.

