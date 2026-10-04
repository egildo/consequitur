// The dock: the goals' configuration and state, at the bottom of the ledger's
// column. Up to two goals side by side and, under them, the one wrapper that asks
// for their completion; each block is coloured by its state. The goal being
// composed lives here too: its composer is a persistent element in `slot`, put
// there by the page, and never touched by a redraw of the blocks. The blocks are
// drawn again only when what they read changed, so a hover on a tick keeps its band.

import type { EventLine } from 'consequitur';
import { foundTick, goalFacts, goalRows, type Handlers } from './cards.ts';
import { completionOf, keyOfCheck, type Derived, type DockGoal } from './deduce.ts';
import { h } from './dom.ts';
import type { PageState } from './state.ts';
import { checkSentence } from './ui-schema.ts';

/** The most goals that stand besides the wrapper. */
export const MOST_GOALS = 2;

export interface DockHandlers extends Handlers {
  /** «Imposta un traguardo», or with `completion` «Imposta il completamento». */
  onGoal(role?: 'completion'): void;
  onChange(line: EventLine): void;
  onRemove(line: EventLine): void;
}

type GoalState = 'waiting' | 'met' | 'warned';

const stateOf = ({ goal }: DockGoal): GoalState => (goal.met ? 'met' : goal.checks.some((c) => c.orphan) ? 'warned' : 'waiting');

/** «1 di 2 traguardi raggiunti», from the wrapper's conditions that name a goal; null when it names none. */
function progressOf({ goal }: DockGoal, lines: EventLine[]): string | null {
  const named = goal.checks.filter(({ check }) => check.writer !== undefined && lines.some((l) => check.writer === `goal::${l.id}`));
  if (named.length === 0) return null;
  const done = named.filter((c) => c.foundIn !== undefined).length;
  return `${done} di ${named.length} ${named.length === 1 ? 'traguardo raggiunto' : 'traguardi raggiunti'}`;
}

export function createDock(root: HTMLElement, handlers: DockHandlers) {
  const view = h('div', { class: 'dock-view' });
  const slot = h('div', { class: 'dock-composer' });
  root.append(view, slot);
  let drawn: string | undefined;

  function block(dock: DockGoal, derived: Derived, state: PageState): HTMLElement {
    const { goal, line, wrapper, warnings } = dock;
    const composing = state.draft?.goal;
    const lines = derived.thread.lines;
    const targets = derived.offers.find((offer) => offer.gist === 'set_goal_revoke')?.targets ?? [];
    const removable = targets.includes(line.id);

    const actions: HTMLElement[] = [];
    if (!composing && removable) {
      if (derived.offered.has('set_goal')) {
        const change = h('button', { class: 'action is-quiet', type: 'button' }, 'Cambia');
        change.addEventListener('click', () => handlers.onChange(line));
        actions.push(change);
      }
      const remove = h('button', { class: 'action is-quiet', type: 'button' }, 'Rimuovi');
      remove.addEventListener('click', () => handlers.onRemove(line));
      actions.push(remove);
    }

    // while the wrapper is composed, a goal offers its completion as a condition
    const awaited: HTMLElement[] = [];
    if (composing?.role === 'completion' && !wrapper) {
      const check = completionOf(line);
      if (!composing.checks.some((held) => keyOfCheck(held) === keyOfCheck(check))) {
        const button = h('button', { class: 'action action-await', type: 'button' }, `attendi: ${checkSentence(check, lines)}`);
        button.addEventListener('click', () => handlers.onAwait(check));
        awaited.push(button);
      }
    }

    const progress = wrapper ? progressOf(dock, lines) : null;
    return h(
      'article',
      { class: `goal-block is-${stateOf(dock)}${wrapper ? ' is-wrapper' : ''}`, 'data-goal': line.id },
      h('header', { class: 'goal-head' }, h('h3', { class: 'goal-name' }, goal.name), wrapper && h('span', { class: 'goal-role' }, 'completamento'), actions.length > 0 && h('div', { class: 'goal-actions' }, ...actions)),
      ...goalRows(goalFacts(goal), lines, (id) => foundTick(handlers, id), warnings),
      progress && h('p', { class: 'goal-progress' }, progress),
      awaited.length > 0 && h('div', { class: 'goal-awaits' }, ...awaited),
    );
  }

  function draw(state: PageState, derived: Derived): void {
    const composing = state.draft?.goal;
    const standing = derived.goals.filter((g) => !g.wrapper);
    const wrapper = derived.goals.find((g) => g.wrapper);
    const writes = derived.offered.has('set_goal');

    const content: Array<HTMLElement | false> = [];
    if (derived.goals.length === 0) {
      const set = writes && h('button', { class: 'action', type: 'button' }, 'Imposta un traguardo');
      if (set) set.addEventListener('click', () => handlers.onGoal());
      content.push(h('div', { class: 'dock-empty' }, h('p', null, "Nessun traguardo: l'attività si chiude a mano"), set));
    } else {
      content.push(
        standing.length > 0 && h('div', { class: 'goal-grid' }, ...standing.map((g) => block(g, derived, state))),
        wrapper !== undefined && h('div', { class: 'goal-wrapper' }, block(wrapper, derived, state)),
      );
      if (!composing && writes) {
        const row = h('div', { class: 'dock-actions' });
        if (standing.length < MOST_GOALS) {
          const more = h('button', { class: 'action', type: 'button' }, 'Imposta un traguardo');
          more.addEventListener('click', () => handlers.onGoal());
          row.append(more);
        }
        if (!wrapper && standing.length > 0) {
          const wrap = h('button', { class: 'action', type: 'button' }, 'Imposta il completamento');
          wrap.addEventListener('click', () => handlers.onGoal('completion'));
          row.append(wrap);
        }
        content.push(row.children.length > 0 && row);
      }
    }
    view.replaceChildren(...content.filter((part): part is HTMLElement => part !== false));
  }

  return {
    /** Where the page puts the composer of the goal being composed. */
    slot,
    render(state: PageState, derived: Derived): void {
      const composing = state.draft?.goal;
      // a goal being composed hides the blocks, except while it is the wrapper: they offer their completion
      view.hidden = composing !== undefined && composing !== null && composing.role !== 'completion';
      slot.hidden = !composing;
      // what the blocks read: the goals, the lines their sentences name, what the writer may do, and the goal composed
      const key = JSON.stringify([
        derived.goals.map((g) => [g.goal, Object.entries(g.warnings).map(([i, w]) => [i, w.timestamp])]),
        derived.thread.lines.length,
        derived.offered.has('set_goal'),
        derived.offers.find((offer) => offer.gist === 'set_goal_revoke')?.targets,
        state.pending,
        composing ? [composing.role, composing.checks.map(keyOfCheck)] : null,
      ]);
      if (key === drawn) return;
      drawn = key;
      draw(state, derived);
    },
  };
}
