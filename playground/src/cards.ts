// The card of a line: one function for every gist, drawing the card its gist's UI
// entry names from the line and what the reading says about it. A card is built
// whole and not changed afterwards; the ledger builds another when what it reads
// changes.

import type { Check, EventLine, GoalReading, Json, LineId, Payload } from 'consequitur';
import { WARNING_GIST } from './case.ts';
import type { LineAction, LineSpec } from './deduce.ts';
import { chip, h } from './dom.ts';
import { renderMarkdown } from './markdown.ts';
import { isDragging, point } from './pointing.ts';
import {
  documentSubject,
  gistLabel,
  KIN_WORDS,
  checkSentence,
  lineLabel,
  outcomeSentence,
  payloadPairs,
  recordSentence,
  sayOf,
  timeOf,
  uiOf,
  userName,
  usersOf,
  warningSentence,
  writerName,
} from './ui-schema.ts';

type Child = Node | string | null | undefined | false;

/** What a card tells the page: an action pressed, a condition awaited, a line asked for, a line pointed at. */
export interface Handlers {
  onAction(action: LineAction, line: EventLine): void;
  onAwait(check: Check): void;
  onFocus(id: LineId): void;
  onLight(id: LineId | null): void;
}

/**
 * Hovering or focusing `element` draws the band from it to the card of a line and
 * lights the card; leaving clears both. A drag in progress owns the band.
 */
export function pointAt(handlers: Handlers, element: HTMLElement, id: LineId): void {
  const on = () => {
    if (isDragging()) return;
    handlers.onLight(id);
    const card = document.querySelector<HTMLElement>(`.card[data-line-id="${id}"]`);
    if (card) point(element, card);
  };
  const off = () => {
    handlers.onLight(null);
    point(null, null);
  };
  for (const type of ['mouseenter', 'pointerenter', 'focus']) element.addEventListener(type, on);
  for (const type of ['mouseleave', 'pointerleave', 'blur']) element.addEventListener(type, off);
}

/** A pill that stands for a line: a click goes to its card, hovering lights it and draws the band to it. */
export function lineChip(handlers: Handlers, line: EventLine): HTMLButtonElement {
  const button = h('button', { class: 'chip chip-line', type: 'button' }, lineLabel(line));
  button.addEventListener('click', () => handlers.onFocus(line.id));
  pointAt(handlers, button, line.id);
  return button;
}

const row = (...chips: Array<HTMLElement | null>): HTMLElement | null => {
  const present = chips.filter((c): c is HTMLElement => c !== null);
  return present.length ? h('div', { class: 'chips' }, ...present) : null;
};

const meta = (line: EventLine, prefix = ''): HTMLElement =>
  h('span', { class: 'card-meta' }, `${prefix}${writerName(line.writer)} · ${timeOf(line.timestamp)}`);

/** What makes a card's label open the schema of its gist in the inspector. */
const schemaTag = (gist: string): Record<string, string> => ({ 'data-gist': gist, title: 'Mostra lo schema di questa riga' });

const target = (lines: EventLine[], id: Json | undefined): EventLine | undefined =>
  typeof id === 'string' ? lines.find((l) => l.id === id) : undefined;

/** What each kind of card holds besides the parts the reading feeds. */
function bodyOf(handlers: Handlers, line: EventLine, writtenBy: LineId | undefined, lines: EventLine[]): Child[] {
  const ui = uiOf(line.gist);
  const { payload } = line;
  const pointer = (id: Json | undefined) => {
    const found = target(lines, id);
    return found ? lineChip(handlers, found) : null;
  };

  switch (ui?.card) {
    case 'header':
      return [
        h('h2', { class: 'card-title card-title-lg', ...schemaTag(line.gist) }, typeof payload.name === 'string' ? payload.name : ''),
        h('p', { class: 'card-meta' }, `aperta da ${writerName(line.writer)} · ${timeOf(line.timestamp)}`),
        row(...usersOf(payload.assignTo).map((u) => chip(userName(u), 'user'))),
      ];
    case 'note': {
      const code = typeof payload.document === 'string' ? payload.document : undefined;
      return [
        h('div', { class: 'card-head' }, h('span', { class: 'card-title', ...schemaTag(line.gist) }, ui.label), meta(line)),
        h('div', { class: 'card-text' }, renderMarkdown(typeof payload.text === 'string' ? payload.text : '')),
        row(...[...usersOf(payload.assignTo), ...usersOf(payload.mentions)].map((u) => chip(userName(u), 'user')), code ? chip(code, 'document') : null),
      ];
    }
    case 'mark': {
      const warning = line.gist === WARNING_GIST;
      const key = ui.compose?.refer?.key;
      return [
        h(
          'p',
          { class: 'mark-line' },
          h('span', { class: 'mark-text', ...schemaTag(line.gist) }, warning ? warningSentence(line, lines) : sayOf(ui, line)),
          key ? pointer(payload[key]) : null,
          warning ? pointer(writtenBy) : null,
          h('span', { class: 'card-meta' }, timeOf(line.timestamp)),
        ),
      ];
    }
    case 'document': {
      const code = typeof payload.document === 'string' ? payload.document : '';
      const subject = documentSubject(code);
      const direction = payload.direction === 'inbound' ? 'in entrata' : payload.direction === 'outbound' ? 'in uscita' : null;
      const about = pointer(payload.about);
      return [
        h(
          'div',
          { class: 'card-head' },
          h('span', { class: 'card-title', ...schemaTag(line.gist) }, code, subject && h('span', { class: 'doc-subject' }, subject)),
          direction && h('span', { class: 'badge' }, direction),
        ),
        h('p', { class: 'card-meta' }, `aggiunto da ${writerName(line.writer)} · ${timeOf(line.timestamp)}`),
        about && h('p', { class: 'card-meta' }, 'dal promemoria ', about),
      ];
    }
    case 'goal':
      return [
        h(
          'div',
          { class: 'card-head' },
          h('span', { class: 'badge', ...schemaTag(line.gist) }, ui.label),
          h('span', { class: 'card-title' }, typeof payload.name === 'string' ? payload.name : ''),
          meta(line),
        ),
      ];
    case 'record': {
      const sentence = recordSentence(line, lines);
      return [h('p', { class: 'record-line', ...schemaTag(line.gist) }, sentence, h('span', { class: 'card-meta' }, timeOf(line.timestamp)))];
    }
    default: {
      const kin = line.writer.slice(0, line.writer.indexOf('::'));
      return [
        h(
          'div',
          { class: 'card-head' },
          h('span', { class: 'badge' }, KIN_WORDS[kin] ?? kin),
          h('span', { class: 'card-title', ...schemaTag(line.gist) }, gistLabel(line.gist)),
          meta(line),
        ),
        h('p', { class: 'pairs' }, payloadPairs(payload, lines).join(' · ')),
      ];
    }
  }
}

/** A goal as a card or the panel draws it: read from the reading, or, for a goal that is not in the reading, from its own line. */
export interface GoalFacts {
  name: string;
  checks: GoalReading['checks'];
  then: string;
  outcome?: Payload;
  final: boolean;
  met: boolean;
  /** The line the goal wrote has been revoked. */
  reopened: boolean;
}

export const goalFacts = (goal: GoalReading): GoalFacts => ({
  name: goal.name,
  checks: goal.checks,
  then: goal.then,
  outcome: goal.with,
  final: goal.final,
  met: goal.met,
  reopened: goal.outcomeRevoked === true,
});

const checksOf = (line: EventLine): Check[] => (Array.isArray(line.payload.checks) ? (line.payload.checks as Check[]) : []);

export const goalFactsOf = (line: EventLine): GoalFacts => ({
  name: typeof line.payload.name === 'string' ? line.payload.name : '',
  checks: checksOf(line).map((check) => ({ check })),
  then: typeof line.payload.then === 'string' ? line.payload.then : '',
  outcome: typeof line.payload.with === 'object' && line.payload.with !== null && !Array.isArray(line.payload.with) ? line.payload.with : undefined,
  final: line.payload.final === true,
  met: false,
  reopened: false,
});

/**
 * The checks of a goal, each with its mark (✓ found, ⚠ it cannot come true, ○ waiting), and
 * what the goal does. `tick` draws the mark of a found check; `warnings` holds the warning
 * written for each check that cannot come true, by the check's index, and gives its time.
 */
export function goalRows(facts: GoalFacts, lines: EventLine[], tick?: (id: LineId) => HTMLElement, warnings?: Record<number, EventLine>): HTMLElement[] {
  const items = facts.checks.map(({ check, foundIn, orphan }, index) => {
    const warning = warnings?.[index];
    return h(
      'li',
      { class: foundIn ? 'check is-found' : orphan ? 'check is-orphan' : 'check' },
      foundIn ? (tick?.(foundIn) ?? h('span', { class: 'tick' }, '✓')) : h('span', { class: 'tick' }, orphan ? '⚠' : '○'),
      h('span', null, checkSentence(check, lines), orphan && h('span', { class: 'check-note' }, `non può più avverarsi${warning ? ` · ${timeOf(warning.timestamp)}` : ''}`)),
    );
  });
  return [
    h('ul', { class: 'checks' }, ...items),
    h(
      'p',
      { class: 'goal-then' },
      outcomeSentence(facts.then, facts.outcome),
      facts.final && h('span', { class: 'badge badge-lock' }, h('span', { class: 'lock-icon', 'aria-hidden': 'true' }), 'definitivo'),
      facts.met && h('span', { class: 'badge badge-met' }, 'raggiunto'),
      facts.reopened && h('span', { class: 'badge' }, 'poi riaperto'),
    ),
  ];
}

/** The optional comment on an action, under the card's sentence. */
function noteOf(line: EventLine): HTMLElement | null {
  const { note } = line.payload;
  return typeof note === 'string' && note !== '' ? h('div', { class: 'card-note-text' }, renderMarkdown(note)) : null;
}

/** A fact the system posted about a document, as one row of its card. */
function factSentence(fact: EventLine): string {
  const by = fact.payload.by;
  if (fact.gist === 'doc_signed' && typeof by === 'string') return `Firmato da ${userName(by)} · ${timeOf(fact.timestamp)}`;
  if (fact.gist === 'doc_created') return `Creato · ${timeOf(fact.timestamp)}`;
  return `${gistLabel(fact.gist)} · ${writerName(fact.writer)} · ${timeOf(fact.timestamp)}`;
}

/** The tick of a found check: pointing at it draws the band to the line that satisfied it. */
export function foundTick(handlers: Handlers, id: LineId): HTMLButtonElement {
  const tick = h('button', { class: 'tick tick-button', type: 'button', title: 'Mostra la riga trovata' }, '✓');
  tick.addEventListener('click', () => handlers.onFocus(id));
  pointAt(handlers, tick, id);
  return tick;
}

/**
 * The whole card of a line: its own text, then what the reading adds: the revoker,
 * the goal's ticks, the document's facts, and the buttons. While a goal is being
 * composed a card offers what can be awaited of it, not what can be written about it.
 */
export function drawCard(line: EventLine, spec: LineSpec, lines: EventLine[], handlers: Handlers): HTMLElement {
  const ui = uiOf(line.gist);

  const { revokedBy, goal: reading, writtenBy } = spec.facts;
  const revoked = revokedBy ? h('p', { class: 'card-revoked' }, 'annullata da ', lineChip(handlers, revokedBy)) : null;

  const goal = ui?.card === 'goal' ? h('div', { class: 'goal' }, ...goalRows(reading ? goalFacts(reading) : goalFactsOf(line), lines, (id) => foundTick(handlers, id))) : null;

  const facts = ui?.card === 'document' && spec.documentFacts?.length ? h('ul', { class: 'facts' }, ...spec.documentFacts.map((fact) => h('li', { class: 'fact-row' }, factSentence(fact)))) : null;

  const buttons = spec.awaited
    ? spec.awaited.map(({ check, label }) => {
        const button = h('button', { class: 'action action-await', type: 'button' }, `attendi: ${label}`);
        button.addEventListener('click', () => handlers.onAwait(check));
        return button;
      })
    : (spec.actions ?? []).map((action) => {
        const button = h('button', { class: 'action', type: 'button' }, action.label);
        button.addEventListener('click', () => handlers.onAction(action, line));
        return button;
      });

  return h(
    'article',
    { class: `card card-${ui?.card ?? 'fact'}${line.gist === WARNING_GIST ? ' card-warning' : ''}`, 'data-line-id': line.id },
    ...bodyOf(handlers, line, writtenBy, lines),
    noteOf(line),
    goal,
    facts,
    revoked,
    buttons.length ? h('footer', { class: 'card-actions' }, ...buttons) : null,
  );
}
