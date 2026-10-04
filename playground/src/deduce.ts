// What the thread says about itself that the screen needs and the reading does not hold: the
// offers of the writer, and for each line its actions. What the reading says of each line
// (revoked by, goal, warnings) is `lineFacts`; here are the application's own parts: a document's
// signatures, the buttons, what a goal being composed may await. Pure: the same thread, reading
// and writer give the same answer, and the last answer is kept so a redraw that changes none of
// them costs nothing.

import {
  canonical,
  goalWriter,
  kinOf,
  offers as offersOf,
  type Check,
  type EventLine,
  type GoalReading,
  type Json,
  type LineId,
  type Offer,
  type Reading,
  type ThreadState,
  type Writer,
} from 'consequitur';
import { lineFacts, type LineFacts } from 'consequitur-render';
import { membersIn, SCHEMA, valueIn } from './case.ts';
import { checkSentence, gistLabel, GIST_UI, uiIndex, uiOf, usersOf } from './ui-schema.ts';

/** A button on a card. A `command` is the page playing the document system: it posts system facts, not a draft of `gist`. */
export interface LineAction {
  gist: string;
  label: string;
  command?: 'sign' | 'new-document';
}

/** A condition a card offers to a goal being composed: the check, and its sentence. */
export interface LineAwaited {
  check: Check;
  label: string;
}

/** What a card draws: what the reading says of its line, then what the page adds. */
export interface LineSpec {
  facts: LineFacts;
  /** For a document's line: what the document system said about the document. */
  documentFacts?: EventLine[];
  actions?: LineAction[];
  /** Present only while a goal is being composed, and then in place of `actions`. */
  awaited?: LineAwaited[];
}

/** A goal in force as the dock shows it: its reading, its line, and the warnings its checks have been given. */
export interface DockGoal {
  goal: GoalReading;
  line: EventLine;
  /** The goal that asks for the others' completion. */
  wrapper: boolean;
  /** The warning line of each check that cannot come true, by the check's index. */
  warnings: Record<number, EventLine>;
}

export interface Derived {
  thread: ThreadState;
  reading: Reading;
  writer: Writer;
  /** What this writer may post now and a person composes by hand, in the bar's order. */
  offers: Offer[];
  /** Every gist this writer may post now, composed by hand or not. */
  offered: Set<string>;
  /** The goals in force, in reading order. */
  goals: DockGoal[];
  /** Each line's spec, in reading order. */
  specs: LineSpec[];
}

/** A user who is an expected assignee signs a document of the thread once, while the activity is open. */
function canSign(d: Pick<Derived, 'thread' | 'reading' | 'writer'>, line: EventLine): boolean {
  const user = d.writer.slice(d.writer.indexOf('::') + 2);
  const document = line.payload.document;
  if (kinOf(d.writer) !== 'user' || typeof document !== 'string') return false;
  if (valueIn(d.reading.expected, 'status') !== 'open' || !membersIn(d.reading.expected).includes(user)) return false;
  const standing = new Set(d.reading.inForce);
  return !d.thread.lines.some((l) => standing.has(l.id) && l.gist === 'doc_signed' && l.payload.document === document && l.payload.by === user);
}

function specsOf(d: Omit<Derived, 'specs'>, facts: LineFacts[]): LineSpec[] {
  const byId = new Map(d.thread.lines.map((line) => [line.id, line] as const));
  const standing = new Set(d.reading.inForce);

  return facts.map((fact): LineSpec => {
    const { line } = fact;
    const spec: LineSpec = { facts: fact };

    const document = line.payload.document;
    if (line.gist === 'doc_ref' && document !== undefined) {
      spec.documentFacts = d.reading.inForce
        .map((id) => byId.get(id))
        .filter((l): l is EventLine => l !== undefined && kinOf(l.writer) !== 'user' && l.payload.document === document);
    }

    // a revoking gist is offered on the lines it may name; any other only on a line in force
    const actions = d.offers
      .filter((offer) => {
        if (!uiOf(offer.gist)?.compose?.refer?.gists.includes(line.gist)) return false;
        return offer.targets ? offer.targets.includes(line.id) : standing.has(line.id);
      })
      .map((offer): LineAction => ({ gist: offer.gist, label: gistLabel(offer.gist) }));
    // a memo also offers a document made on the spot, written about it
    if (line.gist === 'memo' && standing.has(line.id) && d.offers.some((offer) => offer.gist === 'doc_ref')) {
      actions.push({ gist: 'doc_ref', label: 'Nuovo documento', command: 'new-document' });
    }
    if (line.gist === 'doc_ref' && standing.has(line.id) && canSign(d, line)) actions.push({ gist: 'doc_signed', label: 'Firma', command: 'sign' });
    if (actions.length) spec.actions = actions;
    return spec;
  });
}

/** The goals in force with what the dock shows of them: the lines whose facts carry a goal. */
const goalsOf = (facts: LineFacts[]): DockGoal[] =>
  facts.flatMap((fact): DockGoal[] =>
    fact.goal ? [{ goal: fact.goal, line: fact.line, wrapper: fact.line.payload.role === 'completion', warnings: fact.warnings ?? {} }] : [],
  );

/** The condition «this goal is reached»: a line of what it writes, written by it. */
export const completionOf = (goal: EventLine): Check => ({ gist: String(goal.payload.then), writer: goalWriter(goal.id) });

/**
 * The wrapper that awaits the goal's completion, when this writer may write the
 * wrapper again: replacing or removing the goal then moves its condition too.
 */
export function wrapperFollowing(derived: Derived, goalId: LineId): DockGoal | undefined {
  if (!derived.offered.has('set_goal')) return undefined;
  const writer = goalWriter(goalId);
  return derived.goals.find((g) => g.wrapper && g.line.id !== goalId && g.goal.checks.some(({ check }) => check.writer === writer));
}

let last: Derived | undefined;

/** The deduction for a thread, its reading and a writer. */
export function derive(thread: ThreadState, reading: Reading, writer: Writer): Derived {
  if (last && last.thread === thread && last.reading === reading && last.writer === writer) return last;
  const every = offersOf(thread.lines, writer, SCHEMA);
  const offers = every
    .filter((offer) => uiOf(offer.gist)?.compose !== undefined)
    .sort((a, b) => uiIndex(a.gist) - uiIndex(b.gist));

  const facts = lineFacts(thread.lines, reading, SCHEMA);
  const base = { thread, reading, writer, offers, offered: new Set(every.map((offer) => offer.gist)), goals: goalsOf(facts) };
  return (last = { ...base, specs: specsOf(base, facts) });
}

/** The checks a goal may await of a line, from the gists whose UI entry says how they are awaited. */
function awaitedOf(line: EventLine, assignees: string[]): Check[] {
  const checks: Check[] = [];
  for (const ui of GIST_UI) {
    for (const awaited of ui.awaited ?? []) {
      if (awaited.on !== line.gist) continue;
      const value: Json | undefined = 'id' in awaited.value ? line.id : line.payload[awaited.value.payload];
      if (value === undefined) continue;
      const payload = { [awaited.key]: value };
      if ('users' in awaited.by) {
        for (const user of usersOf(line.payload[awaited.by.users])) checks.push({ gist: ui.gist, writer: `user::${user}`, payload });
      } else if (awaited.each !== undefined) {
        for (const user of assignees) checks.push({ gist: ui.gist, kin: awaited.by.kin, payload: { ...payload, [awaited.each]: user } });
      } else {
        checks.push({ gist: ui.gist, kin: awaited.by.kin, payload });
      }
    }
  }
  return checks;
}

/** Two checks are the same condition when their `canonical` texts are equal. */
export const keyOfCheck = (check: Check): string => canonical(check as unknown as Json);

let lastAwaited: { derived: Derived; key: string; byLine: Map<LineId, LineAwaited[]> } | undefined;

/** What each line in force offers to a goal being composed that holds `checks`; a condition already held is not offered again. */
export function awaitedFor(derived: Derived, checks: Check[]): Map<LineId, LineAwaited[]> {
  const held = new Set(checks.map(keyOfCheck));
  const key = [...held].sort().join('\n');
  if (lastAwaited?.derived === derived && lastAwaited.key === key) return lastAwaited.byLine;
  const standing = new Set(derived.reading.inForce);
  const byLine = new Map<LineId, LineAwaited[]>();
  for (const line of derived.thread.lines) {
    if (!standing.has(line.id)) continue;
    const offered = awaitedOf(line, membersIn(derived.reading.expected))
      .filter((check) => !held.has(keyOfCheck(check)))
      .map((check) => ({ check, label: checkSentence(check, derived.thread.lines) }));
    if (offered.length) byLine.set(line.id, offered);
  }
  lastAwaited = { derived, key, byLine };
  return byLine;
}

/** What a card draws from its spec, as one string: a card is drawn again only when it changes. */
export const keyOfSpec = (spec: LineSpec): string =>
  JSON.stringify([
    spec.facts.revokedBy?.id,
    spec.facts.goal,
    spec.documentFacts?.map((fact) => fact.id),
    spec.actions?.map((action) => [action.gist, action.command]),
    spec.awaited?.map((awaited) => keyOfCheck(awaited.check)),
  ]);
