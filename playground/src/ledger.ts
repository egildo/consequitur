// The ledger: the thread's cards in reading order, kept by line id with `keyed`. A card is built
// once with a key of what the reading adds to it and built again only when that key changes, and a
// line that arrives is inserted at its place, so the scroll, the hover and the focus stay where they
// are. What changes often and costs nothing to redraw (selected, lit, candidate, target) is a class
// set on the kept card after every update.

import type { EventLine, LineId } from 'consequitur';
import { keyed } from 'consequitur-render';
import { drawCard, type Handlers } from './cards.ts';
import { awaitedFor, keyOfSpec, type Derived, type LineSpec } from './deduce.ts';
import type { PageState } from './state.ts';
import { isGoalLine } from './ui-schema.ts';

export interface LedgerHandlers extends Handlers {
  /** A click on a card that is not on one of its buttons or pills. */
  onSelect(id: LineId): void;
  /** A click on a card's gist label: the line is selected and the inspector shows its gist's schema. */
  onSchema(gist: string, id: LineId): void;
  /** An arrow key while the ledger has focus. */
  onStep(delta: 1 | -1): void;
}

const NO_CONDITIONS: never[] = [];

export function createLedger(root: HTMLElement, handlers: LedgerHandlers) {
  // the lines of the thread being drawn, which a card reads its pills' labels from
  let lines: EventLine[] = [];
  const cards = keyed<LineSpec>(root, {
    id: (spec) => spec.facts.line.id,
    key: keyOfSpec,
    build: (spec) => drawCard(spec.facts.line, spec, lines, handlers),
  });

  root.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('button, a, .chip')) return;
    const id = target.closest<HTMLElement>('.card')?.dataset.lineId;
    if (id === undefined) return;
    const gist = target.closest<HTMLElement>('[data-gist]')?.dataset.gist;
    if (gist !== undefined) handlers.onSchema(gist, id);
    else handlers.onSelect(id);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      handlers.onStep(event.key === 'ArrowDown' ? 1 : -1);
    }
  });

  return {
    /** Forgets every card: «Azzera». */
    clear: cards.clear,

    render(state: PageState, derived: Derived): void {
      lines = state.thread.lines;
      const awaiting = state.draft?.goal ? awaitedFor(derived, state.draft.goal.checks) : undefined;
      // while a goal is composed a card offers what can be awaited of it, not what can be written about it
      const specs = awaiting
        ? derived.specs.map(({ actions: _actions, ...spec }): LineSpec => ({ ...spec, awaited: awaiting.get(spec.facts.line.id) ?? NO_CONDITIONS }))
        : derived.specs;
      cards.update(specs);

      for (const { facts } of specs) {
        const { line, revokedBy } = facts;
        const node = cards.node(line.id);
        if (!node) continue;
        node.classList.toggle('is-goalline', isGoalLine(line.gist));
        node.classList.toggle('is-revoked', revokedBy !== undefined);
        node.classList.toggle('is-selected', state.selected === line.id);
        node.classList.toggle('is-lit', state.lit === line.id);
        node.classList.toggle('is-candidate', state.linking?.candidates.includes(line.id) === true);
        node.classList.toggle('is-target', state.linking?.target === line.id);
      }
    },
  };
}
