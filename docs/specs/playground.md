# The playground — spec

Status: settled, built (round 4, [plan](../plan.md) §4; the second domain, round 5, §6 below). A sample
application: what a real screen built on consequitur looks like. It is private, never published, and
built **only** on `consequitur`, `consequitur-render` and the domains' files in `cases/`. Its UI schema, its words
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
  playground's, read with `readPolicy` and passed to `post` and `dryRun`.
- **Render**: the ledger uses `keyed`, the composer's preview `previewer`, pointing `band`, and
  every card's reading `lineFacts`. What the bench had in its own `ledger.ts`, `deduce.ts` and
  `band.ts` and is now in `consequitur-render` is deleted from the port.
- **Styles**: there is no SIBAR CSS chain. The playground's stylesheet defines its own custom
  properties (a neutral ramp, the five hues of the card kinds and states, spacing) with the values
  the bench used, as one `:root` block, and the rest follows. The ground is the lightest grey.
- **«Schemi»** shows the whole schema of the case as code — its head, each gist, the laws — as chips:
  «Testa» for the head, one per gist, and «Leggi» for the laws.
- The `UI schema` (labels, cards, compose, awaited, the Italian words) stays the playground's: since
  round 5 it is the data of each domain (§6), and `ui-schema.ts` the functions that read it.

## 3 · How it runs

`playground/` is a workspace package (`private: true`), Vite as its dev server and build, plain
TypeScript and DOM, no framework; `markdown-it` its one dependency besides the two packages.
`pnpm dev` at the root starts it on port 5588 (`--strictPort`). `pnpm build` builds it into
`playground/dist`, never published.

## 4 · Done when

Both examples run to the end in a browser with a clean console; the checks the bench met hold:
the thread written by hand writer by writer, refusals in words, the dry-run preview with
«Conferma e invia», the band filling a slot, the goal dock with two goals and the wrapper,
«Cambia» as a new goal and then a revoke of the old, the inspector's four tabs with the schema as code, the records and
goal lines switchable.

## 5 · As built

Where the build had to choose:

- **The schema as code** reads the same file the engine does: a domain's module imports
  `cases/<domain>/schema.json` as text (`?raw`), `defineDomain` parses it once, hands it to `readSchema`, and cuts
  the head, each gist and the laws out of it for the inspector. «Schemi» has the chips «Testa», one per
  gist, and «Leggi» (the laws, as code); the laws keep their own tab, «Leggi», too, so the four tabs stay.
- **Verdicts in Italian**: `laws` in the domain, keyed by law and, for `keeps-set`, by
  the verdict's `set`; a law or a set the table lacks says so in general words.
- **The policy** of SIBAR is one entry in `cases/sibar-activity/policy.json` (since round 5, so the tests read it too), read with `readPolicy`, which `defineDomain` refuses on any problem as it does the schema, and passed to `post` and `dryRun`. The panel lists the
  denunciations it leaves, marked «lasciata senza risposta», beside «In accordo con le righe».
- **Render** takes the place of the bench's ledger cache (`keyed`), preview scheduling (`previewer`),
  band (`band`, with a thin adapter in `pointing.ts`; whether a drag holds the band is `band.dragging`,
  and only the `is-linking` class of the page's body is the page's own) and the per-line reading (`lineFacts`, which also yields the goals the dock
  draws and the warnings of each). What render lacks is on the page: the application's own facts
  (a document's signatures), the actions on a card, and what a goal being composed may await.
- **A failed preview** is heard through the previewer's `onError`: the draft's preview block says
  «Anteprima non disponibile: …» with the error's message, and, the answer on screen not being fresh,
  nothing can be confirmed on it.
- **Styles** are one file, `style.css`: a `:root` block with the neutral ramp, the five hues and the
  spacing, then the rules. No font is fetched; Inter is named first and the system's sans follows.


## 6 · Domains (round 5)

The page runs one **domain** at a time and a picker in its header, «Dominio», switches: «Attività
(SIBAR)» and «Revisione editoriale». A domain is a module in `src/domains/`, made by `defineDomain` in
`src/domain.ts` from its case (the schema read with `readSchema` and `BASE_KIT`, its policy if any, read
with `readPolicy`, its scenarios) and the application's side of it, the **UI schema**: the words (the page's titles, what it
calls the subject, the refusals, the laws, the keys of the value handle and the sets), each gist's label,
card and way of being composed and awaited, the people and the «Scrivo come» list, the goals' outcomes,
and its examples, which are the case's scenarios played through the shared resolver
([editorial-review.md](editorial-review.md) §7), with the words of the button. What the page itself does
for a writer, playing the system around the thread (SIBAR's signing and its new documents), is a
`Command` of the domain, and what it knows beyond the thread (SIBAR's documents) a `DocumentsUi`.

The rest of `src/` reads the domain in use, `domain()`, and names **no gist**:
`test/fence.test.ts` fails on a string literal that is a gist of either case anywhere but the domains
(the DOM's `submit` is the one word it lets through), and `test/domains.test.ts` plays each domain's
examples through the engine and checks that the UI schema has words for every gist and every line.
Switching resets the thread, the draft, the selection and the inspector's chip, and keeps the toggles.
The examples of a domain are buttons made from it, so an example that ends on a refusal its scenario
expects (the review's «un revisore se ne va») leaves that refusal on screen.
