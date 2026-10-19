# How to preview a draft in a web page

This guide gets you a page that shows, while a person composes a line, what sending it would cause, and that draws the thread with its changes.

`consequitur-render` owns no markup and no style: you build every node and paint every class. The [playground](../../playground/src/main.ts) is a working host of it.

## Before you begin

You need a page that holds a thread as a `ThreadState` (`state` below), the `schema`, and a function `readDraft()` that gives the `LineDraft` the form describes, or `null` when it is closed. Install the packages:

```sh
npm install consequitur consequitur-render
```

## Steps

1. **Run the dry run while the person composes.** `previewer` waits 250 ms after the last change, runs the draft, and shows the answer. `keyOf` says when two drafts are the same, so include whatever the answer depends on: the draft, and the thread's length.

   ```ts
   import { dryRun, type DryRun, type LineDraft } from 'consequitur';
   import { previewer } from 'consequitur-render';

   const preview = previewer<LineDraft, DryRun>({
     keyOf: (draft) => JSON.stringify([draft, state.lines.length]),
     run: (draft) => dryRun(state, draft, schema, new Date().toISOString(), { policy }),
     show: (answer, fresh) => drawPreview(answer, fresh),
     onError: (error) => drawFailure(error),
   });
   form.addEventListener('input', () => preview.change(readDraft()));
   ```

   Call `preview.change(null)` when the form closes, and `preview.dispose()` when the page goes.

2. **Draw the answer.** `answer` is the `DryRun`, or `null` when there is no draft. `answer.refusal` says why the line cannot go; `answer.added` is the lines it would add, the draft's first; `answer.verdicts` is every law it would break. While a newer draft waits, `show` gets the last answer with `fresh` false: dim it.

3. **Send only what the person saw.** The answer is advice: `post` judges again. A `confirm` verdict needs the writer's confirmation, so confirm only when the answer on screen is the draft's own.

   ```ts
   const shown = preview.current();
   const confirmed = shown !== null && shown.fresh && shown.answer.verdicts.length > 0 && personClickedConfirm;
   const result = await post(state, draft, schema, new Date().toISOString(), { policy, confirmed });
   ```

4. **Draw the thread.** `lineFacts` gives what the reading holds about each line: in force or not, revoked by which line, the goal it is, what wrote it. `keyed` keeps one node for each line id, builds it again only when its `key` changes, and leaves focus and scroll alone. Put in `key` everything your node shows that can change.

   ```ts
   import { consequitur } from 'consequitur';
   import { keyed, lineFacts, type LineFacts } from 'consequitur-render';

   const cards = keyed<LineFacts>(root, {
     id: (facts) => facts.line.id,
     key: (facts) => JSON.stringify([facts.inForce, facts.revokedBy?.id, facts.goal?.met, facts.goal?.outcome, Object.keys(facts.warnings ?? {})]),
     build: (facts) => {
       const card = drawCard(facts);
       card.dataset.lineId = facts.line.id; // the band reads it
       return card;
     },
   });

   let reading = consequitur(state.lines, state.handles, schema);
   cards.update(lineFacts(state.lines, reading, schema));
   ```

   What changes often and costs nothing to redraw, such as selected, is a class you set on `cards.node(id)` after each `update`, outside the key.

5. **Animate what changed.** After a post that is not refused, keep the reading before and compare. `changes` lists what changed from one reading to another, each with a key: a line newly in force, a goal met, a denunciation raised or answered, a hole filled.

   ```ts
   import { changes } from 'consequitur-render';

   const before = reading;
   reading = result.reading;
   state = result.state;
   cards.update(lineFacts(state.lines, reading, schema));
   for (const change of changes(before, reading)) {
     if (change.of === 'line' && change.change === 'in-force') cards.node(change.key)?.classList.add('arrived');
     if (change.of === 'goal' && change.change === 'met') cards.node(change.key)?.classList.add('met');
   }
   ```

6. **Point from one line to another.** `band` draws a curve over a layer. The layer must be an element over the scroll area with a position set. Give it the ends: a hover, or a drag that ends on a line.

   ```ts
   import { band } from 'consequitur-render';

   const pointer = band(layer);
   card.addEventListener('pointerenter', () => pointer.point(card, other));
   card.addEventListener('pointerleave', () => pointer.point(null, null));

   handle.addEventListener('pointerdown', async (event) => {
     const id = await pointer.drag(handle, event, { candidates, onTarget: lightUp });
     if (id !== null) attach(id);
   });
   ```

   `candidates` are the line ids a drag may end on, and a node with `data-line-id` is the line it names. The drag resolves with the id dropped on, or `null` on Esc. Style the classes `band`, `band-path`, `band-dot`, `band-start` and `band-end`; the band sets no colour. Call `pointer.redraw()` when the layer scrolls.

## Variations

- **A different delay.** `previewer({ delay: 500, … })`.
- **Keys for what has no id.** A denunciation or a check has no id of its own: `keyOf(denunciation)` and `keyOfCheck(goal, path)` give a key for a node you keep.
- **The domain's own facts.** `lineFacts` knows no gist. A document a line refers to, or a person, is yours to add to a card. In the playground, [`deduce.ts`](../../playground/src/deduce.ts) does it.

## See also

- [consequitur-render](../reference/render.md): every export, its types and what it throws.
- [Posting](../reference/posting.md#dryrun): what a dry run returns.
- Playground: [the previewer](../../playground/src/main.ts), [the ledger](../../playground/src/ledger.ts) and [the band](../../playground/src/pointing.ts).
