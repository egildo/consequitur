// The page's one state. Everything on the screen is deduced from it by `render`,
// and every event either changes it or writes a line.

import type { Check, Denunciation, LineId, Reading, ThreadState, Writer } from 'consequitur';
import type { Preview } from './ui-schema.ts';

/** The goal being composed, besides its name: what it awaits and what it does. */
export interface GoalForm {
  name: string;
  /** What the goal does: the gist it writes. */
  then: string;
  /** What that gist is given: a value for each field of the outcome, by the field's key. */
  values: Record<string, string>;
  final: boolean;
  checks: Check[];
  /** `completion`: the wrapper, which awaits the completion of the goals. */
  role: 'completion' | null;
  /** The goal this one takes the place of: sending it revokes that goal first. */
  replaces: LineId | null;
}

/** The line being composed, or, with `goal`, the goal being composed. */
export interface Draft {
  /** A new draft has a new number: the composer is built again for it, and only for it. */
  id: number;
  gist: string;
  fields: Record<string, string>;
  /** The markdown text, with `@<user>` and `#<document>` tokens. */
  text: string;
  ref: LineId | null;
  pick: { code: string; direction?: 'inbound' | 'outbound' } | null;
  goal: GoalForm | null;
}

/** A refusal as a person reads it: the words, the core's detail for the `title`, the laws it names. */
export interface ShownRefusal {
  words: string;
  detail: string;
  verdicts: Preview['verdicts'];
}

/** What a drag from a reference slot holds: the lines it may end on, and the one under the pointer. */
export interface Linking {
  candidates: LineId[];
  target: LineId | null;
}

/** The «Testa» chip of «Schemi»: not a gist, so a name no gist can have. */
export const HEAD_CHIP = '(testa)';

/** The «Leggi» chip of «Schemi»: the schema's laws, which are no gist either. */
export const LAWS_CHIP = '(leggi)';

/** The tabs of the inspector. */
export type InspectorTab = 'activity' | 'line' | 'schemas' | 'laws';

export interface PageState {
  thread: ThreadState;
  /** The reading of `thread`. */
  reading: Reading;
  writer: Writer;
  draft: Draft | null;
  /** The dry run on screen: of this draft, or, marked `stale`, of one a little older. */
  preview: Preview | null;
  /** The rounds of the last post's reconciliation. */
  answered: Denunciation[][];
  selected: LineId | null;
  /** The line a pill or a tick is pointing at. */
  lit: LineId | null;
  linking: Linking | null;
  /** Which kinds of line the ledger shows besides the people's. */
  show: { records: boolean; goals: boolean };
  /** The inspector's tab, and the chip its «Schemi» tab shows: a gist, `HEAD_CHIP` or `LAWS_CHIP`. */
  tab: InspectorTab;
  gist: string;
  /** How «Schemi» and «Leggi» write the schema: in KDL, as a person writes it, or in JSON, as it is read. */
  schemaAs: 'kdl' | 'json';
  /** A post or an example is in flight: the page waits for it. */
  pending: boolean;
  refusal: ShownRefusal | null;
}
